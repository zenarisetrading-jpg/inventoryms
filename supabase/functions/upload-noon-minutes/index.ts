import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { corsHeaders } from '../_shared/cors.ts'
import { getSupabaseClient } from '../_shared/supabase.ts'
import { parseMinutesOrderCSV, type ParsedMinutesData } from '../_shared/noon-csv.ts'
import { refreshAllMetrics } from '../_shared/velocity.ts'

interface NoonSaleRow {
  sku: string
  date: string
  channel: 'noon' | 'noon_minutes'
  units_sold: number
  country?: string
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405)

  try {
    const form = await req.formData()
    const file = form.get('file') as File | null
    const country = (form.get('country') as string) || 'UAE'
    if (!file) return jsonResponse({ error: 'No file uploaded' }, 400)

    const csvText = await file.text()
    const parseResult = parseMinutesOrderCSV(csvText) as ParsedMinutesData
    const { sales, errors: parseErrors } = parseResult

    if (sales.length === 0 && parseErrors.length > 0) {
      return jsonResponse({ error: 'No valid rows parsed', errors: parseErrors }, 422)
    }

    const supabase = getSupabaseClient(req)
    
    // Build internal SKU mapping (handling 's' suffix case-insensitively)
    const { data: skuMasterRows } = await supabase
      .from('sku_master')
      .select('sku')
      .eq('is_active', true)
    
    const validSkus = (skuMasterRows ?? []).map((r: { sku: string }) => r.sku)
    const noonToInternal = new Map<string, string>()
    for (const internalSku of validSkus) {
      if (/s$/i.test(internalSku)) noonToInternal.set(internalSku.slice(0, -1).toUpperCase(), internalSku)
      noonToInternal.set(internalSku.toUpperCase(), internalSku)
    }

    // -----------------------------------------------------------------------
    // Step 3: Upsert into sales_snapshot (Aggregated)
    // -----------------------------------------------------------------------
    const deduped = new Map<string, NoonSaleRow>()
    for (const r of sales) {
      const internalSku = noonToInternal.get(r.sku.trim().toUpperCase())
      if (internalSku) {
        const key = `${internalSku}|${r.date}|${country}`
        const ex = deduped.get(key)
        if (ex) {
          ex.units_sold += r.units_sold
        } else {
          deduped.set(key, { sku: internalSku, date: r.date, channel: 'noon_minutes', units_sold: r.units_sold, country })
        }
      }
    }

    const upsertRows = Array.from(deduped.values()).map(r => ({
      ...r,
      country,
      synced_at: new Date().toISOString()
    }))

    if (upsertRows.length > 0) {
      const { error } = await supabase.from('sales_snapshot').upsert(upsertRows, { onConflict: 'sku,date,channel,country' })
      if (error) return jsonResponse({ error: error.message }, 500)
    }

    // -----------------------------------------------------------------------
    // Step 4: Load Raw Detailed Data into minutes_sales (Chunked for Memory)
    // -----------------------------------------------------------------------
    const { raw_rows } = parseResult
    let rawInserted = 0
    
    if (raw_rows && raw_rows.length > 0) {
      const CONFIRMED_STATUSES = new Set(['processing', 'shipped', 'delivered'])
      
      // Filter and map in one pass
      const dbRows = []
      for (const r of raw_rows) {
        if (r.item_status && CONFIRMED_STATUSES.has(r.item_status.toLowerCase())) {
          dbRows.push({
            country_code: r.country_code,
            order_nr: r.order_nr,
            item_nr: r.item_nr,
            order_date: r.order_date,
            sku: r.sku,
            title_en: r.title_en,
            title_ar: r.title_ar,
            brand_en: r.brand_en,
            brand_ar: r.brand_ar,
            currency_code: r.currency_code,
            price: r.price,
            partner_sku: r.partner_sku,
            item_status: r.item_status,
            return_date: r.return_date || null
          })
        }
      }

      const validDbRows = dbRows.filter(r => r.order_nr && r.sku)
      
      // Deduplicate rows from CSV by order_nr + sku (keep the last one)
      const dedupedCsvRows = new Map<string, any>()
      for (const r of validDbRows) {
        dedupedCsvRows.set(`${r.order_nr}|${r.sku}`, r)
      }
      const finalDbRows = Array.from(dedupedCsvRows.values())
      
      const orderNrs = Array.from(new Set(finalDbRows.map(r => r.order_nr)))
      
      const existingMap = new Map<string, any>()
      const QUERY_CHUNK_SIZE = 100 // Lower to avoid PostgREST 1000-row limit
      const INSERT_CHUNK_SIZE = 500
      
      for (let i = 0; i < orderNrs.length; i += QUERY_CHUNK_SIZE) {
        const chunk = orderNrs.slice(i, i + QUERY_CHUNK_SIZE)
        const { data: existingRows, error: fetchErr } = await supabase
          .from('minutes_sales')
          .select('id, order_nr, sku, item_status, price')
          .in('order_nr', chunk)
          .eq('is_current', true)
        
        if (fetchErr) {
          console.error(`[upload-noon-minutes] fetch existing error:`, fetchErr)
          return jsonResponse({ error: `Fetch existing failed: ${fetchErr.message}` }, 500)
        }
        for (const row of (existingRows || [])) {
          existingMap.set(`${row.order_nr}|${row.sku}`, row)
        }
      }

      const idsToRetire: number[] = []
      const rowsToInsert: any[] = []

      for (const newRow of finalDbRows) {
        const key = `${newRow.order_nr}|${newRow.sku}`
        const existing = existingMap.get(key)
        
        if (existing) {
          let changed = false
          if (existing.item_status !== newRow.item_status) changed = true
          else if (Number(existing.price) !== Number(newRow.price)) changed = true
          
          if (changed) {
            idsToRetire.push(existing.id)
            rowsToInsert.push(newRow)
            existingMap.delete(key)
          }
        } else {
          rowsToInsert.push(newRow)
        }
      }

      // Retire old rows
      for (let i = 0; i < idsToRetire.length; i += INSERT_CHUNK_SIZE) {
        const chunk = idsToRetire.slice(i, i + INSERT_CHUNK_SIZE)
        const { error: updateErr } = await supabase.from('minutes_sales')
          .update({ is_current: false, valid_to: new Date().toISOString() })
          .in('id', chunk)
        if (updateErr) {
          console.error(`[upload-noon-minutes] update error:`, updateErr)
          return jsonResponse({ error: `Update failed: ${updateErr.message}` }, 500)
        }
      }

      // Insert new rows
      for (let i = 0; i < rowsToInsert.length; i += INSERT_CHUNK_SIZE) {
        const chunk = rowsToInsert.slice(i, i + INSERT_CHUNK_SIZE)
        const { error: minutesError } = await supabase.from('minutes_sales').insert(chunk)
        if (minutesError) {
          console.error(`[upload-noon-minutes] minutes_sales insert error at chunk ${i}:`, minutesError)
          return jsonResponse({ error: `minutes_sales insert failed: ${minutesError.message}` }, 500)
        }
      }
      
      rawInserted = rowsToInsert.length
    }

    // await refreshAllMetrics(supabase)

    return jsonResponse({
      rows_processed: sales.length,
      raw_rows_inserted: rawInserted,
      skus_updated: Array.from(new Set(upsertRows.map(r => r.sku))).sort(),
      errors: parseErrors,
      message: rawInserted === 0 ? "No new changes detected" : undefined,
    })
  } catch (err) {
    return jsonResponse({ error: String(err) }, 500)
  }
})
