import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { corsHeaders } from '../_shared/cors.ts'
import { getSupabaseAdmin } from '../_shared/supabase.ts'
import { parseMinutesOrderCSV, type ParsedMinutesData } from '../_shared/noon-csv.ts'
import { refreshAllMetrics } from '../_shared/velocity.ts'

interface NoonSaleRow {
  sku: string
  date: string
  channel: 'noon' | 'noon_minutes'
  units_sold: number
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
    if (!file) return jsonResponse({ error: 'No file uploaded' }, 400)

    const csvText = await file.text()
    const parseResult = parseMinutesOrderCSV(csvText) as ParsedMinutesData
    const { sales, errors: parseErrors } = parseResult

    if (sales.length === 0 && parseErrors.length > 0) {
      return jsonResponse({ error: 'No valid rows parsed', errors: parseErrors }, 422)
    }

    const supabase = getSupabaseAdmin()
    
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
        const key = `${internalSku}|${r.date}`
        const ex = deduped.get(key)
        if (ex) {
          ex.units_sold += r.units_sold
        } else {
          deduped.set(key, { sku: internalSku, date: r.date, channel: 'noon_minutes', units_sold: r.units_sold })
        }
      }
    }

    const upsertRows = Array.from(deduped.values()).map(r => ({
      ...r,
      synced_at: new Date().toISOString()
    }))

    if (upsertRows.length > 0) {
      const { error } = await supabase.from('sales_snapshot').upsert(upsertRows, { onConflict: 'sku,date,channel' })
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

      // Insert in batches of 500
      const CHUNK_SIZE = 500
      for (let i = 0; i < dbRows.length; i += CHUNK_SIZE) {
        const chunk = dbRows.slice(i, i + CHUNK_SIZE)
        const { error: minutesError } = await supabase.from('minutes_sales').insert(chunk)
        if (minutesError) {
          console.error(`[upload-noon-minutes] minutes_sales insert error at chunk ${i}:`, minutesError)
          return jsonResponse({ error: `minutes_sales insert failed: ${minutesError.message}` }, 500)
        }
      }
      rawInserted = dbRows.length
    }

    // await refreshAllMetrics(supabase)

    return jsonResponse({
      rows_processed: sales.length,
      raw_rows_inserted: rawInserted,
      skus_updated: Array.from(new Set(upsertRows.map(r => r.sku))).sort(),
      errors: parseErrors,
    })
  } catch (err) {
    return jsonResponse({ error: String(err) }, 500)
  }
})
