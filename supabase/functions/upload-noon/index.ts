import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { corsHeaders } from '../_shared/cors.ts'
import { getSupabaseAdmin } from '../_shared/supabase.ts'
import { parseNoonOrderCSV } from '../_shared/noon-csv.ts'
import { refreshAllMetrics } from '../_shared/velocity.ts'

// ---------------------------------------------------------------------------
// Types for the parser output (contract with _shared/noon-csv.ts)
// ---------------------------------------------------------------------------

// Represents one aggregated sales record for a (sku, date, channel) triple
interface NoonSaleRow {
  sku: string                           // internal partner_sku value
  date: string                          // ISO date string YYYY-MM-DD
  channel: 'noon' | 'noon_minutes'     // fulfillment_model-derived channel
  units_sold: number                    // count of qualifying orders for this sku+date+channel
}

// avg_prices record from parseNoonOrderCSV
interface NoonAvgPrice {
  sku: string
  avg_sell_price_aed: number
}

// Parser return shape matching ParsedNoonData from _shared/noon-csv.ts
interface ParseResult {
  sales: NoonSaleRow[]
  avg_prices: NoonAvgPrice[]
  errors: { row: number; message: string }[]
}

// ---------------------------------------------------------------------------
// Helper: JSON response with CORS headers
// ---------------------------------------------------------------------------

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: `Method ${req.method} not allowed` }, 405)
  }

  try {
    // -----------------------------------------------------------------------
    // Step 1: Extract CSV text from multipart/form-data
    // -----------------------------------------------------------------------
    let csvText: string

    try {
      const form = await req.formData()
      const file = form.get('file') as File | null

      if (!file) {
        return jsonResponse({ error: 'No file field found in form data. Provide a file under the key "file".' }, 400)
      }

      // Read raw text and strip BOM if present
      const raw = await file.text()
      csvText = raw.startsWith('\uFEFF') ? raw.slice(1) : raw
    } catch (formError) {
      console.error('[upload-noon] Failed to parse form data:', formError)
      return jsonResponse({ error: 'Failed to parse multipart form data. Ensure Content-Type includes a valid boundary.' }, 400)
    }

    if (!csvText || !csvText.trim()) {
      return jsonResponse({ error: 'Uploaded file is empty.' }, 400)
    }

    // -----------------------------------------------------------------------
    // Step 2: Parse the CSV via the shared parser
    // -----------------------------------------------------------------------
    let parseResult: ParseResult

    try {
      parseResult = parseNoonOrderCSV(csvText)
    } catch (parseError) {
      console.error('[upload-noon] CSV parse failed completely:', parseError)
      return jsonResponse(
        { error: 'CSV is completely unreadable. Ensure the file is a valid Noon order export.' },
        422
      )
    }

    // parseNoonOrderCSV returns { sales, avg_prices, errors }
    const { sales, avg_prices, errors: parseErrors } = parseResult

    if (sales.length === 0 && parseErrors.length > 0) {
      // Every row errored — treat as unreadable
      return jsonResponse(
        {
          error: 'No valid rows could be parsed from the CSV.',
          rows_processed: 0,
          skus_updated: [],
          errors: parseErrors,
        },
        422
      )
    }

    const supabase = getSupabaseAdmin()
    const skusUpdated = new Set<string>()

    // -----------------------------------------------------------------------
    // Step 3: Upsert sales_snapshot rows (one per unique sku+date)
    // -----------------------------------------------------------------------
    // sales from the parser are already aggregated to (sku, date, units_sold).
    // Filter to only SKUs that exist in sku_master — Noon partner_sku values
    // that don't match any internal SKU would cause a FK violation.
    if (sales.length > 0) {
      // Load all active master SKUs to build a robust mapping dictionary
      const { data: skuMasterRows } = await supabase
        .from('sku_master')
        .select('sku')
        .eq('is_active', true)
      
      const validSkus = (skuMasterRows ?? []).map((r: { sku: string }) => r.sku)
      const noonToInternal = new Map<string, string>()
      
      for (const internalSku of validSkus) {
        // Noon often omits trailing 's' (e.g. "32OZNAVYBLUE" -> "32OZNAVYBLUES")
        if (/s$/i.test(internalSku)) {
          noonToInternal.set(internalSku.slice(0, -1).toUpperCase(), internalSku)
        }
        noonToInternal.set(internalSku.toUpperCase(), internalSku)
      }

      // Map parsed Noon SKUs to internal SKUs using the dictionary
      // This also handles any leading/trailing blanks that might have slipped through trimming
      const deduped = new Map<string, { sku: string; date: string; channel: 'noon' | 'noon_minutes'; units_sold: number }>()
      let unknownCount = 0

      for (const r of sales) {
        const trimmedNoonSku = r.sku.trim().toUpperCase()
        const internalSku = noonToInternal.get(trimmedNoonSku)
        
        if (internalSku) {
          const key = `${internalSku}|${r.date}|${r.channel}`
          const ex = deduped.get(key)
          if (ex) {
            ex.units_sold += r.units_sold
          } else {
            deduped.set(key, { sku: internalSku, date: r.date, channel: r.channel, units_sold: r.units_sold })
          }
        } else {
          unknownCount++
        }
      }

      const salesUpsertRows = Array.from(deduped.values()).map((r) => ({
        sku: r.sku,
        date: r.date,
        channel: r.channel,
        units_sold: r.units_sold,
        synced_at: new Date().toISOString(),
      }))

      console.log(`[upload-noon] ${salesUpsertRows.length} rows to upsert, ${unknownCount} Noon SKUs could not be mapped`)

      if (salesUpsertRows.length > 0) {
        const { error: salesError } = await supabase
          .from('sales_snapshot')
          .upsert(salesUpsertRows, {
            onConflict: 'sku,date,channel',
          })

        if (salesError) {
          console.error('[upload-noon] sales_snapshot upsert error:', salesError)
          // Surface the actual DB error in the response so it's visible in the UI
          return jsonResponse(
            { error: `sales_snapshot upsert failed: ${salesError.message}` },
            500
          )
        }
      }

      // Track unique SKUs that had data written
      for (const r of salesUpsertRows) {
        skusUpdated.add(r.sku)
      }
    }

    // -----------------------------------------------------------------------
    // Step 4: Upsert avg_sell_price_aed per SKU to sku_master (if applicable)
    // avg_prices from the parser are per-SKU averages already computed.
    // Skip gracefully if the column does not exist (catches DB schema error).
    // -----------------------------------------------------------------------
    if (avg_prices.length > 0) {
      // Attempt updates one SKU at a time so a missing column only suppresses
      // this optional step rather than failing the whole upload.
      try {
        const priceUpdatePromises = avg_prices.map(({ sku, avg_sell_price_aed }) =>
          supabase
            .from('sku_master')
            .update({ avg_sell_price_aed })
            .eq('sku', sku)
        )

        const results = await Promise.allSettled(priceUpdatePromises)

        // Log any unexpected errors but do not fail the response
        for (const result of results) {
          if (result.status === 'rejected') {
            console.warn('[upload-noon] avg_sell_price_aed update skipped (column may not exist):', result.reason)
          } else if (result.value.error) {
            // Column missing typically surfaces as a PostgREST 400/PGRST116 or similar
            const errMsg: string = result.value.error.message ?? ''
            if (
              errMsg.includes('avg_sell_price_aed') ||
              errMsg.includes('column') ||
              errMsg.toLowerCase().includes('does not exist')
            ) {
              // Column not yet added to schema — skip silently as per spec
              console.info('[upload-noon] avg_sell_price_aed column not present on sku_master — skipping price update')
              break
            }
            console.warn('[upload-noon] avg_sell_price_aed update warning:', errMsg)
          }
        }
      } catch (priceUpdateErr) {
        // Non-critical — log and continue
        console.warn('[upload-noon] avg_sell_price_aed update failed gracefully:', priceUpdateErr)
      }
    }

    // -----------------------------------------------------------------------
    // Step 5: Refresh decision engine metrics
    // -----------------------------------------------------------------------
    if (skusUpdated.size > 0) {
      try {
        await refreshAllMetrics(supabase)
      } catch (err) {
        console.error('[upload-noon] refreshAllMetrics error:', err)
      }
    }

    // -----------------------------------------------------------------------
    // Step 6: Return summary response
    // -----------------------------------------------------------------------
    return jsonResponse({
      rows_processed: sales.length,
      skus_updated: Array.from(skusUpdated).sort(),
      errors: parseErrors,
    })
  } catch (err) {
    console.error('[upload-noon] Unhandled error:', err)
    return jsonResponse({ error: 'Internal server error' }, 500)
  }
})
