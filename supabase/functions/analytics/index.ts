import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { corsHeaders } from '../_shared/cors.ts'
import { getSupabaseAdmin } from '../_shared/supabase.ts'
import { INCOMING_PO_STATUSES } from '../_shared/types.ts'

// ---------------------------------------------------------------------------
// Types
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
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const url = new URL(req.url)
    const rangeDays = parseInt(url.searchParams.get('days') ?? '30', 10)
    const validRange = [7, 30, 90].includes(rangeDays) ? rangeDays : 30

    const supabase = getSupabaseAdmin()
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - validRange)
    const cutoff = cutoffDate.toISOString().slice(0, 10)

    // -------------------------------------------------------------------------
    // Run all queries in parallel
    // -------------------------------------------------------------------------
    const [
      salesTrendResult,
      coverageResult,
      skuCoverageResult,
      poPipelineResult,
      poLineItemsResult,
      topSkusResult,
      categoryResult,
      inventoryAmazonResult,
      inventoryNoonResult,
      inventoryLocadResult,
      reorderResult,
      flagCountResult,
      noDataSkusResult,
    ] = await Promise.all([
      // 1. Sales trend: daily totals by channel
      supabase
        .from('sales_snapshot')
        .select('date, channel, units_sold')
        .gte('date', cutoff)
        .order('date', { ascending: true }),

      // 2. Coverage health: all demand_metrics for coverage distribution
      supabase
        .from('demand_metrics')
        .select('sku, coverage_amazon, coverage_noon, coverage_warehouse, action_flag, sku_master!inner(is_active)')
        .eq('sku_master.is_active', true),

      // 3. SKU coverage heatmap: top 80 by action severity
      supabase
        .from('demand_metrics')
        .select('sku, coverage_amazon, coverage_noon, coverage_warehouse, action_flag, blended_sv, sku_master!inner(is_active)')
        .eq('sku_master.is_active', true)
        .order('blended_sv', { ascending: false })
        .limit(80),

      // 4. PO pipeline: incoming/open-shipping POs
      supabase
        .from('po_register')
        .select('id, po_number, supplier, order_date, eta, status')
        .in('status', INCOMING_PO_STATUSES)
        .order('eta', { ascending: true }),

      // 5. PO line items (for units per PO)
      supabase
        .from('po_line_items')
        .select('po_id, sku, units_ordered, units_received'),

      // 6. Top 20 SKUs by revenue in range
      supabase
        .from('sales_snapshot')
        .select('sku, units_sold')
        .gte('date', cutoff),

      // 7. Category performance: sales joined with sku_master sub_category
      supabase
        .from('sales_snapshot')
        .select('sku, channel, units_sold')
        .gte('date', cutoff),

      // 8a/8b/8c. Inventory value inputs by node.
      // Query per-node to avoid API max-rows truncation dropping noon/locad rows.
      supabase
        .from('inventory_snapshot')
        .select('sku, node, warehouse_name, available, snapshot_date')
        .eq('node', 'amazon_fba')
        .gte('snapshot_date', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10))
        .order('snapshot_date', { ascending: false })
        .limit(5000),
      supabase
        .from('inventory_snapshot')
        .select('sku, node, warehouse_name, available, snapshot_date')
        .eq('node', 'noon_fbn')
        .gte('snapshot_date', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10))
        .order('snapshot_date', { ascending: false })
        .limit(5000),
      supabase
        .from('inventory_snapshot')
        .select('sku, node, warehouse_name, available, snapshot_date')
        .eq('node', 'locad_warehouse')
        .gte('snapshot_date', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10))
        .order('snapshot_date', { ascending: false })
        .limit(5000),

      // 9. Reorder cash requirement
      supabase
        .from('demand_metrics')
        .select('sku, action_flag, suggested_reorder_units, sku_master!inner(is_active)')
        .eq('sku_master.is_active', true)
        .eq('should_reorder', true)
        .order('action_flag', { ascending: true }),

      // 10. Current action flag counts
      supabase
        .from('demand_metrics')
        .select('action_flag, sku_master!inner(is_active)')
        .eq('sku_master.is_active', true),

      // 11. SKUs with no coverage data at all (null on all three nodes)
      supabase
        .from('demand_metrics')
        .select('sku, sku_master!inner(is_active)')
        .eq('sku_master.is_active', true)
        .is('coverage_amazon', null)
        .is('coverage_noon', null)
        .is('coverage_warehouse', null),
    ])

    // -------------------------------------------------------------------------
    // Also fetch sku_master for names + cogs + category
    // -------------------------------------------------------------------------
    const { data: skuMasterRows } = await supabase
      .from('sku_master')
      .select('sku, name, category, sub_category, cogs, moq, units_per_box, asin')
      .eq('is_active', true)

    const skuMap = new Map<string, { name: string; category: string | null; sub_category: string | null; cogs: number | null; moq: number | null; units_per_box: number; asin: string | null }>(
      (skuMasterRows ?? []).map((r: { sku: string; name: string; category: string | null; sub_category: string | null; cogs: number | null; moq: number | null; units_per_box: number | null; asin: string | null }) => [
        r.sku.trim().toUpperCase(),
        { name: r.name, category: r.category, sub_category: r.sub_category, cogs: r.cogs, moq: r.moq, units_per_box: r.units_per_box ?? 1, asin: r.asin },
      ])
    )

    // -------------------------------------------------------------------------
    // 1. Sales trend: aggregate by date + channel
    // -------------------------------------------------------------------------
    const salesByDateChannel = new Map<string, { amazon: number; noon: number; noon_minutes: number }>()
    for (const row of (salesTrendResult.data ?? [])) {
      const entry = salesByDateChannel.get(row.date) ?? { amazon: 0, noon: 0, noon_minutes: 0 }
      if (row.channel === 'amazon') entry.amazon += row.units_sold
      else if (row.channel === 'noon') entry.noon += row.units_sold
      else if (row.channel === 'noon_minutes') entry.noon_minutes += row.units_sold
      salesByDateChannel.set(row.date, entry)
    }
    const sales_trend = Array.from(salesByDateChannel.entries())
      .map(([date, v]) => ({ date, ...v }))
      .sort((a, b) => a.date.localeCompare(b.date))

    // -------------------------------------------------------------------------
    // 2. Coverage health
    // -------------------------------------------------------------------------
    const coverageRows = coverageResult.data ?? []
    function coverageBuckets(values: (number | null)[]) {
      let critical = 0, warning = 0, healthy = 0, no_data = 0
      // Only include SKUs with non-null coverage (null = no inventory data synced yet for this node)
      // 0 days IS critical (stock exists but coverage is genuinely zero)
      const nums = values.filter((v): v is number => v !== null && v > 0)
      for (const v of nums) {
        if (v < 14) critical++
        else if (v < 30) warning++
        else healthy++
      }
      // Count nulls and exact-zeros separately so caller can surface "no data"
      for (const v of values) {
        if (v === null) no_data++
        else if (v === 0) critical++ // zero coverage = no stock at all = critical
      }
      const sorted = [...nums].sort((a, b) => a - b)
      const median = sorted.length > 0 ? sorted[Math.floor(sorted.length / 2)] : 0
      return { median_days: Math.round(median), critical, warning, healthy, no_data }
    }
    const coverage_health = {
      amazon_fba: coverageBuckets(coverageRows.map((r: { coverage_amazon: number | null }) => r.coverage_amazon)),
      noon_fbn: coverageBuckets(coverageRows.map((r: { coverage_noon: number | null }) => r.coverage_noon)),
      locad_warehouse: coverageBuckets(coverageRows.map((r: { coverage_warehouse: number | null }) => r.coverage_warehouse)),
    }

    // -------------------------------------------------------------------------
    // 3. SKU coverage heatmap
    // -------------------------------------------------------------------------
    const flagOrder: Record<string, number> = {
      CRITICAL_OOS_RISK: 0,
      OOS_RISK: 1,
      SHIP_NOW: 2,
      REORDER: 3,
      TRANSFER: 4,
      EXCESS: 5,
      OK: 6,
    }
    const sku_coverage = (skuCoverageResult.data ?? [])
      .map((r: { sku: string; coverage_amazon: number | null; coverage_noon: number | null; coverage_warehouse: number | null; action_flag: string | null; blended_sv: number | null }) => ({
        sku: r.sku,
        name: skuMap.get(r.sku)?.name ?? r.sku,
        action_flag: r.action_flag ?? 'OK',
        amazon_fba: r.coverage_amazon !== null ? Math.round(r.coverage_amazon) : null,
        noon_fbn: r.coverage_noon !== null ? Math.round(r.coverage_noon) : null,
        locad_warehouse: r.coverage_warehouse !== null ? Math.round(r.coverage_warehouse) : null,
      }))
      .sort((a: { action_flag: string }, b: { action_flag: string }) =>
        (flagOrder[a.action_flag] ?? 9) - (flagOrder[b.action_flag] ?? 9)
      )

    // -------------------------------------------------------------------------
    // 4 + 5. PO pipeline with line item totals
    // -------------------------------------------------------------------------
    const lineItemsByPO = new Map<string, { total_units: number; skus: string[] }>()
    for (const li of (poLineItemsResult.data ?? [])) {
      const entry = lineItemsByPO.get(li.po_id) ?? { total_units: 0, skus: [] }
      entry.total_units += (li.units_ordered ?? 0) - (li.units_received ?? 0)
      if (!entry.skus.includes(li.sku)) entry.skus.push(li.sku)
      lineItemsByPO.set(li.po_id, entry)
    }
    const po_pipeline = (poPipelineResult.data ?? []).map((po: { id: string; po_number: string; supplier: string | null; order_date: string | null; eta: string | null; status: string }) => ({
      po_number: po.po_number,
      supplier: po.supplier ?? '',
      order_date: po.order_date ?? '',
      eta: po.eta ?? '',
      status: po.status,
      total_units: lineItemsByPO.get(po.id)?.total_units ?? 0,
    }))

    // -------------------------------------------------------------------------
    // 6. Top 20 SKUs by revenue
    // -------------------------------------------------------------------------
    const skuUnits = new Map<string, number>()
    for (const row of (topSkusResult.data ?? [])) {
      skuUnits.set(row.sku, (skuUnits.get(row.sku) ?? 0) + row.units_sold)
    }
    const top_skus = Array.from(skuUnits.entries())
      .map(([sku, units]) => {
        const meta = skuMap.get(sku)
        const cogs = meta?.cogs ?? 0
        return {
          sku,
          name: meta?.name ?? sku,
          category: meta?.sub_category ?? meta?.category ?? null,
          units_sold: units,
          revenue_aed: Math.round(units * cogs),
        }
      })
      .sort((a, b) => b.revenue_aed - a.revenue_aed)
      .slice(0, 20)

    // -------------------------------------------------------------------------
    // 7. Category performance
    // -------------------------------------------------------------------------
    const catMap = new Map<string, { amazon: number; noon: number; noon_minutes: number }>()
    for (const row of (categoryResult.data ?? [])) {
      const meta = skuMap.get(row.sku)
      const cat = meta?.sub_category ?? meta?.category ?? 'Unknown'
      const entry = catMap.get(cat) ?? { amazon: 0, noon: 0, noon_minutes: 0 }
      if (row.channel === 'amazon') entry.amazon += row.units_sold
      else if (row.channel === 'noon') entry.noon += row.units_sold
      else if (row.channel === 'noon_minutes') entry.noon_minutes += row.units_sold
      catMap.set(cat, entry)
    }
    const category_performance = Array.from(catMap.entries())
      .map(([category, v]) => ({ category, ...v }))
      .sort((a, b) => (b.amazon + b.noon + b.noon_minutes) - (a.amazon + a.noon + a.noon_minutes))

    // -------------------------------------------------------------------------
    // 8. Inventory value
    // -------------------------------------------------------------------------
    // KEY FIX: dedup by (sku, node, warehouse_name) — not just (sku, node).
    // A single SKU can have stock in multiple Locad bins (different warehouse_name).
    // Using sku|node as the key caused all bins beyond the first to be silently dropped.
    // Query is ordered snapshot_date DESC so the first occurrence per key is the latest.
    const inventoryRows = [
      ...((inventoryAmazonResult.data ?? []) as { sku: string; node: string; warehouse_name: string | null; available: number }[]),
      ...((inventoryNoonResult.data ?? []) as { sku: string; node: string; warehouse_name: string | null; available: number }[]),
      ...((inventoryLocadResult.data ?? []) as { sku: string; node: string; warehouse_name: string | null; available: number }[]),
    ]

    const latestPerBin = new Map<string, number>() // key: sku|node|warehouse_name → available
    for (const row of inventoryRows) {
      const key = `${row.sku}|${row.node}|${row.warehouse_name ?? '_'}`
      if (!latestPerBin.has(key)) {
        latestPerBin.set(key, row.available ?? 0)
      }
    }

    const nodeValues = new Map<string, number>()
    let totalInventoryValue = 0
    // Helper: Locad stores quantities in BOXES — multiply by units_per_box for actual units
    function effectiveUnits(available: number, node: string, upb: number): number {
      return node === 'locad_warehouse' ? available * upb : available
    }

    for (const [key, available] of latestPerBin.entries()) {
      const parts = key.split('|')
      const sku = parts[0]
      const node = parts[1]
      const meta = skuMap.get(sku)
      const cogs = meta?.cogs ?? 0
      const units = effectiveUnits(available, node, meta?.units_per_box ?? 1)
      const value = units * cogs
      nodeValues.set(node, (nodeValues.get(node) ?? 0) + value)
      totalInventoryValue += value
    }

    // Value by flag (and subcategory inventory) — sum across all bins per SKU
    const skuFlags = new Map<string, string>((coverageResult.data ?? []).map((r: { sku: string; action_flag: string | null }) => [r.sku, r.action_flag ?? 'OK']))
    const flagValues = new Map<string, number>()
    const subCatInventory = new Map<string, { amazon: number; noon: number; warehouse: number }>()
    const abcInventory = new Map<string, { amazon: number; noon: number; warehouse: number }>()

    for (const [key, available] of latestPerBin.entries()) {
      const parts = key.split('|')
      const sku = parts[0]
      const node = parts[1]
      const meta = skuMap.get(sku)
      const cogs = meta?.cogs ?? 0
      const units = effectiveUnits(available, node, meta?.units_per_box ?? 1)
      const value = units * cogs

      // Flag breakdown
      const flag = skuFlags.get(sku) ?? 'OK'
      flagValues.set(flag, (flagValues.get(flag) ?? 0) + value)

      // Sub-category breakdown
      const subCat = meta?.sub_category ?? 'Unknown'
      const scEntry = subCatInventory.get(subCat) ?? { amazon: 0, noon: 0, warehouse: 0 }
      if (node === 'amazon_fba') scEntry.amazon += value
      else if (node === 'noon_fbn') scEntry.noon += value
      else if (node === 'locad_warehouse') scEntry.warehouse += value
      subCatInventory.set(subCat, scEntry)

      // ABC category breakdown
      const abc = meta?.category ?? 'Unclassified'
      const abcEntry = abcInventory.get(abc) ?? { amazon: 0, noon: 0, warehouse: 0 }
      if (node === 'amazon_fba') abcEntry.amazon += value
      else if (node === 'noon_fbn') abcEntry.noon += value
      else if (node === 'locad_warehouse') abcEntry.warehouse += value
      abcInventory.set(abc, abcEntry)
    }

    const inventory_value = {
      total_aed: Math.round(totalInventoryValue),
      by_node: Array.from(nodeValues.entries()).map(([node, value]) => ({
        node,
        value_aed: Math.round(value),
      })),
      by_flag: Array.from(flagValues.entries()).map(([flag, value]) => ({
        flag,
        value_aed: Math.round(value),
      })),
    }

    const subcategory_inventory = Array.from(subCatInventory.entries())
      .map(([sub_category, v]) => ({
        sub_category,
        amazon_aed: Math.round(v.amazon),
        noon_aed: Math.round(v.noon),
        warehouse_aed: Math.round(v.warehouse),
        total_aed: Math.round(v.amazon + v.noon + v.warehouse),
      }))
      .sort((a, b) => b.total_aed - a.total_aed)

    const abc_inventory = Array.from(abcInventory.entries())
      .map(([category, v]) => ({
        category,
        amazon_aed: Math.round(v.amazon),
        noon_aed: Math.round(v.noon),
        warehouse_aed: Math.round(v.warehouse),
        total_aed: Math.round(v.amazon + v.noon + v.warehouse),
      }))
      .sort((a, b) => (a.category ?? 'Z').localeCompare(b.category ?? 'Z'))

    // -------------------------------------------------------------------------
    // 9. Reorder cash requirement
    // -------------------------------------------------------------------------
    const reorder_cash = (reorderResult.data ?? []).map((r: { sku: string; action_flag: string | null; suggested_reorder_units: number | null }) => {
      const meta = skuMap.get(r.sku)
      const units = r.suggested_reorder_units ?? meta?.moq ?? 0
      const cogs = meta?.cogs ?? 0
      return {
        sku: r.sku,
        name: meta?.name ?? r.sku,
        urgency: r.action_flag ?? 'REORDER',
        units,
        cost_aed: Math.round(units * cogs),
      }
    }).sort((a: { urgency: string }, b: { urgency: string }) =>
      (flagOrder[a.urgency] ?? 9) - (flagOrder[b.urgency] ?? 9)
    )

    // -------------------------------------------------------------------------
    // 10. Flag distribution
    // -------------------------------------------------------------------------
    const flagDist = new Map<string, number>()
    for (const row of (flagCountResult.data ?? [])) {
      const f = row.action_flag ?? 'OK'
      flagDist.set(f, (flagDist.get(f) ?? 0) + 1)
    }
    const flag_distribution = Array.from(flagDist.entries()).map(([flag, count]) => ({ flag, count }))

    // -------------------------------------------------------------------------
    // 11. Channel mix over time
    // -------------------------------------------------------------------------
    const channel_mix = sales_trend.map(({ date, amazon, noon, noon_minutes }) => {
      const total = amazon + noon + noon_minutes
      return {
        date,
        amazon_pct: total > 0 ? Math.round((amazon / total) * 100) : 0,
        noon_pct: total > 0 ? Math.round(((noon + noon_minutes) / total) * 100) : 0,
        noon_minutes_pct: total > 0 ? Math.round((noon_minutes / total) * 100) : 0,
      }
    })

    // -------------------------------------------------------------------------
    // 12. ABC sales performance (by sku_master.category = A/B/C)
    // -------------------------------------------------------------------------
    const abcSales = new Map<string, { units: number; revenue: number; sku_count: Set<string> }>()
    for (const row of (topSkusResult.data ?? [])) {
      const meta = skuMap.get(row.sku)
      const cat = meta?.category ?? 'Unclassified'
      const entry = abcSales.get(cat) ?? { units: 0, revenue: 0, sku_count: new Set() }
      entry.units += row.units_sold
      entry.revenue += row.units_sold * (meta?.cogs ?? 0)
      entry.sku_count.add(row.sku)
      abcSales.set(cat, entry)
    }
    const abc_performance = Array.from(abcSales.entries())
      .map(([category, v]) => ({
        category,
        units_sold: v.units,
        revenue_aed: Math.round(v.revenue),
        sku_count: v.sku_count.size,
      }))
      .sort((a, b) => (a.category ?? 'Z').localeCompare(b.category ?? 'Z'))

    // -------------------------------------------------------------------------
    // 13. Subcategory sales performance
    // -------------------------------------------------------------------------
    const subCatSales = new Map<string, { amazon: number; noon: number; noon_minutes: number }>()
    for (const row of (categoryResult.data ?? [])) {
      const normalized = (row.sku as string).trim().toUpperCase()
      const meta = skuMap.get(normalized)
      const subCat = meta?.sub_category ?? 'Unknown'
      const entry = subCatSales.get(subCat) ?? { amazon: 0, noon: 0, noon_minutes: 0 }
      if (row.channel === 'amazon') entry.amazon += row.units_sold
      else if (row.channel === 'noon') entry.noon += row.units_sold
      else if (row.channel === 'noon_minutes') entry.noon_minutes += row.units_sold
      subCatSales.set(subCat, entry)
    }
    const subcategory_sales = Array.from(subCatSales.entries())
      .map(([sub_category, v]) => ({ sub_category, ...v, total: v.amazon + v.noon + v.noon_minutes }))
      .sort((a, b) => b.total - a.total)

    // -------------------------------------------------------------------------
    // 14. Dormant / discontinued SKUs for Coverage Health panel
    // Rule: SKU has no coverage data AND no stock AND no sales in last 90 days
    // -------------------------------------------------------------------------
    const noCoverageSkus = (noDataSkusResult.data ?? []).map((r: { sku: string }) => r.sku)
    const cutoff90 = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

    let noCoverageWithActivity = new Set<string>()
    if (noCoverageSkus.length > 0) {
      const [sales60Result, inventory60Result] = await Promise.all([
        supabase
          .from('sales_snapshot')
          .select('sku')
          .in('sku', noCoverageSkus)
          .gte('date', cutoff90)
          .gt('units_sold', 0),
        supabase
          .from('inventory_snapshot')
          .select('sku')
          .in('sku', noCoverageSkus)
          .gte('snapshot_date', cutoff90)
          .gt('available', 0),
      ])

      noCoverageWithActivity = new Set<string>([
        ...((sales60Result.data ?? []) as { sku: string }[]).map((r) => r.sku),
        ...((inventory60Result.data ?? []) as { sku: string }[]).map((r) => r.sku),
      ])
    }

    const dormantSkus = noCoverageSkus.filter((sku) => !noCoverageWithActivity.has(sku))

    return jsonResponse({
      range_days: validRange,
      sales_trend,
      coverage_health,
      sku_coverage,
      po_pipeline,
      top_skus,
      channel_mix,
      category_performance,
      inventory_value,
      subcategory_inventory,
      abc_inventory,
      abc_performance,
      subcategory_sales,
      reorder_cash,
      flag_distribution,
      no_data_skus: dormantSkus.map((sku) => {
        const normalized = sku.trim().toUpperCase()
        return {
          sku,
          name: skuMap.get(normalized)?.name ?? sku,
          asin: skuMap.get(normalized)?.asin ?? null,
        }
      }),
      generated_at: new Date().toISOString(),
    })
  } catch (err) {
    console.error('[analytics] Unhandled error:', err)
    return jsonResponse({ error: 'Internal server error' }, 500)
  }
})
