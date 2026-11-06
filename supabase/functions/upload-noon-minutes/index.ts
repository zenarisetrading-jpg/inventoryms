import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { corsHeaders } from '../_shared/cors.ts'
import { getSupabaseAdmin } from '../_shared/supabase.ts'
import { parseMinutesOrderCSV, type ParsedMinutesData } from '../_shared/noon-csv.ts'

// ---------------------------------------------------------------------------
// upload-noon-minutes
//
// Loads the Noon Minutes order export into minutes_sales (one row per item_nr, SCD2),
// then rebuilds the derived tables from that raw table:
//   * sales_snapshot (channel 'noon_minutes')  <- sync_sales_snapshot_from_raw()
//   * fact_sales (sales_channel 'Minutes')     <- trg_refresh_minutes_sales trigger
//   * fact_inventory_planning (minutes_sv)     <- refresh_fact_inventory_planning()
//
// The Noon API (Saddl noon_api) has no Minutes orders feed, so this export is the only
// source of Minutes sales.
// ---------------------------------------------------------------------------

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

const CONFIRMED_STATUSES = new Set(['processing', 'shipped', 'delivered'])

function toCountry(countryCode: string | undefined, fallback: string): string {
  const cc = (countryCode || '').trim().toUpperCase()
  if (cc === 'AE' || cc === 'UAE') return 'UAE'
  if (cc === 'SA' || cc === 'KSA') return 'KSA'
  return fallback
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405)

  try {
    const form = await req.formData()
    const file = form.get('file') as File | null
    const country = (form.get('country') as string) || 'UAE'
    const saddl_id = (form.get('saddl_id') as string) || ''
    if (!file) return jsonResponse({ error: 'No file uploaded' }, 400)
    if (!saddl_id || saddl_id === 'none') return jsonResponse({ error: 'saddl_id (account) is required' }, 400)

    const csvText = await file.text()
    const parseResult = parseMinutesOrderCSV(csvText) as ParsedMinutesData
    const { raw_rows, errors: parseErrors } = parseResult

    if ((!raw_rows || raw_rows.length === 0) && parseErrors.length > 0) {
      return jsonResponse({ error: 'No valid rows parsed', errors: parseErrors }, 422)
    }

    const supabase = getSupabaseAdmin()

    // -----------------------------------------------------------------------
    // 1. Normalise rows. One Noon item (item_nr) = one unit. Keep the last
    //    occurrence of each item_nr in the file.
    // -----------------------------------------------------------------------
    const itemKey = (r: { item_nr?: string; order_nr?: string; sku?: string }) =>
      r.item_nr ? `I:${r.item_nr}` : `O:${r.order_nr}|${r.sku}`

    const csvRows = new Map<string, any>()
    let countryMismatch = 0
    for (const r of raw_rows || []) {
      if (!r.order_nr || !r.sku) continue
      const rowCountry = toCountry(r.country_code, country)
      if (rowCountry !== country) countryMismatch++
      csvRows.set(itemKey(r), {
        country_code: r.country_code,
        country: rowCountry,
        order_nr: r.order_nr,
        item_nr: r.item_nr || null,
        order_date: r.order_date,
        sku: r.sku,
        title_en: r.title_en,
        title_ar: r.title_ar,
        brand_en: r.brand_en,
        brand_ar: r.brand_ar,
        currency_code: r.currency_code,
        price: r.price,
        partner_sku: (r.partner_sku || '').trim(),
        item_status: (r.item_status || '').trim(),
        return_date: r.return_date || null,
        saddl_id,
      })
    }

    // -----------------------------------------------------------------------
    // 2. Load current versions of these items for this account
    // -----------------------------------------------------------------------
    const orderNrs = Array.from(new Set(Array.from(csvRows.values()).map(r => r.order_nr)))
    const existingMap = new Map<string, any>()
    for (let i = 0; i < orderNrs.length; i += 100) {
      const { data: existingRows, error: fetchErr } = await supabase
        .from('minutes_sales')
        .select('id, order_nr, item_nr, sku, item_status, price')
        .in('order_nr', orderNrs.slice(i, i + 100))
        .eq('saddl_id', saddl_id)
        .eq('is_current', true)
      if (fetchErr) {
        console.error('[upload-noon-minutes] fetch existing error:', fetchErr)
        return jsonResponse({ error: `Fetch existing failed: ${fetchErr.message}` }, 500)
      }
      for (const row of existingRows || []) existingMap.set(itemKey(row), row)
    }

    // -----------------------------------------------------------------------
    // 3. SCD2 diff
    //    - new confirmed item            -> insert
    //    - confirmed item changed        -> retire old, insert new
    //    - item now cancelled / returned -> retire old (stops counting it)
    // -----------------------------------------------------------------------
    const idsToRetire: number[] = []
    const rowsToInsert: any[] = []
    let skippedUnconfirmed = 0

    for (const [key, newRow] of csvRows.entries()) {
      const confirmed = CONFIRMED_STATUSES.has(newRow.item_status.toLowerCase())
      const existing = existingMap.get(key)

      if (existing) {
        const changed = existing.item_status !== newRow.item_status || Number(existing.price) !== Number(newRow.price)
        if (!changed) continue
        idsToRetire.push(existing.id)
        if (confirmed) rowsToInsert.push(newRow)
      } else if (confirmed) {
        rowsToInsert.push(newRow)
      } else {
        skippedUnconfirmed++
      }
    }

    const now = new Date().toISOString()
    for (let i = 0; i < idsToRetire.length; i += 500) {
      const { error: updateErr } = await supabase.from('minutes_sales')
        .update({ is_current: false, valid_to: now })
        .in('id', idsToRetire.slice(i, i + 500))
      if (updateErr) {
        console.error('[upload-noon-minutes] update error:', updateErr)
        return jsonResponse({ error: `Update failed: ${updateErr.message}` }, 500)
      }
    }

    for (let i = 0; i < rowsToInsert.length; i += 500) {
      const { error: insertErr } = await supabase.from('minutes_sales').insert(rowsToInsert.slice(i, i + 500))
      if (insertErr) {
        console.error(`[upload-noon-minutes] minutes_sales insert error at chunk ${i}:`, insertErr)
        return jsonResponse({ error: `minutes_sales insert failed: ${insertErr.message}` }, 500)
      }
    }

    // -----------------------------------------------------------------------
    // 4. Rebuild derived tables from minutes_sales (single source of truth).
    //    fact_sales is refreshed by the trg_refresh_minutes_sales trigger.
    // -----------------------------------------------------------------------
    const refreshErrors: string[] = []
    if (idsToRetire.length > 0 || rowsToInsert.length > 0) {
      const { error: snapErr } = await supabase.rpc('sync_sales_snapshot_from_raw')
      if (snapErr) refreshErrors.push(`sync_sales_snapshot_from_raw: ${snapErr.message}`)
      const { error: planErr } = await supabase.rpc('refresh_fact_inventory_planning')
      if (planErr) refreshErrors.push(`refresh_fact_inventory_planning: ${planErr.message}`)
    }

    const confirmedRows = Array.from(csvRows.values()).filter(r => CONFIRMED_STATUSES.has(r.item_status.toLowerCase()))
    const dates = confirmedRows.map(r => String(r.order_date).slice(0, 10)).filter(Boolean).sort()

    return jsonResponse({
      rows_processed: raw_rows?.length ?? 0,
      items_in_file: csvRows.size,
      confirmed_units_in_file: confirmedRows.length,
      raw_rows_inserted: rowsToInsert.length,
      raw_rows_retired: idsToRetire.length,
      unconfirmed_skipped: skippedUnconfirmed,
      country_mismatch_rows: countryMismatch,
      date_range: dates.length ? { from: dates[0], to: dates[dates.length - 1] } : null,
      skus_updated: Array.from(new Set(confirmedRows.map(r => r.partner_sku))).sort(),
      errors: [...parseErrors, ...refreshErrors.map(message => ({ row: 0, message }))],
      message: rowsToInsert.length === 0 && idsToRetire.length === 0 ? 'No new changes detected' : undefined,
    })
  } catch (err) {
    return jsonResponse({ error: String(err) }, 500)
  }
})
