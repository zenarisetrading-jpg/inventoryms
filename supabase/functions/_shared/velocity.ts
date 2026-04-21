import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import type { SKU } from './types.ts'
import { THRESHOLDS } from './types.ts'
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
  supabase: SupabaseClient
): Promise<{ sv_7: number; sv_90: number; blended_sv: number; amazon_sv: number; noon_sv: number }> {
  const today = new Date()
  const date7dAgo = new Date(today)
  date7dAgo.setDate(today.getDate() - 7)
  const date90dAgo = new Date(today)
  date90dAgo.setDate(today.getDate() - 90)
  const date30dAgo = new Date(today)
  date30dAgo.setDate(today.getDate() - 30)

  const fmt = (d: Date) => d.toISOString().split('T')[0]

  // Fetch last 90 days of sales data for this SKU (all channels)
  const { data, error } = await supabase
    .from('sales_snapshot')
    .select('date, channel, units_sold')
    .eq('sku', sku)
    .gte('date', fmt(date90dAgo))
    .lte('date', fmt(today))

  if (error || !data || data.length === 0) {
    return { sv_7: 0, sv_90: 0, blended_sv: 0, amazon_sv: 0, noon_sv: 0 }
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
      r.date >= fmt(date30dAgo) && (r.channel === 'noon' || r.channel === 'noon_minutes')
    )
    .reduce((sum: number, r: { units_sold: number }) => sum + (r.units_sold ?? 0), 0)

  const sv_7 = units7d / 7
  const sv_90 = units90d / 90

  // Total daily velocity across all channels — used for coverage, reorder, and allocation.
  const amazon_sv = daysCovered < 7 ? 0 : units30dAmazon / 30
  const noon_sv = daysCovered < 7 ? 0 : units30dNoon / 30
  const blended_sv = amazon_sv + noon_sv

  return { sv_7, sv_90, blended_sv, amazon_sv, noon_sv }
}

// ---------------------------------------------------------------------------
// refreshAllMetrics
// ---------------------------------------------------------------------------
// Master refresh function called after every data ingestion cycle.
// Iterates all active SKUs, recomputes all metrics, and upserts results.
// ---------------------------------------------------------------------------
export async function refreshAllMetrics(supabase: SupabaseClient): Promise<void> {
  const today = new Date()
  const date60dAgo = new Date(today)
  date60dAgo.setDate(today.getDate() - 60)
  const fmt = (d: Date) => d.toISOString().split('T')[0]

  // 1. Identify and update active/inactive status
  // FETCH current state of all SKUs
  const { data: allSkus, error: allError } = await supabase
    .from('sku_master')
    .select('sku, created_at, is_active')

  if (allError || !allSkus) {
    console.error('refreshAllMetrics: failed to fetch all SKUs', allError)
    return
  }

  // FETCH 60-day sales totals for all SKUs
  const { data: sales60d, error: salesError } = await supabase
    .from('sales_snapshot')
    .select('sku, units_sold')
    .gte('date', fmt(date60dAgo))

  const salesMap = new Map<string, number>()
  for (const s of sales60d ?? []) {
    salesMap.set(s.sku, (salesMap.get(s.sku) ?? 0) + (s.units_sold ?? 0))
  }

  // Determine which SKUs to deactivate or reactivate
  const toDeactivate: string[] = []
  const toActivate: string[] = []

  for (const sku of allSkus) {
    const hasSales = (salesMap.get(sku.sku) ?? 0) > 0
    const isOldEnough = new Date(sku.created_at) < date60dAgo

    if (!hasSales && isOldEnough && sku.is_active) {
      toDeactivate.push(sku.sku)
    } else if (hasSales && !sku.is_active) {
      toActivate.push(sku.sku)
    }
  }

  // Bulk update SKUs in database
  if (toDeactivate.length > 0) {
    console.log(`refreshAllMetrics: deactivating ${toDeactivate.length} SKUs due to 60d inactivity`)
    await supabase.from('sku_master').update({ is_active: false }).in('sku', toDeactivate)
    // Also clear demand_metrics for inactive SKUs to remove them from OOS reports immediately
    await supabase.from('demand_metrics').delete().in('sku', toDeactivate)
  }
  if (toActivate.length > 0) {
    console.log(`refreshAllMetrics: reactivating ${toActivate.length} SKUs with recent sales`)
    await supabase.from('sku_master').update({ is_active: true }).in('sku', toActivate)
  }

  // 2. Fetch resulting active SKUs for metric computation
  const { data: skus, error: skuError } = await supabase
    .from('sku_master')
    .select('*')
    .eq('is_active', true)

  if (skuError || !skus || skus.length === 0) {
    console.error('refreshAllMetrics: failed to fetch active SKUs', skuError)
    return
  }

  const todayStr = new Date().toISOString().split('T')[0]

  // Delete today's pending allocation plans upfront so we can insert fresh ones per-SKU
  await supabase
    .from('allocation_plans')
    .delete()
    .eq('status', 'pending')
    .eq('plan_date', todayStr)

  // Process SKUs in parallel batches of 10 to stay well within the 60s timeout
  const BATCH_SIZE = 10
  for (let i = 0; i < (skus as SKU[]).length; i += BATCH_SIZE) {
    const batch = (skus as SKU[]).slice(i, i + BATCH_SIZE)

    await Promise.all(batch.map(async (sku: SKU) => {
      try {
        // Velocity
        const { sv_7, sv_90, blended_sv, amazon_sv, noon_sv } = await computeVelocity(sku.sku, supabase)

        // Coverage
        const coverage = await computeCoverage(sku, blended_sv, supabase)

        // Action flag
        const action_flag = computeActionFlag(sku, blended_sv, coverage)

        // Reorder recommendation
        // stock_in_hand = all physical stock (any node) + supplier POs + internal transfers in-flight
        const reorder = computeReorder(
          sku,
          blended_sv,
          coverage.incoming_po_units + coverage.in_transit_allocation_units,
          coverage.total_available
        )

        // Upsert demand_metrics immediately (don't accumulate — avoids timeout data loss)
        const { error: metricsErr } = await supabase
          .from('demand_metrics')
          .upsert({
            sku: sku.sku,
            sv_7,
            sv_90,
            blended_sv,
            amazon_sv,
            noon_sv,
            coverage_amazon: coverage.by_node.amazon_fba.coverage_days,
            coverage_noon: coverage.by_node.noon_fbn.coverage_days,
            coverage_warehouse: coverage.by_node.locad_warehouse.coverage_days,
            total_coverage: coverage.total_coverage,
            projected_coverage: coverage.projected_coverage,
            total_available: coverage.total_available,
            incoming_po_units: coverage.incoming_po_units,
            in_transit_allocation_units: coverage.in_transit_allocation_units,
            action_flag,
            should_reorder: reorder?.should_reorder ?? false,
            suggested_reorder_units: reorder?.suggested_units ?? 0,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'sku' })
        if (metricsErr) {
          console.error(`refreshAllMetrics: demand_metrics upsert error for ${sku.sku}`, metricsErr)
        }

        // Allocation plans (insert fresh ones per-SKU)
        await computeAllocation(sku, coverage, amazon_sv, noon_sv, supabase)
      } catch (err) {
        console.error(`refreshAllMetrics: error processing SKU ${sku.sku}`, err)
      }
    }))
  }

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
