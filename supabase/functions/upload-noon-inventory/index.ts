import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { corsHeaders } from '../_shared/cors.ts'
import { getSupabaseAdmin } from '../_shared/supabase.ts'

// ---------------------------------------------------------------------------
// upload-noon-inventory
//
// Loads Noon Minutes stock from the Noon seller-portal inventory export.
//
//   * Minutes = every Darkstore warehouse: codes with DS (e.g. DXBDS03, AINDS03)
//     AND codes with ID (e.g. DXBID02, AUHID02, DXSID02).
//   * Only inventory_type = 'saleable' counts as stock.
//   * FBN (Noon Core) rows are NOT written: FBN stock comes from the automated
//     Noon API pull (noon_api.v_fbn_inventory_current) via the sync function.
//     They are counted and reported back only.
//
// Rows are written per warehouse code (node = 'Minutes', warehouse_name = code),
// dated from the export's inventory_snapshot_at. All Minutes rows for the same
// account / country / date are replaced, so an API 'DARKSTORE' row for that date
// is never double counted with the export.
// ---------------------------------------------------------------------------

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

/** Darkstore (Minutes) warehouse: 3-letter city code + DS|ID + digits */
export const MINUTES_WAREHOUSE_RE = /^[A-Z]{3}(DS|ID)\d+/i

interface NoonInvRow {
  sku: string
  available_qty: number
  warehouse_code: string | null
  inventory_type: string | null
  snapshot_at: string | null
}

/** Quote-aware CSV line splitter (titles in the Noon export contain commas). */
function splitCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { cur += '"'; i++ }
      else inQuotes = !inQuotes
    } else if (ch === ',' && !inQuotes) {
      out.push(cur); cur = ''
    } else {
      cur += ch
    }
  }
  out.push(cur)
  return out.map(c => c.trim())
}

function parseNoonInventoryCSV(text: string): { rows: NoonInvRow[]; errors: { row: number; message: string }[] } {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/)
  const errors: { row: number; message: string }[] = []
  const rows: NoonInvRow[] = []

  if (lines.length === 0 || !lines[0].trim()) return { rows, errors }

  const header = splitCsvLine(lines[0]).map(h => h.toLowerCase())
  let skuIdx = header.indexOf('partner_sku')
  if (skuIdx === -1) skuIdx = header.indexOf('product_id')
  if (skuIdx === -1) skuIdx = header.indexOf('sku')
  const qtyIdx = header.findIndex(h => h === 'available_qty' || h === 'available' || h === 'quantity' || h === 'qty')
  const whIdx = header.findIndex(h => h === 'warehouse_code' || h === 'wh_code' || h === 'warehouse_id')
  const typeIdx = header.findIndex(h => h === 'inventory_type' || h === 'type' || h === 'condition')
  const snapIdx = header.indexOf('inventory_snapshot_at')

  if (skuIdx === -1 || qtyIdx === -1 || whIdx === -1) {
    errors.push({ row: 0, message: `Missing required columns. Found: ${header.join(', ')}. Expected: partner_sku, qty, warehouse_code.` })
    return { rows, errors }
  }

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue
    const cols = splitCsvLine(line)
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

    rows.push({
      sku: rawSku,
      available_qty: qty,
      warehouse_code: cols[whIdx] || null,
      inventory_type: typeIdx !== -1 ? cols[typeIdx] || null : null,
      snapshot_at: snapIdx !== -1 ? cols[snapIdx] || null : null,
    })
  }

  return { rows, errors }
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405)

  try {
    const supabase = getSupabaseAdmin()

    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const country = (formData.get('country') as string) || 'UAE'
    const saddl_id = (formData.get('saddl_id') as string) || ''
    if (!file) return jsonResponse({ error: 'No file uploaded' }, 400)
    if (!saddl_id || saddl_id === 'none') return jsonResponse({ error: 'saddl_id (account) is required' }, 400)

    const text = await file.text()
    const { rows, errors } = parseNoonInventoryCSV(text)

    if (errors.length > 0 && rows.length === 0) {
      return jsonResponse({ error: errors[0].message, errors }, 400)
    }
    if (rows.length === 0) {
      return jsonResponse({ rows_processed: 0, rows_matched: 0, rows_unmatched: 0, unmatched_skus: [] })
    }

    // Snapshot date = export date (inventory_snapshot_at "YYYY-MM-DD, HH:MM:SS"), else today (UTC)
    const firstSnap = rows.find(r => r.snapshot_at)?.snapshot_at ?? ''
    const snapMatch = firstSnap.match(/\d{4}-\d{2}-\d{2}/)
    const snapshot_date = snapMatch ? snapMatch[0] : new Date().toISOString().slice(0, 10)

    // Load this account's catalogue (same matching rules as the API sync)
    const skuMasterRows: { sku: string }[] = []
    for (let from = 0; ; from += 1000) {
      const { data: page, error: smErr } = await supabase
        .from('sku_master')
        .select('sku')
        .eq('country', country)
        .eq('saddl_id', saddl_id)
        .range(from, from + 999)
      if (smErr) {
        console.error('upload-noon-inventory: failed to fetch SKUs', smErr)
        return jsonResponse({ error: 'Failed to validate SKUs against database' }, 400)
      }
      if (!page || page.length === 0) break
      skuMasterRows.push(...page)
      if (page.length < 1000) break
    }

    const exactMap = new Map<string, string>()
    const cleanMap = new Map<string, string>()
    for (const { sku } of skuMasterRows) {
      if (!sku) continue
      const raw = String(sku).trim()
      exactMap.set(raw.toUpperCase(), raw)
      const clean = raw.replace(/[^A-Za-z0-9]/g, '').toUpperCase()
      if (!cleanMap.has(clean)) cleanMap.set(clean, raw)
    }
    const resolveSku = (candidate: string): string | null => {
      const upper = candidate.trim().toUpperCase()
      if (!upper) return null
      if (exactMap.has(upper)) return exactMap.get(upper)!
      const clean = upper.replace(/[^A-Z0-9]/g, '')
      if (cleanMap.has(clean)) return cleanMap.get(clean)!
      if (upper.endsWith('S') && exactMap.has(upper.slice(0, -1))) return exactMap.get(upper.slice(0, -1))!
      if (clean.endsWith('S') && cleanMap.has(clean.slice(0, -1))) return cleanMap.get(clean.slice(0, -1))!
      return null
    }

    // Aggregate saleable Minutes stock: sku|warehouse_code -> qty
    const aggregated = new Map<string, number>()
    const unmatched = new Map<string, number>()
    let minutesUnits = 0
    let dsUnits = 0
    let idUnits = 0
    let fbnUnitsSkipped = 0
    let nonSaleableUnitsSkipped = 0
    let rowsMatched = 0

    for (const row of rows) {
      if (row.inventory_type && row.inventory_type.trim().toLowerCase() !== 'saleable') {
        nonSaleableUnitsSkipped += row.available_qty
        continue
      }
      const wh = (row.warehouse_code || '').trim().toUpperCase()
      const m = wh.match(MINUTES_WAREHOUSE_RE)
      if (!m) {
        fbnUnitsSkipped += row.available_qty
        continue
      }

      const internal = resolveSku(row.sku)
      if (!internal) {
        unmatched.set(row.sku.trim(), (unmatched.get(row.sku.trim()) || 0) + row.available_qty)
        continue
      }

      const key = `${internal}|${wh}`
      aggregated.set(key, (aggregated.get(key) || 0) + row.available_qty)
      rowsMatched++
      minutesUnits += row.available_qty
      if (m[1].toUpperCase() === 'DS') dsUnits += row.available_qty
      else idUnits += row.available_qty
    }

    const synced_at = new Date().toISOString()
    const upsertRows = Array.from(aggregated.entries()).map(([key, available]) => {
      const [sku, warehouse_name] = key.split('|')
      return {
        sku,
        node: 'Minutes',
        warehouse_name,
        available,
        inbound: 0,
        reserved: 0,
        country,
        snapshot_date,
        synced_at,
        saddl_id,
      }
    })

    if (upsertRows.length > 0) {
      // Replace this account's Minutes rows for the export date only
      const { error: deleteError } = await supabase
        .from('inventory_snapshot')
        .delete()
        .eq('node', 'Minutes')
        .eq('country', country)
        .eq('saddl_id', saddl_id)
        .eq('snapshot_date', snapshot_date)
      if (deleteError) {
        console.error('upload-noon-inventory: delete error', deleteError)
        return jsonResponse({ error: deleteError.message }, 500)
      }

      for (let i = 0; i < upsertRows.length; i += 500) {
        const { error: upsertError } = await supabase
          .from('inventory_snapshot')
          .upsert(upsertRows.slice(i, i + 500), { onConflict: 'sku,node,warehouse_name,snapshot_date,country,saddl_id' })
        if (upsertError) {
          console.error('upload-noon-inventory: upsert error', upsertError)
          return jsonResponse({ error: upsertError.message }, 500)
        }
      }

      const { error: refreshErr } = await supabase.rpc('refresh_fact_inventory_planning')
      if (refreshErr) console.error('upload-noon-inventory: refresh_fact_inventory_planning', refreshErr)
    }

    const unmatchedUnits = Array.from(unmatched.values()).reduce((a, b) => a + b, 0)

    return jsonResponse({
      rows_processed: rows.length,
      rows_matched: rowsMatched,
      rows_unmatched: unmatched.size,
      unmatched_skus: Array.from(unmatched.keys()).slice(0, 20),
      snapshot_date,
      minutes_skus: new Set(upsertRows.map(r => r.sku)).size,
      minutes_rows_written: upsertRows.length,
      minutes_units: minutesUnits,
      minutes_ds_units: dsUnits,
      minutes_id_units: idUnits,
      minutes_unmatched_units: unmatchedUnits,
      fbn_units_skipped: fbnUnitsSkipped,
      non_saleable_units_skipped: nonSaleableUnitsSkipped,
    })
  } catch (err) {
    console.error('upload-noon-inventory: unhandled error', err)
    return jsonResponse({ error: 'Internal server error', detail: String(err) }, 500)
  }
})
