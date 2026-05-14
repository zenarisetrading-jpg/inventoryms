import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { corsHeaders } from '../_shared/cors.ts'
import { getSupabaseAdmin } from '../_shared/supabase.ts'
import { parseNoonOrderCSV } from '../_shared/noon-csv.ts'
import { refreshAllMetrics } from '../_shared/velocity.ts'

interface NoonSaleRow {
  sku: string
  date: string
  channel: 'noon' | 'noon_minutes'
  units_sold: number
}

interface ParseResult {
  sales: NoonSaleRow[]
  avg_prices: any[]
  raw_rows: any[]
  errors: { row: number; message: string }[]
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
    const parseResult = parseNoonOrderCSV(csvText) as ParseResult
    const { sales, errors: parseErrors } = parseResult

    if (sales.length === 0 && parseErrors.length > 0) {
      return jsonResponse({ error: 'No valid rows parsed', errors: parseErrors }, 422)
    }

    const supabase = getSupabaseAdmin()
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

    const deduped = new Map<string, any>()
    for (const r of sales) {
      const internalSku = noonToInternal.get(r.sku.trim().toUpperCase())
      if (internalSku) {
        // FORCE channel to noon_minutes for this specific upload
        const channel = 'noon_minutes'
        const key = `${internalSku}|${r.date}|${channel}`
        const ex = deduped.get(key)
        if (ex) {
          ex.units_sold += r.units_sold
        } else {
          deduped.set(key, { sku: internalSku, date: r.date, channel, units_sold: r.units_sold })
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
    // Step 4: Load Raw Detailed Data into minutes_sales
    // -----------------------------------------------------------------------
    const { raw_rows } = parseResult
    let rawInserted = 0
    
    if (raw_rows && raw_rows.length > 0) {
      const CONFIRMED_STATUSES = new Set(['processing', 'shipped', 'delivered'])
      const filteredRaw = raw_rows.filter((r: any) => r.status && CONFIRMED_STATUSES.has(r.status.toLowerCase()))

      const dbRows = filteredRaw.map((r: any) => {
        // Robust numeric parsing
        const cleanInt = (val: any) => {
          if (!val) return null
          const num = parseInt(String(val).replace(/[^\d-]/g, ''))
          return isNaN(num) ? null : num
        }
        const cleanFloat = (val: any) => {
          if (!val) return 0
          const num = parseFloat(String(val).replace(/[^\d.-]/g, ''))
          return isNaN(num) ? 0 : num
        }

        return {
          id_partner: cleanInt(r.id_partner),
          src_country: r.src_country || null,
          country_code: r.country_code || null,
          dest_country: r.dest_country || null,
          bayan_nr: r.bayan_nr || null,
          item_nr: r.item_nr || null,
          partner_sku: r.partner_sku || null,
          sku: r.sku || null,
          status: r.status || null,
          offer_price: cleanFloat(r.offer_price),
          gmv_lcy: cleanFloat(r.gmv_lcy),
          currency_code: r.currency_code || null,
          brand_code: r.brand_code || null,
          family: r.family || null,
          fulfillment_model: r.fulfillment_model || null,
          order_timestamp: r.order_timestamp || null,
          shipment_timestamp: r.shipment_timestamp || null,
          delivered_timestamp: r.delivered_timestamp || null
        }
      })

      if (dbRows.length > 0) {
        const { error: minutesError } = await supabase.from('minutes_sales').insert(dbRows)
        if (minutesError) {
          console.error('[upload-noon-minutes] minutes_sales insert error:', minutesError)
          return jsonResponse({ error: `minutes_sales insert failed: ${minutesError.message}` }, 500)
        }
        rawInserted = dbRows.length
      }
    }

    await refreshAllMetrics(supabase)

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
