import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { corsHeaders } from '../_shared/cors.ts'
import { getSupabaseAdmin } from '../_shared/supabase.ts'
import { refreshAllMetrics } from '../_shared/velocity.ts'

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

interface NoonInvRow {
  sku: string
  available_qty: number
}

function parseNoonInventoryCSV(text: string): { rows: NoonInvRow[]; errors: { row: number; message: string }[] } {
  const lines = text.trim().split('\n')
  const errors: { row: number; message: string }[] = []
  const rows: NoonInvRow[] = []

  if (lines.length === 0) return { rows, errors }

  // Parse header — find the columns we need
  const header = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/\r$/, ''))
  let skuIdx = header.indexOf('partner_sku')
  if (skuIdx === -1) skuIdx = header.indexOf('product_id')
  if (skuIdx === -1) skuIdx = header.indexOf('sku')
  const qtyIdx = header.findIndex(h => h === 'available_qty' || h === 'available' || h === 'quantity' || h === 'qty')

  if (skuIdx === -1 || qtyIdx === -1) {
    errors.push({ row: 0, message: `Missing required columns. Found: ${header.join(', ')}. Expected: partner_sku/sku and available_qty/available.` })
    return { rows, errors }
  }

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].replace(/\r$/, '').trim()
    if (!line) continue

    const cols = line.split(',').map(c => c.replace(/^"|"$/g, '').trim())
    const rawSku = cols[skuIdx]
    const rawQty = cols[qtyIdx]

    if (!rawSku) {
      errors.push({ row: i + 1, message: 'Empty SKU' })
      continue
    }

    const qty = parseInt(rawQty, 10)
    if (isNaN(qty) || qty < 0) {
      errors.push({ row: i + 1, message: `Invalid quantity: ${rawQty}` })
      continue
    }

    rows.push({ sku: rawSku, available_qty: qty })
  }

  return { rows, errors }
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405)

  try {
    const supabase = getSupabaseAdmin()
    const today = new Date().toISOString().slice(0, 10)

    // Parse multipart form
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    if (!file) return jsonResponse({ error: 'No file uploaded' }, 400)

    const text = await file.text()
    const { rows, errors } = parseNoonInventoryCSV(text)

    if (errors.length > 0 && rows.length === 0) {
      return jsonResponse({ error: errors[0].message, errors }, 400)
    }

    if (rows.length === 0) {
      return jsonResponse({ rows_processed: 0, rows_matched: 0, rows_unmatched: 0, unmatched_skus: [] })
    }

    // Load sku_master to validate SKUs (only include active ones)
    const { data: skuMasterData, error: skuError } = await supabase
      .from('sku_master')
      .select('sku')
      .eq('is_active', true)

    if (skuError) {
      console.error('upload-noon-inventory: failed to fetch SKUs', skuError)
      return jsonResponse({ error: 'Failed to validate SKUs against database' }, 400)
    }

    const validSkus = new Set<string>((skuMasterData ?? []).map((r: { sku: string }) => r.sku))

    // Build reverse map: NOON_SKU_UPPERCASE → internal_sku
    // Noon omits trailing 's' that sku_master uses (e.g. "32OZNAVYBLUE" → "32OZNAVYBLUES")
    const noonToInternal = new Map<string, string>()
    for (const internalSku of validSkus) {
      if (/s$/i.test(internalSku)) {
        noonToInternal.set(internalSku.slice(0, -1).toUpperCase(), internalSku)
      }
      // Also index the sku itself (case-insensitive exact match)
      noonToInternal.set(internalSku.toUpperCase(), internalSku)
    }

    const aggregated = new Map<string, number>()
    // Initialize all master SKUs as 0 available on Noon
    // Any SKU not found in the inventory sheet is by definition OOS
    for (const internal of validSkus) {
      aggregated.set(internal, 0)
    }

    const matched: NoonInvRow[] = []
    const unmatchedSkus: string[] = []

    for (const row of rows) {
      const internal = noonToInternal.get(row.sku.trim().toUpperCase())
      if (internal) {
        aggregated.set(internal, (aggregated.get(internal) ?? 0) + row.available_qty)
        matched.push({ sku: internal, available_qty: row.available_qty })
      } else {
        unmatchedSkus.push(row.sku)
      }
    }

    // Upsert all SKUs (found ones + OOS ones)
    const upsertRows = Array.from(aggregated.entries()).map(([sku, available]) => ({
      sku,
      node: 'noon_fbn',
      warehouse_name: null,
      available,
      inbound: 0,
      reserved: 0,
      snapshot_date: today,
      synced_at: new Date().toISOString(),
    }))

    // Use chunks to avoid request size limits if many SKUs
    const CHUNK_SIZE = 100
    for (let i = 0; i < upsertRows.length; i += CHUNK_SIZE) {
      const chunk = upsertRows.slice(i, i + CHUNK_SIZE)
      const { error: upsertError } = await supabase
        .from('inventory_snapshot')
        .upsert(chunk, { onConflict: 'sku,node,warehouse_name,snapshot_date' })

      if (upsertError) {
        console.error('upload-noon-inventory: upsert error', upsertError)
        return jsonResponse({ error: upsertError.message }, 500)
      }
    }

    // Refresh all metrics after successful write
    try {
      await refreshAllMetrics(supabase)
    } catch (e) {
      console.error('upload-noon-inventory: refreshAllMetrics error', e)
    }

    return jsonResponse({
      rows_processed: rows.length,
      rows_matched: matched.length,
      rows_unmatched: unmatchedSkus.length,
      unmatched_skus: unmatchedSkus.slice(0, 20),
    })
  } catch (err) {
    console.error('upload-noon-inventory: unhandled error', err)
    return jsonResponse({ error: 'Internal server error', detail: String(err) }, 500)
  }
})
