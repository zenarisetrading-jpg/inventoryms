/**
 * _shared/abc.ts
 *
 * ABC classification logic — runs on every refreshAllMetrics call.
 *
 * Rules (60-day rolling window):
 *   A — SKU combined revenue (AMZ + Noon) > 1% of total
 *   A — OR sub-category combined revenue > 5% of total
 *   B — sub-category combined revenue 2–5% of total
 *   C — otherwise (including zero-revenue SKUs)
 */

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { fetchAmazonSalesRevenue } from './saddl.ts'

export type ABCClass = 'A' | 'B' | 'C'

export interface SKUClassification {
  sku: string
  sub_category: string
  amz_revenue_aed: number
  noon_revenue_aed: number
  sku_revenue_aed: number
  sku_contribution_pct: number
  sub_category_contribution_pct: number
  abc_class: ABCClass
  reason: string
}

export interface ABCResult {
  range_days: number
  total_revenue_aed: number
  summary: { A: number; B: number; C: number; no_revenue: number }
  classifications: SKUClassification[]
  generated_at: string
}

// ---------------------------------------------------------------------------
// classifyABC
// Computes per-SKU and per-sub-category revenue, returns full classification.
// Does NOT write to the database.
// ---------------------------------------------------------------------------
export async function classifyABC(
  supabase: SupabaseClient,
  days = 60
): Promise<ABCResult> {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

  const [salesResult, skuResult, amazonRevenueRows] = await Promise.all([
    supabase
      .from('sales_snapshot')
      .select('sku, channel, units_sold')
      .gte('date', cutoff)
      .in('channel', ['noon', 'noon_minutes']),
    (async () => {
      const withPrice = await supabase
        .from('sku_master')
        .select('sku, asin, sub_category, avg_sell_price_aed')
      if (!withPrice.error) return withPrice
      return supabase.from('sku_master').select('sku, asin, sub_category')
    })(),
    fetchAmazonSalesRevenue(days),
  ])

  if (salesResult.error) throw new Error(`sales_snapshot query failed: ${salesResult.error.message}`)
  if (skuResult.error) throw new Error(`sku_master query failed: ${skuResult.error.message}`)

  const skuMeta = new Map<string, { sub_category: string; avg_sell_price_aed: number }>()
  const asinToSku = new Map<string, string>()
  for (const row of (skuResult.data ?? []) as {
    sku: string
    asin?: string | null
    sub_category: string | null
    avg_sell_price_aed?: number | null
  }[]) {
    skuMeta.set(row.sku, {
      sub_category: row.sub_category ?? 'Unknown',
      avg_sell_price_aed: Number(row.avg_sell_price_aed ?? 0),
    })
    if (row.asin) asinToSku.set(row.asin, row.sku)
  }

  const revenueBySkuAMZ = new Map<string, number>()
  const revenueBySkuNoon = new Map<string, number>()
  let totalRevenue = 0

  for (const row of amazonRevenueRows) {
    const sku = asinToSku.get(row.asin)
    if (!sku || !skuMeta.has(sku)) continue
    const revenue = Number(row.revenue ?? 0)
    if (!Number.isFinite(revenue) || revenue <= 0) continue
    revenueBySkuAMZ.set(sku, (revenueBySkuAMZ.get(sku) ?? 0) + revenue)
    totalRevenue += revenue
  }

  for (const row of (salesResult.data ?? []) as { sku: string; units_sold: number }[]) {
    const meta = skuMeta.get(row.sku)
    if (!meta) continue
    const revenue = (row.units_sold ?? 0) * (meta.avg_sell_price_aed ?? 0)
    if (!Number.isFinite(revenue) || revenue <= 0) continue
    revenueBySkuNoon.set(row.sku, (revenueBySkuNoon.get(row.sku) ?? 0) + revenue)
    totalRevenue += revenue
  }

  const revenueBySkuTotal = new Map<string, number>()
  const revenueBySub = new Map<string, number>()

  for (const [sku, rev] of revenueBySkuAMZ) {
    revenueBySkuTotal.set(sku, (revenueBySkuTotal.get(sku) ?? 0) + rev)
    const sub = skuMeta.get(sku)?.sub_category ?? 'Unknown'
    revenueBySub.set(sub, (revenueBySub.get(sub) ?? 0) + rev)
  }
  for (const [sku, rev] of revenueBySkuNoon) {
    revenueBySkuTotal.set(sku, (revenueBySkuTotal.get(sku) ?? 0) + rev)
    const sub = skuMeta.get(sku)?.sub_category ?? 'Unknown'
    revenueBySub.set(sub, (revenueBySub.get(sub) ?? 0) + rev)
  }

  const classifications: SKUClassification[] = []

  for (const [sku, meta] of skuMeta) {
    const amzRev = revenueBySkuAMZ.get(sku) ?? 0
    const noonRev = revenueBySkuNoon.get(sku) ?? 0
    const skuRevenue = amzRev + noonRev
    const subRevenue = revenueBySub.get(meta.sub_category) ?? 0
    const skuPct = totalRevenue > 0 ? (skuRevenue / totalRevenue) * 100 : 0
    const subPct = totalRevenue > 0 ? (subRevenue / totalRevenue) * 100 : 0

    let abc_class: ABCClass
    let reason: string

    if (skuPct > 1) {
      abc_class = 'A'
      reason = `sku ${skuPct.toFixed(2)}% > 1%`
    } else if (subPct > 5) {
      abc_class = 'A'
      reason = `sub-cat "${meta.sub_category}" ${subPct.toFixed(2)}% > 5%`
    } else if (subPct >= 2) {
      abc_class = 'B'
      reason = `sub-cat "${meta.sub_category}" ${subPct.toFixed(2)}% (2–5%)`
    } else {
      abc_class = 'C'
      reason = `sub-cat "${meta.sub_category}" ${subPct.toFixed(2)}% < 2%`
    }

    classifications.push({
      sku,
      sub_category: meta.sub_category,
      amz_revenue_aed: Math.round(amzRev),
      noon_revenue_aed: Math.round(noonRev),
      sku_revenue_aed: Math.round(skuRevenue),
      sku_contribution_pct: Math.round(skuPct * 100) / 100,
      sub_category_contribution_pct: Math.round(subPct * 100) / 100,
      abc_class,
      reason,
    })
  }

  classifications.sort((a, b) => b.sku_revenue_aed - a.sku_revenue_aed)

  return {
    range_days: days,
    total_revenue_aed: Math.round(totalRevenue),
    summary: {
      A: classifications.filter(r => r.abc_class === 'A').length,
      B: classifications.filter(r => r.abc_class === 'B').length,
      C: classifications.filter(r => r.abc_class === 'C').length,
      no_revenue: classifications.filter(r => r.sku_revenue_aed === 0).length,
    },
    classifications,
    generated_at: new Date().toISOString(),
  }
}

// ---------------------------------------------------------------------------
// refreshABCCategories
// Classifies and writes results back to sku_master.category in 3 batch updates.
// Called automatically by refreshAllMetrics after every data ingestion.
// ---------------------------------------------------------------------------
export async function refreshABCCategories(
  supabase: SupabaseClient,
  days = 60
): Promise<void> {
  const result = await classifyABC(supabase, days)

  const skusA = result.classifications.filter(r => r.abc_class === 'A').map(r => r.sku)
  const skusB = result.classifications.filter(r => r.abc_class === 'B').map(r => r.sku)
  const skusC = result.classifications.filter(r => r.abc_class === 'C').map(r => r.sku)

  await Promise.all([
    skusA.length > 0
      ? supabase.from('sku_master').update({ category: 'A' }).in('sku', skusA)
      : Promise.resolve(),
    skusB.length > 0
      ? supabase.from('sku_master').update({ category: 'B' }).in('sku', skusB)
      : Promise.resolve(),
    skusC.length > 0
      ? supabase.from('sku_master').update({ category: 'C' }).in('sku', skusC)
      : Promise.resolve(),
  ])

  console.log(
    `[abc] refreshABCCategories: A=${skusA.length} B=${skusB.length} C=${skusC.length} (${days}d window)`
  )
}
