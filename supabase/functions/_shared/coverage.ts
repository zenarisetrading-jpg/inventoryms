import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import type { SKU, InventoryNode } from './types.ts'
import { INCOMING_PO_STATUSES, THRESHOLDS } from './types.ts'
import type { ActionFlag } from './types.ts'

// ---------------------------------------------------------------------------
// CoverageResult
// ---------------------------------------------------------------------------
export interface CoverageResult {
  by_node: Record<
    InventoryNode,
    { available: number; inbound: number; coverage_days: number }
  >
  total_available: number
  total_coverage: number
  incoming_po_units: number
  in_transit_allocation_units: number
  projected_coverage: number
}

// ---------------------------------------------------------------------------
// computeCoverage
// ---------------------------------------------------------------------------
// Queries the latest inventory_snapshot per node for the given SKU and sums
// incoming PO units.  All coverage values are expressed in days.
// ---------------------------------------------------------------------------
export async function computeCoverage(
  sku: SKU,
  blended_sv: number,
  supabase: SupabaseClient
): Promise<CoverageResult> {
  // Default per-node structure
  const emptyNode = { available: 0, inbound: 0, coverage_days: 0 }
  const defaultResult: CoverageResult = {
    by_node: {
      amazon_fba: { ...emptyNode },
      noon_fbn: { ...emptyNode },
      locad_warehouse: { ...emptyNode },
    },
    total_available: 0,
    total_coverage: blended_sv === 0 ? Infinity : 0,
    incoming_po_units: 0,
    in_transit_allocation_units: 0,
    projected_coverage: blended_sv === 0 ? Infinity : 0,
  }

  // -------------------------------------------------------------------------
  // 1. Fetch latest inventory snapshot rows per node
  // -------------------------------------------------------------------------
  const { data: snapshots, error: snapError } = await supabase
    .from('inventory_snapshot')
    .select('node, warehouse_name, available, inbound, snapshot_date')
    .eq('sku', sku.sku)
    .order('snapshot_date', { ascending: false })

  if (snapError || !snapshots || snapshots.length === 0) {
    return defaultResult
  }

  // Find the most recent snapshot_date per node
  const latestDateByNode: Record<string, string> = {}
  for (const row of snapshots as {
    node: InventoryNode
    warehouse_name: string | null
    available: number
    inbound: number
    snapshot_date: string
  }[]) {
    if (
      !latestDateByNode[row.node] ||
      row.snapshot_date > latestDateByNode[row.node]
    ) {
      latestDateByNode[row.node] = row.snapshot_date
    }
  }

  // Filter to only the latest rows per node
  const latestRows = (
    snapshots as {
      node: InventoryNode
      warehouse_name: string | null
      available: number
      inbound: number
      snapshot_date: string
    }[]
  ).filter((row) => row.snapshot_date === latestDateByNode[row.node])

  // -------------------------------------------------------------------------
  // 2. Aggregate per-node totals
  //    For locad_warehouse: SUM across all warehouse_name values on latest date
  // -------------------------------------------------------------------------
  const nodeAggregates: Record<InventoryNode, { available: number; inbound: number }> = {
    amazon_fba: { available: 0, inbound: 0 },
    noon_fbn: { available: 0, inbound: 0 },
    locad_warehouse: { available: 0, inbound: 0 },
  }

  for (const row of latestRows) {
    const node = row.node as InventoryNode
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

  // -------------------------------------------------------------------------
  // 3. Query incoming PO units (supplier → warehouse)
  //    po_line_items joined with po_register where status IN INCOMING_PO_STATUSES
  // -------------------------------------------------------------------------
  let incoming_po_units = 0

  const { data: poLines, error: poError } = await supabase
    .from('po_line_items')
    .select('units_ordered, units_received, po_register!inner(status)')
    .eq('sku', sku.sku)
    .in('po_register.status', INCOMING_PO_STATUSES)

  if (!poError && poLines) {
    for (const line of poLines as {
      units_ordered: number
      units_received: number
    }[]) {
      const remaining = (line.units_ordered ?? 0) - (line.units_received ?? 0)
      if (remaining > 0) {
        incoming_po_units += remaining
      }
    }
  }

  // -------------------------------------------------------------------------
  // 3b. Query in-transit allocation units (warehouse → FBA/Noon)
  //     approved = Locad appointment booked (units reserved, excluded from available)
  //     shipped  = physically picked up from Locad, en route to destination
  //     pending is excluded — those units are still in Locad's available quantity
  // -------------------------------------------------------------------------
  let in_transit_allocation_units = 0

  const { data: allocLines, error: allocError } = await supabase
    .from('allocation_plans')
    .select('units_to_ship')
    .eq('sku', sku.sku)
    .in('status', ['approved', 'shipped'])

  if (!allocError && allocLines) {
    for (const line of allocLines as { units_to_ship: number }[]) {
      in_transit_allocation_units += line.units_to_ship ?? 0
    }
  }

  // -------------------------------------------------------------------------
  // 4. Compute coverage days
  // -------------------------------------------------------------------------
  const coverageDays = (available: number): number => {
    if (blended_sv === 0) return Infinity
    return available / blended_sv
  }

  const total_available =
    nodeAggregates.amazon_fba.available +
    nodeAggregates.noon_fbn.available +
    nodeAggregates.locad_warehouse.available

  const total_coverage = coverageDays(total_available)
  const projected_coverage = coverageDays(
    total_available + incoming_po_units + in_transit_allocation_units
  )

  return {
    by_node: {
      amazon_fba: {
        available: nodeAggregates.amazon_fba.available,
        inbound: nodeAggregates.amazon_fba.inbound,
        coverage_days: coverageDays(nodeAggregates.amazon_fba.available),
      },
      noon_fbn: {
        available: nodeAggregates.noon_fbn.available,
        inbound: nodeAggregates.noon_fbn.inbound,
        coverage_days: coverageDays(nodeAggregates.noon_fbn.available),
      },
      locad_warehouse: {
        available: nodeAggregates.locad_warehouse.available,
        inbound: nodeAggregates.locad_warehouse.inbound,
        coverage_days: coverageDays(nodeAggregates.locad_warehouse.available),
      },
    },
    total_available,
    total_coverage,
    incoming_po_units,
    in_transit_allocation_units,
    projected_coverage,
  }
}

// ---------------------------------------------------------------------------
// computeActionFlag
// ---------------------------------------------------------------------------
// Evaluates the priority-ordered rule set and returns the appropriate flag.
// If blended_sv === 0 there is no velocity so no OOS risk — return 'OK'.
// ---------------------------------------------------------------------------
export function computeActionFlag(
  sku: SKU,
  blended_sv: number,
  coverage: CoverageResult
): ActionFlag {
  // No velocity → no OOS risk
  if (blended_sv === 0) return 'OK'

  const thresholds = THRESHOLDS[sku.category ?? 'C']
  const total_coverage = coverage.total_coverage

  // Guard: treat Infinity as safe
  const safeTotal = isFinite(total_coverage) ? total_coverage : Infinity

  if (isFinite(safeTotal) && safeTotal <= 7) return 'CRITICAL_OOS_RISK'
  if (isFinite(safeTotal) && safeTotal <= 14) return 'OOS_RISK'

  const warehouseAvailable = coverage.by_node.locad_warehouse.available
  const amazonCoverage = coverage.by_node.amazon_fba.coverage_days
  const noonCoverage = coverage.by_node.noon_fbn.coverage_days

  if (
    warehouseAvailable > 0 &&
    (amazonCoverage < thresholds.reorder_trigger ||
      noonCoverage < thresholds.reorder_trigger)
  ) {
    return 'SHIP_NOW'
  }

  if (
    isFinite(coverage.projected_coverage) &&
    coverage.projected_coverage < thresholds.reorder_trigger
  ) {
    return 'REORDER'
  }

  if (isFinite(safeTotal) && safeTotal > thresholds.min_coverage * 2.0) return 'EXCESS'

  return 'OK'
}
