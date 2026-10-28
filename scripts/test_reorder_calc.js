const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const env = fs.readFileSync('frontend/.env', 'utf8');
const urlMatch = env.match(/VITE_SUPABASE_URL=(.*)/);
const keyMatch = env.match(/VITE_SUPABASE_ANON_KEY=(.*)/);

const supabase = createClient(urlMatch[1].trim(), keyMatch[1].trim());

async function testReorderEngine() {
  console.log('Fetching live data from Supabase...');
  
  // 1. Fetch SKU Intelligence
  const { data: skuData, error: skuErr } = await supabase.rpc('get_sku_intelligence', {
    p_country: 'UAE',
    p_saddl_id: 's2c_uae_test'
  });
  if (skuErr) {
    console.error('SKU Intelligence error:', skuErr);
    return;
  }

  // 2. Fetch Suppliers from fact_purchase
  const { data: poRows, error: poErr } = await supabase
    .from('fact_purchase')
    .select('sku, supplier, order_date, status, units_ordered, units_received, cogs_per_unit')
    .order('order_date', { ascending: false });

  if (poErr) console.warn('PO error:', poErr);

  const supplierMap = new Map();
  const incomingValueMap = new Map();
  if (poRows) {
    for (const po of poRows) {
      if (!supplierMap.has(po.sku) && po.supplier) {
        supplierMap.set(po.sku, po.supplier);
      }
      const st = (po.status || '').toLowerCase().trim();
      if (['ordered', 'shipped', 'in_transit', 'placed'].includes(st)) {
        const pending = Math.max(0, (po.units_ordered || 0) - (po.units_received || 0));
        const val = pending * (Number(po.cogs_per_unit) || 0);
        incomingValueMap.set(po.sku, (incomingValueMap.get(po.sku) || 0) + val);
      }
    }
  }

  console.log(`Fetched ${skuData.length} SKUs and ${supplierMap.size} supplier mappings.`);

  // Configuration defaults
  const demandWindow = 30; // 30 days
  const targetCoverageA = 60;
  const targetCoverageB = 45;
  const targetCoverageC = 30;
  const safetyStockDays = 7;
  const aCutoff = 80;
  const bCutoff = 95;

  // Step 1: Compute Consumption Value for ABC
  const rawList = skuData.map(item => {
    const dailySales = Number(item.sales_30d || 0) / demandWindow;
    const unitCost = Number(item.cogs) > 0 ? Number(item.cogs) : 0;
    const annualConsumption = dailySales * 365 * unitCost;

    // Brand extraction
    let brand = 'S2C';
    const name = item.name || '';
    if (name.startsWith('PETSLY')) brand = 'PETSLY';
    else if (name.startsWith('Bath & Relax')) brand = 'Bath & Relax';
    else if (name.startsWith('Raymond Home')) brand = 'Raymond Home';
    else if (item.sku.startsWith('PTSLY')) brand = 'PETSLY';

    return {
      sku: item.sku,
      name: item.name || item.sku,
      asin: item.asin,
      fnsku: item.fnsku,
      brand,
      category: item.product_category || 'General',
      sub_category: item.sub_category || '',
      is_active: item.is_active !== false,
      dailySales,
      unitCost,
      annualConsumption,
      availableStock: Number(item.total_available || 0),
      fbaStock: Number(item.fba_available || 0),
      fbnStock: Number(item.fbn_available || 0),
      locadStock: Number(item.locad_available || 0),
      minutesStock: Number(item.minutes_available || 0),
      reservedStock: Number(item.total_reserved || 0),
      incomingStock: Number(item.already_ordered || 0),
      incomingPOValue: incomingValueMap.get(item.sku) || 0,
      moq: Number(item.moq) || 0,
      casePack: Number(item.units_per_box) > 0 ? Number(item.units_per_box) : 1,
      leadTimeDays: Number(item.lead_time_days) || 45,
      supplier: supplierMap.get(item.sku) || 'Direct Factory / SADDL',
      sales30d: Number(item.sales_30d || 0),
      sales120d: Number(item.sales_120d || 0),
      allTimeSales: Number(item.sales_all_time || 0),
      hasCost: Number(item.cogs) > 0
    };
  });

  // Step 2: Rank for ABC by annualConsumption descending
  const activeItems = rawList.filter(r => r.is_active);
  const totalConsumption = activeItems.reduce((acc, r) => acc + r.annualConsumption, 0);

  activeItems.sort((a, b) => b.annualConsumption - a.annualConsumption);

  let runningVal = 0;
  for (const item of activeItems) {
    runningVal += item.annualConsumption;
    item.cumulativePct = totalConsumption > 0 ? (runningVal / totalConsumption) * 100 : 100;

    if (item.annualConsumption <= 0) {
      item.abcClass = 'C';
    } else if (item.cumulativePct <= aCutoff || (runningVal - item.annualConsumption) / totalConsumption * 100 < aCutoff) {
      item.abcClass = 'A';
    } else if (item.cumulativePct <= bCutoff || (runningVal - item.annualConsumption) / totalConsumption * 100 < bCutoff) {
      item.abcClass = 'B';
    } else {
      item.abcClass = 'C';
    }
  }

  // Handle inactive items ABC
  for (const item of rawList) {
    if (!item.is_active) {
      item.abcClass = 'C';
      item.cumulativePct = 100;
    }
  }

  // Step 3: Compute Reorder Quantities and Financials
  for (const item of rawList) {
    // Days of inventory remaining
    item.daysRemaining = item.dailySales > 0 ? (item.availableStock / item.dailySales) : null;

    // Target coverage days based on ABC
    let targetCoverage = targetCoverageC;
    if (item.abcClass === 'A') targetCoverage = targetCoverageA;
    else if (item.abcClass === 'B') targetCoverage = targetCoverageB;
    item.targetCoverageDays = targetCoverage;

    // Target stock quantity
    const totalRequiredDays = targetCoverage + safetyStockDays;
    item.targetStockQty = Math.ceil(item.dailySales * totalRequiredDays);

    // Recommended Reorder Quantity formula:
    // MAX(0, Target Stock - Net Available - Incoming)
    let netDeficit = Math.max(0, item.targetStockQty - item.availableStock - item.incomingStock);

    if (item.dailySales <= 0) {
      // Zero velocity: do NOT recommend arbitrary order
      item.recommendedReorderQty = 0;
      item.stockStatus = item.availableStock > 0 ? 'No Sales (Stocked)' : 'No Sales (OOS)';
    } else {
      if (netDeficit > 0) {
        // Apply MOQ
        let rounded = Math.max(netDeficit, item.moq);
        // Apply Case Pack
        if (item.casePack > 1) {
          rounded = Math.ceil(rounded / item.casePack) * item.casePack;
        }
        item.recommendedReorderQty = rounded;
      } else {
        item.recommendedReorderQty = 0;
      }

      // Stock status
      if (item.availableStock === 0) item.stockStatus = 'Out of Stock';
      else if (item.daysRemaining !== null && item.daysRemaining < 14) item.stockStatus = 'Critical Low';
      else if (item.daysRemaining !== null && item.daysRemaining < 30) item.stockStatus = 'Low Stock';
      else if (item.daysRemaining !== null && item.daysRemaining > 90) item.stockStatus = 'Overstocked';
      else item.stockStatus = 'Healthy';
    }

    // Reorder COGS
    item.reorderCOGS = item.recommendedReorderQty * item.unitCost;
    item.currentInventoryValue = item.availableStock * item.unitCost;

    // Replenishment Priority
    if (item.dailySales > 0 && (item.availableStock === 0 || (item.daysRemaining !== null && item.daysRemaining < item.leadTimeDays))) {
      item.priority = 'Critical';
    } else if (item.recommendedReorderQty > 0 && ((item.daysRemaining !== null && item.daysRemaining < item.leadTimeDays + 14) || item.abcClass === 'A')) {
      item.priority = 'High';
    } else if (item.recommendedReorderQty > 0) {
      item.priority = 'Medium';
    } else {
      item.priority = 'Low';
    }

    // Recommended Reorder Date
    if (item.dailySales <= 0) {
      item.recommendedReorderDate = 'N/A';
      item.daysUntilReorder = null;
    } else if (item.daysRemaining === null || item.daysRemaining <= item.leadTimeDays) {
      item.recommendedReorderDate = 'Today';
      item.daysUntilReorder = 0;
    } else {
      const daysUntil = Math.floor(item.daysRemaining - item.leadTimeDays);
      item.daysUntilReorder = daysUntil;
      const targetDate = new Date();
      targetDate.setDate(targetDate.getDate() + daysUntil);
      item.recommendedReorderDate = targetDate.toISOString().split('T')[0];
    }
  }

  // Executive Summary KPIs
  const totalActive = rawList.filter(r => r.is_active).length;
  const requiringReorder = rawList.filter(r => r.recommendedReorderQty > 0).length;
  const criticalCount = rawList.filter(r => r.priority === 'Critical').length;
  const aReorderCount = rawList.filter(r => r.abcClass === 'A' && r.recommendedReorderQty > 0).length;
  const totalReorderUnits = rawList.reduce((acc, r) => acc + r.recommendedReorderQty, 0);
  const totalReorderCOGS = rawList.reduce((acc, r) => acc + r.reorderCOGS, 0);
  const totalInventoryValue = rawList.reduce((acc, r) => acc + r.currentInventoryValue, 0);
  const projectedInvestment = totalInventoryValue + totalReorderCOGS;
  const totalIncomingPOValue = rawList.reduce((acc, r) => acc + r.incomingPOValue, 0);

  // ABC Breakdown
  const abcBreakdown = ['A', 'B', 'C'].map(cls => {
    const items = rawList.filter(r => r.abcClass === cls);
    const cogs = items.reduce((acc, r) => acc + r.reorderCOGS, 0);
    const units = items.reduce((acc, r) => acc + r.recommendedReorderQty, 0);
    const stockVal = items.reduce((acc, r) => acc + r.currentInventoryValue, 0);
    const pct = totalReorderCOGS > 0 ? (cogs / totalReorderCOGS) * 100 : 0;
    return {
      class: cls,
      count: items.length,
      currentStockValue: stockVal,
      reorderQty: units,
      reorderCOGS: cogs,
      pctOfTotal: pct
    };
  });

  const sumABCCogs = abcBreakdown.reduce((acc, b) => acc + b.reorderCOGS, 0);

  console.log('\n================ EXECUTIVE SUMMARY ================');
  console.log(`1. Total Active SKUs:              ${totalActive}`);
  console.log(`2. SKUs Requiring Replenishment:   ${requiringReorder}`);
  console.log(`3. Critical Stockout Risks:        ${criticalCount}`);
  console.log(`4. A-Category SKUs Reorder Needed: ${aReorderCount}`);
  console.log(`5. Total Recommended Units:        ${totalReorderUnits.toLocaleString()}`);
  console.log(`6. Total Recommended COGS:         AED ${totalReorderCOGS.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
  console.log(`7. Total Current Inventory Value:  AED ${totalInventoryValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
  console.log(`8. Projected Inventory Investment: AED ${projectedInvestment.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
  console.log(`Incoming Purchase Order Value:     AED ${totalIncomingPOValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);

  console.log('\n================ ABC BREAKDOWN ====================');
  abcBreakdown.forEach(b => {
    console.log(`Category ${b.class}: ${b.count} SKUs | Stock Value: AED ${Math.round(b.currentStockValue).toLocaleString()} | Reorder: ${b.reorderQty.toLocaleString()} units | COGS: AED ${Math.round(b.reorderCOGS).toLocaleString()} (${b.pctOfTotal.toFixed(1)}%)`);
  });
  console.log(`Reconciliation Check: Sum(A+B+C COGS) = ${sumABCCogs.toFixed(2)} vs Total = ${totalReorderCOGS.toFixed(2)} | Diff = ${(sumABCCogs - totalReorderCOGS).toFixed(4)}`);

  console.log('\nTop 5 Critical Replenishment Recommendations:');
  const criticalItems = rawList.filter(r => r.priority === 'Critical' && r.recommendedReorderQty > 0);
  criticalItems.sort((a,b) => b.reorderCOGS - a.reorderCOGS).slice(0, 5).forEach((item, idx) => {
    console.log(`${idx+1}. [${item.abcClass}] ${item.sku} (${item.brand}) | Daily: ${item.dailySales.toFixed(2)} | Stock: ${item.availableStock} (Days: ${item.daysRemaining ? item.daysRemaining.toFixed(1) : 0}d) | Reorder: ${item.recommendedReorderQty} units | COGS: AED ${item.reorderCOGS.toFixed(2)} | Supplier: ${item.supplier}`);
  });
}

testReorderEngine().catch(console.error);
