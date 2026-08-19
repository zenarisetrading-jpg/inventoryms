import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import type { SKU } from './types.ts'
import { THRESHOLDS, INCOMING_PO_STATUSES } from './types.ts'
import { computeCoverage } from './coverage.ts'
import { computeAllocation } from './allocation.ts'
import { computeReorder } from './reorder.ts'
import { computeActionFlag } from './coverage.ts'
import { refreshABCCategories } from './abc.ts'

// ---------------------------------------------------------------------------
// computeVelocity
// ---------------------------------------------------------------------------
// Queries sales_snapshot for a given SKU, summing amazon + noon channels.
// Returns 7-day velocity, 90-day velocity, and a blended velocity.
// ---------------------------------------------------------------------------
export async function computeVelocity(
  sku: string,
  supabase: SupabaseClient,
  country: string = 'UAE',
  saddl_id: string = 'none'
): Promise<{ sv_7: number; sv_90: number; blended_sv: number; amazon_sv: number; noon_sv: number; minutes_sv: number }> {
  const today = new Date()
  const date7dAgo = new Date(today)
  date7dAgo.setDate(today.getDate() - 7)
  const date90dAgo = new Date(today)
  date90dAgo.setDate(today.getDate() - 90)
  const date30dAgo = new Date(today)
  date30dAgo.setDate(today.getDate() - 30)

  const fmt = (d: Date) => d.toISOString().split('T')[0]

  // Fetch last 90 days of sales data for this SKU (all channels, filtered by country and saddl_id)
  const { data, error } = await supabase
    .from('sales_snapshot')
    .select('date, channel, units_sold')
    .eq('sku', sku)
    .eq('country', country)
    .eq('saddl_id', saddl_id)
    .gte('date', fmt(date90dAgo))
    .lte('date', fmt(today))

  if (error || !data || data.length === 0) {
    return { sv_7: 0, sv_90: 0, blended_sv: 0, amazon_sv: 0, noon_sv: 0, minutes_sv: 0 }
  }

  // Determine earliest data date to detect sparse history
  const dates = data.map((r: { date: string }) => r.date).sort()
  const earliestDate = new Date(dates[0])
  const daysCovered = Math.floor(
    (today.getTime() - earliestDate.getTime()) / (1000 * 60 * 60 * 24)
  )

  // Sum units in last 7 days
  const units7d = data
    .filter((r: { date: string; units_sold: number }) => r.date >= fmt(date7dAgo))
    .reduce((sum: number, r: { units_sold: number }) => sum + (r.units_sold ?? 0), 0)

  // Sum units in last 90 days (all records already filtered above)
  const units90d = data.reduce(
    (sum: number, r: { units_sold: number }) => sum + (r.units_sold ?? 0),
    0
  )

  // Channel-specific units in last 30 days for weighted blended SV
  const units30dAmazon = data
    .filter((r: { date: string; channel?: string; units_sold: number }) =>
      r.date >= fmt(date30dAgo) && r.channel === 'amazon'
    )
    .reduce((sum: number, r: { units_sold: number }) => sum + (r.units_sold ?? 0), 0)

  const units30dNoon = data
    .filter((r: { date: string; channel?: string; units_sold: number }) =>
      r.date >= fmt(date30dAgo) && r.channel === 'noon'
    )
    .reduce((sum: number, r: { units_sold: number }) => sum + (r.units_sold ?? 0), 0)

  const units30dMinutes = data
    .filter((r: { date: string; channel?: string; units_sold: number }) =>
      r.date >= fmt(date30dAgo) && r.channel === 'noon_minutes'
    )
    .reduce((sum: number, r: { units_sold: number }) => sum + (r.units_sold ?? 0), 0)

  const sv_7 = units7d / 7
  const sv_90 = units90d / 90

  // Total daily velocity across all channels — used for coverage, reorder, and allocation.
  const amazon_sv = daysCovered < 7 ? 0 : units30dAmazon / 30
  const noon_sv = daysCovered < 7 ? 0 : units30dNoon / 30
  const minutes_sv = daysCovered < 7 ? 0 : units30dMinutes / 30
  const blended_sv = amazon_sv + noon_sv + minutes_sv

  return { sv_7, sv_90, blended_sv, amazon_sv, noon_sv, minutes_sv }
}

// ---------------------------------------------------------------------------
// refreshAllMetrics
// ---------------------------------------------------------------------------
// Master refresh function called after every data ingestion cycle.
// BULK OPTIMIZED: Fetches all data in single batch queries per location,
// calculates velocity, coverage, reorder, and allocation in-memory,
// and bulk-upserts results in single operations.
// ---------------------------------------------------------------------------
export async function refreshAllMetrics(supabase: SupabaseClient): Promise<void> {
  const today = new Date()
  const todayStr = today.toISOString().split('T')[0]
  const date7dAgo = new Date(today)
  date7dAgo.setDate(today.getDate() - 7)
  const date30dAgo = new Date(today)
  date30dAgo.setDate(today.getDate() - 30)
  const date90dAgo = new Date(today)
  date90dAgo.setDate(today.getDate() - 90)
  const fmt = (d: Date) => d.toISOString().split('T')[0]

  const str7dAgo = fmt(date7dAgo)
  const str30dAgo = fmt(date30dAgo)
  const str90dAgo = fmt(date90dAgo)
  const strToday = fmt(today)

  // Load active locations — process each country and account separately
  let locations: { country: string; saddl_account_id: string }[] = [{ country: 'UAE', saddl_account_id: 'none' }]
  try {
    const { data: locData } = await supabase
      .from('amazon_locations')
      .select('country, saddl_account_id')
      .eq('is_active', true)
    if (locData && locData.length > 0) {
      locations = locData
    }
  } catch {
    // fallback to UAE only
  }

  for (const loc of locations) {
    console.log(`[velocity] Bulk refreshAllMetrics for country=${loc.country}, saddl_id=${loc.saddl_account_id}`)

    // 1. Fetch active SKUs for this country
    const { data: skusData, error: skuError } = await supabase
      .from('sku_master')
      .select('*')
      .eq('is_active', true)
      .eq('country', loc.country)

    if (skuError || !skusData || skusData.length === 0) {
      console.error(`refreshAllMetrics: no active SKUs for country=${loc.country}`, skuError)
      continue
    }

    const skus = skusData as SKU[]

    // 2. BULK FETCH: All 90d sales, inventory snapshots, PO lines, and in-transit allocations in parallel
    const [salesRes, snapRes, poRes, allocRes] = await Promise.all([
      // Sales snapshot for last 90 days
      supabase
        .from('sales_snapshot')
        .select('sku, date, channel, units_sold')
        .eq('country', loc.country)
        .eq('saddl_id', loc.saddl_account_id)
        .gte('date', str90dAgo)
        .lte('date', strToday),

      // Inventory snapshots for this location
      supabase
        .from('inventory_snapshot')
        .select('sku, node, warehouse_name, available, inbound, snapshot_date')
        .eq('country', loc.country)
        .eq('saddl_id', loc.saddl_account_id)
        .order('snapshot_date', { ascending: false }),

      // Incoming PO line items
      supabase
        .from('po_line_items')
        .select('sku, units_ordered, units_received, po_register!inner(status, country, saddl_id)')
        .eq('po_register.country', loc.country)
        .eq('po_register.saddl_id', loc.saddl_account_id)
        .in('po_register.status', INCOMING_PO_STATUSES),

      // In-transit allocations
      supabase
        .from('allocation_plans')
        .select('sku, units_to_ship')
        .eq('country', loc.country)
        .eq('saddl_id', loc.saddl_account_id)
        .in('status', ['approved', 'shipped'])
    ])

    // 3. Index sales data by SKU in memory
    type SalesRow = { sku: string; date: string; channel: string; units_sold: number }
    const salesBySku = new Map<string, SalesRow[]>()
    for (const r of (salesRes.data || []) as SalesRow[]) {
      const list = salesBySku.get(r.sku) || []
      list.push(r)
      salesBySku.set(r.sku, list)
    }

    // 4. Index latest inventory snapshots by SKU and Node
    type SnapRow = { sku: string; node: string; warehouse_name: string | null; available: number; inbound: number; snapshot_date: string }
    const snapsBySku = new Map<string, SnapRow[]>()
    for (const r of (snapRes.data || []) as SnapRow[]) {
      const list = snapsBySku.get(r.sku) || []
      list.push(r)
      snapsBySku.set(r.sku, list)
    }

    // 5. Index incoming PO units by SKU
    const poUnitsBySku = new Map<string, number>()
    for (const r of (poRes.data || []) as { sku: string; units_ordered: number; units_received: number }[]) {
      const remaining = Math.max(0, (r.units_ordered ?? 0) - (r.units_received ?? 0))
      if (remaining > 0) {
        poUnitsBySku.set(r.sku, (poUnitsBySku.get(r.sku) || 0) + remaining)
      }
    }

    // 6. Index in-transit allocation units by SKU
    const inTransitBySku = new Map<string, number>()
    for (const r of (allocRes.data || []) as { sku: string; units_to_ship: number }[]) {
      inTransitBySku.set(r.sku, (inTransitBySku.get(r.sku) || 0) + (r.units_to_ship || 0))
    }

    // Delete today's pending allocation plans upfront so we can insert fresh ones
    await supabase
      .from('allocation_plans')
      .delete()
      .eq('status', 'pending')
      .eq('plan_date', todayStr)
      .eq('country', loc.country)
      .eq('saddl_id', loc.saddl_account_id)

    const demandMetricsRows: any[] = []
    const allocationPlansRows: any[] = []

    // 7. IN-MEMORY COMPUTATION for all SKUs
    for (const sku of skus) {
      const skuSales = salesBySku.get(sku.sku) || []

      // --- Velocity ---
      let sv_7 = 0
      let sv_90 = 0
      let amazon_sv = 0
      let noon_sv = 0
      let minutes_sv = 0
      let blended_sv = 0

      if (skuSales.length > 0) {
        let earliestDateStr = skuSales[0].date
        let units7d = 0
        let units90d = 0
        let units30dAmazon = 0
        let units30dNoon = 0
        let units30dMinutes = 0

        for (const s of skuSales) {
          if (s.date < earliestDateStr) earliestDateStr = s.date
          const u = s.units_sold ?? 0
          units90d += u
          if (s.date >= str7dAgo) units7d += u
          if (s.date >= str30dAgo) {
            if (s.channel === 'amazon') units30dAmazon += u
            else if (s.channel === 'noon') units30dNoon += u
            else if (s.channel === 'noon_minutes') units30dMinutes += u
          }
        }

        const daysCovered = Math.floor(
          (today.getTime() - new Date(earliestDateStr).getTime()) / (1000 * 60 * 60 * 24)
        )

        sv_7 = units7d / 7
        sv_90 = units90d / 90
        amazon_sv = daysCovered < 7 ? 0 : units30dAmazon / 30
        noon_sv = daysCovered < 7 ? 0 : units30dNoon / 30
        minutes_sv = daysCovered < 7 ? 0 : units30dMinutes / 30
        blended_sv = amazon_sv + noon_sv + minutes_sv
      }

      // --- Coverage ---
      const skuSnaps = snapsBySku.get(sku.sku) || []
      const latestDateByNode: Record<string, string> = {}
      for (const row of skuSnaps) {
        if (!latestDateByNode[row.node] || row.snapshot_date > latestDateByNode[row.node]) {
          latestDateByNode[row.node] = row.snapshot_date
        }
      }

      const nodeAggregates = {
        amazon_fba: { available: 0, inbound: 0 },
        noon_fbn: { available: 0, inbound: 0 },
        locad_warehouse: { available: 0, inbound: 0 },
        Minutes: { available: 0, inbound: 0 },
      }

      for (const row of skuSnaps) {
        if (row.snapshot_date !== latestDateByNode[row.node]) continue
        const node = row.node as keyof typeof nodeAggregates
        if (node in nodeAggregates) {
          if (node === 'locad_warehouse') {
            const p = sku.units_per_box ?? 1
            nodeAggregates[node].available += (row.available ?? 0) * p
            nodeAggregates[node].inbound += (row.inbound ?? 0) * p
          } else {
            nodeAggregates[node].available += row.available ?? 0
            nodeAggregates[node].inbound += row.inbound ?? 0
          }
        }
      }

      const coverageDays = (available: number): number => {
        if (blended_sv === 0) return Infinity
        return available / blended_sv
      }

      const incoming_po_units = poUnitsBySku.get(sku.sku) || 0
      const in_transit_allocation_units = inTransitBySku.get(sku.sku) || 0

      const total_available =
        nodeAggregates.amazon_fba.available +
        nodeAggregates.noon_fbn.available +
        nodeAggregates.locad_warehouse.available

      const total_coverage = coverageDays(total_available)
      const projected_coverage = coverageDays(
        total_available + incoming_po_units + in_transit_allocation_units
      )

      const coverageObj = {
        by_node: {
          amazon_fba: { ...nodeAggregates.amazon_fba, coverage_days: coverageDays(nodeAggregates.amazon_fba.available) },
          noon_fbn: { ...nodeAggregates.noon_fbn, coverage_days: coverageDays(nodeAggregates.noon_fbn.available) },
          locad_warehouse: { ...nodeAggregates.locad_warehouse, coverage_days: coverageDays(nodeAggregates.locad_warehouse.available) },
          Minutes: { ...nodeAggregates.Minutes, coverage_days: coverageDays(nodeAggregates.Minutes.available) },
        },
        total_available,
        total_coverage,
        incoming_po_units,
        in_transit_allocation_units,
        projected_coverage,
      }

      // --- Action Flag ---
      const action_flag = computeActionFlag(sku, blended_sv, coverageObj)

      // --- Reorder ---
      const reorder = computeReorder(
        sku,
        blended_sv,
        incoming_po_units + in_transit_allocation_units,
        total_available
      )

      demandMetricsRows.push({
        sku: sku.sku,
        country: loc.country,
        saddl_id: loc.saddl_account_id,
        sv_7,
        sv_90,
        blended_sv,
        amazon_sv,
        noon_sv,
        minutes_sv,
        coverage_amazon: coverageObj.by_node.amazon_fba.coverage_days,
        coverage_noon: coverageObj.by_node.noon_fbn.coverage_days,
        coverage_warehouse: coverageObj.by_node.locad_warehouse.coverage_days,
        total_coverage: isFinite(coverageObj.total_coverage) ? coverageObj.total_coverage : 9999,
        projected_coverage: isFinite(coverageObj.projected_coverage) ? coverageObj.projected_coverage : 9999,
        total_available: coverageObj.total_available,
        incoming_po_units: coverageObj.incoming_po_units,
        in_transit_allocation_units: coverageObj.in_transit_allocation_units,
        action_flag,
        should_reorder: reorder?.should_reorder ?? false,
        suggested_reorder_units: reorder?.suggested_units ?? 0,
        updated_at: new Date().toISOString(),
      })

      // --- Allocation Calculation ---
      if (amazon_sv > 0 || noon_sv > 0) {
        const warehouse_avail = coverageObj.by_node.locad_warehouse.available
        const amazon_avail = coverageObj.by_node.amazon_fba.available
        const noon_avail = coverageObj.by_node.noon_fbn.available
        const upb = sku.units_per_box ?? 1

        if (warehouse_avail > 0 && upb > 0) {
          const boxes_in_hand = Math.floor(warehouse_avail / upb)
          const amazon_deficit = Math.max(0, 30 * amazon_sv - amazon_avail)
          const noon_deficit = Math.max(0, 30 * noon_sv - noon_avail)
          const boxes_req_amz = Math.ceil(amazon_deficit / upb)
          const boxes_req_noon = Math.ceil(noon_deficit / upb)

          let boxes_for_amz = 0
          let boxes_for_noon = 0

          if (boxes_in_hand >= boxes_req_amz + boxes_req_noon) {
            boxes_for_amz = boxes_req_amz
            boxes_for_noon = boxes_req_noon
          } else if (boxes_in_hand >= boxes_req_amz) {
            boxes_for_amz = boxes_req_amz
            boxes_for_noon = boxes_in_hand - boxes_req_amz
          } else {
            boxes_for_amz = boxes_in_hand
            boxes_for_noon = 0
          }

          if (boxes_for_amz > 0) {
            allocationPlansRows.push({
              sku: sku.sku,
              node: 'amazon_fba',
              boxes_to_ship: boxes_for_amz,
              units_to_ship: boxes_for_amz * upb,
              status: 'pending',
              plan_date: todayStr,
              country: loc.country,
              saddl_id: loc.saddl_account_id,
            })
          }

          if (boxes_for_noon > 0) {
            allocationPlansRows.push({
              sku: sku.sku,
              node: 'noon_fbn',
              boxes_to_ship: boxes_for_noon,
              units_to_ship: boxes_for_noon * upb,
              status: 'pending',
              plan_date: todayStr,
              country: loc.country,
              saddl_id: loc.saddl_account_id,
            })
          }
        }
      }
    }

    // 8. BATCH UPSERT: demand_metrics (chunks of 200)
    const CHUNK_SIZE = 200
    for (let i = 0; i < demandMetricsRows.length; i += CHUNK_SIZE) {
      const chunk = demandMetricsRows.slice(i, i + CHUNK_SIZE)
      const { error: dmErr } = await supabase
        .from('demand_metrics')
        .upsert(chunk, { onConflict: 'sku,country,saddl_id' })
      if (dmErr) {
        console.error(`[velocity] Error bulk upserting demand_metrics for ${loc.country}:`, dmErr)
      }
    }

    // 9. BATCH UPSERT: allocation_plans
    if (allocationPlansRows.length > 0) {
      for (let i = 0; i < allocationPlansRows.length; i += CHUNK_SIZE) {
        const chunk = allocationPlansRows.slice(i, i + CHUNK_SIZE)
        const { error: apErr } = await supabase
          .from('allocation_plans')
          .upsert(chunk, { onConflict: 'sku,node,plan_date,country,saddl_id' })
        if (apErr) {
          console.error(`[velocity] Error bulk upserting allocation_plans for ${loc.country}:`, apErr)
        }
      }
    }

    console.log(`[velocity] Finished bulk refresh for ${loc.country}: processed ${skus.length} SKUs, ${demandMetricsRows.length} metrics, ${allocationPlansRows.length} allocation plans`)
  } // end for-each location

  // Reclassify all SKUs on every refresh (60-day rolling window)
  try {
    await refreshABCCategories(supabase, 60)
  } catch (err) {
    console.error('refreshAllMetrics: ABC reclassification failed (non-fatal)', err)
  }
}


// ---------------------------------------------------------------------------
// computeABCThresholdAnalysis
// ---------------------------------------------------------------------------
// Queries 90-day sales distribution from sales_snapshot and computes
// descriptive stats per SKU.  Returns a summary object.
// ---------------------------------------------------------------------------
export async function computeABCThresholdAnalysis(
  supabase: SupabaseClient
): Promise<Record<string, unknown>> {
  const today = new Date()
  const date90dAgo = new Date(today)
  date90dAgo.setDate(today.getDate() - 90)
  const fmt = (d: Date) => d.toISOString().split('T')[0]

  // Pull all 90-day sales grouped by SKU + date (all channels summed)
  const { data, error } = await supabase
    .from('sales_snapshot')
    .select('sku, date, units_sold')
    .gte('date', fmt(date90dAgo))
    .lte('date', fmt(today))

  if (error || !data) {
    console.error('computeABCThresholdAnalysis: query failed', error)
    return {}
  }

  // Aggregate daily units by SKU
  const bySkuDate: Record<string, Record<string, number>> = {}
  for (const row of data as { sku: string; date: string; units_sold: number }[]) {
    if (!bySkuDate[row.sku]) bySkuDate[row.sku] = {}
    bySkuDate[row.sku][row.date] =
      (bySkuDate[row.sku][row.date] ?? 0) + (row.units_sold ?? 0)
  }

  // Compute percentile helper
  const percentile = (sorted: number[], p: number): number => {
    if (sorted.length === 0) return 0
    const idx = (p / 100) * (sorted.length - 1)
    const lower = Math.floor(idx)
    const upper = Math.ceil(idx)
    if (lower === upper) return sorted[lower]
    return sorted[lower] + (sorted[upper] - sorted[lower]) * (idx - lower)
  }

  const skuStats: Record<string, unknown> = {}

  for (const [sku, dateMap] of Object.entries(bySkuDate)) {
    const dailyUnits = Object.values(dateMap).sort((a, b) => a - b)
    const total = dailyUnits.reduce((s, v) => s + v, 0)
    const avg = total / dailyUnits.length

    skuStats[sku] = {
      days_of_data: dailyUnits.length,
      total_units_90d: total,
      avg_daily: Math.round(avg * 100) / 100,
      min: dailyUnits[0],
      p10: Math.round(percentile(dailyUnits, 10) * 100) / 100,
      p25: Math.round(percentile(dailyUnits, 25) * 100) / 100,
      median: Math.round(percentile(dailyUnits, 50) * 100) / 100,
      p75: Math.round(percentile(dailyUnits, 75) * 100) / 100,
      p90: Math.round(percentile(dailyUnits, 90) * 100) / 100,
      max: dailyUnits[dailyUnits.length - 1],
    }
  }

  // Overall velocity distribution to inform ABC threshold tuning
  const allAvgVelocities = Object.values(skuStats)
    .map((s) => (s as Record<string, number>).avg_daily)
    .sort((a, b) => a - b)

  const summary = {
    generated_at: new Date().toISOString(),
    sku_count: Object.keys(skuStats).length,
    velocity_distribution: {
      p10: Math.round(percentile(allAvgVelocities, 10) * 100) / 100,
      p25: Math.round(percentile(allAvgVelocities, 25) * 100) / 100,
      median: Math.round(percentile(allAvgVelocities, 50) * 100) / 100,
      p75: Math.round(percentile(allAvgVelocities, 75) * 100) / 100,
      p90: Math.round(percentile(allAvgVelocities, 90) * 100) / 100,
    },
    current_thresholds: THRESHOLDS,
    per_sku: skuStats,
  }

  return summary
}
