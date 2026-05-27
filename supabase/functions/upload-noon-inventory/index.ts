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
  warehouse_code: string | null
  inventory_type?: string | null
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
  const whIdx = header.findIndex(h => h === 'warehouse_code' || h === 'warehouse' || h === 'wh_code' || h === 'warehouse_id')
  const typeIdx = header.findIndex(h => h === 'inventory_type' || h === 'type' || h === 'condition')

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
    const rawWh = whIdx !== -1 ? cols[whIdx] : null
    const rawType = typeIdx !== -1 ? cols[typeIdx] : null

    if (!rawSku) {
      errors.push({ row: i + 1, message: 'Empty SKU' })
      continue
    }

    const qty = parseInt(rawQty, 10)
    if (isNaN(qty) || qty < 0) {
      errors.push({ row: i + 1, message: `Invalid quantity: ${rawQty}` })
      continue
    }

    rows.push({ sku: rawSku, available_qty: qty, warehouse_code: rawWh, inventory_type: rawType })
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
    const noonToInternal = new Map<string, string>()
    // Set exact matches first to ensure they take priority
    for (const internalSku of validSkus) {
      noonToInternal.set(internalSku.toUpperCase(), internalSku)
    }
    // Set trailing 's' fallbacks only if they do not overwrite an exact match
    for (const internalSku of validSkus) {
      if (/s$/i.test(internalSku)) {
        const withoutS = internalSku.slice(0, -1).toUpperCase()
        if (!noonToInternal.has(withoutS)) {
          noonToInternal.set(withoutS, internalSku)
        }
      }
    }

    // Aggregated map: sku|node|warehouse_name -> available
    const aggregated = new Map<string, number>()

    const matched: NoonInvRow[] = []
    const unmatchedSkus: string[] = []

    for (const row of rows) {
      const internal = noonToInternal.get(row.sku.trim().toUpperCase())
      if (internal) {
        // Logic: if warehouse code contains DS or ID -> Minutes, else -> noon_fbn
        const whCode = row.warehouse_code || 'FBN_GENERIC'
        // Extra strict check: Must start with city code + (DS|ID) + digits
        const isMinutes = /^(AJM|AUH|DXB|SHJ)(DS|ID)\d+/i.test(whCode)
        const node = isMinutes ? 'Minutes' : 'noon_fbn'
        const warehouse_name = whCode

        const key = `${internal}|${node}|${warehouse_name}`
        aggregated.set(key, (aggregated.get(key) || 0) + row.available_qty)
        matched.push({ ...row, sku: internal })
      } else {
        unmatchedSkus.push(row.sku)
      }
    }

    // Prepare upsert rows
    const upsertRows = Array.from(aggregated.entries()).map(([key, available]) => {
      const [sku, node, warehouse_name] = key.split('|')
      return {
        sku,
        node,
        warehouse_name,
        available,
        inbound: 0,
        reserved: 0,
        snapshot_date: today,
        synced_at: new Date().toISOString(),
      }
    })

    // Before upserting, we should clear OLD snapshots for THIS node/date to avoid orphans?
    // Actually, upsert with onConflict handles it. 
    // But wait! If a SKU was in WH1 and now it's only in WH2, WH1 will still have a row from today if we uploaded twice.
    // Usually, we should delete all noon_fbn/Minutes rows for today before upserting fresh ones.
    const { error: deleteError } = await supabase
      .from('inventory_snapshot')
      .delete()
      .in('node', ['noon_fbn', 'Minutes'])
      .eq('snapshot_date', today)

    if (deleteError) {
      console.error('upload-noon-inventory: delete error', deleteError)
    }

    // Use chunks to avoid request size limits
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
      unmatched_skus: [...new Set(unmatchedSkus)].slice(0, 20),
    })
  } catch (err) {
    console.error('upload-noon-inventory: unhandled error', err)
    return jsonResponse({ error: 'Internal server error', detail: String(err) }, 500)
  }
})
