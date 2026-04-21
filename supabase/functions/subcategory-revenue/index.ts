import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { corsHeaders } from '../_shared/cors.ts'
import { getSupabaseAdmin } from '../_shared/supabase.ts'
import { fetchAmazonSalesRevenue } from '../_shared/saddl.ts'

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'GET') return jsonResponse({ error: 'Method not allowed' }, 405)

  try {
    const url = new URL(req.url)
    const days = Number(url.searchParams.get('days') ?? '60')
    const rangeDays = Number.isFinite(days) && days > 0 ? Math.floor(days) : 60
    const cutoff = new Date(Date.now() - rangeDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

    const supabase = getSupabaseAdmin()
    const [salesResult, skuResult, amazonRevenueRows] = await Promise.all([
      supabase
        .from('sales_snapshot')
        .select('sku, channel, units_sold')
        .gte('date', cutoff)
        .in('channel', ['noon', 'noon_minutes']),
      // Try to read avg_sell_price_aed; fallback if column is missing.
      (async () => {
        const withPrice = await supabase
          .from('sku_master')
          .select('sku, asin, sub_category, avg_sell_price_aed')
        if (!withPrice.error) return withPrice
        return supabase
          .from('sku_master')
          .select('sku, asin, sub_category')
      })(),
      fetchAmazonSalesRevenue(rangeDays),
    ])

    if (salesResult.error) {
      return jsonResponse({ error: 'Failed to fetch sales', detail: salesResult.error.message }, 500)
    }
    if (skuResult.error) {
      return jsonResponse({ error: 'Failed to fetch sku metadata', detail: skuResult.error.message }, 500)
    }

    const skuMeta = new Map<string, { sub_category: string; avg_sell_price_aed: number }>()
    const asinToSku = new Map<string, string>()
    for (const row of (skuResult.data ?? []) as { sku: string; asin?: string | null; sub_category: string | null; avg_sell_price_aed?: number | null }[]) {
      skuMeta.set(row.sku, {
        sub_category: row.sub_category ?? 'Unknown',
        avg_sell_price_aed: Number(row.avg_sell_price_aed ?? 0),
      })
      if (row.asin) asinToSku.set(row.asin, row.sku)
    }

    // Revenue by subcategory from Amazon direct revenue.
    const revenueBySub = new Map<string, number>()
    const skusBySub = new Map<string, Set<string>>()
    let totalRevenue = 0
    for (const row of amazonRevenueRows) {
      const sku = asinToSku.get(row.asin)
      if (!sku) continue
      const meta = skuMeta.get(sku)
      if (!meta) continue
      const revenue = Number(row.revenue ?? 0)
      if (!Number.isFinite(revenue) || revenue <= 0) continue
      totalRevenue += revenue
      revenueBySub.set(meta.sub_category, (revenueBySub.get(meta.sub_category) ?? 0) + revenue)
      const subSet = skusBySub.get(meta.sub_category) ?? new Set<string>()
      subSet.add(sku)
      skusBySub.set(meta.sub_category, subSet)
    }

    // Revenue by subcategory from Noon sales using avg_sell_price_aed.
    for (const row of (salesResult.data ?? []) as { sku: string; channel: string; units_sold: number }[]) {
      const meta = skuMeta.get(row.sku)
      if (!meta) continue
      const revenue = (row.units_sold ?? 0) * (meta.avg_sell_price_aed ?? 0)
      if (!Number.isFinite(revenue) || revenue <= 0) continue
      totalRevenue += revenue
      revenueBySub.set(meta.sub_category, (revenueBySub.get(meta.sub_category) ?? 0) + revenue)
      const subSet = skusBySub.get(meta.sub_category) ?? new Set<string>()
      subSet.add(row.sku)
      skusBySub.set(meta.sub_category, subSet)
    }

    const contributions = Array.from(revenueBySub.entries())
      .map(([sub_category, revenue_aed]) => ({
        sub_category,
        revenue_aed: Math.round(revenue_aed),
        contribution_pct: totalRevenue > 0 ? Math.round((revenue_aed / totalRevenue) * 10000) / 100 : 0,
        distinct_skus: (skusBySub.get(sub_category) ?? new Set<string>()).size,
        skus: Array.from(skusBySub.get(sub_category) ?? new Set<string>()).sort(),
      }))
      .sort((a, b) => b.contribution_pct - a.contribution_pct)

    return jsonResponse({
      range_days: rangeDays,
      revenue_basis: 'amazon: ordered_revenue (Saddl), noon: units_sold * avg_sell_price_aed',
      total_revenue_aed: Math.round(totalRevenue),
      contributions,
      generated_at: new Date().toISOString(),
    })
  } catch (err) {
    console.error('subcategory-revenue: unhandled error', err)
    return jsonResponse({ error: 'Internal server error', detail: String(err) }, 500)
  }
})
