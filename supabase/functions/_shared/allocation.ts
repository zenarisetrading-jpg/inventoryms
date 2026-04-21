import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import type { SKU, AllocationPlan } from './types.ts'
import type { CoverageResult } from './coverage.ts'

const TARGET_COVERAGE_DAYS = 30

export interface AllocationBoxDecision {
  boxes_in_hand: number
  boxes_required_amazon: number
  boxes_required_noon: number
  boxes_for_amazon: number
  boxes_for_noon: number
  decision:
  | 'HOLD_NO_STOCK'
  | 'BOTH_SEND_30D_AMZ_30D_NOON'
  | 'FBA_THEN_REMAINDER_TO_NOON'
  | 'FBA_PRIORITY_PARTIAL'
}

export function computeAllocationBoxDecision(
  boxesInHand: number,
  boxesRequiredAmazon: number,
  boxesRequiredNoon: number
): AllocationBoxDecision {
  const boxes_in_hand = Math.max(0, Math.floor(boxesInHand))
  const boxes_required_amazon = Math.max(0, Math.floor(boxesRequiredAmazon))
  const boxes_required_noon = Math.max(0, Math.floor(boxesRequiredNoon))

  if (boxes_in_hand <= 0) {
    return {
      boxes_in_hand,
      boxes_required_amazon,
      boxes_required_noon,
      boxes_for_amazon: 0,
      boxes_for_noon: 0,
      decision: 'HOLD_NO_STOCK',
    }
  }

  if (boxes_in_hand >= boxes_required_amazon + boxes_required_noon) {
    return {
      boxes_in_hand,
      boxes_required_amazon,
      boxes_required_noon,
      boxes_for_amazon: boxes_required_amazon,
      boxes_for_noon: boxes_required_noon,
      decision: 'BOTH_SEND_30D_AMZ_30D_NOON',
    }
  }

  if (boxes_in_hand >= boxes_required_amazon) {
    return {
      boxes_in_hand,
      boxes_required_amazon,
      boxes_required_noon,
      boxes_for_amazon: boxes_required_amazon,
      boxes_for_noon: boxes_in_hand - boxes_required_amazon,
      decision: 'FBA_THEN_REMAINDER_TO_NOON',
    }
  }

  return {
    boxes_in_hand,
    boxes_required_amazon,
    boxes_required_noon,
    boxes_for_amazon: boxes_in_hand,
    boxes_for_noon: 0,
    decision: 'FBA_PRIORITY_PARTIAL',
  }
}

// ---------------------------------------------------------------------------
// computeAllocation
// ---------------------------------------------------------------------------
// Given a SKU, its coverage snapshot, and node velocities, this function
// determines how many boxes should be shipped from the warehouse to Amazon
// FBA and Noon FBN.
//
// Rules:
//   1. Compute box requirements to reach 30d coverage for Amazon and Noon based on their respective SVs.
//   2. Compute whole boxes in hand at warehouse.
//   3. Apply branch logic:
//      a) no stock => hold
//      b) enough for both 30d targets => ship both targets
//      c) enough for Amazon target only => ship Amazon target + remainder to Noon
//      d) not enough for Amazon target => all to Amazon (priority)
//   4. Upsert into allocation_plans and return plans with boxes_to_ship > 0.
// ---------------------------------------------------------------------------
export async function computeAllocation(
  sku: SKU,
  coverage: CoverageResult,
  amazon_sv: number,
  noon_sv: number,
  supabase: SupabaseClient
): Promise<AllocationPlan[]> {
  const plans: AllocationPlan[] = []
  const today = new Date().toISOString().split('T')[0]

  // No velocity across any nodes = nothing to allocate
  if (amazon_sv === 0 && noon_sv === 0) return plans

  const warehouse_available = coverage.by_node.locad_warehouse.available
  const amazon_available = coverage.by_node.amazon_fba.available
  const noon_available = coverage.by_node.noon_fbn.available

  // Nothing in warehouse to allocate
  if (warehouse_available <= 0 || sku.units_per_box <= 0) return plans

  const boxes_in_hand = Math.floor(warehouse_available / sku.units_per_box)

  const amazon_target_units = TARGET_COVERAGE_DAYS * amazon_sv
  const noon_target_units = TARGET_COVERAGE_DAYS * noon_sv

  const amazon_deficit_units = Math.max(0, amazon_target_units - amazon_available)
  const noon_deficit_units = Math.max(0, noon_target_units - noon_available)

  // Boxes required use ceil so one extra whole box can close the deficit.
  const boxes_required_amazon = Math.ceil(amazon_deficit_units / sku.units_per_box)
  const boxes_required_noon = Math.ceil(noon_deficit_units / sku.units_per_box)

  const decision = computeAllocationBoxDecision(
    boxes_in_hand,
    boxes_required_amazon,
    boxes_required_noon
  )

  const boxes_for_amazon = decision.boxes_for_amazon
  const boxes_for_noon = decision.boxes_for_noon
  const units_for_amazon = boxes_for_amazon * sku.units_per_box
  const units_for_noon = boxes_for_noon * sku.units_per_box

  if (boxes_for_amazon > 0) {
    plans.push({
      sku: sku.sku,
      node: 'amazon_fba',
      boxes_to_ship: boxes_for_amazon,
      units_to_ship: units_for_amazon,
      status: 'pending',
    })
  }

  if (boxes_for_noon > 0) {
    plans.push({
      sku: sku.sku,
      node: 'noon_fbn',
      boxes_to_ship: boxes_for_noon,
      units_to_ship: units_for_noon,
      status: 'pending',
    })
  }

  // -------------------------------------------------------------------------
  // Upsert allocation plans to DB (only for plans with boxes > 0)
  // -------------------------------------------------------------------------
  if (plans.length > 0) {
    for (const plan of plans) {
      const { error } = await supabase.from('allocation_plans').upsert(
        {
          sku: plan.sku,
          node: plan.node,
          boxes_to_ship: plan.boxes_to_ship,
          units_to_ship: plan.units_to_ship,
          status: 'pending',
          plan_date: today,
        },
        { onConflict: 'sku,node,plan_date' }
      )
      if (error) {
        console.error(
          `computeAllocation: upsert failed for SKU ${plan.sku} node ${plan.node}`,
          error
        )
      }
    }
  }

  return plans
}
