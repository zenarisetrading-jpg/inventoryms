/**
 * sync/index.ts — Deno Edge Function
 *
 * Routes:
 *   POST /sync/amazon   — pull Amazon inventory + sales from Saddl → upsert S2C tables
 *   POST /sync/locad    — pull Locad inventory via REST API → upsert S2C tables
 *   POST /sync/all      — run all sources
 *   GET  /sync/status   — connection health check
 *
 * After any sync: calls refreshAllMetrics() from _shared/velocity.ts
 * (guarded with try/catch in case the Decision Engine has not yet deployed it).
 */

// v1.0.1 - forced redeploy for schema cache
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { corsHeaders } from '../_shared/cors.ts'
import { getSupabaseAdmin } from '../_shared/supabase.ts'
import {
  fetchAmazonInventory,
  fetchAmazonSales,
  getSaddlConnectionStatus,
} from '../_shared/saddl.ts'
import { LocadClient, isLocadConfigured } from '../_shared/locad.ts'

// refreshAllMetrics is provided by the Decision Engine agent.
// The static import is used when velocity.ts is deployed. If not yet available
// the try/catch around each call handles graceful degradation.
import { refreshAllMetrics as _refreshAllMetrics } from '../_shared/velocity.ts'
const refreshAllMetrics = _refreshAllMetrics

// ---------------------------------------------------------------------------
// serve
// ---------------------------------------------------------------------------

serve(async (req: Request) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const url = new URL(req.url)
  // Extract action from path (e.g. ".../sync/refresh-fact" -> "refresh-fact")
  const segments = url.pathname.split('/').filter(Boolean)
  const action = segments[segments.length - 1] ?? ''

  try {
    if (req.method === 'GET' && action === 'status') {
      return await handleStatus()
    }

    const clear = url.searchParams.get('clear') === 'true'
    if (req.method === 'POST') {
      if (action === 'amazon') return await handleSync('amazon', clear)
      if (action === 'amazon-fdw') return await handleAmazonFDW()
      if (action === 'locad') return await handleSync('locad', clear)
      if (action === 'all') return await handleSync('all', clear)
      if (action === 'refresh-fact') return await handleRefreshFact()
    }

    return jsonResponse({ error: 'Not found', path: url.pathname }, 404)
  } catch (err) {
    console.error('[sync] Unhandled error:', err)
    return jsonResponse({ error: String((err as Error).message) }, 500)
  }
})

// ---------------------------------------------------------------------------
// handleSync
// ---------------------------------------------------------------------------

async function handleSync(
  source: 'amazon' | 'locad' | 'all',
  clear = false
): Promise<Response> {
  const supabase = getSupabaseAdmin()
  const synced_at = new Date().toISOString()
  let skus_processed = 0
  let locad_status: 'synced' | 'skipped_not_connected' = 'skipped_not_connected'
  const errors: string[] = []

  // ---- CLEAR RECORDS (Optional) ----
  if (clear) {
    console.log('[sync] Clearing all inventory and sales records as requested...')
    const tables = ['inventory_snapshot', 'sales_snapshot', 'demand_metrics', 'allocation_plans', 'locad_raw_staging']
    for (const table of tables) {
      const { error } = await supabase.from(table).delete().neq('sku', 'DOES_NOT_EXIST')
      if (error) {
        errors.push(`Clear ${table} failure: ${error.message}`)
      }
    }
  }

  // ---- Load active locations from amazon_locations ----
  let locations: { country: string; saddl_account_id: string; saddl_client_id: string }[] = []
  try {
    const { data: locData, error: locErr } = await supabase
      .from('amazon_locations')
      .select('country, saddl_account_id, saddl_client_id')
      .eq('is_active', true)
    if (locErr || !locData || locData.length === 0) {
      // Fallback to UAE defaults if table doesn't exist or is empty
      console.log('[sync] No amazon_locations found, falling back to UAE defaults')
      locations = [{ country: 'UAE', saddl_account_id: 's2c_uae_test', saddl_client_id: 's2c_uae_test' }]
    } else {
      locations = locData
    }
  } catch {
    locations = [{ country: 'UAE', saddl_account_id: 's2c_uae_test', saddl_client_id: 's2c_uae_test' }]
  }

  // ---- Amazon (Saddl) — sync all active locations ----
  if (source === 'amazon' || source === 'all') {
    for (const loc of locations) {
      try {
        console.log(`[sync] Syncing Amazon for ${loc.country} (account=${loc.saddl_account_id}, client=${loc.saddl_client_id})`)

        const [inventory, sales] = await Promise.all([
          fetchAmazonInventory(loc.saddl_client_id),
          fetchAmazonSales(90, loc.saddl_account_id),
        ])

      // Build asin → sku mapping from sku_master (filtered by country)
      const { data: skuMasterRows, error: smErr } = await supabase
        .from('sku_master')
        .select('sku, asin')
        .eq('country', loc.country)
        .not('asin', 'is', null)
      if (smErr) {
        errors.push(`[${loc.country}] sku_master lookup: ${smErr.message}`)
      }
      const asinToSku: Record<string, string> = {}
      for (const row of skuMasterRows ?? []) {
        if (row.asin) asinToSku[row.asin] = row.sku
      }
      console.log(`[sync] [${loc.country}] asin→sku map: ${Object.keys(asinToSku).length} entries`)


      if (inventory.length > 0) {
        const snapshotDate = new Date().toISOString().split('T')[0]
        const snapRows = inventory
          .filter((item) => asinToSku[item.asin])
          .map((item) => ({
            sku: asinToSku[item.asin],
            node: 'amazon_fba',
            warehouse_name: null,
            available: item.available,
            inbound: item.inbound,
            reserved: item.reserved,
            snapshot_date: snapshotDate,
            country: loc.country
          }))

        console.log(`[sync] [${loc.country}] inventory: ${inventory.length} ASINs from Saddl, ${snapRows.length} matched to sku_master`)

        if (snapRows.length > 0) {
          const { error: invErr } = await supabase
            .from('inventory_snapshot')
            .upsert(snapRows, {
              onConflict: 'sku,node,warehouse_name,snapshot_date,country',
            })
          if (invErr) {
            errors.push(`inventory_snapshot upsert: ${invErr.message}`)
          } else {
            skus_processed += snapRows.length
          }
        }
      }

      if (sales.length > 0) {
        const salesRows = sales
          .filter((s) => asinToSku[s.asin])
          .map((s) => ({
            sku: asinToSku[s.asin],
            date: s.date,
            channel: 'amazon' as const,
            units_sold: s.units_sold,
            country: loc.country
          }))

        console.log(`[sync] [${loc.country}] sales: ${sales.length} ASIN-rows from Saddl, ${salesRows.length} matched to sku_master`)

        if (salesRows.length > 0) {
          const { error: salesErr } = await supabase
            .from('sales_snapshot')
            .upsert(salesRows, { onConflict: 'sku,date,channel,country' })
          if (salesErr) {
            errors.push(`sales_snapshot upsert: ${salesErr.message}`)
          }
        }

        // --- NEW: Populate raw amazon_sales for fact table refresh ---
        const rawSalesRows = sales.map(s => ({
          report_date: s.date,
          child_asin: s.asin,
          units_ordered: s.units_sold,
          ordered_revenue: s.revenue
        }))

        if (rawSalesRows.length > 0) {
          const { error: rawErr } = await supabase
            .from('amazon_sales')
            .upsert(rawSalesRows, { onConflict: 'report_date,child_asin' })
          if (rawErr) console.error('[sync] amazon_sales upsert error:', rawErr)
        }
      }
      } catch (err) {
        errors.push(`[${loc.country}] Amazon sync error: ${(err as Error).message}`)
      }
    } // end for-each location
  }

  // ---- Locad REST API ----
  if (source === 'locad' || source === 'all') {
    if (!isLocadConfigured()) {
      locad_status = 'skipped_not_connected'
    } else {
      try {
        const client = new LocadClient()
        const locadInventory = await client.getInventory()

        if (locadInventory.length > 0) {
          // ── Step 1: Generate a unique ID for this sync run ──────────────────
          const syncRunId = crypto.randomUUID()
          const snapshotDate = new Date().toISOString().split('T')[0]

          // ── Step 2: Resolve FNSKUs from sku_master ──────────────────────────
          const upcs = [...new Set(locadInventory.map((i) => i.upc).filter(Boolean))]

          const fnskuRowsToFetch = [...upcs]
          upcs.forEach(u => {
            if (u.endsWith('S')) fnskuRowsToFetch.push(u.slice(0, -1))
          })

          const { data: fnskuRows, error: fnskuErr } = await supabase
            .from('sku_master')
            .select('sku, fnsku')
            .in('fnsku', [...new Set(fnskuRowsToFetch)])

          if (fnskuErr) errors.push(`sku_master FNSKU lookup: ${fnskuErr.message}`)

          const fnskuToSku = new Map<string, string>()
          for (const row of (fnskuRows ?? []) as { sku: string; fnsku: string }[]) {
            const key = String(row.fnsku ?? '').trim()
            if (key) fnskuToSku.set(key, row.sku)
          }

          // Helper to get SKU from UPC, handling trailing 'S'
          const findSku = (upc: string): string | null => {
            const cleanUpc = upc.trim()
            if (!cleanUpc) return null
            // Direct match
            if (fnskuToSku.has(cleanUpc)) return fnskuToSku.get(cleanUpc) ?? null
            // Try stripping 'S'
            if (cleanUpc.endsWith('S') && fnskuToSku.has(cleanUpc.slice(0, -1))) {
              return fnskuToSku.get(cleanUpc.slice(0, -1)) ?? null
            }
            return null
          }

          // ── Step 3: Write ALL raw rows to staging (before matching) ─────────
          const stagingRows = locadInventory.map((item) => {
            const upc = String(item.upc ?? '').trim()
            const matchedSku = findSku(upc)
            return {
              sync_run_id: syncRunId,
              locad_sku: String(item.sku ?? '').trim(),
              locad_upc: upc || null,
              available: item.available ?? 0,
              matched_sku: matchedSku,
              match_method: matchedSku ? 'fnsku' : 'unmatched',
            }
          })

          const { error: stagingErr } = await supabase
            .from('locad_raw_staging')
            .upsert(stagingRows, { onConflict: 'sync_run_id,locad_sku' })
          if (stagingErr) {
            errors.push(`locad_raw_staging upsert: ${stagingErr.message}`)
            console.error('[sync] locad_raw_staging error:', stagingErr.message)
          } else {
            const unmatchedCount = stagingRows.filter((r) => r.match_method === 'unmatched').length
            console.log(
              `[sync] Locad staging: ${stagingRows.length} rows written ` +
              `(${stagingRows.length - unmatchedCount} matched, ${unmatchedCount} unmatched) ` +
              `sync_run_id=${syncRunId}`
            )
          }

          // ── Step 3.5: Auto-populate locad_sku_map for future manual uploads ─
          const mappedRows = stagingRows
            .filter((r) => r.match_method === 'fnsku' && r.matched_sku)
            .map((r) => ({
              locad_sku: r.locad_sku,
              internal_sku: r.matched_sku,
              matched_by: 'api_fnsku',
              notes: `Auto-mapped via Locad API UPC match (normalized) on ${snapshotDate}`,
            }))

          if (mappedRows.length > 0) {
            const { error: mapErr } = await supabase
              .from('locad_sku_map')
              .upsert(mappedRows, { onConflict: 'locad_sku' })
            if (mapErr) {
              errors.push(`locad_sku_map upsert error: ${mapErr.message}`)
              console.error('[sync] locad_sku_map error:', mapErr.message)
            } else {
              console.log(`[sync] locad_sku_map auto-saved ${mappedRows.length} matched pairs`)
            }
          }

          // ── Step 4: Upsert only matched rows into inventory_snapshot ─────────
          const availableByInternalSku: Record<string, number> = {}
          for (const item of locadInventory) {
            const internalSku = findSku(String(item.upc ?? '').trim())
            if (!internalSku) continue
            availableByInternalSku[internalSku] = (availableByInternalSku[internalSku] ?? 0) + (item.available ?? 0)
          }

          const snapRows = Object.entries(availableByInternalSku).map(([sku, available]) => ({
            sku,
            node: 'locad_warehouse' as const,
            warehouse_name: 'LOCAD Umm Ramool FC',
            available,
            inbound: 0,
            reserved: 0,
            snapshot_date: snapshotDate,
            country: 'UAE'
          }))

          if (snapRows.length > 0) {
            const { error: locadErr } = await supabase
              .from('inventory_snapshot')
              .upsert(snapRows, {
                onConflict: 'sku,node,warehouse_name,snapshot_date,country',
              })
            if (locadErr) {
              errors.push(`Locad inventory_snapshot upsert: ${locadErr.message}`)
            } else {
              skus_processed += snapRows.length
              locad_status = 'synced'
            }
          } else {
            locad_status = 'synced'
          }
        } else {
          locad_status = 'synced'
        }
      } catch (err) {
        errors.push(`Locad sync error: ${(err as Error).message}`)
      }
    }
  }

  // ---- Refresh metrics ----
  if (refreshAllMetrics) {
    try {
      await refreshAllMetrics(supabase)
    } catch (err) {
      errors.push(`refreshAllMetrics error: ${(err as Error).message}`)
    }
  }

  // ---- Refresh Fact Tables ----
  if (source === 'all') {
    try {
      console.log('[sync] Refreshing fact tables as part of full sync...')
      const { error: err1 } = await supabase.rpc('refresh_fact_inventory_planning')
      if (err1) errors.push(`Planning Refresh Error: ${err1.message}`)
      const { error: err2 } = await supabase.rpc('refresh_fact_sales_data')
      if (err2) {
        const { error: errRaw } = await supabase.rpc('execute_sql', { sql: 'SELECT public.refresh_fact_sales_data()' })
        if (errRaw) errors.push(`Sales Refresh Error: ${errRaw.message}`)
      }
    } catch (err) {
      errors.push(`refresh_fact error: ${(err as Error).message}`)
    }
  }

  const overallStatus = errors.length === 0 ? 'ok' : 'partial'

  return jsonResponse({
    status: overallStatus,
    synced_at,
    skus_processed,
    locad_status,
    ...(errors.length > 0 ? { errors } : {}),
  })
}

// ---------------------------------------------------------------------------
// handleRefreshFact
// ---------------------------------------------------------------------------

async function handleRefreshFact(): Promise<Response> {
  const supabase = getSupabaseAdmin()
  
  console.log('[sync] Refreshing fact tables...')
  
  try {
    // 1. Refresh Inventory Planning Fact
    const { error: err1 } = await supabase.rpc('refresh_fact_inventory_planning')
    if (err1) {
      console.error('[sync] refresh_fact_inventory_planning error:', err1)
      throw new Error(`Planning Refresh Error: ${err1.message}`)
    }
    
    // 2. Refresh Sales Performance Fact (The new SCD Type 2 table)
    const { error: err2 } = await supabase.rpc('refresh_fact_sales_data')
    if (err2) {
      console.error('[sync] refresh_fact_sales_data error:', err2)
      // Fallback: Try raw SQL execution via utility function if RPC fails due to schema cache
      const { error: errRaw } = await supabase.rpc('execute_sql', { sql: 'SELECT public.refresh_fact_sales_data()' })
      if (errRaw) {
        throw new Error(`Sales Refresh Error: ${err2.message} (Raw: ${errRaw.message})`)
      }
    }
    
    return jsonResponse({
      status: 'ok',
      message: 'All Fact tables refreshed successfully'
    })
  } catch (err: any) {
    return jsonResponse({ error: err.message }, 500)
  }
}

async function handleAmazonFDW(): Promise<Response> {
  const supabase = getSupabaseAdmin()
  
  console.log('[sync] Refreshing Amazon FDW...')
  
  // Call the FDW refresh function
  const { error } = await supabase.rpc('refresh_amazon_sales_data')

  if (error) {
    console.error('[sync] refresh_amazon_sales_data error:', error)
    // Attempting raw execution via a workaround if RPC isn't defined as a Supabase RPC
    const { error: execErr } = await supabase.rpc('execute_sql', { sql: 'SELECT public.refresh_amazon_sales_data()' })
    if (execErr) return jsonResponse({ error: `Amazon Refresh failed: ${error.message}` }, 500)
  }

  return jsonResponse({
    status: 'ok',
    message: 'Amazon Remote Data (FDW) refreshed successfully'
  })
}


// ---------------------------------------------------------------------------
// handleStatus
// ---------------------------------------------------------------------------

async function handleStatus(): Promise<Response> {
  const supabase = getSupabaseAdmin()

  // Amazon (Saddl) status
  const amazonStatus = await getSaddlConnectionStatus()

  // Locad API status
  const locadConfigured = isLocadConfigured()
  let locadApiStatus: 'connected' | 'not_connected' = locadConfigured
    ? 'connected'
    : 'not_connected'

  // Locad XLSX upload log
  const { data: xlsxLog } = await supabase
    .from('locad_upload_log')
    .select('uploaded_at, rows_matched, rows_unmatched')
    .order('uploaded_at', { ascending: false })
    .limit(1)

  const latestXlsx = xlsxLog?.[0] ?? null

  // Locad API inventory freshness (latest locad_warehouse snapshot sync)
  const { data: locadInventoryLog } = await supabase
    .from('inventory_snapshot')
    .select('synced_at')
    .eq('node', 'locad_warehouse')
    .order('synced_at', { ascending: false })
    .limit(1)

  const latestLocadInventorySynced = locadInventoryLog?.[0]?.synced_at ?? null

  // Noon CSV — derive last upload date from the most recent noon sales_snapshot row
  const { data: noonSalesLog } = await supabase
    .from('sales_snapshot')
    .select('synced_at')
    .eq('channel', 'noon')
    .order('synced_at', { ascending: false })
    .limit(1)

  const latestNoonSynced = noonSalesLog?.[0]?.synced_at ?? null

  // Noon Inventory — derive last upload date from the most recent noon_fbn or Minutes snapshot
  const { data: noonInventoryLog } = await supabase
    .from('inventory_snapshot')
    .select('synced_at')
    .in('node', ['noon_fbn', 'Minutes'])
    .order('synced_at', { ascending: false })
    .limit(1)

  const latestNoonInventorySynced = noonInventoryLog?.[0]?.synced_at ?? null

  return jsonResponse({
    amazon: {
      status: amazonStatus.status,
      last_synced: amazonStatus.last_synced,
    },
    locad_api: {
      status: locadApiStatus,
      credentials_configured: locadConfigured,
      last_synced: latestLocadInventorySynced,
    },
    locad_xlsx: {
      last_uploaded: latestXlsx?.uploaded_at ?? null,
      rows_matched: latestXlsx?.rows_matched ?? null,
      rows_unmatched: latestXlsx?.rows_unmatched ?? null,
    },
    noon_csv: {
      last_uploaded: latestNoonSynced,
    },
    noon_inventory: {
      last_uploaded: latestNoonInventorySynced,
    },
  })
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
