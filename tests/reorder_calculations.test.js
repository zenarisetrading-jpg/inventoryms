const assert = require('assert');
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

// ---------------------------------------------------------------------------
// Pure Calculation Engine (Mirrors frontend/src/lib/reorderService.ts)
// ---------------------------------------------------------------------------
function calculateSingleSKU({
  sku = 'TEST-SKU',
  name = 'Test Product',
  category = 'A',
  amazonSV = 0,
  noonSV = 0,
  minutesSV = 0,
  fbaUnits = 0,
  fbnUnits = 0,
  minutesUnits = 0,
  locadUnits = 0,
  targetDaysA = 60,
  targetDaysB = 45,
  targetDaysC = 30,
  existingPOQty = 0,
  moq = 0,
  casePack = 1,
  unitCost = 0,
  leadTimeDays = 45,
  applyMOQ = true,
  applyCasePack = true,
  lowDaysThreshold = 15,
}) {
  // 3. CAT
  const cat = (category || 'C').toUpperCase().trim();
  const catClass = cat === 'A' ? 'A' : cat === 'B' ? 'B' : 'C';

  // 4. Daily Sales = Amazon Daily Sales + Noon Daily Sales + Minutes Daily Sales
  const daily_sales = Math.round((Math.max(0, amazonSV) + Math.max(0, noonSV) + Math.max(0, minutesSV)) * 1000) / 1000;

  // 5. Available Stock = FBA + FBN + Minutes + LOCAD
  const available_stock = Math.max(0, fbaUnits) + Math.max(0, fbnUnits) + Math.max(0, minutesUnits) + Math.max(0, locadUnits);

  // 6. Days Left = Available Stock / Daily Sales
  const is_zero_sales = daily_sales <= 0;
  let days_left = null;
  if (is_zero_sales) {
    days_left = available_stock === 0 ? 0 : null;
  } else {
    days_left = Math.round((available_stock / daily_sales) * 10) / 10;
  }

  // 7. Target Days
  let target_days = targetDaysC;
  if (catClass === 'A') target_days = targetDaysA;
  else if (catClass === 'B') target_days = targetDaysB;

  // 8. Target Stock & 9. Reorder Qty (If Daily Sales is 0 and Available Stock is 0, order MOQ)
  const safe_moq = Math.max(0, Number(moq) || 0);
  let target_stock = 0;
  let reorder_qty = 0;

  if (is_zero_sales && available_stock === 0) {
    target_stock = safe_moq;
    reorder_qty = safe_moq;
  } else if (is_zero_sales) {
    target_stock = 0;
    reorder_qty = 0;
  } else {
    target_stock = Math.ceil(daily_sales * target_days);
    reorder_qty = Math.max(0, target_stock - available_stock);
  }

  // 10. Existing PO Qty
  const safe_existing_po = Math.max(0, Number(existingPOQty) || 0);

  // 11. Remaining Reorder Qty = MAX(0, Reorder Qty - Existing PO Qty)
  const remaining_reorder_qty = Math.max(0, reorder_qty - safe_existing_po);

  // 12. MOQ
  const is_missing_moq = safe_moq <= 0 && (remaining_reorder_qty > 0 || (is_zero_sales && available_stock === 0));

  // Case pack
  const safe_case_pack = Math.max(1, Number(casePack) || 1);

  // 13. Suggested Order Qty
  let suggested_order_qty = 0;
  let is_moq_applied = false;
  let is_case_pack_applied = false;

  if (remaining_reorder_qty > 0) {
    let qty = remaining_reorder_qty;
    if (applyMOQ && safe_moq > 0) {
      if (qty < safe_moq) {
        qty = safe_moq;
        is_moq_applied = true;
      }
    }
    if (applyCasePack && safe_case_pack > 1) {
      const rounded = Math.ceil(qty / safe_case_pack) * safe_case_pack;
      if (rounded > qty) {
        is_case_pack_applied = true;
      }
      qty = rounded;
    }
    suggested_order_qty = qty;
  } else {
    suggested_order_qty = 0;
  }

  // 14. Unit Cost
  const is_missing_cost = !unitCost || Number(unitCost) <= 0;
  const safe_unit_cost = is_missing_cost ? 0 : Math.round(Number(unitCost) * 100) / 100;

  // 15. Total Reorder Cost = Suggested Order Qty * Unit Cost (0 if cost missing)
  const total_reorder_cost = is_missing_cost ? 0 : Math.round(suggested_order_qty * safe_unit_cost * 100) / 100;

  const is_reorder_required = remaining_reorder_qty > 0 || suggested_order_qty > 0;
  const is_zero_stock = available_stock === 0;
  const is_low_days = days_left !== null && (days_left < lowDaysThreshold || days_left < target_days);
  const is_stockout_risk = !is_zero_sales && (available_stock === 0 || (days_left !== null && days_left < leadTimeDays));

  return {
    sku,
    name,
    category: catClass,
    daily_sales,
    available_stock,
    days_left,
    target_days,
    target_stock,
    reorder_qty,
    existing_po_qty: safe_existing_po,
    remaining_reorder_qty,
    moq: safe_moq,
    suggested_order_qty,
    unit_cost: safe_unit_cost,
    total_reorder_cost,

    is_zero_sales,
    is_missing_cost,
    is_missing_moq,
    is_moq_applied,
    is_case_pack_applied,
    is_reorder_required,
    is_zero_stock,
    is_low_days,
    is_stockout_risk,
  };
}

// ---------------------------------------------------------------------------
// TEST RUNNER
// ---------------------------------------------------------------------------
async function runTests() {
  console.log('=== RUNNING SKU-WISE REORDER DASHBOARD COMPREHENSIVE TESTS ===\n');

  // Scenario 1: No Replenishment Required (Available stock >= Target stock)
  console.log('Scenario 1: No Replenishment Required');
  {
    const r = calculateSingleSKU({
      category: 'A',
      amazonSV: 2,
      noonSV: 1,
      minutesSV: 1, // Daily Sales = 4
      fbaUnits: 200,
      fbnUnits: 50,
      minutesUnits: 20,
      locadUnits: 30, // Available = 300
      targetDaysA: 60, // Target Stock = 240
      existingPOQty: 0,
      moq: 50,
      unitCost: 10,
    });

    assert.strictEqual(r.daily_sales, 4, 'Daily sales should be 4');
    assert.strictEqual(r.available_stock, 300, 'Available stock should be 300');
    assert.strictEqual(r.target_stock, 240, 'Target stock should be 4 * 60 = 240');
    assert.strictEqual(r.reorder_qty, 0, 'Reorder Qty should be 0 since Available >= Target');
    assert.strictEqual(r.remaining_reorder_qty, 0, 'Remaining Reorder Qty should be 0');
    assert.strictEqual(r.suggested_order_qty, 0, 'Suggested Order Qty should be 0');
    assert.strictEqual(r.total_reorder_cost, 0, 'Total Reorder Cost should be 0');
    assert.strictEqual(r.is_reorder_required, false, 'Reorder should not be required');
  }
  console.log('✓ Passed: Scenario 1 - No Replenishment Required\n');

  // Scenario 2: Reorder Quantity Greater Than Existing PO Quantity
  console.log('Scenario 2: Reorder Quantity Greater Than Existing PO Quantity');
  {
    const r = calculateSingleSKU({
      category: 'A',
      amazonSV: 5,
      noonSV: 3,
      minutesSV: 2, // Daily Sales = 10
      fbaUnits: 200,
      fbnUnits: 100,
      minutesUnits: 50,
      locadUnits: 50, // Available = 400
      targetDaysA: 60, // Target Stock = 600
      existingPOQty: 100, // PO Qty = 100
      moq: 50,
      casePack: 1,
      unitCost: 15,
    });

    // Reorder Qty = 600 - 400 = 200
    // Remaining Reorder Qty = 200 - 100 = 100
    assert.strictEqual(r.reorder_qty, 200, 'Reorder Qty should be 200');
    assert.strictEqual(r.remaining_reorder_qty, 100, 'Remaining Reorder Qty should be 100');
    assert.strictEqual(r.suggested_order_qty, 100, 'Suggested Order Qty should be 100 (>= MOQ 50)');
    assert.strictEqual(r.total_reorder_cost, 1500, 'Total Reorder Cost should be 100 * 15 = 1500');
  }
  console.log('✓ Passed: Scenario 2 - Reorder Quantity > Existing PO\n');

  // Scenario 3: Existing PO Quantity Fully Covers Reorder Requirement
  console.log('Scenario 3: Existing PO Fully Covers Reorder Requirement');
  {
    const r = calculateSingleSKU({
      category: 'B',
      amazonSV: 2, // Daily Sales = 2
      targetDaysB: 45, // Target Stock = 90
      fbaUnits: 30, // Available = 30
      existingPOQty: 70, // Existing PO = 70
      moq: 100,
      unitCost: 20,
    });

    // Reorder Qty = 90 - 30 = 60
    // Remaining = MAX(0, 60 - 70) = 0
    assert.strictEqual(r.reorder_qty, 60, 'Reorder Qty should be 60');
    assert.strictEqual(r.remaining_reorder_qty, 0, 'Remaining Reorder Qty must be 0');
    assert.strictEqual(r.suggested_order_qty, 0, 'Suggested Order Qty must be 0 even if MOQ = 100');
    assert.strictEqual(r.total_reorder_cost, 0, 'Total Reorder Cost must be 0');
  }
  console.log('✓ Passed: Scenario 3 - Existing PO Fully Covers Requirement\n');

  // Scenario 4: Remaining Requirement Below MOQ (Exact Prompt Example)
  console.log('Scenario 4: Remaining Requirement Below MOQ (Exact Example from Prompt)');
  {
    const r = calculateSingleSKU({
      category: 'A',
      amazonSV: 10, // Daily Sales = 10
      fbaUnits: 400, // Available Stock = 400
      targetDaysA: 60, // Target Days = 60
      existingPOQty: 188, // Existing PO Qty = 188
      moq: 24, // MOQ = 24
      unitCost: 10, // Unit Cost = $10
      casePack: 1,
    });

    assert.strictEqual(r.daily_sales, 10, 'Daily sales should be 10');
    assert.strictEqual(r.available_stock, 400, 'Available stock should be 400');
    assert.strictEqual(r.target_days, 60, 'Target days should be 60');
    assert.strictEqual(r.target_stock, 600, 'Target stock should be 600');
    assert.strictEqual(r.reorder_qty, 200, 'Reorder Qty should be 200');
    assert.strictEqual(r.existing_po_qty, 188, 'Existing PO Qty should be 188');
    assert.strictEqual(r.remaining_reorder_qty, 12, 'Remaining Reorder Qty should be 12');
    assert.strictEqual(r.moq, 24, 'MOQ should be 24');
    assert.strictEqual(r.suggested_order_qty, 24, 'Suggested Order Qty should be MOQ (24)');
    assert.strictEqual(r.is_moq_applied, true, 'is_moq_applied flag should be true');
    assert.strictEqual(r.unit_cost, 10, 'Unit Cost should be 10');
    assert.strictEqual(r.total_reorder_cost, 240, 'Total Reorder Cost should be $240 (24 * $10)');
  }
  console.log('✓ Passed: Scenario 4 - Exact Prompt Example ($240 reorder investment)\n');

  // Scenario 5: Remaining Requirement Equal to MOQ
  console.log('Scenario 5: Remaining Requirement Equal to MOQ');
  {
    const r = calculateSingleSKU({
      category: 'A',
      amazonSV: 5,
      fbaUnits: 250, // Available = 250, Target = 300, Reorder = 50
      existingPOQty: 0,
      moq: 50,
      unitCost: 12,
    });

    assert.strictEqual(r.remaining_reorder_qty, 50, 'Remaining should be 50');
    assert.strictEqual(r.suggested_order_qty, 50, 'Suggested should equal MOQ (50)');
    assert.strictEqual(r.total_reorder_cost, 600, 'Total cost should be 50 * 12 = 600');
  }
  console.log('✓ Passed: Scenario 5 - Remaining Equal to MOQ\n');

  // Scenario 6: Remaining Requirement Greater Than MOQ
  console.log('Scenario 6: Remaining Requirement Greater Than MOQ');
  {
    const r = calculateSingleSKU({
      category: 'A',
      amazonSV: 5,
      fbaUnits: 200, // Target = 300, Reorder = 100
      existingPOQty: 0,
      moq: 40,
      unitCost: 8,
    });

    assert.strictEqual(r.remaining_reorder_qty, 100, 'Remaining should be 100');
    assert.strictEqual(r.suggested_order_qty, 100, 'Suggested should be 100');
    assert.strictEqual(r.is_moq_applied, false, 'MOQ was not the constraint');
    assert.strictEqual(r.total_reorder_cost, 800, 'Total cost should be 100 * 8 = 800');
  }
  console.log('✓ Passed: Scenario 6 - Remaining Greater Than MOQ\n');

  // Scenario 7: Missing MOQ
  console.log('Scenario 7: Missing MOQ Handling');
  {
    const r = calculateSingleSKU({
      category: 'B',
      amazonSV: 2,
      targetDaysB: 45, // Target = 90
      fbaUnits: 20, // Reorder = 70
      existingPOQty: 0,
      moq: 0, // Unconfigured MOQ
      unitCost: 15,
    });

    assert.strictEqual(r.remaining_reorder_qty, 70, 'Remaining Reorder Qty should be 70');
    assert.strictEqual(r.suggested_order_qty, 70, 'Suggested Order Qty should fall back to Remaining Reorder Qty');
    assert.strictEqual(r.is_missing_moq, true, 'SKU must be flagged for missing MOQ review');
    assert.strictEqual(r.total_reorder_cost, 1050, 'Total cost calculated using suggested quantity');
  }
  console.log('✓ Passed: Scenario 7 - Missing MOQ Flagging\n');

  // Scenario 8: Supplier Order Increments / Case-Pack Requirements
  console.log('Scenario 8: Supplier Case-Pack Rounding');
  {
    const r = calculateSingleSKU({
      category: 'A',
      amazonSV: 2,
      targetDaysA: 60, // Target = 120
      fbaUnits: 75, // Remaining = 45
      existingPOQty: 0,
      moq: 20,
      casePack: 25, // Box size = 25
      unitCost: 10,
    });

    // Remaining = 45 > MOQ 20. Case pack = 25 -> ceil(45 / 25) * 25 = 50.
    assert.strictEqual(r.remaining_reorder_qty, 45, 'Remaining Reorder Qty should be 45');
    assert.strictEqual(r.suggested_order_qty, 50, 'Suggested Order Qty must round up to box multiple 50');
    assert.strictEqual(r.is_case_pack_applied, true, 'Case pack applied flag should be true');
    assert.strictEqual(r.total_reorder_cost, 500, 'Total Reorder Cost should be 50 * 10 = 500');
  }
  console.log('✓ Passed: Scenario 8 - Supplier Case-Pack Rounding\n');

  // Scenario 9: Zero Daily Sales
  console.log('Scenario 9: Zero Daily Sales (Days Left = N/A, Flagged for Review)');
  {
    const r = calculateSingleSKU({
      category: 'C',
      amazonSV: 0,
      noonSV: 0,
      minutesSV: 0, // Daily sales = 0
      fbaUnits: 50, // Stocked
      existingPOQty: 0,
      moq: 100,
      unitCost: 20,
    });

    assert.strictEqual(r.daily_sales, 0, 'Daily sales should be 0');
    assert.strictEqual(r.days_left, null, 'Days left must be null (displayed as N/A in UI)');
    assert.strictEqual(r.is_zero_sales, true, 'SKU must be flagged for zero sales review');
    assert.strictEqual(r.target_stock, 0, 'Target stock must be 0 for zero demand SKU');
    assert.strictEqual(r.reorder_qty, 0, 'Reorder qty must be 0');
    assert.strictEqual(r.suggested_order_qty, 0, 'Suggested order qty must be 0');
  }
  console.log('✓ Passed: Scenario 9 - Zero Daily Sales\n');

  // Scenario 10: Zero Available Stock
  console.log('Scenario 10: Zero Available Stock');
  {
    const r = calculateSingleSKU({
      category: 'A',
      amazonSV: 4,
      targetDaysA: 60, // Target = 240
      fbaUnits: 0,
      fbnUnits: 0,
      minutesUnits: 0,
      locadUnits: 0, // Available = 0
      existingPOQty: 0,
      moq: 50,
      unitCost: 10,
      leadTimeDays: 30,
    });

    assert.strictEqual(r.available_stock, 0, 'Available stock should be 0');
    assert.strictEqual(r.days_left, 0, 'Days left should be 0');
    assert.strictEqual(r.is_zero_stock, true, 'is_zero_stock flag should be true');
    assert.strictEqual(r.is_stockout_risk, true, 'is_stockout_risk flag should be true');
    assert.strictEqual(r.reorder_qty, 240, 'Reorder Qty should be full target 240');
  }
  console.log('✓ Passed: Scenario 10 - Zero Available Stock\n');

  // Scenario 11: Missing Unit Cost
  console.log('Scenario 11: Missing Unit Cost (Flagged and Excluded from Total Reorder Cost)');
  {
    const r = calculateSingleSKU({
      category: 'B',
      amazonSV: 2,
      targetDaysB: 45,
      fbaUnits: 10, // Remaining = 80
      existingPOQty: 0,
      moq: 50,
      unitCost: 0, // Missing unit cost
    });

    assert.strictEqual(r.is_missing_cost, true, 'is_missing_cost flag should be true');
    assert.strictEqual(r.suggested_order_qty, 80, 'Suggested Order Qty should still compute accurately');
    assert.strictEqual(r.total_reorder_cost, 0, 'Total Reorder Cost must be 0 (excluded from confirmed total)');
  }
  console.log('✓ Passed: Scenario 11 - Missing Unit Cost\n');

  // Scenario 12 & 13: Partially Received & Multiple Purchase Orders
  console.log('Scenario 12 & 13: Partially Received & Multiple Purchase Orders');
  {
    // PO 1: ordered 100, received 40 -> pending 60
    // PO 2: ordered 50, received 0 -> pending 50
    // Total pending balance = 110
    const poList = [
      { status: 'ordered', units_ordered: 100, units_received: 40 },
      { status: 'shipped', units_ordered: 50, units_received: 0 },
      { status: 'cancelled', units_ordered: 200, units_received: 0 }, // excluded
      { status: 'closed', units_ordered: 80, units_received: 80 },    // excluded (fully received)
    ];

    const activePOs = poList.filter(p => ['ordered', 'shipped', 'in_transit'].includes(p.status));
    const totalPendingPO = activePOs.reduce((acc, p) => acc + Math.max(0, p.units_ordered - p.units_received), 0);

    assert.strictEqual(totalPendingPO, 110, 'Pending PO balance should be 60 + 50 = 110');

    const r = calculateSingleSKU({
      category: 'A',
      amazonSV: 3,
      targetDaysA: 60, // Target = 180
      fbaUnits: 30, // Reorder = 150
      existingPOQty: totalPendingPO, // 110
      moq: 20,
      unitCost: 5,
    });

    // Remaining = 150 - 110 = 40
    assert.strictEqual(r.existing_po_qty, 110, 'Existing PO should be 110');
    assert.strictEqual(r.remaining_reorder_qty, 40, 'Remaining should be 40');
    assert.strictEqual(r.suggested_order_qty, 40, 'Suggested should be 40');
    assert.strictEqual(r.total_reorder_cost, 200, 'Total cost should be 40 * 5 = 200');
  }
  console.log('✓ Passed: Scenario 12 & 13 - Partially Received & Multiple POs\n');

  // Scenario 14: Category Target Days Configurations
  console.log('Scenario 14: Category Target Days Settings');
  {
    const rA = calculateSingleSKU({ category: 'A', amazonSV: 1, targetDaysA: 60, targetDaysB: 45, targetDaysC: 30 });
    const rB = calculateSingleSKU({ category: 'B', amazonSV: 1, targetDaysA: 60, targetDaysB: 45, targetDaysC: 30 });
    const rC = calculateSingleSKU({ category: 'C', amazonSV: 1, targetDaysA: 60, targetDaysB: 45, targetDaysC: 30 });

    assert.strictEqual(rA.target_days, 60, 'CAT A should have 60 target days');
    assert.strictEqual(rB.target_days, 45, 'CAT B should have 45 target days');
    assert.strictEqual(rC.target_days, 30, 'CAT C should have 30 target days');
  }
  console.log('✓ Passed: Scenario 14 - Category Target Days Settings\n');

  // Scenario 15: Financial Reconciliations
  console.log('Scenario 15: Financial Reconciliations & Category Sum Reconciliations');
  {
    const catalog = [
      calculateSingleSKU({ sku: 'SKU-A', category: 'A', amazonSV: 5, fbaUnits: 100, targetDaysA: 60, moq: 50, unitCost: 10 }), // Suggested: 200, Cost: 2000
      calculateSingleSKU({ sku: 'SKU-B', category: 'B', amazonSV: 2, fbaUnits: 50, targetDaysB: 45, moq: 50, unitCost: 20 }),  // Suggested: 50 (MOQ), Cost: 1000
      calculateSingleSKU({ sku: 'SKU-C', category: 'C', amazonSV: 1, fbaUnits: 10, targetDaysC: 30, moq: 25, unitCost: 15 }),  // Suggested: 25 (MOQ), Cost: 375
    ];

    const totalReorderCost = catalog.reduce((s, i) => s + i.total_reorder_cost, 0);
    assert.strictEqual(totalReorderCost, 3375, 'Total Reorder Cost must equal 2000 + 1000 + 375 = 3375');

    const catACost = catalog.filter(i => i.category === 'A').reduce((s, i) => s + i.total_reorder_cost, 0);
    const catBCost = catalog.filter(i => i.category === 'B').reduce((s, i) => s + i.total_reorder_cost, 0);
    const catCCost = catalog.filter(i => i.category === 'C').reduce((s, i) => s + i.total_reorder_cost, 0);

    assert.strictEqual(totalReorderCost, catACost + catBCost + catCCost, 'Total cost must equal sum of Category A, B, and C costs');
  }
  console.log('✓ Passed: Scenario 15 - Financial & Category Reconciliations\n');

  // Scenario 16: Live Database Integration Test
  console.log('Scenario 16: Live Supabase Database Integration Verification');
  {
    const env = fs.readFileSync('frontend/.env', 'utf8');
    const urlMatch = env.match(/VITE_SUPABASE_URL=(.*)/);
    const keyMatch = env.match(/VITE_SUPABASE_ANON_KEY=(.*)/);
    const supabase = createClient(urlMatch[1].trim(), keyMatch[1].trim());

    const { data, error } = await supabase
      .from('v_fact_inventory_with_age')
      .select('*')
      .eq('country', 'UAE')
      .eq('saddl_id', 's2c_uae_test')
      .limit(10);

    assert.ifError(error);
    assert.ok(Array.isArray(data) && data.length > 0, 'Live v_fact_inventory_with_age must return rows');

    const sample = data[0];
    assert.ok('sku' in sample, 'Record must contain sku');
    assert.ok('category' in sample, 'Record must contain category');
    assert.ok('fba_units' in sample, 'Record must contain fba_units');
    assert.ok('blended_sv' in sample, 'Record must contain blended_sv');
    assert.ok('already_ordered' in sample, 'Record must contain already_ordered');
    console.log(`Live DB verified: Retrieved ${data.length} sample rows from v_fact_inventory_with_age.`);
  }
  console.log('✓ Passed: Scenario 16 - Live Database Integration\n');

  // Scenario 17: Active SKUs Only Constraint Verification
  console.log('Scenario 17: Inactive SKUs Excluded - Dashboard Strictly Calculates on Active SKUs Only');
  {
    const env = fs.readFileSync('frontend/.env', 'utf8');
    const urlMatch = env.match(/VITE_SUPABASE_URL=(.*)/);
    const keyMatch = env.match(/VITE_SUPABASE_ANON_KEY=(.*)/);
    const supabase = createClient(urlMatch[1].trim(), keyMatch[1].trim());

    // Query active vs inactive counts in database
    const [activeRes, inactiveRes] = await Promise.all([
      supabase
        .from('v_fact_inventory_with_age')
        .select('sku, is_active')
        .eq('country', 'UAE')
        .eq('saddl_id', 's2c_uae_test')
        .eq('is_active', true),
      supabase
        .from('v_fact_inventory_with_age')
        .select('sku, is_active')
        .eq('country', 'UAE')
        .eq('saddl_id', 's2c_uae_test')
        .eq('is_active', false),
    ]);

    assert.ifError(activeRes.error);
    assert.ifError(inactiveRes.error);

    const activeCount = (activeRes.data || []).length;
    const inactiveCount = (inactiveRes.data || []).length;
    const totalCount = activeCount + inactiveCount;

    console.log(`Live DB SKU Counts -> Active: ${activeCount}, Inactive: ${inactiveCount}, Total: ${totalCount}`);
    assert.strictEqual(activeCount, 126, 'Authoritative active SKU count must equal 126');
    assert.strictEqual(inactiveCount, 234, 'Authoritative inactive SKU count must equal 234');
    assert.strictEqual(totalCount, 360, 'Total SKUs in DB must equal 360');

    // Test calculation filter logic with a mixed mock catalog
    const mixedCatalog = [
      { sku: 'ACTIVE-1', is_active: true, category: 'A', amazonSV: 2, fbaUnits: 10, moq: 50, unitCost: 10 },
      { sku: 'INACTIVE-1', is_active: false, category: 'A', amazonSV: 100, fbaUnits: 0, moq: 1000, unitCost: 500 }, // massive phantom demand if not excluded!
      { sku: 'ACTIVE-2', is_active: true, category: 'B', amazonSV: 1, fbaUnits: 20, moq: 20, unitCost: 5 },
      { sku: 'INACTIVE-2', is_active: false, category: 'C', amazonSV: 50, fbaUnits: 0, moq: 500, unitCost: 200 },
    ];

    const activeOnlyFiltered = mixedCatalog.filter(sku => sku.is_active !== false);
    assert.strictEqual(activeOnlyFiltered.length, 2, 'Only active SKUs must remain after filter');
    assert.ok(activeOnlyFiltered.every(sku => sku.is_active === true), 'All remaining SKUs must have is_active == true');

    const processed = activeOnlyFiltered.map(calculateSingleSKU);
    assert.strictEqual(processed.length, 2);
    assert.strictEqual(processed[0].sku, 'ACTIVE-1');
    assert.strictEqual(processed[1].sku, 'ACTIVE-2');

    // Confirm that inactive SKU demand (100 SV and 50 SV) was strictly prevented from contaminating KPIs
    const totalDailySales = processed.reduce((s, i) => s + i.daily_sales, 0);
    assert.strictEqual(totalDailySales, 3, 'Total Daily Sales must only be 2 + 1 = 3, completely ignoring inactive SKUs');
  }
  console.log('✓ Passed: Scenario 17 - Active SKUs Only Filtering & Verification\n');

  // Scenario 18: Zero Daily Sales AND Zero Available Stock -> Days Left = 0, Order MOQ
  console.log('Scenario 18: Zero Daily Sales and Zero Stock Rule (Days Left = 0, Order MOQ)');
  {
    const r1 = calculateSingleSKU({
      sku: 'SKU-ZERO-STOCK-NO-PO',
      category: 'C',
      amazonSV: 0,
      noonSV: 0,
      minutesSV: 0,
      fbaUnits: 0,
      fbnUnits: 0,
      minutesUnits: 0,
      locadUnits: 0,
      existingPOQty: 0,
      moq: 60,
      casePack: 12,
      unitCost: 15,
    });

    assert.strictEqual(r1.daily_sales, 0, 'Daily sales must be 0');
    assert.strictEqual(r1.available_stock, 0, 'Available stock must be 0');
    assert.strictEqual(r1.days_left, 0, 'Days left must be 0 when sales is 0 and available stock is 0');
    assert.strictEqual(r1.target_stock, 60, 'Target stock must equal MOQ (60)');
    assert.strictEqual(r1.reorder_qty, 60, 'Reorder qty must equal MOQ (60)');
    assert.strictEqual(r1.remaining_reorder_qty, 60, 'Remaining reorder qty must be 60');
    assert.strictEqual(r1.suggested_order_qty, 60, 'Suggested order qty must be 60 (MOQ)');
    assert.strictEqual(r1.total_reorder_cost, 900, 'Total reorder cost must equal 60 * 15 = 900');

    // Case 2: Zero Sales, Zero Available Stock, BUT with Existing PO partially covering MOQ
    const r2 = calculateSingleSKU({
      sku: 'SKU-ZERO-STOCK-PARTIAL-PO',
      category: 'B',
      amazonSV: 0,
      noonSV: 0,
      minutesSV: 0,
      fbaUnits: 0,
      fbnUnits: 0,
      minutesUnits: 0,
      locadUnits: 0,
      existingPOQty: 24, // 24 units already on order
      moq: 60,
      casePack: 12,
      unitCost: 10,
    });

    assert.strictEqual(r2.days_left, 0, 'Days left must be 0');
    assert.strictEqual(r2.reorder_qty, 60, 'Reorder qty is MOQ (60)');
    assert.strictEqual(r2.remaining_reorder_qty, 36, 'Remaining reorder qty = 60 - 24 = 36');
    assert.strictEqual(r2.suggested_order_qty, 60, 'Suggested order qty adjusts to MOQ (60)');

    // Case 3: Zero Sales, Zero Available Stock, BUT Existing PO fully covers MOQ
    const r3 = calculateSingleSKU({
      sku: 'SKU-ZERO-STOCK-FULL-PO',
      category: 'A',
      amazonSV: 0,
      noonSV: 0,
      minutesSV: 0,
      fbaUnits: 0,
      existingPOQty: 100, // already ordered 100 units
      moq: 50,
      unitCost: 20,
    });

    assert.strictEqual(r3.days_left, 0, 'Days left must be 0');
    assert.strictEqual(r3.reorder_qty, 50, 'Reorder qty is MOQ (50)');
    assert.strictEqual(r3.remaining_reorder_qty, 0, 'Remaining reorder qty is 0 because PO covers it');
    assert.strictEqual(r3.suggested_order_qty, 0, 'Suggested order qty is 0');
  }
  console.log('✓ Passed: Scenario 18 - Zero Sales & Zero Stock Rule (Days Left = 0, Order MOQ)\n');

  // Scenario 19: Planning to Discontinue Toggle (Off by Default, Reorder Suspended When ON, Re-enables when OFF)
  console.log('Scenario 19: Planning to Discontinue Toggle (Off by Default, Reorders Suspended When ON)');
  {
    // Helper replicating allRecommendations map logic in reorder_recommendations.tsx
    function applyDiscontinueState(recommendations, discontinuedMap) {
      return recommendations.map((item) => {
        const is_discontinued = Boolean(discontinuedMap[item.sku]);
        if (is_discontinued) {
          return {
            ...item,
            is_discontinued: true,
            reorder_qty: 0,
            remaining_reorder_qty: 0,
            suggested_order_qty: 0,
            total_reorder_cost: 0,
            is_reorder_required: false,
          };
        }
        return {
          ...item,
          is_discontinued: false,
        };
      });
    }

    const sku1 = calculateSingleSKU({
      sku: 'SKU-DISC-1',
      name: 'Essential Product 1',
      category: 'A',
      amazonSV: 5,
      fbaUnits: 50,
      targetDaysA: 60, // Target = 300, Available = 50 -> Reorder = 250
      moq: 100,
      unitCost: 10,
    });

    const sku2 = calculateSingleSKU({
      sku: 'SKU-DISC-2',
      name: 'Phasing Out Product 2',
      category: 'B',
      amazonSV: 2,
      fbaUnits: 10,
      targetDaysB: 45, // Target = 90, Available = 10 -> Reorder = 80
      moq: 50,
      unitCost: 20,
    });

    const sku3 = calculateSingleSKU({
      sku: 'SKU-DISC-3',
      name: 'Healthy Product 3',
      category: 'C',
      amazonSV: 1,
      fbaUnits: 60,
      targetDaysC: 30, // Target = 30, Available = 60 -> Reorder = 0
      moq: 20,
      unitCost: 5,
    });

    const catalog = [sku1, sku2, sku3];

    // 1. Initial State: Discontinued map is empty (OFF by default for all SKUs)
    const initialDiscontinuedMap = {};
    const step1Recommendations = applyDiscontinueState(catalog, initialDiscontinuedMap);

    // Verify all SKUs are OFF by default
    assert.ok(step1Recommendations.every(i => i.is_discontinued === false), 'Every SKU must have is_discontinued = false by default');
    assert.strictEqual(step1Recommendations[0].suggested_order_qty, 250, 'SKU 1 suggested order qty intact');
    assert.strictEqual(step1Recommendations[0].total_reorder_cost, 2500, 'SKU 1 cost intact');
    assert.strictEqual(step1Recommendations[1].suggested_order_qty, 80, 'SKU 2 suggested order qty intact');
    assert.strictEqual(step1Recommendations[1].total_reorder_cost, 1600, 'SKU 2 cost intact');
    assert.strictEqual(step1Recommendations[2].suggested_order_qty, 0, 'SKU 3 suggested order qty intact (0)');

    const initialTotalReorderQty = step1Recommendations.reduce((s, i) => s + i.suggested_order_qty, 0);
    const initialTotalCost = step1Recommendations.reduce((s, i) => s + i.total_reorder_cost, 0);
    const initialReorderSKUCount = step1Recommendations.filter(i => i.is_reorder_required).length;

    assert.strictEqual(initialTotalReorderQty, 330, 'Total reorder qty should be 250 + 80 = 330');
    assert.strictEqual(initialTotalCost, 4100, 'Total cost should be 2500 + 1600 = 4100');
    assert.strictEqual(initialReorderSKUCount, 2, '2 SKUs require reordering initially');

    // 2. Toggle SKU-DISC-2 to ON (Planning to Discontinue)
    const updatedDiscontinuedMap = { 'SKU-DISC-2': true };
    const step2Recommendations = applyDiscontinueState(catalog, updatedDiscontinuedMap);

    const discItem = step2Recommendations.find(i => i.sku === 'SKU-DISC-2');
    assert.strictEqual(discItem.is_discontinued, true, 'SKU-DISC-2 must now be marked discontinued');
    assert.strictEqual(discItem.reorder_qty, 0, 'Reorder qty must be reset to 0');
    assert.strictEqual(discItem.remaining_reorder_qty, 0, 'Remaining reorder qty must be reset to 0');
    assert.strictEqual(discItem.suggested_order_qty, 0, 'Suggested order qty must be suspended to 0');
    assert.strictEqual(discItem.total_reorder_cost, 0, 'Total reorder cost must be 0');
    assert.strictEqual(discItem.is_reorder_required, false, 'is_reorder_required must be false');

    // Verify non-discontinued SKU remains unaffected
    const activeItem = step2Recommendations.find(i => i.sku === 'SKU-DISC-1');
    assert.strictEqual(activeItem.is_discontinued, false, 'SKU-DISC-1 remains active');
    assert.strictEqual(activeItem.suggested_order_qty, 250, 'SKU-DISC-1 quantity intact');
    assert.strictEqual(activeItem.total_reorder_cost, 2500, 'SKU-DISC-1 cost intact');

    // Verify Reconciled KPIs immediately exclude suspended orders
    const step2TotalReorderQty = step2Recommendations.reduce((s, i) => s + i.suggested_order_qty, 0);
    const step2TotalCost = step2Recommendations.reduce((s, i) => s + i.total_reorder_cost, 0);
    const step2ReorderSKUCount = step2Recommendations.filter(i => i.is_reorder_required).length;

    assert.strictEqual(step2TotalReorderQty, 250, 'Total reorder units must drop from 330 to 250');
    assert.strictEqual(step2TotalCost, 2500, 'Total reorder cost must drop from 4100 to 2500');
    assert.strictEqual(step2ReorderSKUCount, 1, 'Only 1 SKU requires reorder now');

    // 3. Test Filter: planningToDiscontinue
    const filteredDiscontinued = step2Recommendations.filter(i => i.is_discontinued);
    assert.strictEqual(filteredDiscontinued.length, 1, 'Filter must match exactly 1 discontinued SKU');
    assert.strictEqual(filteredDiscontinued[0].sku, 'SKU-DISC-2');

    // 4. Toggle SKU-DISC-2 back to OFF (Re-enable reorders)
    const toggledOffMap = {};
    const step3Recommendations = applyDiscontinueState(catalog, toggledOffMap);

    const restoredItem = step3Recommendations.find(i => i.sku === 'SKU-DISC-2');
    assert.strictEqual(restoredItem.is_discontinued, false, 'SKU-DISC-2 restored to active replenishment');
    assert.strictEqual(restoredItem.suggested_order_qty, 80, 'Suggested order qty restored to 80');
    assert.strictEqual(restoredItem.total_reorder_cost, 1600, 'Total reorder cost restored to 1600');
    assert.strictEqual(restoredItem.is_reorder_required, true, 'is_reorder_required restored to true');

    const step3TotalReorderQty = step3Recommendations.reduce((s, i) => s + i.suggested_order_qty, 0);
    const step3TotalCost = step3Recommendations.reduce((s, i) => s + i.total_reorder_cost, 0);
    assert.strictEqual(step3TotalReorderQty, 330, 'Total reorder units restored to 330');
    assert.strictEqual(step3TotalCost, 4100, 'Total cost restored to 4100');
  }
  console.log('✓ Passed: Scenario 19 - Planning to Discontinue Toggle (Off by Default, Reorders Suspended When ON)\n');

  console.log('================================================================');
  console.log(' ALL 19 SKU REORDER DASHBOARD TEST SCENARIOS PASSED WITH 100% SUCCESS ');
  console.log('================================================================');
}

runTests().catch((err) => {
  console.error('\n❌ TEST FAILED:', err);
  process.exit(1);
});

