import { supabase } from './supabase'
import { DEFAULT_REORDER_CONFIG } from '../types/reorder'
import type {
  ABCClass,
  ABCCategorySummary,
  ReorderConfig,
  ReorderExecutiveKPIs,
  ReorderFilterState,
  SKUReorderRecommendation,
} from '../types/reorder'

export interface RawSKUData {
  sku: string
  name: string
  asin: string | null
  fnsku: string | null
  brand: string
  category: string // CAT A, B, or C
  product_category: string
  sub_category: string
  is_active: boolean
  cogs: number
  landing_cost?: number
  moq: number
  units_per_box: number
  lead_time_days: number

  // Stock sources (matching Inventory tab)
  fba_units: number
  fbn_units: number
  minutes_units: number
  locad_units: number
  locad_boxes: number
  stock_in_hand: number

  // Sales Velocity (matching Inventory tab)
  amazon_sv: number
  noon_sv: number
  minutes_sv: number
  blended_sv: number
  sales_yesterday?: number

  // Purchase Order & Supply Chain
  supplier: string
  already_ordered: number
  incoming_po_value: number
  earliest_eta: string | null
}

// ---------------------------------------------------------------------------
// In-Memory Cache
// ---------------------------------------------------------------------------
let cachedRawData: { key: string; data: RawSKUData[]; expiry: number } | null = null

export async function fetchReorderRawData(
  country: string,
  saddlId: string,
  forceRefresh = false
): Promise<RawSKUData[]> {
  const cacheKey = `${country}_${saddlId}`
  const now = Date.now()

  if (!forceRefresh && cachedRawData && cachedRawData.key === cacheKey && cachedRawData.expiry > now) {
    return cachedRawData.data
  }

  try {
    // Helper to paginate through Supabase default 1000 row limits
    const fetchAllRows = async (buildQuery: (from: number, to: number) => any) => {
      const rows: any[] = []
      let from = 0
      while (true) {
        const { data, error } = await buildQuery(from, from + 999)
        if (error) throw error
        if (!data || data.length === 0) break
        rows.push(...data)
        if (data.length < 1000) break
        from += 1000
      }
      return rows
    }

    // Fetch directly from authoritative Inventory Tab view and SKU master in parallel (Active SKUs only)
    const [factRows, smRows, poRows] = await Promise.all([
      fetchAllRows((from, to) =>
        supabase
          .from('v_fact_inventory_with_age')
          .select('*')
          .eq('country', country)
          .eq('saddl_id', saddlId)
          .eq('is_active', true)
          .range(from, to)
      ),
      fetchAllRows((from, to) =>
        supabase
          .from('sku_master')
          .select('sku, name, asin, fnsku, lead_time_days, moq, units_per_box, cogs, landing_cost, product_category, sub_category, category, is_active')
          .eq('country', country)
          .eq('saddl_id', saddlId)
          .eq('is_active', true)
          .range(from, to)
      ),
      fetchAllRows((from, to) =>
        supabase
          .from('fact_purchase')
          .select('sku, supplier, order_date, status, units_ordered, units_received, cogs_per_unit, eta')
          .eq('country', country)
          .eq('saddl_id', saddlId)
          .order('order_date', { ascending: false })
          .range(from, to)
      ),
    ])

    // Build SKU master lookup map
    const smMap = new Map<string, any>()
    for (const sm of smRows) {
      smMap.set(sm.sku, sm)
    }

    // Build latest supplier, incoming PO value and earliest ETA per SKU
    const supplierMap = new Map<string, string>()
    const incomingValCol = new Map<string, number>()
    const earliestEtaMap = new Map<string, string>()

    for (const po of poRows) {
      if (!supplierMap.has(po.sku) && po.supplier) {
        supplierMap.set(po.sku, po.supplier)
      }
      const st = (po.status || '').toLowerCase().trim()
      if (['ordered', 'shipped', 'in_transit', 'placed'].includes(st)) {
        const pending = Math.max(0, (po.units_ordered || 0) - (po.units_received || 0))
        const val = pending * (Number(po.cogs_per_unit) || 0)
        incomingValCol.set(po.sku, (incomingValCol.get(po.sku) || 0) + val)
        if (po.eta && (!earliestEtaMap.has(po.sku) || po.eta < earliestEtaMap.get(po.sku)!)) {
          earliestEtaMap.set(po.sku, po.eta)
        }
      }
    }

    // Combine fact inventory records with SKU master metadata (Active SKUs only)
    const composite: RawSKUData[] = factRows
      .filter((item) => item.is_active === true && (smMap.get(item.sku)?.is_active !== false))
      .map((item) => {
        const sm = smMap.get(item.sku) || {}
        const name = sm.name || item.name || item.sku

        let brand = 'S2C'
        if (name.startsWith('PETSLY') || item.sku.startsWith('PTSLY')) brand = 'PETSLY'
        else if (name.startsWith('Bath & Relax')) brand = 'Bath & Relax'
        else if (name.startsWith('Raymond Home')) brand = 'Raymond Home'

        const moq = Number(item.moq ?? sm.moq ?? 0)
        const units_per_box = Number(item.units_per_box ?? sm.units_per_box ?? 1)
        const cogs = Number(item.cogs ?? sm.cogs ?? 0)
        const landing_cost = Number(sm.landing_cost ?? item.cogs ?? 0)
        const lead_time_days = Number(sm.lead_time_days ?? 45)

        return {
          sku: item.sku,
          name,
          asin: sm.asin || item.asin || null,
          fnsku: sm.fnsku || item.fnsku || null,
          brand,
          category: (item.category || sm.category || 'C').toUpperCase().trim(),
          product_category: item.product_category || sm.product_category || 'General',
          sub_category: item.sub_category || sm.sub_category || '',
          is_active: true,
          cogs,
          landing_cost,
          moq,
          units_per_box: units_per_box > 0 ? units_per_box : 1,
          lead_time_days,

          fba_units: Number(item.fba_units || 0),
          fbn_units: Number(item.fbn_units || 0),
          minutes_units: Number(item.minutes_units || 0),
          locad_units: Number(item.locad_units || 0),
          locad_boxes: Number(item.locad_boxes || 0),
          stock_in_hand: Number(item.stock_in_hand || 0),

          amazon_sv: Number(item.amazon_sv || 0),
          noon_sv: Number(item.noon_sv || 0),
          minutes_sv: Number(item.minutes_sv || 0),
          blended_sv: Number(item.blended_sv || 0),
          sales_yesterday: Number(item.sales_yesterday || 0),

          supplier: supplierMap.get(item.sku) || 'Direct Supplier',
          already_ordered: Number(item.already_ordered || 0),
          incoming_po_value: incomingValCol.get(item.sku) || 0,
          earliest_eta: earliestEtaMap.get(item.sku) || null,
        }
      })

    cachedRawData = { key: cacheKey, data: composite, expiry: now + 30000 }
    return composite
  } catch (err: any) {
    console.error('Failed to load inventory reorder raw data:', err)
    throw err
  }
}

// ---------------------------------------------------------------------------
// Pure Calculation Engine: Compute SKU-Wise Reorder Recommendations
// ---------------------------------------------------------------------------
export function calculateReorderPlan(
  rawList: RawSKUData[],
  config: ReorderConfig = DEFAULT_REORDER_CONFIG
): {
  recommendations: SKUReorderRecommendation[]
  kpis: ReorderExecutiveKPIs
  abcSummaries: ABCCategorySummary[]
} {
  // Ensure dashboard strictly calculates and displays data on active SKUs only
  const activeRawList = rawList.filter((raw) => raw.is_active !== false)

  const recommendations: SKUReorderRecommendation[] = activeRawList.map((raw) => {
    // 3. CAT (A, B, C)
    const catRaw = (raw.category || 'C').toUpperCase().trim()
    const category: ABCClass = catRaw === 'A' ? 'A' : catRaw === 'B' ? 'B' : 'C'

    // 4. Daily Sales = Amazon Daily Sales + Noon Daily Sales + Minutes Daily Sales
    const amazon_sv = Math.max(0, Number(raw.amazon_sv) || 0)
    const noon_sv = Math.max(0, Number(raw.noon_sv) || 0)
    const minutes_sv = Math.max(0, Number(raw.minutes_sv) || 0)
    const daily_sales = Math.round((amazon_sv + noon_sv + minutes_sv) * 1000) / 1000

    // 5. Available Stock = FBA + FBN + Minutes + LOCAD
    const fba_units = Math.max(0, Number(raw.fba_units) || 0)
    const fbn_units = Math.max(0, Number(raw.fbn_units) || 0)
    const minutes_units = Math.max(0, Number(raw.minutes_units) || 0)
    const locad_units = Math.max(0, Number(raw.locad_units) || 0)
    const available_stock = fba_units + fbn_units + minutes_units + locad_units

    // 6. Days Left = Available Stock / Daily Sales
    // Rule: If Daily Sales is 0 and Available Stock is 0, Days Left is 0.
    // If Daily Sales is 0 but Available Stock > 0, Days Left is null (N/A / Review).
    const is_zero_sales = daily_sales <= 0
    let days_left: number | null = null
    if (is_zero_sales) {
      days_left = available_stock === 0 ? 0 : null
    } else {
      days_left = Math.round((available_stock / daily_sales) * 10) / 10
    }

    // 7. Target Days: CAT A = 60, CAT B = 45, CAT C = 30 (configurable)
    let target_days = config.targetDaysC
    if (category === 'A') target_days = config.targetDaysA
    else if (category === 'B') target_days = config.targetDaysB

    // 8. Target Stock & 9. Reorder Qty
    // Rule: If Daily Sales is 0 and Available Stock is 0, order MOQ
    const moq = Math.max(0, Number(raw.moq) || 0)
    let target_stock = 0
    let reorder_qty = 0

    if (is_zero_sales && available_stock === 0) {
      // Order MOQ when sales = 0 and available stock = 0
      target_stock = moq
      reorder_qty = moq
    } else if (is_zero_sales) {
      target_stock = 0
      reorder_qty = 0
    } else {
      target_stock = Math.ceil(daily_sales * target_days)
      reorder_qty = Math.max(0, target_stock - available_stock)
    }

    // 10. Existing PO Qty = Unreceived balance from existing purchase orders
    const existing_po_qty = Math.max(0, Number(raw.already_ordered) || 0)

    // 11. Remaining Reorder Qty = MAX(0, Reorder Qty - Existing PO Qty)
    const remaining_reorder_qty = Math.max(0, reorder_qty - existing_po_qty)

    // 12. MOQ
    const is_missing_moq = moq <= 0 && (remaining_reorder_qty > 0 || (is_zero_sales && available_stock === 0))

    // Supplier Case Pack multiples
    const case_pack = Math.max(1, Number(raw.units_per_box) || 1)

    // 13. Suggested Order Qty
    // - 0, if Remaining Reorder Qty = 0
    // - MAX(Remaining Reorder Qty, MOQ), if Remaining Reorder Qty > 0 and MOQ is configured
    // - Remaining Reorder Qty, if no MOQ is configured
    // Where supplier ordering increments apply, round suggested quantity up to next valid order increment
    let suggested_order_qty = 0
    let is_moq_applied = false
    let is_case_pack_applied = false

    if (remaining_reorder_qty > 0) {
      let qty = remaining_reorder_qty
      if (config.applyMOQ && moq > 0) {
        if (qty < moq) {
          qty = moq
          is_moq_applied = true
        }
      }
      if (config.applyCasePack && case_pack > 1) {
        const rounded = Math.ceil(qty / case_pack) * case_pack
        if (rounded > qty) {
          is_case_pack_applied = true
        }
        qty = rounded
      }
      suggested_order_qty = qty
    } else {
      suggested_order_qty = 0
    }

    // 14. Unit Cost (From cogs / landing_cost)
    const unit_cost_raw = Number(raw.cogs) > 0 ? Number(raw.cogs) : (Number(raw.landing_cost) || 0)
    const is_missing_cost = unit_cost_raw <= 0
    const unit_cost = is_missing_cost ? 0 : Math.round(unit_cost_raw * 100) / 100

    // 15. Total Reorder Cost = Suggested Order Qty * Unit Cost
    // If unit cost is missing or invalid, flag SKU and exclude from confirmed financial total
    const total_reorder_cost = is_missing_cost ? 0 : Math.round(suggested_order_qty * unit_cost * 100) / 100

    // Flags & Operational Metrics
    const is_reorder_required = remaining_reorder_qty > 0 || suggested_order_qty > 0
    const is_zero_stock = available_stock === 0
    const lead_time_days = Number(raw.lead_time_days) || 45
    const is_low_days = days_left !== null && (days_left < config.lowDaysThreshold || days_left < target_days)
    // Stockout risk: zero stock or imminent depletion before supplier replenishment lead time
    const is_stockout_risk = available_stock === 0 || (days_left !== null && days_left < lead_time_days)

    return {
      sku: raw.sku,
      name: raw.name,
      category,
      cat: category,
      daily_sales,
      available_stock,
      days_left,
      target_days,
      target_stock,
      reorder_qty,
      existing_po_qty,
      remaining_reorder_qty,
      moq,
      suggested_order_qty,
      final_qty: suggested_order_qty,
      unit_cost,
      suggested_reorder_cost: total_reorder_cost,
      final_reorder_cost: total_reorder_cost,
      finalized_reorder_cost: total_reorder_cost,
      total_reorder_cost,

      fba_units,
      fbn_units,
      minutes_units,
      locad_units,
      locad_boxes: raw.locad_boxes,
      amazon_sv,
      noon_sv,
      minutes_sv,
      blended_sv: raw.blended_sv,

      case_pack,
      lead_time_days,
      supplier: raw.supplier,
      is_zero_sales,
      is_missing_cost,
      is_missing_moq,
      is_moq_applied,
      is_case_pack_applied,
      is_reorder_required,
      is_zero_stock,
      is_low_days,
      is_stockout_risk,
      is_active: raw.is_active,
      product_category: raw.product_category,
      sub_category: raw.sub_category,
      asin: raw.asin,
      fnsku: raw.fnsku,
      brand: raw.brand,

      // Compatibility aliases
      abc_class: category,
      recommended_reorder_qty: suggested_order_qty,
      reorder_cogs: total_reorder_cost,
      days_remaining: days_left,
      target_stock_qty: target_stock,
      priority: is_stockout_risk ? 'Critical' : is_reorder_required ? 'High' : 'Low',
      stock_status: is_zero_sales ? 'Zero Sales' : available_stock === 0 ? 'Stockout Risk' : is_low_days ? 'Low Stock' : 'Healthy',
    }
  })

  const kpis = calculateKPIs(recommendations)
  const abcSummaries = calculateABCSummaries(recommendations)

  return { recommendations, kpis, abcSummaries }
}

// ---------------------------------------------------------------------------
// KPI Calculations (Exact 9 Summary Cards + Diagnostic Totals)
// ---------------------------------------------------------------------------
export function calculateKPIs(items: SKUReorderRecommendation[]): ReorderExecutiveKPIs {
  const totalSKUs = items.length
  const skusRequiringReorder = items.filter((i) => i.is_reorder_required).length

  const totalDailySales =
    Math.round(items.reduce((acc, i) => acc + i.daily_sales, 0) * 100) / 100
  const totalAvailableStock = items.reduce((acc, i) => acc + i.available_stock, 0)
  const totalReorderQty = items.reduce((acc, i) => acc + i.reorder_qty, 0)
  const totalExistingPOQty = items.reduce((acc, i) => acc + i.existing_po_qty, 0)
  const totalRemainingReorderQty = items.reduce((acc, i) => acc + i.remaining_reorder_qty, 0)
  const totalSuggestedOrderQty = items.reduce((acc, i) => acc + i.suggested_order_qty, 0)
  const totalFinalQty = items.reduce((acc, i) => acc + (i.final_qty ?? i.suggested_order_qty), 0)

  const totalSuggestedReorderCost =
    Math.round(items.reduce((acc, i) => acc + (i.suggested_reorder_cost ?? (i.suggested_order_qty * i.unit_cost)), 0) * 100) / 100

  const totalFinalizedReorderCost =
    Math.round(items.reduce((acc, i) => acc + (i.final_reorder_cost ?? i.total_reorder_cost ?? ((i.final_qty ?? i.suggested_order_qty) * i.unit_cost)), 0) * 100) / 100

  // Total Reorder Cost defaults to Finalized Reorder Cost
  const totalReorderCost = totalFinalizedReorderCost

  const missingUnitCostCount = items.filter((i) => i.is_missing_cost).length
  const missingMOQCount = items.filter((i) => i.is_missing_moq).length
  const zeroSalesCount = items.filter((i) => i.is_zero_sales).length
  const zeroStockCount = items.filter((i) => i.is_zero_stock).length
  const stockoutRiskCount = items.filter((i) => i.is_stockout_risk).length

  return {
    totalSKUs,
    skusRequiringReorder,
    totalDailySales,
    totalAvailableStock,
    totalReorderQty,
    totalExistingPOQty,
    totalRemainingReorderQty,
    totalSuggestedOrderQty,
    totalFinalQty,
    totalSuggestedReorderCost,
    totalFinalizedReorderCost,
    totalReorderCost,
    missingUnitCostCount,
    missingMOQCount,
    zeroSalesCount,
    zeroStockCount,
    stockoutRiskCount,
    lastCalculatedAt: new Date().toISOString(),
  }
}

// ---------------------------------------------------------------------------
// ABC Category Analysis Breakdown
// ---------------------------------------------------------------------------
export function calculateABCCategorySummaryForCat(
  items: SKUReorderRecommendation[],
  category: ABCClass
): ABCCategorySummary {
  const catItems = items.filter((i) => i.category === category)
  return {
    category,
    skuCount: catItems.length,
    totalDailySales: Math.round(catItems.reduce((acc, i) => acc + i.daily_sales, 0) * 100) / 100,
    totalAvailableStock: catItems.reduce((acc, i) => acc + i.available_stock, 0),
    totalTargetStock: catItems.reduce((acc, i) => acc + i.target_stock, 0),
    totalReorderQty: catItems.reduce((acc, i) => acc + i.reorder_qty, 0),
    totalExistingPOQty: catItems.reduce((acc, i) => acc + i.existing_po_qty, 0),
    totalRemainingReorderQty: catItems.reduce((acc, i) => acc + i.remaining_reorder_qty, 0),
    totalSuggestedOrderQty: catItems.reduce((acc, i) => acc + i.suggested_order_qty, 0),
    totalFinalQty: catItems.reduce((acc, i) => acc + (i.final_qty ?? i.suggested_order_qty), 0),
    totalSuggestedReorderCost: Math.round(catItems.reduce((acc, i) => acc + (i.suggested_reorder_cost ?? (i.suggested_order_qty * i.unit_cost)), 0) * 100) / 100,
    totalFinalizedReorderCost: Math.round(catItems.reduce((acc, i) => acc + (i.final_reorder_cost ?? i.total_reorder_cost ?? ((i.final_qty ?? i.suggested_order_qty) * i.unit_cost)), 0) * 100) / 100,
    totalReorderCost: Math.round(catItems.reduce((acc, i) => acc + (i.final_reorder_cost ?? i.total_reorder_cost ?? ((i.final_qty ?? i.suggested_order_qty) * i.unit_cost)), 0) * 100) / 100,
    stockoutRiskCount: catItems.filter((i) => i.is_stockout_risk).length,
  }
}

export function calculateABCSummaries(items: SKUReorderRecommendation[]): ABCCategorySummary[] {
  return [
    calculateABCCategorySummaryForCat(items, 'A'),
    calculateABCCategorySummaryForCat(items, 'B'),
    calculateABCCategorySummaryForCat(items, 'C'),
  ]
}

// ---------------------------------------------------------------------------
// Filtering & Sorting
// ---------------------------------------------------------------------------
function matchesNumericFilter(
  val: number | undefined | null,
  mode: 'all' | 'gt0' | 'eq0' | undefined,
  minStr: string | undefined,
  maxStr: string | undefined
): boolean {
  const num = typeof val === 'number' && !isNaN(val) ? val : parseFloat(String(val ?? 0)) || 0

  if (mode === 'gt0' && num <= 0) return false
  if (mode === 'eq0' && num !== 0) return false

  if (minStr !== undefined && minStr.trim() !== '') {
    const min = parseFloat(minStr)
    if (!isNaN(min) && num < min) return false
  }
  if (maxStr !== undefined && maxStr.trim() !== '') {
    const max = parseFloat(maxStr)
    if (!isNaN(max) && num > max) return false
  }
  return true
}

export function filterReorderItems(
  items: SKUReorderRecommendation[],
  filters: ReorderFilterState
): SKUReorderRecommendation[] {
  return items.filter((item) => {
    // 1. CAT filter
    if (filters.cat && filters.cat !== 'ALL' && item.category !== filters.cat) {
      return false
    }

    // 2. SKU search
    if (filters.sku.trim()) {
      const q = filters.sku.trim().toLowerCase()
      if (!item.sku.toLowerCase().includes(q)) return false
    }

    // 3. Product Name search
    if (filters.productName.trim()) {
      const q = filters.productName.trim().toLowerCase()
      if (!item.name.toLowerCase().includes(q)) return false
    }

    // 4. Reorder Required filter
    if (filters.reorderRequired && !item.is_reorder_required) {
      return false
    }

    // 5. Zero Stock filter
    if (filters.zeroStock && !item.is_zero_stock) {
      return false
    }

    // 6. Low Days Left filter
    if (filters.lowDaysLeft && !item.is_low_days) {
      return false
    }

    // 7. MOQ Applied filter
    if (filters.moqApplied && !item.is_moq_applied) {
      return false
    }

    // 8. Missing Unit Cost filter
    if (filters.missingUnitCost && !item.is_missing_cost) {
      return false
    }

    // 9. Missing MOQ filter
    if (filters.missingMOQ && !item.is_missing_moq) {
      return false
    }

    // 10. Planning to Discontinue filter (All / Yes / No)
    if (filters.planningToDiscontinue === 'yes') {
      if (!item.is_discontinued) return false
    } else if (filters.planningToDiscontinue === 'no') {
      if (item.is_discontinued) return false
    }

    // 11. Reorder Qty filter
    if (!matchesNumericFilter(item.reorder_qty, filters.reorderQtyMode, filters.reorderQtyMin, filters.reorderQtyMax)) {
      return false
    }

    // 12. Existing PO Qty filter
    if (!matchesNumericFilter(item.existing_po_qty, filters.existingPOQtyMode, filters.existingPOQtyMin, filters.existingPOQtyMax)) {
      return false
    }

    // 13. Remaining Reorder Qty filter
    if (!matchesNumericFilter(item.remaining_reorder_qty, filters.remainingReorderQtyMode, filters.remainingReorderQtyMin, filters.remainingReorderQtyMax)) {
      return false
    }

    // 14. MOQ filter
    if (!matchesNumericFilter(item.moq, filters.moqMode, filters.moqMin, filters.moqMax)) {
      return false
    }

    // 15. Suggested Order Qty filter
    if (!matchesNumericFilter(item.suggested_order_qty, filters.suggestedOrderQtyMode, filters.suggestedOrderQtyMin, filters.suggestedOrderQtyMax)) {
      return false
    }

    // 16. Unit Cost filter
    if (!matchesNumericFilter(item.unit_cost, filters.unitCostMode, filters.unitCostMin, filters.unitCostMax)) {
      return false
    }

    // 17. Suggested Reorder Cost filter
    if (filters.suggestedReorderCostMode && !matchesNumericFilter(item.suggested_reorder_cost, filters.suggestedReorderCostMode, filters.suggestedReorderCostMin, filters.suggestedReorderCostMax)) {
      return false
    }

    // 18. Finalized Reorder Cost filter
    if (!matchesNumericFilter(item.final_reorder_cost ?? item.total_reorder_cost, filters.totalReorderCostMode, filters.totalReorderCostMin, filters.totalReorderCostMax)) {
      return false
    }

    return true
  })
}

export function sortReorderItems(
  items: SKUReorderRecommendation[],
  sortKey: keyof SKUReorderRecommendation,
  sortDir: 'asc' | 'desc'
): SKUReorderRecommendation[] {
  const dir = sortDir === 'asc' ? 1 : -1

  return [...items].sort((a, b) => {
    const valA = a[sortKey]
    const valB = b[sortKey]

    if (valA === null || valA === undefined) return 1
    if (valB === null || valB === undefined) return -1

    if (typeof valA === 'string' && typeof valB === 'string') {
      return dir * valA.localeCompare(valB)
    }

    if (valA < valB) return -1 * dir
    if (valA > valB) return 1 * dir
    return 0
  })
}

// ---------------------------------------------------------------------------
// CSV Export (Dashboard View & Detailed View)
// ---------------------------------------------------------------------------
export function exportReorderToCSV(
  items: SKUReorderRecommendation[],
  mode: 'dashboard' | 'detailed' = 'dashboard',
  customFilename?: string
) {
  const dateStr = new Date().toISOString().split('T')[0]
  const filename =
    customFilename ||
    (mode === 'dashboard'
      ? `sku_reorder_dashboard_${dateStr}.csv`
      : `sku_reorder_detailed_${dateStr}.csv`)

  const dashboardHeaders = [
    'SKU',
    'Product Name',
    'CAT',
    'Planning to Discontinue',
    'Daily Sales',
    'Available Stock',
    'Days Left',
    'Target Days',
    'Target Stock',
    'Reorder Qty',
    'Existing PO Qty',
    'Remaining Reorder Qty',
    'MOQ',
    'Suggested Order Qty',
    'Final Qty',
    'Unit Cost',
    'Suggested Reorder Cost',
    'Finalized Reorder Cost',
  ]

  const detailedExtraHeaders = [
    'FBA Stock',
    'FBN Stock',
    'Minutes Stock',
    'LOCAD Stock',
    'Amazon Daily Sales',
    'Noon Daily Sales',
    'Minutes Daily Sales',
    'Case Pack (Units/Box)',
    'Supplier',
    'Review Flags',
  ]

  const headers =
    mode === 'dashboard'
      ? dashboardHeaders
      : [...dashboardHeaders, ...detailedExtraHeaders]

  const rows = items.map((i) => {
    const baseCols = [
      `"${i.sku}"`,
      `"${(i.name || '').replace(/"/g, '""')}"`,
      i.category,
      i.is_discontinued ? 'Yes' : 'No',
      Number(i.daily_sales.toFixed(2)),
      i.available_stock,
      i.days_left !== null ? Number(i.days_left.toFixed(1)) : 'N/A',
      i.target_days,
      i.target_stock,
      i.reorder_qty,
      i.existing_po_qty,
      i.remaining_reorder_qty,
      i.moq,
      i.suggested_order_qty,
      i.final_qty !== undefined ? i.final_qty : i.suggested_order_qty,
      Number(i.unit_cost.toFixed(2)),
      Number((i.suggested_reorder_cost ?? (i.suggested_order_qty * i.unit_cost)).toFixed(2)),
      Number((i.final_reorder_cost ?? i.total_reorder_cost ?? ((i.final_qty !== undefined ? i.final_qty : i.suggested_order_qty) * i.unit_cost)).toFixed(2)),
    ]

    if (mode === 'dashboard') {
      return baseCols.join(',')
    }

    const flags: string[] = []
    if (i.is_discontinued) flags.push('Planning to Discontinue')
    if (i.is_zero_sales) flags.push('Zero Sales')
    if (i.is_missing_cost) flags.push('Missing Unit Cost')
    if (i.is_missing_moq) flags.push('Missing MOQ')
    if (i.is_moq_applied) flags.push('MOQ Applied')
    if (i.is_case_pack_applied) flags.push('Case Pack Rounded')
    if (i.is_stockout_risk) flags.push('Stockout Risk')

    const detailedCols = [
      ...baseCols,
      i.fba_units,
      i.fbn_units,
      i.minutes_units,
      i.locad_units,
      Number(i.amazon_sv.toFixed(2)),
      Number(i.noon_sv.toFixed(2)),
      Number(i.minutes_sv.toFixed(2)),
      i.case_pack,
      `"${(i.supplier || '').replace(/"/g, '""')}"`,
      `"${flags.join(', ')}"`,
    ]

    return detailedCols.join(',')
  })

  const csvContent = [headers.join(','), ...rows].join('\n')
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.setAttribute('href', url)
  link.setAttribute('download', filename)
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

// ---------------------------------------------------------------------------
// Database Table Persistence: public.sku_reorder_recommendations
// ---------------------------------------------------------------------------

/**
 * Fetches saved `planning_to_discontinue` flags from `public.sku_reorder_recommendations`.
 */
export async function fetchSavedDiscontinuedFlags(
  country: string,
  saddlId: string
): Promise<Record<string, boolean>> {
  try {
    const { data, error } = await supabase
      .from('sku_reorder_recommendations')
      .select('sku, planning_to_discontinue')
      .eq('country', country)
      .eq('saddl_id', saddlId)
      .eq('planning_to_discontinue', true)

    if (error || !data) return {}

    const map: Record<string, boolean> = {}
    for (const row of data) {
      if (row.planning_to_discontinue) {
        map[row.sku] = true
      }
    }
    return map
  } catch {
    return {}
  }
}

/**
 * Fetches saved `final_qty` overrides from `public.sku_reorder_recommendations`.
 * Uses pagination to support catalogs of any size without 1000-row capping.
 */
export async function fetchSavedFinalQty(
  country: string,
  saddlId: string
): Promise<Record<string, number>> {
  try {
    const map: Record<string, number> = {}
    let from = 0
    while (true) {
      const { data, error } = await supabase
        .from('sku_reorder_recommendations')
        .select('sku, final_qty')
        .eq('country', country)
        .eq('saddl_id', saddlId)
        .not('final_qty', 'is', null)
        .range(from, from + 999)

      if (error || !data || data.length === 0) break

      for (const row of data) {
        if (row.final_qty !== null && row.final_qty !== undefined) {
          map[row.sku] = Number(row.final_qty)
        }
      }
      if (data.length < 1000) break
      from += 1000
    }
    return map
  } catch {
    return {}
  }
}

/**
 * Updates `final_qty` for a single SKU in `public.sku_reorder_recommendations`.
 * Ensures each SKU and store (country, saddl_id) retains its own value.
 */
export async function updateSingleFinalQtyInDB(
  sku: string,
  finalQty: number | null,
  country: string,
  saddlId: string,
  suggestedOrderQty?: number
): Promise<{ ok: boolean; error?: string }> {
  try {
    const { data, error } = await supabase
      .from('sku_reorder_recommendations')
      .update({ final_qty: finalQty, updated_at: new Date().toISOString() })
      .eq('sku', sku)
      .eq('country', country)
      .eq('saddl_id', saddlId)
      .select('sku')

    if (error) {
      console.error('Failed to update final_qty in DB:', error)
      return { ok: false, error: error.message }
    }

    if ((!data || data.length === 0) && finalQty !== null) {
      const { error: upsertErr } = await supabase
        .from('sku_reorder_recommendations')
        .upsert({
          sku,
          country,
          saddl_id: saddlId,
          final_qty: finalQty,
          suggested_order_qty: suggestedOrderQty ?? finalQty,
          updated_at: new Date().toISOString()
        }, { onConflict: 'sku,country,saddl_id' })
      if (upsertErr) return { ok: false, error: upsertErr.message }
    }

    return { ok: true }
  } catch (err: any) {
    console.error('Error updating final_qty in DB:', err)
    return { ok: false, error: err.message }
  }
}

/**
 * Resets `final_qty` for a SKU in `public.sku_reorder_recommendations` back to null (defaulting to suggested_order_qty).
 */
export async function resetSingleFinalQtyInDB(
  sku: string,
  country: string,
  saddlId: string
): Promise<{ ok: boolean; error?: string }> {
  return updateSingleFinalQtyInDB(sku, null, country, saddlId)
}

/**
 * Maps a `SKUReorderRecommendation` row to the `public.sku_reorder_recommendations` table schema.
 */
function mapRecommendationToTableRow(
  item: SKUReorderRecommendation,
  country: string,
  saddlId: string
) {
  return {
    sku: item.sku,
    country,
    saddl_id: saddlId,
    product_name: item.name,
    brand: item.brand || 'S2C',
    cat: item.category,
    planning_to_discontinue: Boolean(item.is_discontinued),
    daily_sales: item.daily_sales,
    available_stock: item.available_stock,
    days_left: item.days_left,
    target_days: item.target_days,
    target_stock: item.target_stock,
    reorder_qty: item.reorder_qty,
    existing_po_qty: item.existing_po_qty,
    remaining_reorder_qty: item.remaining_reorder_qty,
    moq: item.moq,
    suggested_order_qty: item.suggested_order_qty,
    final_qty: item.is_custom_final_qty ? (item.final_qty ?? null) : null,
    unit_cost: item.unit_cost,
    total_reorder_cost: item.total_reorder_cost,
    fba_units: item.fba_units,
    fbn_units: item.fbn_units,
    minutes_units: item.minutes_units,
    locad_units: item.locad_units,
    locad_boxes: item.locad_boxes,
    amazon_sv: item.amazon_sv,
    noon_sv: item.noon_sv,
    minutes_sv: item.minutes_sv,
    blended_sv: item.blended_sv,
    case_pack: item.case_pack,
    lead_time_days: item.lead_time_days,
    supplier: item.supplier || 'Direct Supplier',
    is_zero_sales: item.is_zero_sales,
    is_missing_cost: item.is_missing_cost,
    is_missing_moq: item.is_missing_moq,
    is_moq_applied: item.is_moq_applied,
    is_case_pack_applied: item.is_case_pack_applied,
    is_reorder_required: item.is_reorder_required,
    is_zero_stock: item.is_zero_stock,
    is_low_days: item.is_low_days,
    is_stockout_risk: item.is_stockout_risk,
    is_active: item.is_active !== false,
    updated_at: new Date().toISOString(),
  }
}

/**
 * Bulk-upserts all SKU reorder recommendation rows into `public.sku_reorder_recommendations`.
 */
export async function saveReorderRecommendationsToDB(
  items: SKUReorderRecommendation[],
  country: string,
  saddlId: string
): Promise<{ ok: boolean; count: number; error?: string }> {
  if (!items.length) return { ok: true, count: 0 }

  try {
    const rows = items.map((item) => mapRecommendationToTableRow(item, country, saddlId))
    const BATCH_SIZE = 500
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE)
      const { error } = await supabase
        .from('sku_reorder_recommendations')
        .upsert(batch, { onConflict: 'sku,country,saddl_id' })

      if (error) {
        // Fallback: invoke the planning edge function (which uses service_role to create & upsert the table)
        const { data: fnData, error: fnErr } = await supabase.functions.invoke('planning', {
          body: { rows: batch },
        })
        if (fnErr || !fnData?.ok) {
          console.error('Failed to save sku_reorder_recommendations batch:', error || fnErr)
          return { ok: false, count: i, error: error?.message || fnErr?.message }
        }
      }
    }
    return { ok: true, count: rows.length }
  } catch (err: any) {
    console.error('Error saving to sku_reorder_recommendations:', err)
    return { ok: false, count: 0, error: err.message }
  }
}

/**
 * Updates a single SKU row in `public.sku_reorder_recommendations` (e.g., when toggling Planning to Discontinue).
 */
export async function updateSingleReorderRecommendationInDB(
  item: SKUReorderRecommendation,
  country: string,
  saddlId: string
): Promise<void> {
  try {
    const row = mapRecommendationToTableRow(item, country, saddlId)
    await supabase
      .from('sku_reorder_recommendations')
      .upsert(row, { onConflict: 'sku,country,saddl_id' })
  } catch (err) {
    console.error('Failed to update single SKU in sku_reorder_recommendations:', err)
  }
}
