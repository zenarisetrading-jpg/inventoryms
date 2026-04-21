export type SKUCategory = 'A' | 'B' | 'C'
export type POStatus = 'draft' | 'ordered' | 'shipped' | 'in_transit' | 'arrived' | 'closed'
export type InventoryNode = 'amazon_fba' | 'noon_fbn' | 'locad_warehouse'
export type ActionFlag = 'CRITICAL_OOS_RISK' | 'OOS_RISK' | 'SHIP_NOW' | 'REORDER' | 'TRANSFER' | 'EXCESS' | 'OK'
export type SalesChannel = 'amazon' | 'noon'

export interface SKU {
  sku: string
  name: string
  asin: string
  fnsku: string
  category: SKUCategory
  sub_category: string
  units_per_box: number
  moq: number
  lead_time_days: number
  cogs: number
}

export interface InventorySnapshot {
  sku: string
  node: InventoryNode
  warehouse_name: string | null
  available: number
  inbound: number
  reserved: number
  snapshot_date: string
}

export interface SalesSnapshot {
  sku: string
  date: string
  channel: SalesChannel
  units_sold: number
}

export interface DemandMetrics {
  sku: string
  sv_7: number
  sv_90: number
  blended_sv: number
  coverage_amazon: number
  coverage_noon: number
  coverage_warehouse: number
  total_coverage: number
  projected_coverage: number
  action_flag: ActionFlag
}

export interface POLineItem {
  sku: string
  units_ordered: number
  units_received: number
}

export interface PO {
  id: string
  po_number: string
  supplier: string
  order_date: string
  eta: string
  status: POStatus
  notes?: string
  line_items: POLineItem[]
}

export interface AllocationPlan {
  sku: string
  node: InventoryNode
  boxes_to_ship: number
  units_to_ship: number
  status: 'pending' | 'approved' | 'shipped'
}

// Business logic constants
export const THRESHOLDS: Record<SKUCategory, { min_coverage: number; reorder_trigger: number }> = {
  A: { min_coverage: 60, reorder_trigger: 45 },
  B: { min_coverage: 45, reorder_trigger: 30 },
  C: { min_coverage: 20, reorder_trigger: 20 },
}

export const VALID_PO_TRANSITIONS: Record<POStatus, POStatus[]> = {
  draft: ['ordered'],
  ordered: ['shipped'],
  shipped: ['in_transit'],
  in_transit: ['arrived'],
  arrived: ['closed'],
  closed: [],
}

// PO statuses that count toward projected coverage
export const INCOMING_PO_STATUSES: POStatus[] = ['ordered', 'shipped', 'in_transit']
