import type { SKU, InventoryNode } from './types.ts'
import { THRESHOLDS } from './types.ts'

// ---------------------------------------------------------------------------
// TransferRecommendation
// ---------------------------------------------------------------------------
export interface TransferRecommendation {
  from: InventoryNode
  to: InventoryNode
  units: number
  boxes: number
}

// ---------------------------------------------------------------------------
// computeTransfers
// ---------------------------------------------------------------------------
// Identifies inter-node transfer opportunities for a SKU.
//
// A transfer is recommended when:
//   - source node has coverage_days > excess_threshold  (excess stock)
//   - destination node has coverage_days < deficit_threshold  (deficit risk)
//
// Thresholds:
//   excess_threshold  = min_coverage * 1.5
//   deficit_threshold = reorder_trigger
//
// Only whole boxes are transferred.
// ---------------------------------------------------------------------------
export function computeTransfers(
  sku: SKU,
  blended_sv: number,
  coverage_by_node: Record<InventoryNode, { available: number; coverage_days: number }>
): TransferRecommendation[] {
  const transfers: TransferRecommendation[] = []

  // No velocity → no basis for transfers
  if (blended_sv === 0 || sku.units_per_box <= 0) return transfers

  const thresholds = THRESHOLDS[sku.category ?? 'C']
  const deficit_threshold = thresholds.reorder_trigger

  // Transfers ONLY originate from locad_warehouse → amazon_fba or noon_fbn.
  // Reverse transfers (FBA→Noon, FBA→Locad, Noon→anything) are never recommended.
  const warehouseData = coverage_by_node['locad_warehouse']
  if (warehouseData.available <= 0) return transfers

  const destNodes: InventoryNode[] = ['amazon_fba', 'noon_fbn']

  for (const toNode of destNodes) {
    const toData = coverage_by_node[toNode]

    // Only recommend if destination is below deficit threshold
    if (!isFinite(toData.coverage_days) && toData.coverage_days > 0) continue
    if (isFinite(toData.coverage_days) && toData.coverage_days >= deficit_threshold) continue

    // Units needed to bring destination up to min_coverage
    const target_units = thresholds.min_coverage * blended_sv
    const deficit_units = Math.max(0, target_units - toData.available)

    // Cap by available warehouse stock (don't over-allocate across multiple destinations)
    const already_allocated = transfers.reduce((sum, t) => sum + t.units, 0)
    const warehouse_remaining = warehouseData.available - already_allocated
    if (warehouse_remaining <= 0) break

    const transferable_units = Math.min(deficit_units, warehouse_remaining)
    const boxes = Math.floor(transferable_units / sku.units_per_box)
    const units = boxes * sku.units_per_box

    if (boxes > 0) {
      transfers.push({
        from: 'locad_warehouse',
        to: toNode,
        units,
        boxes,
      })
    }
  }

  return transfers
}
