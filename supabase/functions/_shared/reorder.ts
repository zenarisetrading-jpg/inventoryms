import type { SKU } from './types.ts'
import { THRESHOLDS } from './types.ts'

// ---------------------------------------------------------------------------
// computeReorder
// ---------------------------------------------------------------------------
// Determines whether a reorder should be placed for a given SKU and, if so,
// how many units to order.
//
// A reorder is triggered when projected_coverage falls below the category's
// reorder_trigger threshold.
//
// suggested_units is the number of units required to bring total inventory
// (including in-transit PO units) back up to min_coverage days, capped at
// a minimum of the SKU's MOQ.
// ---------------------------------------------------------------------------
export function computeReorder(
  sku: SKU,
  blended_sv: number,
  incoming_units: number,   // supplier POs + in-transit allocation plans
  total_available: number
): { should_reorder: boolean; suggested_units: number } {
  const plan = computeReorderPlan(sku, blended_sv, incoming_units, total_available)
  return { should_reorder: plan.should_reorder, suggested_units: plan.suggested_units }
}

export function computeReorderPlan(
  sku: SKU,
  blended_sv: number,
  incoming_po_units: number,
  total_available: number
): {
  should_reorder: boolean
  suggested_units: number
  required_units: number
  stock_in_hand_units: number
  shortfall_units: number
  buffer_units: number
} {
  const thresholds = THRESHOLDS[sku.category ?? 'C']
  const projected_coverage = blended_sv === 0 ? Infinity : (total_available + incoming_po_units) / blended_sv

  // Trigger: projected_coverage falls below reorder_trigger
  if (blended_sv > 0 && projected_coverage < thresholds.reorder_trigger) {
    const required_units = Math.ceil(thresholds.min_coverage * blended_sv)
    const stock_in_hand_units = Math.round(total_available + incoming_po_units)
    const shortfall_units = Math.max(0, required_units - stock_in_hand_units)
    const moq = Math.max(1, sku.moq ?? 1)
    
    const suggested_units = Math.max(shortfall_units, moq)
    
    return {
      should_reorder: true,
      suggested_units,
      required_units,
      stock_in_hand_units,
      shortfall_units,
      buffer_units: 0, // Not used in this logic
    }
  }

  return {
    should_reorder: false,
    suggested_units: 0,
    required_units: Math.ceil(thresholds.min_coverage * blended_sv),
    stock_in_hand_units: Math.round(total_available + incoming_po_units),
    shortfall_units: 0,
    buffer_units: 0,
  }
}
