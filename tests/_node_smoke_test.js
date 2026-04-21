/**
 * Node.js smoke test — runs a subset of business logic and parser
 * tests without Deno. Used only for the QA report execution.
 */

// =========================================================================
// computeReorder (ported inline for Node testing)
// =========================================================================
const THRESHOLDS = {
  A: { min_coverage: 60, reorder_trigger: 45 },
  B: { min_coverage: 45, reorder_trigger: 30 },
  C: { min_coverage: 20, reorder_trigger: 20 },
};

function computeReorder(sku, blended_sv, projected_coverage, incoming_po_units, total_available) {
  const thresholds = THRESHOLDS[sku.category];
  if (blended_sv === 0) return { should_reorder: false, suggested_units: 0 };
  if (!isFinite(projected_coverage)) return { should_reorder: false, suggested_units: 0 };
  if (projected_coverage < thresholds.reorder_trigger) {
    const suggested_units = Math.max(
      Math.ceil(thresholds.min_coverage * blended_sv - total_available - incoming_po_units),
      sku.moq || 1
    );
    return { should_reorder: true, suggested_units };
  }
  return { should_reorder: false, suggested_units: 0 };
}

// =========================================================================
// computeActionFlag (ported inline for Node testing)
// =========================================================================
function computeActionFlag(sku, blended_sv, coverage) {
  if (blended_sv === 0) return 'OK';
  const thresholds = THRESHOLDS[sku.category];
  const total_coverage = coverage.total_coverage;
  const safeTotal = isFinite(total_coverage) ? total_coverage : Infinity;
  if (isFinite(safeTotal) && safeTotal <= 7) return 'CRITICAL_OOS_RISK';
  if (isFinite(safeTotal) && safeTotal <= 14) return 'OOS_RISK';
  const warehouseAvailable = coverage.by_node.locad_warehouse.available;
  const amazonCoverage = coverage.by_node.amazon_fba.coverage_days;
  const noonCoverage = coverage.by_node.noon_fbn.coverage_days;
  if (warehouseAvailable > 0 && (amazonCoverage < thresholds.reorder_trigger || noonCoverage < thresholds.reorder_trigger)) return 'SHIP_NOW';
  if (isFinite(coverage.projected_coverage) && coverage.projected_coverage < thresholds.reorder_trigger) return 'REORDER';
  if (isFinite(safeTotal) && safeTotal > thresholds.min_coverage * 2.0) return 'EXCESS';
  return 'OK';
}

// =========================================================================
// parseNoonOrderCSV (ported inline for Node testing)
// =========================================================================
const CONFIRMED_STATUSES = new Set(['processing', 'shipped', 'delivered']);
const CURRENCY_TO_AED = {
  QAR: 1.02, KWD: 12.25, OMR: 9.71, BHD: 9.93,
  AED: 1.0, USD: 3.67, SAR: 0.98, EGP: 0.073,
};

function parseCSVRow(line) {
  const result = []; let field = ''; let inQuotes = false; let i = 0;
  while (i < line.length) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') { field += '"'; i += 2; continue; }
      else if (ch === '"') { inQuotes = false; i++; continue; }
      else { field += ch; i++; continue; }
    }
    if (ch === '"') { inQuotes = true; i++; continue; }
    if (ch === ',') { result.push(field); field = ''; i++; continue; }
    field += ch; i++;
  }
  result.push(field); return result;
}

function parseNoonOrderCSV(csvText) {
  const cleaned = csvText.replace(/^\uFEFF/, '').trim();
  if (!cleaned) return { sales: [], avg_prices: [], errors: [{ row: 0, message: 'Empty CSV file' }] };
  const lines = cleaned.split(/\r?\n/);
  if (lines.length < 2) return { sales: [], avg_prices: [], errors: [{ row: 0, message: 'CSV has no data rows' }] };
  const headers = parseCSVRow(lines[0]).map(h => h.trim().toLowerCase().replace(/\s+/g, '_'));
  const idx = {}; for (let i = 0; i < headers.length; i++) idx[headers[i]] = i;
  const errors = [];
  const required = ['partner_sku', 'status', 'offer_price', 'currency_code', 'order_timestamp'];
  for (const col of required) {
    if (idx[col] === undefined) {
      if (col === 'partner_sku' && idx['seller_sku'] !== undefined) idx['partner_sku'] = idx['seller_sku'];
      else if (col === 'order_timestamp' && idx['order_date'] !== undefined) idx['order_timestamp'] = idx['order_date'];
      else errors.push({ row: 0, message: 'Missing required column: "' + col + '"' });
    }
  }
  if (errors.length > 0) return { sales: [], avg_prices: [], errors };
  const salesMap = new Map(); const priceMap = new Map();
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim(); if (!line) continue;
    const cols = parseCSVRow(line);
    const get = k => { const ii = idx[k]; return ii !== undefined ? (cols[ii] || '').trim() : ''; };
    const status = get('status').toLowerCase();
    if (!CONFIRMED_STATUSES.has(status)) continue;
    const partner_sku = get('partner_sku');
    if (!partner_sku) { errors.push({ row: i + 1, message: 'Empty partner_sku' }); continue; }
    const date = get('order_timestamp').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { errors.push({ row: i + 1, message: 'Invalid timestamp' }); continue; }
    const rawPrice = parseFloat(get('offer_price').replace(/,/g, ''));
    const currency = get('currency_code').toUpperCase();
    const rate = CURRENCY_TO_AED[currency] || 1.0;
    const priceAed = isNaN(rawPrice) ? 0 : rawPrice * rate;
    const sk = partner_sku + '|' + date;
    salesMap.set(sk, (salesMap.get(sk) || 0) + 1);
    const ex = priceMap.get(partner_sku);
    if (ex) { ex[0] += priceAed; ex[1] += 1; } else priceMap.set(partner_sku, [priceAed, 1]);
  }
  const sales = [];
  for (const [key, u] of salesMap) { const [sku, date] = key.split('|'); sales.push({ sku, date, units_sold: u }); }
  sales.sort((a, b) => a.sku.localeCompare(b.sku) || a.date.localeCompare(b.date));
  const avg_prices = [];
  for (const [sku, [sum, cnt]] of priceMap) avg_prices.push({ sku, avg_sell_price_aed: cnt > 0 ? Math.round(sum / cnt * 100) / 100 : 0 });
  avg_prices.sort((a, b) => a.sku.localeCompare(b.sku));
  return { sales, avg_prices, errors };
}

// =========================================================================
// Test runner
// =========================================================================
let pass = 0, fail = 0;
const results = [];

function test(name, fn) {
  try {
    fn();
    console.log('PASS  ' + name);
    results.push({ name, result: 'PASS' });
    pass++;
  } catch (e) {
    console.error('FAIL  ' + name + ' — ' + e.message);
    results.push({ name, result: 'FAIL', error: e.message });
    fail++;
  }
}

function assertEqual(a, b, msg) {
  if (a !== b) throw new Error((msg || '') + ': expected ' + JSON.stringify(b) + ', got ' + JSON.stringify(a));
}

function assertTrue(cond, msg) {
  if (!cond) throw new Error(msg || 'Expected true');
}

// =========================================================================
// Category 2 tests
// =========================================================================
const skuA = { sku: 'T', name: 'T', asin: '', fnsku: '', category: 'A', sub_category: '', units_per_box: 6, moq: 100, lead_time_days: 30, cogs: 10 };
const skuB = { ...skuA, category: 'B', moq: 100 };
const skuC = { ...skuA, category: 'C', moq: 50 };

test('2.1 — computeReorder: normal reorder triggered (Cat A)', () => {
  const r = computeReorder(skuA, 10, 30, 0, 300);
  assertEqual(r.should_reorder, true);
  assertEqual(r.suggested_units, 300);
});

test('2.2 — computeReorder: MOQ floor applied', () => {
  const sku = { ...skuA, moq: 500 };
  const r = computeReorder(sku, 10, 30, 0, 595);
  assertEqual(r.should_reorder, true);
  assertEqual(r.suggested_units, 500);
});

test('2.3 — computeReorder: no reorder when coverage >= trigger', () => {
  const r = computeReorder(skuA, 10, 60, 0, 600);
  assertEqual(r.should_reorder, false);
  assertEqual(r.suggested_units, 0);
});

test('2.4 — computeReorder: zero velocity = no reorder', () => {
  const r = computeReorder(skuA, 0, 0, 0, 0);
  assertEqual(r.should_reorder, false);
});

const mkCov = (total, proj, azAv, azCov, noonAv, noonCov, whAv) => ({
  total_coverage: total, projected_coverage: proj,
  by_node: {
    amazon_fba: { available: azAv, coverage_days: azCov },
    noon_fbn: { available: noonAv, coverage_days: noonCov },
    locad_warehouse: { available: whAv, coverage_days: 0 },
  },
});

test('2.5a — computeActionFlag: CRITICAL_OOS_RISK at 5d', () => {
  assertEqual(computeActionFlag(skuA, 10, mkCov(5, 5, 50, 5, 0, 0, 0)), 'CRITICAL_OOS_RISK');
});

test('2.5b — computeActionFlag: OOS_RISK at 10d', () => {
  assertEqual(computeActionFlag(skuA, 10, mkCov(10, 10, 100, 10, 0, 0, 0)), 'OOS_RISK');
});

test('2.5c — computeActionFlag: SHIP_NOW (warehouse available + amazon < trigger)', () => {
  assertEqual(computeActionFlag(skuA, 10, mkCov(30, 30, 200, 20, 0, 0, 200)), 'SHIP_NOW');
});

test('2.5d — computeActionFlag: REORDER (projected < trigger, no warehouse)', () => {
  assertEqual(computeActionFlag(skuA, 10, mkCov(30, 30, 300, 30, 0, 0, 0)), 'REORDER');
});

test('2.5e — computeActionFlag: EXCESS at 130d (> 120)', () => {
  assertEqual(computeActionFlag(skuA, 10, mkCov(130, 130, 1300, 130, 0, 0, 0)), 'EXCESS');
});

test('2.5f — computeActionFlag: OK at 70d', () => {
  assertEqual(computeActionFlag(skuA, 10, mkCov(70, 70, 700, 70, 0, 0, 0)), 'OK');
});

test('2.6 — computeActionFlag: zero velocity = OK', () => {
  assertEqual(computeActionFlag(skuA, 0, mkCov(Infinity, Infinity, 0, Infinity, 0, Infinity, 0)), 'OK');
});

test('2.9 — THRESHOLDS constants correct', () => {
  assertEqual(THRESHOLDS.A.min_coverage, 60);
  assertEqual(THRESHOLDS.A.reorder_trigger, 45);
  assertEqual(THRESHOLDS.B.min_coverage, 45);
  assertEqual(THRESHOLDS.B.reorder_trigger, 30);
  assertEqual(THRESHOLDS.C.min_coverage, 20);
  assertEqual(THRESHOLDS.C.reorder_trigger, 20);
});

test('2.10 — computeReorder: Cat B correct thresholds', () => {
  const r = computeReorder(skuB, 5, 20, 0, 100);
  assertEqual(r.should_reorder, true);
  assertEqual(r.suggested_units, 125);
});

test('2.11 — computeReorder: Cat C with MOQ floor', () => {
  const r = computeReorder(skuC, 2, 15, 0, 20);
  assertEqual(r.should_reorder, true);
  assertEqual(r.suggested_units, 50);
});

test('2.12 — computeReorder: incoming PO reduces suggested_units', () => {
  const r = computeReorder(skuA, 10, 40, 200, 200);
  assertEqual(r.should_reorder, true);
  assertEqual(r.suggested_units, 200);
});

test('2.13 — computeReorder: infinite projected = no reorder', () => {
  const r = computeReorder(skuA, 10, Infinity, 0, 0);
  assertEqual(r.should_reorder, false);
});

// =========================================================================
// Category 3 tests
// =========================================================================
const HEADER = 'id_partner,country_code,dest_country,item_nr,partner_sku,sku,status,offer_price,gmv_lcy,currency_code,brand_code,family,fulfillment_model,order_timestamp,shipment_timestamp,delivered_timestamp';
const SAMPLE_ROWS = [
  '1,AE,AE,1,18OZWBBLUE,noon_123,Delivered,89.00,89.00,AED,brand,family,FBN,2026-02-01T10:00:00,2026-02-02T10:00:00,2026-02-03T10:00:00',
  '2,AE,AE,2,18OZWBBLUE,noon_124,Delivered,89.00,89.00,AED,brand,family,FBN,2026-02-01T11:00:00,2026-02-02T11:00:00,2026-02-03T11:00:00',
  '3,AE,AE,3,18OZWBBLUE,noon_125,Cancelled,89.00,89.00,AED,brand,family,FBN,2026-02-01T12:00:00,,',
  '4,AE,AE,4,18OZWBRED,noon_126,Delivered,75.00,75.00,AED,brand,family,FBN,2026-02-01T10:00:00,2026-02-02T10:00:00,2026-02-03T10:00:00',
  '5,AE,AE,5,18OZWBRED,noon_127,Shipped,75.00,75.00,AED,brand,family,FBN,2026-02-02T10:00:00,,',
];
const SAMPLE_CSV = HEADER + '\n' + SAMPLE_ROWS.join('\n');

test('3.1 — parseNoonOrderCSV: aggregation, Cancelled excluded', () => {
  const r = parseNoonOrderCSV(SAMPLE_CSV);
  assertEqual(r.errors.length, 0, '3.1: no errors');
  assertEqual(r.sales.length, 3, '3.1: 3 sales rows');
  const blue = r.sales.find(s => s.sku === '18OZWBBLUE' && s.date === '2026-02-01');
  assertTrue(blue !== undefined, '3.1: BLUE Feb01 missing');
  assertEqual(blue.units_sold, 2, '3.1: BLUE 2 units');
  const red1 = r.sales.find(s => s.sku === '18OZWBRED' && s.date === '2026-02-01');
  assertTrue(red1 !== undefined, '3.1: RED Feb01 missing');
  assertEqual(red1.units_sold, 1);
  const red2 = r.sales.find(s => s.sku === '18OZWBRED' && s.date === '2026-02-02');
  assertTrue(red2 !== undefined, '3.1: RED Feb02 (Shipped) missing');
  assertEqual(red2.units_sold, 1);
});

test('3.2 — parseNoonOrderCSV: KWD currency conversion', () => {
  const csv = HEADER + '\n1,KW,KW,1,TESTSKU_KWD,noon_1,Delivered,10.00,10.00,KWD,b,f,FBN,2026-02-01T10:00:00,,';
  const r = parseNoonOrderCSV(csv);
  assertEqual(r.errors.length, 0);
  const p = r.avg_prices.find(x => x.sku === 'TESTSKU_KWD');
  assertTrue(p !== undefined, '3.2: price entry missing');
  assertTrue(Math.abs(p.avg_sell_price_aed - 122.5) < 0.01, '3.2: KWD price must be ~122.50, got ' + p.avg_sell_price_aed);
});

test('3.3 — parseNoonOrderCSV: BOM character stripped', () => {
  const r = parseNoonOrderCSV('\uFEFF' + SAMPLE_CSV);
  assertEqual(r.errors.length, 0, '3.3: BOM causes no errors');
  assertEqual(r.sales.length, 3, '3.3: same 3 sales');
});

test('3.4 — Locad filename date regex', () => {
  const re = /InventoryReport_(\d{4}-\d{2}-\d{2})/;
  const m = 'InventoryReport_2026-02-27-09-47-00-1772185620-267707.xlsx'.match(re);
  assertEqual(m && m[1], '2026-02-27');
  const m2 = 'SomeOtherFile.xlsx'.match(re);
  assertEqual(m2, null);
});

test('3.5 — FNSKU pattern validation', () => {
  const FNSKU = /^X[0-9A-Z]{9}$/;
  assertTrue(FNSKU.test('X001U92IYT'), 'X001U92IYT should be valid');
  assertTrue(FNSKU.test('X002C6AYY5'), 'X002C6AYY5 should be valid');
  assertTrue(FNSKU.test('X002C6CH1X'), 'X002C6CH1X should be valid');
  assertTrue(!FNSKU.test('B0FDWJC58Y'), 'ASIN should be invalid');
  assertTrue(!FNSKU.test('x001u92iyt'), 'lowercase should be invalid');
  assertTrue(!FNSKU.test('X001U92IY'), '9-char should be invalid');
  assertTrue(!FNSKU.test(''), 'empty should be invalid');
  assertTrue(!FNSKU.test('9781234567890'), 'ISBN should be invalid');
});

test('3.6 — parseNoonOrderCSV: empty CSV returns error', () => {
  const r = parseNoonOrderCSV('');
  assertTrue(r.errors.length > 0, '3.6: expected errors');
  assertEqual(r.sales.length, 0);
});

test('3.7 — parseNoonOrderCSV: header-only CSV returns error', () => {
  const r = parseNoonOrderCSV(HEADER);
  assertTrue(r.errors.length > 0, '3.7: expected errors for header-only');
});

test('3.8 — parseNoonOrderCSV: Processing status included', () => {
  const csv = HEADER + '\n1,AE,AE,1,TESTSKU_PROC,noon_1,Processing,50.00,50.00,AED,b,f,FBN,2026-02-10T10:00:00,,';
  const r = parseNoonOrderCSV(csv);
  assertEqual(r.errors.length, 0);
  assertEqual(r.sales.length, 1);
});

test('3.9 — parseNoonOrderCSV: AED stays 1:1', () => {
  const csv = HEADER + '\n1,AE,AE,1,TESTSKU_AED,noon_1,Delivered,100.00,100.00,AED,b,f,FBN,2026-02-15T10:00:00,,,';
  const r = parseNoonOrderCSV(csv);
  const p = r.avg_prices[0];
  assertTrue(p && Math.abs(p.avg_sell_price_aed - 100) < 0.01, '3.9: AED must be 100.00');
});

test('3.11 — parseNoonOrderCSV: missing partner_sku column returns error', () => {
  const bad = 'id_partner,country_code,sku,status,offer_price,currency_code,order_timestamp\n1,AE,noon_123,Delivered,89.00,AED,2026-02-01T10:00:00';
  const r = parseNoonOrderCSV(bad);
  assertTrue(r.errors.length > 0, '3.11: expected error');
  assertTrue(r.errors.some(e => e.message.includes('partner_sku')), '3.11: error must mention partner_sku');
});

// =========================================================================
// Summary
// =========================================================================
console.log('\n=== Node Smoke Test Summary ===');
console.log('PASS: ' + pass + '  |  FAIL: ' + fail);
if (fail > 0) {
  console.log('\nFailed tests:');
  results.filter(r => r.result === 'FAIL').forEach(r => console.log('  FAIL: ' + r.name + ' — ' + r.error));
  process.exit(1);
} else {
  console.log('All ' + pass + ' tests passed.');
}
