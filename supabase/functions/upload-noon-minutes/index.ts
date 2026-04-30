import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { corsHeaders } from '../_shared/cors.ts'
import { getSupabaseAdmin } from '../_shared/supabase.ts'
import { parseNoonOrderCSV } from '../_shared/noon-csv.ts'
import { refreshAllMetrics } from '../_shared/velocity.ts'

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
    const parseResult = parseNoonOrderCSV(csvText)
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

    await refreshAllMetrics(supabase)

    return jsonResponse({
      rows_processed: sales.length,
      skus_updated: Array.from(new Set(upsertRows.map(r => r.sku))).sort(),
      errors: parseErrors,
    })
  } catch (err) {
    return jsonResponse({ error: String(err) }, 500)
  }
})
