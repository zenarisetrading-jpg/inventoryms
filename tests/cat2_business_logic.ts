/**
 * Category 2 — Business Logic Unit Tests
 *
 * Tests computeReorder, computeActionFlag, computeTransfers, and THRESHOLDS
 * by importing directly from the shared modules.
 *
 * Run with Deno (no network required for most tests):
 *   deno test tests/cat2_business_logic.ts --allow-read --allow-env
 *
 * Note: computeActionFlag and computeTransfers are pure functions.
 *       computeReorder is pure. No Supabase client needed.
 */

import { assertEquals, assert } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { computeReorder } from '../supabase/functions/_shared/reorder.ts'
import { computeTransfers } from '../supabase/functions/_shared/transfer.ts'
import { computeActionFlag } from '../supabase/functions/_shared/coverage.ts'
import { THRESHOLDS } from '../supabase/functions/_shared/types.ts'
import type { SKU } from '../supabase/functions/_shared/types.ts'
import type { CoverageResult } from '../supabase/functions/_shared/coverage.ts'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSKU(overrides: Partial<SKU> = {}): SKU {
  return {
    sku: 'TEST-SKU-001',
    name: 'Test SKU',
    asin: 'B000000001',
    fnsku: 'X000000001',
    category: 'A',
    sub_category: 'bottles',
    units_per_box: 6,
    moq: 100,
    lead_time_days: 30,
    cogs: 10.0,
    ...overrides,
  }
}

function makeCoverage(overrides: Partial<CoverageResult> = {}): CoverageResult {
  return {
    by_node: {
      amazon_fba: { available: 0, inbound: 0, coverage_days: 0 },
      noon_fbn: { available: 0, inbound: 0, coverage_days: 0 },
      locad_warehouse: { available: 0, inbound: 0, coverage_days: 0 },
    },
    total_available: 0,
    total_coverage: 0,
    incoming_po_units: 0,
    in_transit_allocation_units: 0,
    projected_coverage: 0,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Test 2.1 — computeReorder: normal reorder triggered
// ---------------------------------------------------------------------------
Deno.test('2.1 — computeReorder: normal reorder triggered for Category A', () => {
  // Category A: reorder_trigger = 45, min_coverage = 60
  // blended_sv = 10 units/day
  // projected_coverage = 30 days (< 45 → trigger)
  // incoming_po_units = 0
  // total_available = 300
  // needed = ceil(60 * 10 - 300 - 0) = ceil(300) = 300
  // moq = 100 → suggested = max(300, 100) = 300

  const sku = makeSKU({ category: 'A', moq: 100 })
  const result = computeReorder(
    sku,
    10,  // blended_sv
    0,   // incoming_po_units
    300  // total_available
  )

  assertEquals(result.should_reorder, true, '2.1: should_reorder must be true')
  assertEquals(result.suggested_units, 300, '2.1: suggested_units must be 300')
  console.log('[2.1] PASS — reorder triggered, suggested_units=300')
})

// ---------------------------------------------------------------------------
// Test 2.2 — computeReorder: MOQ floor applied
// ---------------------------------------------------------------------------
Deno.test('2.2 — computeReorder: MOQ floor applied when computed units < MOQ', () => {
  // Category A: min_coverage = 60, blended_sv = 10
  // total_available = 595 → need = ceil(600 - 595 - 0) = 5
  // moq = 500 → suggested = max(5, 500) = 500
  // projected_coverage = 30 (< 45 → triggers)

  const sku = makeSKU({ category: 'A', moq: 500 })
  const result = computeReorder(
    sku,
    10,   // blended_sv
    0,    // incoming_po_units
    300   // total_available (projected_coverage = 30 < 45)
  )

  assertEquals(result.should_reorder, true, '2.2: should_reorder must be true')
  assertEquals(result.suggested_units, 500, '2.2: suggested_units must equal MOQ (500)')
  console.log('[2.2] PASS — MOQ floor applied, suggested_units=500')
})

// ---------------------------------------------------------------------------
// Test 2.3 — computeReorder: no reorder when coverage healthy
// ---------------------------------------------------------------------------
Deno.test('2.3 — computeReorder: no reorder when projected_coverage >= reorder_trigger', () => {
  // Category A: reorder_trigger = 45
  // projected_coverage = 60 (>= 45 → no reorder)

  const sku = makeSKU({ category: 'A', moq: 100 })
  const result = computeReorder(
    sku,
    10,   // blended_sv
    0,    // incoming_po_units
    600   // total_available (projected_coverage = 60)
  )

  assertEquals(result.should_reorder, false, '2.3: should_reorder must be false')
  assertEquals(result.suggested_units, 0, '2.3: suggested_units must be 0')
  console.log('[2.3] PASS — no reorder when coverage healthy')
})

// ---------------------------------------------------------------------------
// Test 2.4 — computeReorder: zero velocity = no reorder
// ---------------------------------------------------------------------------
Deno.test('2.4 — computeReorder: zero velocity means no reorder', () => {
  const sku = makeSKU({ category: 'A', moq: 100 })
  const result = computeReorder(
    sku,
    0,    // blended_sv = 0
    0,    // incoming_po_units
    0     // total_available
  )

  assertEquals(result.should_reorder, false, '2.4: should_reorder must be false when velocity=0')
  assertEquals(result.suggested_units, 0, '2.4: suggested_units must be 0')
  console.log('[2.4] PASS — zero velocity produces no reorder')
})

// ---------------------------------------------------------------------------
// Test 2.5 — computeActionFlag: priority cascade
// ---------------------------------------------------------------------------
Deno.test('2.5a — computeActionFlag: CRITICAL_OOS_RISK when total_coverage <= 7', () => {
  const sku = makeSKU({ category: 'A' })
  const coverage = makeCoverage({
    total_coverage: 5,
    projected_coverage: 5,
    by_node: {
      amazon_fba: { available: 50, inbound: 0, coverage_days: 5 },
      noon_fbn: { available: 0, inbound: 0, coverage_days: 0 },
      locad_warehouse: { available: 0, inbound: 0, coverage_days: 0 },
    },
  })

  const flag = computeActionFlag(sku, 10, coverage)
  assertEquals(flag, 'CRITICAL_OOS_RISK', '2.5a: expected CRITICAL_OOS_RISK')
  console.log('[2.5a] PASS — CRITICAL_OOS_RISK at 5 days coverage')
})

Deno.test('2.5b — computeActionFlag: OOS_RISK when total_coverage <= 14', () => {
  const sku = makeSKU({ category: 'A' })
  const coverage = makeCoverage({
    total_coverage: 10,
    projected_coverage: 10,
    by_node: {
      amazon_fba: { available: 100, inbound: 0, coverage_days: 10 },
      noon_fbn: { available: 0, inbound: 0, coverage_days: 0 },
      locad_warehouse: { available: 0, inbound: 0, coverage_days: 0 },
    },
  })

  const flag = computeActionFlag(sku, 10, coverage)
  assertEquals(flag, 'OOS_RISK', '2.5b: expected OOS_RISK')
  console.log('[2.5b] PASS — OOS_RISK at 10 days coverage')
})

Deno.test('2.5c — computeActionFlag: SHIP_NOW when warehouse stock available and amazon_coverage < reorder_trigger', () => {
  // Category A: reorder_trigger = 45
  // warehouse > 0, amazon_coverage = 20 (< 45) → SHIP_NOW
  const sku = makeSKU({ category: 'A' })
  const blended_sv = 10
  const coverage = makeCoverage({
    total_coverage: 30,
    projected_coverage: 30,
    by_node: {
      amazon_fba: { available: 200, inbound: 0, coverage_days: 20 },
      noon_fbn: { available: 0, inbound: 0, coverage_days: 0 },
      locad_warehouse: { available: 200, inbound: 0, coverage_days: 20 },
    },
  })

  const flag = computeActionFlag(sku, blended_sv, coverage)
  assertEquals(flag, 'SHIP_NOW', '2.5c: expected SHIP_NOW')
  console.log('[2.5c] PASS — SHIP_NOW when warehouse available and amazon coverage low')
})

Deno.test('2.5d — computeActionFlag: REORDER when projected_coverage < reorder_trigger and no warehouse', () => {
  // Category A: reorder_trigger = 45
  // projected_coverage = 30, warehouse = 0, total_coverage = 30 (> 14 so not OOS)
  const sku = makeSKU({ category: 'A' })
  const coverage = makeCoverage({
    total_coverage: 30,
    projected_coverage: 30,
    by_node: {
      amazon_fba: { available: 300, inbound: 0, coverage_days: 30 },
      noon_fbn: { available: 0, inbound: 0, coverage_days: 0 },
      locad_warehouse: { available: 0, inbound: 0, coverage_days: 0 },
    },
  })

  const flag = computeActionFlag(sku, 10, coverage)
  assertEquals(flag, 'REORDER', '2.5d: expected REORDER')
  console.log('[2.5d] PASS — REORDER when projected_coverage < reorder_trigger, no warehouse')
})

Deno.test('2.5e — computeActionFlag: EXCESS when total_coverage > min_coverage * 2', () => {
  // Category A: min_coverage = 60, excess threshold = 120
  // total_coverage = 130 > 120 → EXCESS
  const sku = makeSKU({ category: 'A' })
  const coverage = makeCoverage({
    total_coverage: 130,
    projected_coverage: 130,
    by_node: {
      amazon_fba: { available: 1300, inbound: 0, coverage_days: 130 },
      noon_fbn: { available: 0, inbound: 0, coverage_days: 0 },
      locad_warehouse: { available: 0, inbound: 0, coverage_days: 0 },
    },
  })

  const flag = computeActionFlag(sku, 10, coverage)
  assertEquals(flag, 'EXCESS', '2.5e: expected EXCESS')
  console.log('[2.5e] PASS — EXCESS at 130 days coverage (> 2 * 60 = 120)')
})

Deno.test('2.5f — computeActionFlag: OK when coverage healthy (between reorder and excess)', () => {
  // Category A: reorder_trigger = 45, min_coverage * 2 = 120
  // total_coverage = 70 → OK
  const sku = makeSKU({ category: 'A' })
  const coverage = makeCoverage({
    total_coverage: 70,
    projected_coverage: 70,
    by_node: {
      amazon_fba: { available: 700, inbound: 0, coverage_days: 70 },
      noon_fbn: { available: 0, inbound: 0, coverage_days: 0 },
      locad_warehouse: { available: 0, inbound: 0, coverage_days: 0 },
    },
  })

  const flag = computeActionFlag(sku, 10, coverage)
  assertEquals(flag, 'OK', '2.5f: expected OK')
  console.log('[2.5f] PASS — OK at 70 days coverage')
})

// ---------------------------------------------------------------------------
// Test 2.6 — computeActionFlag: zero velocity = always OK
// ---------------------------------------------------------------------------
Deno.test('2.6 — computeActionFlag: zero velocity returns OK regardless of coverage', () => {
  const sku = makeSKU({ category: 'A' })
  const coverage = makeCoverage({
    total_coverage: Infinity,
    projected_coverage: Infinity,
  })

  const flag = computeActionFlag(sku, 0, coverage) // blended_sv = 0
  assertEquals(flag, 'OK', '2.6: zero velocity must always return OK')
  console.log('[2.6] PASS — zero velocity returns OK')
})

// ---------------------------------------------------------------------------
// Test 2.7 — computeTransfers: excess → deficit transfer
// ---------------------------------------------------------------------------
Deno.test('2.7 — computeTransfers: excess amazon → deficit noon transfer recommended', () => {
  // Category A: min_coverage = 60, excess_threshold = 60 * 1.5 = 90, reorder_trigger = 45
  // amazon: 120 days (> 90 = excess)
  // noon: 20 days (< 45 = deficit)
  // blended_sv = 5, units_per_box = 6

  const sku = makeSKU({ category: 'A', units_per_box: 6 })
  const blended_sv = 5

  const coverage_by_node = {
    locad_warehouse: {
      available: Math.round(120 * blended_sv), // 600 units
      coverage_days: 120,
    },
    amazon_fba: {
      available: 0,
      coverage_days: 0,
    },
    noon_fbn: {
      available: Math.round(20 * blended_sv), // 100 units
      coverage_days: 20,
    },
  }

  const transfers = computeTransfers(sku, blended_sv, coverage_by_node)

  assert(transfers.length > 0, '2.7: expected at least one transfer recommendation')

  const warehouseToNoon = transfers.find((t) => t.from === 'locad_warehouse' && t.to === 'noon_fbn')
  assert(
    warehouseToNoon !== undefined,
    '2.7: expected transfer from locad_warehouse to noon_fbn'
  )
  assert(warehouseToNoon!.units > 0, '2.7: transfer units must be > 0')
  assert(warehouseToNoon!.boxes > 0, '2.7: transfer boxes must be > 0')
  assert(
    warehouseToNoon!.units % sku.units_per_box === 0,
    '2.7: transfer units must be a whole number of boxes'
  )

  console.log(
    `[2.7] PASS — transfer: ${warehouseToNoon!.units} units (${warehouseToNoon!.boxes} boxes) from warehouse to noon`
  )
})

// ---------------------------------------------------------------------------
// Test 2.8 — computeTransfers: no transfer when both nodes healthy
// ---------------------------------------------------------------------------
Deno.test('2.8 — computeTransfers: no transfer when both nodes above reorder_trigger', () => {
  // Category A: reorder_trigger = 45
  // amazon = 70 days (> 45, no deficit)
  // noon = 70 days (> 45, no deficit)
  // excess_threshold = 90 — neither is in excess
  const sku = makeSKU({ category: 'A', units_per_box: 6 })
  const blended_sv = 5

  const coverage_by_node = {
    amazon_fba: { available: 70 * blended_sv, coverage_days: 70 },
    noon_fbn: { available: 70 * blended_sv, coverage_days: 70 },
    locad_warehouse: { available: 0, coverage_days: 0 },
  }

  const transfers = computeTransfers(sku, blended_sv, coverage_by_node)
  assertEquals(transfers.length, 0, '2.8: no transfers expected when both nodes healthy')
  console.log('[2.8] PASS — no transfers when both nodes have 70 days coverage')
})

// ---------------------------------------------------------------------------
// Test 2.9 — THRESHOLDS constants correct
// ---------------------------------------------------------------------------
Deno.test('2.9 — THRESHOLDS constants match documented values', () => {
  assertEquals(
    THRESHOLDS.A,
    { min_coverage: 60, reorder_trigger: 45 },
    '2.9: Category A thresholds must be { min_coverage: 60, reorder_trigger: 45 }'
  )
  assertEquals(
    THRESHOLDS.B,
    { min_coverage: 45, reorder_trigger: 30 },
    '2.9: Category B thresholds must be { min_coverage: 45, reorder_trigger: 30 }'
  )
  assertEquals(
    THRESHOLDS.C,
    { min_coverage: 20, reorder_trigger: 20 },
    '2.9: Category C thresholds must be { min_coverage: 20, reorder_trigger: 20 }'
  )
  console.log('[2.9] PASS — all THRESHOLDS constants match expected values')
})

// ---------------------------------------------------------------------------
// Additional edge case: Category B and C reorder thresholds
// ---------------------------------------------------------------------------
Deno.test('2.10 — computeReorder: Category B uses different thresholds', () => {
  // Category B: reorder_trigger = 30, min_coverage = 45
  // blended_sv = 5, projected_coverage = 20 (< 30 → trigger)
  // total_available = 100, needed = ceil(45*5 - 100 - 0) = ceil(125) = 125
  // moq = 100 → max(125, 100) = 125
  const sku = makeSKU({ category: 'B', moq: 100 })
  const result = computeReorder(sku, 5, 0, 100)

  assertEquals(result.should_reorder, true, '2.10: should_reorder must be true for Category B')
  assertEquals(result.suggested_units, 125, '2.10: suggested_units must be 125 for Category B')
  console.log('[2.10] PASS — Category B reorder uses min_coverage=45, reorder_trigger=30')
})

Deno.test('2.11 — computeReorder: Category C uses same value for min and trigger', () => {
  // Category C: reorder_trigger = 20, min_coverage = 20
  // projected_coverage = 15 (< 20 → trigger)
  // blended_sv = 2, total_available = 20, needed = ceil(20*2 - 20 - 0) = ceil(20) = 20
  // moq = 50 → max(20, 50) = 50
  const sku = makeSKU({ category: 'C', moq: 50 })
  const result = computeReorder(sku, 2, 0, 20)

  assertEquals(result.should_reorder, true, '2.11: should_reorder must be true')
  assertEquals(result.suggested_units, 50, '2.11: MOQ floor must apply: 50')
  console.log('[2.11] PASS — Category C reorder: MOQ floor of 50 applied')
})

Deno.test('2.12 — computeReorder: incoming PO units reduce suggested_units', () => {
  // Category A: min_coverage = 60, blended_sv = 10
  // total_available = 200, incoming_po_units = 200, projected_coverage = 40 (< 45 → trigger)
  // needed = ceil(600 - 200 - 200) = ceil(200) = 200
  // moq = 100 → max(200, 100) = 200
  const sku = makeSKU({ category: 'A', moq: 100 })
  const result = computeReorder(sku, 10, 200, 200)

  assertEquals(result.should_reorder, true, '2.12: should trigger despite incoming PO')
  assertEquals(result.suggested_units, 200, '2.12: PO units reduce the suggested quantity')
  console.log('[2.12] PASS — incoming PO units correctly reduce suggested_units')
})

Deno.test('2.13 — computeReorder: infinite projected_coverage = no reorder', () => {
  // Infinity means effectively unlimited stock
  const sku = makeSKU({ category: 'A', moq: 100 })
  const result = computeReorder(sku, 10, 0, 1000) // 1000 units / 10 = 100 days coverage

  assertEquals(result.should_reorder, false, '2.13: infinite projected_coverage must not trigger reorder')
  console.log('[2.13] PASS — infinite projected_coverage correctly produces no reorder')
})

Deno.test('2.14 — computeTransfers: zero velocity produces no transfers', () => {
  const sku = makeSKU({ category: 'A', units_per_box: 6 })

  const coverage_by_node = {
    amazon_fba: { available: 0, coverage_days: 0 },
    noon_fbn: { available: 0, coverage_days: 0 },
    locad_warehouse: { available: 0, coverage_days: 0 },
  }

  const transfers = computeTransfers(sku, 0, coverage_by_node) // blended_sv = 0
  assertEquals(transfers.length, 0, '2.14: zero velocity must produce no transfer recommendations')
  console.log('[2.14] PASS — zero velocity produces no transfers')
})
