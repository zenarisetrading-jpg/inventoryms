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
import { getSupabaseClient, getSupabaseAdmin } from '../_shared/supabase.ts'
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

  try {
    const url = new URL(req.url)
    // Extract action from path (e.g. ".../sync/refresh-fact" -> "refresh-fact")
    const segments = url.pathname.split('/').filter(Boolean)
    const action = segments[segments.length - 1] ?? ''

    const clear = url.searchParams.get('clear') === 'true'
    const daysParam = url.searchParams.get('days')
    const days = daysParam ? parseInt(daysParam, 10) : 90
    const countryParam = url.searchParams.get('country')
    const accountParam = url.searchParams.get('account') || url.searchParams.get('account_id') || url.searchParams.get('saddl_id')

    if (req.method === 'GET' && (action === 'status' || action === 'amazon-status')) {
      return await handleStatus(req, countryParam, accountParam)
    }

    if (req.method === 'POST') {
      if (action === 'amazon') return await handleSync(req, 'amazon', clear, days, countryParam, accountParam)
      if (action === 'amazon-fdw') return await handleAmazonFDW(req)
      if (action === 'locad') return await handleSync(req, 'locad', clear, days, countryParam, accountParam)
      if (action === 'all') return await handleSync(req, 'all', clear, days, countryParam, accountParam)
      if (action === 'refresh-fact') return await handleRefreshFact(req)

      if (action === 'debug-saddl') {
        const { getPool } = await import('../_shared/saddl.ts')
        const pool = getPool();
        const conn = await pool.connect();
        const { rows } = await conn.queryObject(`SELECT * FROM sc_raw.sales_traffic LIMIT 1`);
        conn.release();
        return new Response(JSON.stringify(rows, (k, v) => typeof v === 'bigint' ? v.toString() : v, 2), { headers: { 'Content-Type': 'application/json' } });
      }
    }

    return jsonResponse({ error: 'Not found', path: url.pathname }, 404)
  } catch (err) {
    console.error('[sync] Unhandled error:', err)
    return jsonResponse({ error: String((err as Error).message) }, 500)
  }
})

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// handleSync
// ---------------------------------------------------------------------------

async function handleSync(
  req: Request,
  source: 'amazon' | 'locad' | 'all',
  clear = false,
  days = 90,
  countryParam: string | null = null,
  accountParam: string | null = null
): Promise<Response> {
  const supabase = getSupabaseAdmin()
  const synced_at = new Date().toISOString()
  let skus_processed = 0
  let locad_status: 'synced' | 'skipped_not_connected' = 'skipped_not_connected'
  const errors: string[] = []

  // ---- CLEAR RECORDS (Optional) ----
  if (clear) {
    console.log('[sync] Clearing inventory and sales records as requested...')
    const tables = ['inventory_snapshot', 'demand_metrics', 'allocation_plans', 'locad_raw_staging']
    for (const table of tables) {
      const { error } = await supabase.from(table).delete().neq('sku', 'DOES_NOT_EXIST')
      if (error) {
        errors.push(`Clear ${table} failure: ${error.message}`)
      }
    }
    // Protect Noon and Minutes sales from deletion; only clear Amazon rows when clearing Amazon sync
    if (source === 'amazon') {
      await supabase.from('sales_snapshot').delete().eq('channel', 'amazon')
    } else {
      await supabase.from('sales_snapshot').delete().neq('sku', 'DOES_NOT_EXIST')
      await supabase.rpc('sync_sales_snapshot_from_raw')
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
      console.log('[sync] No amazon_locations found, falling back to UAE defaults')
      locations = [{ country: 'UAE', saddl_account_id: 's2c_uae_test', saddl_client_id: 's2c_uae_test' }]
    } else {
      locations = locData
    }
  } catch {
    locations = [{ country: 'UAE', saddl_account_id: 's2c_uae_test', saddl_client_id: 's2c_uae_test' }]
  }

  if (countryParam) {
    locations = locations.filter(l => l.country.toUpperCase() === countryParam.toUpperCase())
  }
  if (accountParam) {
    locations = locations.filter(l => l.saddl_account_id === accountParam || l.saddl_client_id === accountParam)
  }

  const locationSyncResults: any[] = []

  if (source === 'amazon' || source === 'all') {
    // Process locations sequentially to avoid connection starvation on the Saddl pool
    for (const loc of locations) {
      const locErrors: string[] = []
      let locFetched = 0
      let locUpdated = 0
      const syncLogId = crypto.randomUUID()
      const locStartTime = new Date().toISOString()

      // Record started audit log
      try {
        await supabase.from('amazon_sync_log').insert({
          id: syncLogId,
          country: loc.country,
          saddl_id: loc.saddl_account_id,
          status: 'running',
          started_at: locStartTime
        })
      } catch (logErr) {
        console.warn(`[sync] failed to write initial sync log:`, logErr)
      }

      try {
        console.log(`[sync] Syncing Amazon for ${loc.country} (account=${loc.saddl_account_id}, client=${loc.saddl_client_id})`)

        const inventory = await fetchAmazonInventory(loc.saddl_client_id).catch(err => {
          const msg = `[${loc.country}] fetch inventory err: ${err.message}`
          locErrors.push(msg)
          errors.push(msg)
          return []
        })
        locFetched = inventory.length

        const sales = await fetchAmazonSales(days, loc.saddl_account_id).catch(err => {
          const msg = `[${loc.country}] fetch sales err: ${err.message}`
          locErrors.push(msg)
          errors.push(msg)
          return []
        })

        // Build SKU, ASIN, and FNSKU mapping from sku_master (filtered by country and saddl_id with full pagination)
        const skuMasterRows: any[] = []
        let smFrom = 0
        const SM_STEP = 1000
        while (true) {
          const { data: page, error: smErr } = await supabase
            .from('sku_master')
            .select('sku, asin, fnsku')
            .eq('country', loc.country)
            .eq('saddl_id', loc.saddl_account_id)
            .range(smFrom, smFrom + SM_STEP - 1)

          if (smErr) {
            const msg = `[${loc.country}] sku_master lookup: ${smErr.message}`
            locErrors.push(msg)
            errors.push(msg)
            break
          }
          if (!page || page.length === 0) break
          skuMasterRows.push(...page)
          if (page.length < SM_STEP) break
          smFrom += SM_STEP
        }

        const validSkus = new Map<string, string>() // upper SKU -> original SKU
        const asinToSku: Record<string, string> = {}
        const fnskuToSku: Record<string, string> = {}

        for (const row of skuMasterRows ?? []) {
          if (row.sku) validSkus.set(row.sku.trim().toUpperCase(), row.sku)
          if (row.asin && row.sku) asinToSku[row.asin.trim()] = row.sku
          if (row.fnsku && row.sku) fnskuToSku[row.fnsku.trim()] = row.sku
        }

        console.log(`[sync] [${loc.country}] Catalog mapping: ${validSkus.size} SKUs, ${Object.keys(asinToSku).length} ASINs, ${Object.keys(fnskuToSku).length} FNSKUs`)

        // Only update inventory if we fetched records — never overwrite valid data with zero on empty fetch
        if (inventory.length > 0) {
          const snapshotDate = new Date().toISOString().split('T')[0]
          const snapRows: any[] = []

          for (const item of inventory) {
            let resolvedSku: string | null = null

            // 1. Direct SKU match if seller SKU is present
            if (item.sku && validSkus.has(item.sku.trim().toUpperCase())) {
              resolvedSku = validSkus.get(item.sku.trim().toUpperCase())!
            } else if (item.asin && asinToSku[item.asin.trim()]) {
              resolvedSku = asinToSku[item.asin.trim()]
            } else if (item.fnsku && fnskuToSku[item.fnsku.trim()]) {
              resolvedSku = fnskuToSku[item.fnsku.trim()]
            }

            if (resolvedSku) {
              snapRows.push({
                sku: resolvedSku,
                node: 'amazon_fba',
                warehouse_name: null,
                available: item.available,
                inbound: item.inbound,
                reserved: item.reserved,
                snapshot_date: snapshotDate,
                country: loc.country,
                saddl_id: loc.saddl_account_id
              })
            }
          }

          console.log(`[sync] [${loc.country}] inventory: ${inventory.length} items from Saddl, ${snapRows.length} matched to sku_master`)

          if (snapRows.length > 0) {
            // Upsert in chunks of 100 to avoid payload limits and timeouts
            const CHUNK_SIZE = 100
            for (let i = 0; i < snapRows.length; i += CHUNK_SIZE) {
              const chunk = snapRows.slice(i, i + CHUNK_SIZE)
              const { error: invErr } = await supabase
                .from('inventory_snapshot')
                .upsert(chunk, {
                  onConflict: 'sku,node,warehouse_name,snapshot_date,country,saddl_id',
                })
              if (invErr) {
                const msg = `[${loc.country}] inventory_snapshot upsert: ${invErr.message}`
                locErrors.push(msg)
                errors.push(msg)
              } else {
                locUpdated += chunk.length
                skus_processed += chunk.length
              }
            }
          }
        }

        if (sales.length > 0) {
          const salesRows: any[] = []
          for (const s of sales) {
            const resolvedSku = asinToSku[s.asin.trim()]
            if (resolvedSku) {
              salesRows.push({
                sku: resolvedSku,
                date: s.date,
                channel: 'amazon' as const,
                units_sold: s.units_sold,
                revenue: s.revenue,
                country: loc.country,
                saddl_id: loc.saddl_account_id
              })
            }
          }

          console.log(`[sync] [${loc.country}] sales: ${sales.length} ASIN-rows from Saddl, ${salesRows.length} matched to sku_master`)

          if (salesRows.length > 0) {
            const CHUNK_SIZE = 500
            for (let i = 0; i < salesRows.length; i += CHUNK_SIZE) {
              const chunk = salesRows.slice(i, i + CHUNK_SIZE)
              const { error: salesErr } = await supabase
                .from('sales_snapshot')
                .upsert(chunk, { onConflict: 'sku,date,channel,country,saddl_id' })
              if (salesErr) {
                const msg = `[${loc.country}] sales_snapshot upsert: ${salesErr.message}`
                locErrors.push(msg)
                errors.push(msg)
              }
            }
          }

          // Populate raw amazon_sales for fact table refresh (deduplicated by report_date, child_asin, country)
          const rawSalesMap = new Map<string, any>()
          for (const s of sales) {
            const key = `${s.date}_${s.asin}_${loc.country}`
            if (!rawSalesMap.has(key)) {
              rawSalesMap.set(key, {
                report_date: s.date,
                child_asin: s.asin,
                country: loc.country,
                units_ordered: s.units_sold,
                ordered_revenue: s.revenue,
                saddl_id: loc.saddl_account_id
              })
            } else {
              const existing = rawSalesMap.get(key)
              existing.units_ordered = (existing.units_ordered || 0) + (s.units_sold || 0)
              existing.ordered_revenue = (existing.ordered_revenue || 0) + (s.revenue || 0)
            }
          }
          const rawSalesRows = Array.from(rawSalesMap.values())

          if (rawSalesRows.length > 0) {
            const CHUNK_SIZE = 500
            for (let i = 0; i < rawSalesRows.length; i += CHUNK_SIZE) {
              const chunk = rawSalesRows.slice(i, i + CHUNK_SIZE)
              const { error: rawErr } = await supabase
                .from('amazon_sales')
                .upsert(chunk, { onConflict: 'report_date,child_asin,country,saddl_id' })
              if (rawErr) {
                console.error('[sync] amazon_sales upsert error:', rawErr)
                const msg = `[${loc.country}] amazon_sales upsert: ${rawErr.message}`
                locErrors.push(msg)
                errors.push(msg)
              }
            }
          }
        }

        // Record completed audit log
        const locStatus = locErrors.length === 0 ? 'success' : (locUpdated > 0 ? 'partial' : 'failed')
        locationSyncResults.push({
          country: loc.country,
          account_id: loc.saddl_account_id,
          status: locStatus,
          records_fetched: locFetched,
          records_updated: locUpdated,
          errors: locErrors
        })

        try {
          await supabase.from('amazon_sync_log').update({
            status: locStatus,
            completed_at: new Date().toISOString(),
            records_fetched: locFetched,
            records_updated: locUpdated,
            error_details: locErrors.join('; ') || null
          }).eq('id', syncLogId)
        } catch (updateLogErr) {
          console.warn(`[sync] failed to update sync log:`, updateLogErr)
        }

      } catch (err) {
        const msg = `[${loc.country}] Amazon sync error: ${(err as Error).message}`
        locErrors.push(msg)
        errors.push(msg)
        locationSyncResults.push({
          country: loc.country,
          account_id: loc.saddl_account_id,
          status: 'failed',
          records_fetched: locFetched,
          records_updated: locUpdated,
          errors: locErrors
        })

        try {
          await supabase.from('amazon_sync_log').update({
            status: 'failed',
            completed_at: new Date().toISOString(),
            records_fetched: locFetched,
            records_updated: locUpdated,
            error_details: locErrors.join('; ')
          }).eq('id', syncLogId)
        } catch {}
      }
    }
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
            country: 'UAE',
            saddl_id: 's2c_uae_test' // Mapped to primary account per user request
          }))

          if (snapRows.length > 0) {
            const { error: locadErr } = await supabase
              .from('inventory_snapshot')
              .upsert(snapRows, {
                onConflict: 'sku,node,warehouse_name,snapshot_date,country,saddl_id',
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
  try {
    console.log(`[sync] Refreshing fact tables for source=${source}...`)
    const { error: err1 } = await supabase.rpc('refresh_fact_inventory_planning')
    if (err1) errors.push(`Planning Refresh Error: ${err1.message}`)

    if (source === 'amazon' || source === 'all') {
      const { error: err2 } = await supabase.rpc('refresh_fact_sales_data', { days_back: days })
      if (err2) {
        const { error: errRaw } = await supabase.rpc('execute_sql', { sql: `SELECT public.refresh_fact_sales_data(${days})` })
        if (errRaw) errors.push(`Sales Refresh Error: ${errRaw.message}`)
      }
    }
  } catch (err) {
    errors.push(`refresh_fact error: ${(err as Error).message}`)
  }

  const overallStatus = errors.length === 0 ? 'ok' : 'partial'

  return jsonResponse({
    status: overallStatus,
    synced_at,
    skus_processed,
    locad_status,
    locations: locationSyncResults,
    ...(errors.length > 0 ? { errors } : {}),
  })
}

// ---------------------------------------------------------------------------
// handleRefreshFact
// ---------------------------------------------------------------------------

async function handleRefreshFact(req: Request): Promise<Response> {
  const supabase = getSupabaseAdmin()
  
  console.log('[sync] Refreshing fact tables...')
  
  try {
    // 0a. Sync Sales Snapshot from raw Noon & Minutes tables
    console.log('[sync] Syncing sales snapshot from raw orders...')
    const { error: syncSalesErr } = await supabase.rpc('sync_sales_snapshot_from_raw')
    if (syncSalesErr) {
      console.warn('[sync] sync_sales_snapshot_from_raw warning:', syncSalesErr)
    }

    // 0b. Trigger sync-inventory-age
    console.log('[sync] Triggering sync-inventory-age...')
    const { error: syncAgeErr } = await supabase.functions.invoke('sync-inventory-age', {
      method: 'POST'
    })
    if (syncAgeErr) {
      console.error('[sync] sync-inventory-age error (non-fatal):', syncAgeErr)
    }

    // 1. Refresh Inventory Planning Fact
    const { error: err1 } = await supabase.rpc('refresh_fact_inventory_planning')
    if (err1) {
      console.error('[sync] refresh_fact_inventory_planning error:', err1)
      throw new Error(`Planning Refresh Error: ${err1.message}`)
    }
    
    // 2. Refresh Sales Performance Fact (The new SCD Type 2 table)
    const { error: err2 } = await supabase.rpc('refresh_fact_sales_data', { days_back: 90 }) // Hardcoded 90 for standalone refresh API
    if (err2) {
      console.error('[sync] refresh_fact_sales_data error:', err2)
      // Fallback: Try raw SQL execution via utility function if RPC fails due to schema cache
      const { error: errRaw } = await supabase.rpc('execute_sql', { sql: 'SELECT public.refresh_fact_sales_data(90)' })
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

async function handleAmazonFDW(req: Request): Promise<Response> {
  const supabase = getSupabaseClient(req)
  
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

async function handleStatus(
  req: Request,
  countryParam?: string | null,
  accountParam?: string | null
): Promise<Response> {
  const supabase = getSupabaseAdmin()

  // Amazon (Saddl) status
  const amazonStatus = await getSaddlConnectionStatus()

  // Query amazon_sync_log via RPC
  let latestAmazonSync: any = null
  try {
    const { data: syncLogs, error: syncLogErr } = await supabase.rpc('get_latest_amazon_sync_status', {
      p_country: countryParam || 'UAE',
      p_saddl_id: accountParam || 's2c_uae_test',
    })
    if (!syncLogErr && syncLogs) {
      latestAmazonSync = Array.isArray(syncLogs) ? (syncLogs[0] ?? null) : syncLogs
    }
  } catch (err) {
    console.warn('[sync] failed to fetch latest amazon sync status:', err)
  }

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
      sync_log: latestAmazonSync,
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
