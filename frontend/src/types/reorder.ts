export type ABCClass = 'A' | 'B' | 'C'

export type StockRiskLevel = 'Stockout Risk' | 'Critical Low' | 'Low Stock' | 'Healthy' | 'Overstocked' | 'Zero Sales'

export interface ReorderConfig {
  targetDaysA: number // Default 60 days
  targetDaysB: number // Default 45 days
  targetDaysC: number // Default 30 days
  applyMOQ: boolean   // Default true
  applyCasePack: boolean // Default true
  lowDaysThreshold: number // Default 15 days
}

export const DEFAULT_REORDER_CONFIG: ReorderConfig = {
  targetDaysA: 60,
  targetDaysB: 45,
  targetDaysC: 30,
  applyMOQ: true,
  applyCasePack: true,
  lowDaysThreshold: 15,
}

export interface SKUReorderRecommendation {
  // 1. SKU
  sku: string
  // 2. Product Name
  name: string
  // 3. CAT (A, B, C)
  category: ABCClass | string
  cat: ABCClass | string
  // 4. Daily Sales = Amazon + Noon + Minutes
  daily_sales: number
  // 5. Available Stock = FBA + FBN + Minutes + LOCAD
  available_stock: number
  // 6. Days Left = Available Stock / Daily Sales (null when daily_sales == 0)
  days_left: number | null
  // 7. Target Days (Configurable: CAT A=60, B=45, C=30)
  target_days: number
  // 8. Target Stock = CEIL(Daily Sales * Target Days)
  target_stock: number
  // 9. Reorder Qty = MAX(0, Target Stock - Available Stock)
  reorder_qty: number
  // 10. Existing PO Qty = Unreceived balance from purchase orders
  existing_po_qty: number
  // 11. Remaining Reorder Qty = MAX(0, Reorder Qty - Existing PO Qty)
  remaining_reorder_qty: number
  // 12. MOQ (Minimum Order Quantity)
  moq: number
  // 13. Suggested Order Qty (After MOQ & case-pack multiples)
  suggested_order_qty: number
  // 14. Unit Cost (From cogs / landing_cost)
  unit_cost: number
  // 15. Total Reorder Cost = Suggested Order Qty * Unit Cost
  total_reorder_cost: number

  // Channel-level breakdown (aligned with Inventory tab)
  fba_units: number
  fbn_units: number
  minutes_units: number
  locad_units: number
  locad_boxes: number
  amazon_sv: number
  noon_sv: number
  minutes_sv: number
  blended_sv: number

  // Operational Constraints & Review Flags
  case_pack: number // units_per_box
  lead_time_days: number
  supplier: string
  is_zero_sales: boolean
  is_missing_cost: boolean
  is_missing_moq: boolean
  is_moq_applied: boolean
  is_case_pack_applied: boolean
  is_reorder_required: boolean
  is_zero_stock: boolean
  is_low_days: boolean
  is_stockout_risk: boolean
  is_active: boolean
  is_discontinued?: boolean
  product_category?: string
  sub_category?: string
  asin?: string | null
  fnsku?: string | null
  brand?: string

  // Deprecated/Compatibility aliases
  abc_class?: ABCClass
  recommended_reorder_qty?: number
  reorder_cogs?: number
  days_remaining?: number | null
  target_stock_qty?: number
  priority?: string
  stock_status?: string
}

export interface ReorderExecutiveKPIs {
  // Exact 9 Summary Cards
  totalSKUs: number
  skusRequiringReorder: number
  totalDailySales: number
  totalAvailableStock: number
  totalReorderQty: number
  totalExistingPOQty: number
  totalRemainingReorderQty: number
  totalSuggestedOrderQty: number
  totalReorderCost: number

  // Review & Diagnostic Metrics
  missingUnitCostCount: number
  missingMOQCount: number
  zeroSalesCount: number
  zeroStockCount: number
  stockoutRiskCount: number
  lastCalculatedAt: string
}

export interface ABCCategorySummary {
  category: ABCClass
  skuCount: number
  totalDailySales: number
  totalAvailableStock: number
  totalTargetStock: number
  totalReorderQty: number
  totalExistingPOQty: number
  totalRemainingReorderQty: number
  totalSuggestedOrderQty: number
  totalReorderCost: number
  stockoutRiskCount: number
}

export interface ReorderFilterState {
  cat: string // 'ALL' | 'A' | 'B' | 'C'
  sku: string
  productName: string
  reorderRequired: boolean
  zeroStock: boolean
  lowDaysLeft: boolean
  moqApplied: boolean
  missingUnitCost: boolean
  missingMOQ: boolean
  planningToDiscontinue: boolean
}

export const INITIAL_REORDER_FILTERS: ReorderFilterState = {
  cat: 'ALL',
  sku: '',
  productName: '',
  reorderRequired: false,
  zeroStock: false,
  lowDaysLeft: false,
  moqApplied: false,
  missingUnitCost: false,
  missingMOQ: false,
  planningToDiscontinue: false,
}
