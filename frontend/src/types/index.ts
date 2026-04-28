export type SKUCategory = 'A' | 'B' | 'C'
export type POStatus = 'draft' | 'ordered' | 'shipped' | 'arrived' | 'closed' | 'cancelled'
export type InventoryNode = 'amazon_fba' | 'noon_fbn' | 'locad_warehouse'
export type ActionFlag = 'CRITICAL_OOS_RISK' | 'OOS_RISK' | 'SHIP_NOW' | 'REORDER' | 'TRANSFER' | 'EXCESS' | 'OK'
export type SalesChannel = 'amazon' | 'noon' | 'noon_minutes'

export interface SKU {
  sku: string
  name: string
  asin: string
  fnsku: string
  category: SKUCategory
  sub_category: string | null
  units_per_box: number
  moq: number
  lead_time_days: number
  cogs: number | null
  dimensions: string | null
  is_active: boolean
}

export interface CommandCenterResponse {
  alerts: {
    sku: string
    name: string
    action_flag: ActionFlag
    total_coverage: number
    coverage_amazon: number
    coverage_noon: number
    coverage_warehouse: number
    blended_sv: number
  }[]
  ship_now: {
    sku: string
    name: string
    allocation_logic: string
    blended_sv: number
    current_fba_stock_units: number
    current_fbn_stock_units: number
    boxes_in_hand: number
    boxes_required_30d_amz: number
    boxes_required_30d_noon: number
    suggested_boxes_amazon: number
    suggested_boxes_noon: number
    total_boxes_to_ship: number
    total_units_to_ship: number
    plan_date: string | null
  }[]
  reorder_now: {
    sku: string
    name: string
    category: SKUCategory
    suggested_units: number
    moq: number | null
    cogs: number | null
    blended_sv: number
    projected_coverage: number
    total_cost_aed?: number
    lead_time_days: number
  }[]
  transfers: {
    sku: string
    name: string
    from: InventoryNode
    to: InventoryNode
    units: number
    boxes: number
  }[]
  inbound: {
    po_number: string
    eta: string
    status: POStatus
    line_items: {
      sku: string
      units_ordered: number
      units_received: number
    }[]
  }[]
  excess: {
    sku: string
    name: string
    total_coverage: number
  }[]
  live_selling_skus?: number
  live_skus_amazon?: number
  live_skus_noon?: number
  oos_pct_amazon?: number
  oos_pct_noon?: number
  oos_pct_total?: number
  oos_count_amazon?: number
  oos_count_noon?: number
  oos_count_total?: number
  oos_skus_amazon?: { sku: string; name: string; blended_sv: number; coverage_amazon: number; coverage_noon: number }[]
  oos_skus_noon?: { sku: string; name: string; blended_sv: number; coverage_amazon: number; coverage_noon: number }[]
  latest_snapshot_amazon?: string | null
  latest_snapshot_noon?: string | null
  latest_snapshot_locad?: string | null
  last_synced: string
  total_oos_risk?: {
    sku: string
    name: string
    category: string
    product_category: string
    sub_category: string
    blended_sv: number
    suggested_units: number
    total_cost_aed: number
  }[]
}

export interface SKUDetailResponse {
  sku: string
  name: string
  category: SKUCategory
  units_per_box: number
  moq: number
  lead_time_days: number
  cogs: number
  dimensions: string | null
  is_active: boolean
  demand: {
    sv_7: number
    sv_90: number
    blended_sv: number
  }
  supply: {
    amazon_fba: {
      available: number
      inbound: number
      reserved: number
      coverage_days: number
    }
    noon_fbn: {
      available: number
      inbound: number
      coverage_days: number
    }
    locad_warehouse: {
      available: number
      inbound: number
      coverage_days: number
    }
  }
  total_coverage_days: number
  projected_coverage_days: number
  action_flag: ActionFlag
  pending_pos: {
    po_number: string
    units_incoming: number
    eta: string
    status: POStatus
  }[]
}

export interface SKUListItem extends SKU {
  product_category: string | null
  sub_category: string | null
  is_live: boolean
  demand: {
    blended_sv: number
    total_coverage: number
    projected_coverage: number
    should_reorder: boolean
    suggested_reorder_units: number
  } | null
  action_flag: ActionFlag | null
}

export interface POLineItem {
  id?: string
  sku: string
  units_ordered: number
  units_received: number
  units_per_box?: number
  box_count?: number
  dimensions?: string
  cogs_per_unit?: number
  shipping_cost_per_unit?: number
  notes?: string
}

export interface PO {
  id: string
  po_number: string
  po_name?: string
  supplier: string
  order_date: string
  eta: string
  status: POStatus
  tracking_number?: string
  notes?: string
  line_items: POLineItem[]
  created_at?: string
  updated_at?: string
}

export interface CreatePOInput {
  po_number: string
  po_name?: string
  supplier: string
  order_date: string
  eta: string
  tracking_number?: string
  notes?: string
  line_items: (POLineItem & { sku: string; units_ordered: number })[]
}

export interface UploadPOResponse {
  pos_created: number
  pos_merged?: number
  pos_skipped: number
  pos_failed: number
  rows_processed: number
  created_pos: string[]
  merged_pos?: string[]
  skipped_pos: string[]
  failed_pos: { po_number: string; reason: string }[]
  errors: { row: number; message: string }[]
  message?: string
}

export interface UploadNoonResponse {
  rows_processed: number
  skus_updated: string[]
  errors: { row: number; message: string }[]
}

export interface UploadLocadResponse {
  upload_id: string
  report_date: string
  rows_parsed: number
  rows_matched: number
  rows_unmatched: number
  unmatched_skus: string[]
  status: 'processed' | 'partial' | 'error'
}

export interface UploadNoonInventoryResponse {
  rows_processed: number
  rows_matched: number
  rows_unmatched: number
  unmatched_skus: string[]
}

export interface SyncStatus {
  amazon: { status: 'connected' | 'error'; last_synced: string | null }
  locad_api: { status: 'connected' | 'not_connected'; credentials_configured: boolean; last_synced?: string | null }
  locad_xlsx: { last_uploaded: string | null; rows_matched: number | null; rows_unmatched: number | null }
  noon_csv: { last_uploaded: string | null }
  noon_inventory?: { last_uploaded: string | null }
}

export interface SyncResponse {
  status: 'ok' | 'partial'
  synced_at: string
  skus_processed: number
  locad_status: 'synced' | 'skipped_not_connected'
}

export interface PlanningReorderItem {
  sku: string
  name: string
  abc_class: 'A' | 'B' | 'C'
  product_category: string | null
  product_sub_category: string | null
  blended_sv: number
  stock_in_hand_units: number
  total_coverage: number
  required_stock_by_class_units: number
  shortfall_units: number
  buffer_units: number
  suggested_units: number
  moq: number | null
  cogs: number | null
  total_cost_aed: number
}

export interface PlanningOOSRisk {
  sku: string
  name: string
  coverage_amazon: number
  coverage_noon: number
  coverage_warehouse: number
  action_flag: string | null
}

export interface PlanningWarehouseSKU {
  sku: string
  name: string
  category: string | null
  units: number
  coverage_days: number
}

export interface CoverageNodeHealth {
  median_days: number
  critical: number
  warning: number
  healthy: number
  no_data: number
}

export interface AnalyticsResponse {
  range_days: number
  sales_trend: { date: string; amazon: number; noon: number; noon_minutes: number }[]
  coverage_health: {
    amazon_fba: CoverageNodeHealth
    noon_fbn: CoverageNodeHealth
    locad_warehouse: CoverageNodeHealth
  }
  sku_coverage: {
    sku: string
    name: string
    action_flag: string
    amazon_fba: number | null
    noon_fbn: number | null
    locad_warehouse: number | null
  }[]
  po_pipeline: {
    po_number: string
    supplier: string
    order_date: string
    eta: string
    status: string
    total_units: number
  }[]
  top_skus: {
    sku: string
    name: string
    category: string | null
    units_sold: number
    revenue_aed: number
  }[]
  channel_mix: { date: string; amazon_pct: number; noon_pct: number; noon_minutes_pct: number }[]
  category_performance: { category: string; amazon: number; noon: number; noon_minutes: number }[]
  inventory_value: {
    total_aed: number
    by_node: { node: string; value_aed: number }[]
    by_flag: { flag: string; value_aed: number }[]
  }
  subcategory_inventory: { sub_category: string; amazon_aed: number; noon_aed: number; warehouse_aed: number; total_aed: number }[]
  abc_inventory: { category: string; amazon_aed: number; noon_aed: number; warehouse_aed: number; total_aed: number }[]
  abc_performance: { category: string; units_sold: number; revenue_aed: number; sku_count: number }[]
  subcategory_sales: { sub_category: string; amazon: number; noon: number; noon_minutes: number; total: number }[]
  reorder_cash: { sku: string; name: string; urgency: string; units: number; cost_aed: number }[]
  flag_distribution: { flag: string; count: number }[]
  no_data_skus: { sku: string; name: string; asin: string | null }[]
  generated_at: string
}

export interface PlanningResponse {
  reorder_cash: PlanningReorderItem[]
  total_cash_aed: number
  oos_risks: PlanningOOSRisk[]
  warehouse: {
    total_units: number
    by_category: { category: string; units: number }[]
    skus: PlanningWarehouseSKU[]
  }
  raw_data: any[]
  generated_at?: string
}


