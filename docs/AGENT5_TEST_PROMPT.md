# S2C Inventory OS — Agent 5: QA & Integration Test Runner

> **How to use:**
> Run AFTER Agents 1–4 have completed. Open Claude Code CLI in the project root and paste everything inside the code block below.
> This agent can also be spawned by the Orchestrator as Agent 5 in parallel with final integration.

---

```
You are the QA Engineer for S2C Inventory Operating System. Your job is to verify that everything built by Agents 1–4 actually works — connections are live, schemas are correct, business logic is accurate, endpoints return the right shapes, and the data pipeline flows end-to-end.

---

## ⛔ HARD GUARDRAILS

- Work only inside the current project directory. No reads or writes outside it.
- Saddl DB (`SADDL_DB_URL`, `SADDL_SUPABASE_URL`) is READ ONLY. You will explicitly test that writes to Saddl FAIL — a failed write is a PASSING test.
- All writes, migrations, and test data go to S2C Supabase only (`eiezhzlpirdiqsotvogx`).
- No `rm`, `sudo`, `curl`, `wget`, `brew`, `pip`, or `python` commands.
- Clean up all test data you insert at the end of each test run (delete rows with `test_` prefix).

---

## YOUR OUTPUT

Write all test files to `tests/` directory. When done, write a full report to `docs/test_report.md`.

The report must include:
- Overall result: ✅ PASS or ❌ FAIL
- Table of every test with status, duration, and failure message if any
- Section for each test category
- A clear "Blockers" section if anything is broken that would stop the system from being used

Exit with a non-zero code if any CRITICAL tests fail (connectivity, schema, or core business logic).

---

## TEST CATEGORIES

### CATEGORY 1 — Connectivity & Schema (run first, block all others if these fail)

**Test 1.1 — S2C Supabase connection**
```typescript
// tests/connectivity/s2c_connection.test.ts
// Connect to S2C Supabase using SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from .env
// SELECT 1 — expect no error
// CRITICAL: if this fails, stop all other tests
```

**Test 1.2 — Saddl connection (read-only)**
```typescript
// tests/connectivity/saddl_connection.test.ts
// Connect to Saddl using SADDL_SUPABASE_URL + SADDL_SUPABASE_ANON_KEY
// Attempt SELECT on any accessible table — expect success
// CRITICAL: Attempt INSERT into any Saddl table — expect FAILURE (error)
// If INSERT succeeds: mark as CRITICAL FAIL with message "Saddl DB is not read-only — STOP"
// If INSERT fails: mark as PASS — guardrail is working
```

**Test 1.3 — All required tables exist in S2C Supabase**
Query `information_schema.tables` for all of these — each must exist:
`sku_master`, `sales_snapshot`, `inventory_snapshot`, `po_register`, `po_line_items`,
`allocation_plans`, `demand_metrics`, `locad_sku_map`, `locad_upload_log`, `system_config`

**Test 1.4 — inventory_snapshot has warehouse_name column**
Query `information_schema.columns` for `inventory_snapshot.warehouse_name` — must exist and be nullable TEXT.

**Test 1.5 — system_config has required keys**
SELECT key FROM system_config — must include: `abc_threshold_a`, `abc_threshold_b`, `abc_fee_rate`, `abc_usd_to_aed`

**Test 1.6 — sku_master is seeded**
SELECT COUNT(*) FROM sku_master — must be >= 150. If 0, the seed step failed.

**Test 1.7 — RLS is enabled on all tables**
Query `pg_tables` joined with `pg_class` for `rowsecurity = true` on all tables above.

---

### CATEGORY 2 — Business Logic Unit Tests (pure TypeScript, no DB)

Write these as Deno unit tests. Import the actual functions from `supabase/functions/_shared/`.

**Test 2.1 — Sales velocity: normal case**
```typescript
// Input: 90 days of data, 7d total = 70 units, 90d total = 450 units
// Expected: sv_7 = 10.0, sv_90 = 5.0, blended_sv = (10*0.6) + (5*0.4) = 8.0
```

**Test 2.2 — Sales velocity: < 30 days of data**
```typescript
// Input: only 14 days of data, 7d total = 70 units
// Expected: blended_sv = sv_7 = 10.0 (not blended — insufficient history)
```

**Test 2.3 — Sales velocity: zero sales**
```typescript
// Input: no sales data
// Expected: sv_7 = 0, sv_90 = 0, blended_sv = 0
```

**Test 2.4 — Coverage: normal case**
```typescript
// Input: blended_sv = 10, amazon_available = 100, noon_available = 50, warehouse_available = 200
// Expected: coverage_amazon = 10.0, coverage_noon = 5.0, coverage_warehouse = 20.0, total_coverage = 35.0
```

**Test 2.5 — Coverage: zero velocity (avoid divide by zero)**
```typescript
// Input: blended_sv = 0, any stock
// Expected: all coverage values = Infinity (not NaN, not error)
```

**Test 2.6 — Action flag: priority ordering**
```typescript
// Test each threshold in priority order:
// total_coverage = 5  → CRITICAL_OOS_RISK
// total_coverage = 10 → OOS_RISK
// total_coverage = 30, warehouse_available = 100, amazon_coverage < trigger → SHIP_NOW
// projected_coverage = 20, reorder_trigger = 30 → REORDER
// total_coverage = 200 (> min_coverage * 2) → EXCESS
// total_coverage = 50 (healthy) → OK
```

**Test 2.7 — Allocation: whole boxes only**
```typescript
// Input: units_per_box = 6, amazon_deficit = 25 units, warehouse_available = 100 units
// Expected: boxes_for_amazon = 4 (24 units), NOT 5 (25 rounds up incorrectly)
// Verify: Math.floor(25/6) = 4 boxes = 24 units
```

**Test 2.8 — Allocation: warehouse can't cover full deficit**
```typescript
// Input: amazon_deficit = 100 units, warehouse_available = 30 units, units_per_box = 6
// Expected: allocate max possible = 5 boxes (30 units), NOT 100
```

**Test 2.9 — Reorder: suggested units respects MOQ**
```typescript
// Input: moq = 500, computed_needed = 300
// Expected: suggested_units = 500 (MOQ floor)
```

**Test 2.10 — Reorder: no reorder if projected coverage is healthy**
```typescript
// Input: projected_coverage = 60, category A reorder_trigger = 45
// Expected: should_reorder = false
```

**Test 2.11 — FNSKU pattern matching**
```typescript
// Valid FNSKUs (must match): 'X001U92IYT', 'X002FH4BGX', 'X002C6AYY5'
// Invalid (must NOT match): '123456789', 'B0FDWJC58Y', '', 'x001u92iyt' (lowercase), '9781234567890'
const FNSKU_PATTERN = /^X[0-9A-Z]{9}$/
```

---

### CATEGORY 3 — Parser Tests

**Test 3.1 — Noon order CSV parser: basic flow**
```typescript
// Input: 5 rows of sample order data (inline, no file needed)
const sampleCSV = `id_partner,country_code,dest_country,item_nr,partner_sku,sku,status,offer_price,gmv_lcy,currency_code,brand_code,family,fulfillment_model,order_timestamp,shipment_timestamp,delivered_timestamp
1,AE,AE,1,18OZWBBLUE,noon_123,Delivered,89.00,89.00,AED,brand,family,FBN,2026-02-01T10:00:00,2026-02-02T10:00:00,2026-02-03T10:00:00
2,AE,AE,2,18OZWBBLUE,noon_124,Delivered,89.00,89.00,AED,brand,family,FBN,2026-02-01T11:00:00,2026-02-02T11:00:00,2026-02-03T11:00:00
3,AE,AE,3,18OZWBBLUE,noon_125,Cancelled,89.00,89.00,AED,brand,family,FBN,2026-02-01T12:00:00,,
4,AE,AE,4,18OZWBRED,noon_126,Delivered,75.00,75.00,AED,brand,family,FBN,2026-02-01T10:00:00,2026-02-02T10:00:00,2026-02-03T10:00:00
5,AE,AE,5,18OZWBRED,noon_127,Shipped,75.00,75.00,AED,brand,family,FBN,2026-02-02T10:00:00,,`

// Expected:
// - Cancelled row filtered OUT
// - 18OZWBBLUE: 2 units on 2026-02-01 (Delivered only, not Cancelled)
// - 18OZWBRED: 2 units across 2 days (1 Delivered on Feb 01, 1 Shipped on Feb 02)
// - partner_sku used as key, NOT sku column
```

**Test 3.2 — Noon CSV: currency conversion**
```typescript
// Input: 1 row with offer_price=10, currency_code=KWD
// Expected: avg_sell_price_aed = 10 * 12.25 = 122.50
// Test each: QAR×1.02, KWD×12.25, OMR×9.71, BHD×9.93
```

**Test 3.3 — Locad xlsx parser: extract only SKU + Sellable Stock**
```typescript
// Build a minimal in-memory xlsx workbook with sheet "Inventory"
// Include columns: SKU, Warehouse, Sellable Stock, CostPrice, StockStatus, 60_DaySales
// Expected: only locad_sku and sellable_stock extracted, all others ignored
// Verify CostPrice does NOT appear in output
```

**Test 3.4 — Locad xlsx parser: report_date from filename**
```typescript
// filename = 'InventoryReport_2026-02-27-09-47-00-1234.xlsx'
// Expected: report_date = '2026-02-27'
// filename = 'something_else.xlsx'
// Expected: report_date = today's date (fallback)
```

**Test 3.5 — Locad xlsx parser: negative sellable stock clamped to zero**
```typescript
// Input row: { SKU: 'TEST001', 'Sellable Stock': -5 }
// Expected: sellable_stock = 0 (never negative)
```

---

### CATEGORY 4 — Edge Function Endpoint Tests

Start the Supabase local dev server before running these: `supabase functions serve`
Base URL: `http://localhost:54321/functions/v1`
Auth header: `Authorization: Bearer <SUPABASE_ANON_KEY>`

**Test 4.1 — GET /sync/status**
- Expect HTTP 200
- Expect response shape: `{ amazon: {...}, locad_api: {...}, locad_xlsx: {...}, noon_csv: {...} }`
- Expect `locad_api.credentials_configured = false` (LOCAD_USERNAME is empty)
- Expect `locad_api.status = 'not_connected'`

**Test 4.2 — POST /sync/amazon**
- Body: `{ source: 'amazon' }`
- Expect HTTP 200
- Expect `{ status: 'ok' | 'partial' | 'error', synced_at, skus_processed }`
- If status = 'error': log the error message but do NOT fail the test — Saddl schema may be unexplored yet

**Test 4.3 — POST /sync/locad (should skip gracefully)**
- Body: `{ source: 'locad' }`
- Expect HTTP 200
- Expect `{ locad_status: 'skipped_not_connected' }` (no credentials)
- Must NOT return HTTP 500

**Test 4.4 — GET /dashboard**
- Expect HTTP 200
- Expect response has keys: `alerts`, `ship_now`, `reorder_now`, `transfers`, `inbound`, `excess`, `last_synced`
- Each key must be an array (may be empty — that's fine)

**Test 4.5 — GET /skus**
- Expect HTTP 200
- Expect `{ skus: [...] }` — array may be empty if no sync has run yet

**Test 4.6 — PO lifecycle: create → advance → verify**
```
POST /po   body: { po_number: 'TEST-PO-001', supplier: 'Test Supplier', order_date: '2026-02-27', eta: '2026-04-01', line_items: [{sku: <first_sku_from_sku_master>, units_ordered: 100}] }
→ Expect HTTP 201, response has id

GET /po/<id>
→ Expect po_number = 'TEST-PO-001', status = 'draft'

PATCH /po/<id>   body: { status: 'ordered' }
→ Expect HTTP 200, status = 'ordered'

PATCH /po/<id>   body: { status: 'draft' }   (invalid backwards transition)
→ Expect HTTP 422 with error message listing valid next statuses

// Cleanup
PATCH /po/<id>   body: { status: 'closed' }   (advance to closed for cleanup)
// Note: if status transitions block skipping to closed, advance step by step
```

**Test 4.7 — POST /upload-noon (with sample CSV)**
```typescript
// Use the 5-row sample from Test 3.1 as a file upload
// Expect HTTP 200
// Expect { rows_processed: 4, skus_updated: ['18OZWBBLUE', '18OZWBRED'], errors: [] }
// Then verify: SELECT * FROM sales_snapshot WHERE sku IN ('18OZWBBLUE','18OZWBRED')
// → rows must exist with channel = 'noon'
// Cleanup: DELETE FROM sales_snapshot WHERE sku IN ('18OZWBBLUE','18OZWBRED')
```

**Test 4.8 — POST /upload-locad-report (with real sample xlsx)**
```typescript
// Use the actual InventoryReport xlsx in the project root
// Expect HTTP 200
// Expect { rows_parsed: 163, rows_matched: <N>, rows_unmatched: <163-N> }
// Expect rows_matched > 0 (FNSKU + exact matching should resolve some)
// Then verify: SELECT COUNT(*) FROM inventory_snapshot WHERE node = 'locad_warehouse'
// → count must equal rows_matched
// Verify: warehouse_name = 'LOCAD Umm Ramool FC' for all locad rows
// Verify: inbound = 0, reserved = 0 for all locad rows (only available is set)
// Cleanup: DELETE FROM inventory_snapshot WHERE node = 'locad_warehouse' AND snapshot_date = <report_date>
//          DELETE FROM locad_upload_log WHERE filename LIKE 'InventoryReport%'
```

**Test 4.9 — GET /upload-locad-report/unmatched**
- Run after Test 4.8
- Expect HTTP 200
- Expect `{ unmatched: [...] }` — array of `{ locad_sku, product_name }`
- Each entry must have non-null product_name

**Test 4.10 — POST /upload-locad-report/map (manual SKU mapping)**
```typescript
// Get first unmatched locad_sku from 4.9 response
// Get any internal_sku from sku_master
// POST { locad_sku: <first_unmatched>, internal_sku: <any_valid_sku> }
// Expect HTTP 200, { ok: true }
// Verify: SELECT * FROM locad_sku_map WHERE locad_sku = <first_unmatched> → must exist with matched_by = 'manual'
// Cleanup: DELETE FROM locad_sku_map WHERE matched_by = 'manual' AND locad_sku = <first_unmatched>
```

---

### CATEGORY 5 — Data Pipeline End-to-End

This is the most important category. It verifies the full flow: upload data → sync → metrics refresh → dashboard reflects results.

**Test 5.1 — Full pipeline: Locad upload → decision engine → dashboard**
```
Step 1: Upload Locad xlsx (POST /upload-locad-report)
Step 2: Trigger sync (POST /sync/amazon) to get some Amazon data
Step 3: Trigger metrics refresh (POST /sync/all) or call the refresh function directly
Step 4: GET /dashboard — verify response is non-empty and last_synced is recent (within last 60s)
Step 5: GET /skus — verify at least one SKU has a non-null action_flag
Step 6: For any SKU with warehouse stock > 0 and amazon_coverage < threshold → expect action_flag = SHIP_NOW
```

**Test 5.2 — SKU detail reflects warehouse stock from Locad upload**
```
After Test 5.1:
Pick any SKU that was in the Locad xlsx and was matched
GET /skus/<that_sku>
→ supply.locad_warehouse.available must equal the Sellable Stock from the xlsx for that SKU
→ supply.locad_warehouse.inbound must equal 0
→ total_coverage_days must be a positive number (not NaN, not Infinity unless blended_sv=0)
```

**Test 5.3 — PO units appear in projected coverage**
```
Step 1: Create a PO for a specific SKU with 1000 units_ordered, status = 'ordered', eta = future date
Step 2: GET /skus/<that_sku>
→ projected_coverage_days > total_coverage_days (PO units added to projection)
→ pending_pos array must contain the PO
Cleanup: close and delete the test PO
```

---

### CATEGORY 6 — Guard Rail Verification

**Test 6.1 — Saddl write protection**
```typescript
// Attempt: INSERT INTO any Saddl table via SADDL_DB_URL
// Expected: error (permission denied, RLS violation, or read-only connection)
// If INSERT succeeds: CRITICAL FAIL — log "⚠️ SADDL DB ACCEPTS WRITES — REMOVE WRITE CREDENTIALS"
// If INSERT fails: PASS — log "✅ Saddl DB correctly rejected write attempt"
```

**Test 6.2 — Locad API skips gracefully when not configured**
```typescript
// Verify LOCAD_USERNAME env var is empty
// POST /sync/locad
// Expect: HTTP 200 (not 500), locad_status = 'skipped_not_connected'
// No error thrown, no unhandled exception
```

**Test 6.3 — Invalid PO status transition rejected**
```typescript
// Already tested in 4.6 — reference that result here
```

**Test 6.4 — Negative stock values never stored**
```typescript
// Manually call the Locad parser with a row containing Sellable Stock = -3
// Verify output sellable_stock = 0
```

---

## EXECUTION ORDER

Run categories in this order. Stop at any CRITICAL failure in Category 1.

1. Category 1 — Connectivity & Schema
2. Category 2 — Business Logic Unit Tests  (can run offline, fast)
3. Category 3 — Parser Tests               (can run offline, fast)
4. Category 4 — Edge Function Endpoints    (requires supabase functions serve)
5. Category 5 — End-to-End Pipeline        (requires Categories 1+4 passing)
6. Category 6 — Guardrail Verification

---

## ENVIRONMENT SETUP

Load env vars from `.env` in the project root before running any tests:
```bash
# Load .env
export $(grep -v '^#' .env | xargs)

# Start Edge Functions locally (in background)
supabase functions serve &
sleep 5  # wait for startup

# Run all tests
deno test tests/ --allow-env --allow-net --allow-read
```

Write a test runner script to `tests/run_tests.sh` that does the above automatically.

---

## TEST REPORT FORMAT

Write `docs/test_report.md` with this structure:

```markdown
# S2C Inventory OS — Test Report
**Run date:** <timestamp>
**Overall result:** ✅ ALL PASS / ❌ FAILURES DETECTED

## Summary
| Category | Tests | Passed | Failed | Skipped |
|----------|-------|--------|--------|---------|
| 1. Connectivity & Schema | N | N | N | N |
| 2. Business Logic | N | N | N | N |
| 3. Parsers | N | N | N | N |
| 4. Endpoints | N | N | N | N |
| 5. End-to-End | N | N | N | N |
| 6. Guardrails | N | N | N | N |

## ⚠️ Blockers (fix before using system)
<list any CRITICAL failures here — if none, write "None">

## Detailed Results
<per-test breakdown with pass/fail/duration/error message>

## Saddl Schema Discovery
<paste the table/column map discovered by Agent 1 — or "Not yet discovered" if saddl.ts hasn't run>

## Notes for Operator
<anything the operator should know: unmatched SKU count, missing data, etc.>
```

---

## IMPORTANT NOTES

1. **If supabase functions serve fails to start**, check that `supabase start` has been run first and the local stack is up. If it can't start, skip Category 4 and 5, mark them as "SKIPPED — local stack not running" and note this in the report.

2. **If sku_master is empty** (Test 1.6 fails), stop and report: "sku_master not seeded — Agent 1 seed step did not run. Run: supabase db reset && <re-run seed>". This is a CRITICAL blocker.

3. **Test data cleanup is mandatory**. Every test that inserts rows must delete them at the end. Use `sku` prefixes like `TEST_SKU_001` or PO numbers like `TEST-PO-*` so cleanup queries are safe and targeted.

4. **The Locad xlsx upload test (4.8) uses the real file** at `InventoryReport_2026-02-27-09-47-00-1772185620-267707.xlsx` — verify the filename exists before running.

5. **Don't fail on empty arrays from /dashboard or /skus** — if no sync has run successfully, these will be empty. That's expected. The test just verifies the shape is correct and no 500 errors occur.

Begin by reading all files in `supabase/functions/_shared/` to understand what has been built, then write the test suite.
```
