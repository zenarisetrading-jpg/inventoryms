# Locad Inventory Report — XLSX Ingestion Spec

## Context

Locad (our 3PL warehouse) provides two data routes:
- **Phase 1 (active now):** Manual xlsx export from the Locad dashboard — operator uploads to the system
- **Phase 2 (when API credentials arrive):** REST API auto-sync via `locad.yaml` spec

Both routes output to the same `inventory_snapshot` table. The system UI shows `● Not Connected` / `● Connected` status for the API; the xlsx upload option is always available regardless.

**Data policy (confirmed by operator): Locad data is used for SKU identifier and sellable unit count ONLY.**
All other Locad fields — CostPrice, StockStatus, StockCoverDays, 60_DaySales, InventoryMovementStatus, etc. — are inaccurate and are never used. This applies to both the xlsx and API routes.

---

## Confirmed Report Format

**File:** `InventoryReport_YYYY-MM-DD-HH-MM-SS-*.xlsx`
**Sheet:** `Inventory` (single sheet)
**Rows:** One row per active SKU (163 SKUs in Feb 2026 sample)
**Currency:** AED (all CostPrice values are in AED, not USD)

### Confirmed Columns — What We Extract

The report has 33 columns. We use **two**:

| Column | Type | Description | Use in System |
|--------|------|-------------|---------------|
| `SKU` | string | Locad's SKU identifier — requires mapping to internal SKU | Join key (via `locad_sku_map`) |
| `Sellable Stock` | integer | Units available to allocate (= Warehouse − Reserved − Locked) | `inventory_snapshot.available` |

Additionally read (for SKU matching only, not stored):
| Column | Type | Use |
|--------|------|-----|
| `UPC` | string | Cross-reference vs `sku_master.fnsku` during auto-match pass |
| `ProductName` | string | Displayed to operator when manually mapping unmatched SKUs |

**All other columns are ignored.** This includes: CostPrice, Currency, StockStatus, InventoryMovementStatus, StockCoverDays, 60_DaySales, 60_DaySalesValue, Warehouse Stock, Buffer Stock, B2C Reserved Stock, B2B Reserved Stock, Locked Stock, and all dimensional/weight fields. These values are considered inaccurate and are never consumed by the system.

---

## Critical Finding: SKU Naming Mismatch

In the Feb 2026 sample:
- Locad report: **163 SKUs** (descriptive codes like `12OZCMAMBERLEAF`, `18OZBABYWHALE`)
- `sku_master.csv`: **161 SKUs** (mix of Amazon-style codes like `2W-EDFH-4MBZ` and descriptive codes)
- **Direct SKU name matches: only 37 out of 163 (23%)**

### Root Cause
Locad uses the **seller's own product codes** (short descriptive identifiers) as their SKU field. The `sku_master` currently contains Amazon's assigned FBA SKU codes for most products. However, `sku_master` also contains `FNSKU` (Amazon's fulfillment network SKU), and the Locad report exports this same code in the `UPC` column — making FNSKU the most reliable auto-match key.

### Resolution: `locad_sku_map` Table

```sql
CREATE TABLE locad_sku_map (
  locad_sku    TEXT PRIMARY KEY,    -- SKU from Locad report (e.g. "12OZCMAMBERLEAF")
  internal_sku TEXT NOT NULL,       -- sku_master.sku (our canonical SKU)
  matched_by   TEXT,                -- 'fnsku' | 'exact' | 'manual'
  notes        TEXT,
  created_at   TIMESTAMPTZ DEFAULT now()
);
```

### Matching Strategy (run automatically on first upload, then on each upload for new Locad SKUs)

**Pass 1 — FNSKU match:** `locad.UPC = sku_master.fnsku`
The Locad `UPC` column often contains the Amazon FNSKU (e.g. `X001U92IYT`). When present, this is the most reliable match. Insert as `matched_by = 'fnsku'`.
⚠️ **Not universally available** — some Locad SKUs may have an empty or non-FNSKU value in the `UPC` field (e.g. a vendor barcode or no value at all). The matcher must validate the format before using: only treat a UPC as an FNSKU candidate if it matches the pattern `/^X[0-9A-Z]{9}$/` (Amazon FNSKU format).

**Pass 2 — Exact SKU name match:** `locad.SKU = sku_master.sku`
Catches any SKUs where the Locad code happens to match the internal SKU directly. Insert as `matched_by = 'exact'`.

**Pass 3 — Manual mapping (fallback for remainder):** Any Locad SKUs not resolved by Pass 1 or 2 surface in the Upload Center UI. Operator sees each unresolved `locad_sku` alongside its `ProductName`, and selects the correct `internal_sku` from a searchable dropdown of all `sku_master` entries. Inserted as `matched_by = 'manual'`.

This mapping is **persistent** — once resolved it never needs to be done again unless a new SKU is added to Locad. The agent should generate `docs/locad_sku_unmatched.md` after the first auto-match run listing all unresolved entries with ProductName for operator reference.

**Matcher pseudocode:**
```typescript
const FNSKU_PATTERN = /^X[0-9A-Z]{9}$/

for (const item of parsedItems) {
  // Pass 1: FNSKU via UPC column
  if (item.upc && FNSKU_PATTERN.test(item.upc)) {
    const match = skuMaster.find(s => s.fnsku === item.upc)
    if (match) { addToMap(item.locad_sku, match.sku, 'fnsku'); continue }
  }
  // Pass 2: Exact SKU name
  const match = skuMaster.find(s => s.sku === item.locad_sku)
  if (match) { addToMap(item.locad_sku, match.sku, 'exact'); continue }
  // Pass 3: Unresolved — queue for manual mapping
  unmatchedSkus.push({ locad_sku: item.locad_sku, product_name: item.product_name })
}
```

### Ingestion Behaviour for Unmatched SKUs
- Only matched SKUs are promoted into `inventory_snapshot` (used by Decision Engine)
- Unmatched SKUs are flagged in the Upload Center with a "needs mapping" warning
- Decision Engine silently ignores warehouse stock for any SKU with no mapping yet

---

## Database Schema

No raw staging table is needed. Parsed data goes directly into the existing shared tables.

### `locad_sku_map` — SKU translation (see ORCHESTRATOR_PROMPT schema)
Already defined in the migration. Maps Locad's product codes → `sku_master.sku`.

### `locad_upload_log` — Audit trail (see ORCHESTRATOR_PROMPT schema)
Already defined in the migration. Records each manual upload.

### Write target: `inventory_snapshot`

`inventory_snapshot` has a `warehouse_name` column (see schema) to support multiple Locad warehouses without changing the node type. Currently only `LOCAD Umm Ramool FC` exists, but the design accommodates a second warehouse.

```sql
-- node = 'locad_warehouse' always (the type)
-- warehouse_name = the actual Locad facility name (for future multi-warehouse breakdown)
INSERT INTO inventory_snapshot (sku, node, warehouse_name, available, inbound, reserved, snapshot_date)
SELECT
  m.internal_sku,
  'locad_warehouse',
  r.warehouse_name,   -- 'LOCAD Umm Ramool FC' (or future second warehouse)
  r.sellable_stock,   -- the only quantity we use
  0,                  -- inbound comes from PO register, not Locad
  0,                  -- already netted in Sellable Stock
  r.report_date
FROM locad_parsed r
JOIN locad_sku_map m ON r.locad_sku = m.locad_sku
ON CONFLICT (sku, node, warehouse_name, snapshot_date)
DO UPDATE SET available = EXCLUDED.available, synced_at = now();
```

**Multi-warehouse logic in Decision Engine:**
- `locad_warehouse_total.available` = SUM of `available` across all `warehouse_name` values for a given SKU + date
- SKU detail page can show per-warehouse breakdown when more than one warehouse exists
- Transfer recommendations between warehouses are a future phase feature

---

## Parser Logic (TypeScript — `_shared/locad-xlsx.ts`)

```typescript
import * as XLSX from 'https://esm.sh/xlsx@0.18.5'

// Only the two fields we actually use, plus helpers for SKU matching
interface LocadRow {
  SKU: string
  'Sellable Stock': number
  UPC?: string          // read only for auto-matching; not stored
  ProductName?: string  // read only for operator display; not stored
}

export interface LocadParsedItem {
  locad_sku:      string
  sellable_stock: number
  upc:            string | null  // for FNSKU matching pass
  product_name:   string | null  // for operator display when mapping
}

export function parseLocadXLSX(
  fileBuffer: ArrayBuffer,
  filename: string
): { items: LocadParsedItem[]; report_date: string } {

  const workbook = XLSX.read(fileBuffer, { type: 'array' })
  const sheet = workbook.Sheets['Inventory']
  if (!sheet) throw new Error('Expected sheet named "Inventory" — found: ' + Object.keys(workbook.Sheets).join(', '))

  const rows: LocadRow[] = XLSX.utils.sheet_to_json(sheet)

  // Parse report_date from filename: InventoryReport_YYYY-MM-DD-HH-MM-SS-*.xlsx
  const dateMatch = filename.match(/InventoryReport_(\d{4}-\d{2}-\d{2})/)
  const report_date = dateMatch ? dateMatch[1] : new Date().toISOString().split('T')[0]

  const items: LocadParsedItem[] = rows
    .filter(r => r.SKU && r['Sellable Stock'] !== undefined)
    .map(r => ({
      locad_sku:      r.SKU.trim(),
      sellable_stock: Math.max(0, Number(r['Sellable Stock']) || 0),
      upc:            r.UPC ? String(r.UPC).trim() : null,
      product_name:   r.ProductName ?? null,
    }))

  return { items, report_date }
}
```

---

## Upload Endpoint

```
POST /functions/v1/upload-locad-report
Content-Type: multipart/form-data
Body: file (xlsx), report_date (optional override)

Response:
{
  upload_id:       string,
  report_date:     string,
  rows_parsed:     number,
  rows_matched:    number,     // resolved to internal_sku via locad_sku_map
  rows_unmatched:  number,     // no mapping found — need operator attention
  unmatched_skus:  string[],   // list for display in dashboard
  status:          'processed' | 'partial' | 'error'
}
```

---

## Operator Workflow (Manual Upload)

1. Go to Locad Dashboard → Download Inventory Report (xlsx)
2. In S2C Inventory OS → Upload Center → "Upload Locad Report"
3. Select the xlsx file → system auto-detects report_date from filename
4. System parses, matches, and upserts into `inventory_snapshot`
5. Any unmatched SKUs appear as a warning: "X SKUs need mapping before they affect decisions"
6. Operator can map unmatched SKUs in a simple table UI (locad_sku → internal_sku dropdown)

**Upload cadence: Weekly** — decisions are reviewed weekly, so upload the latest Locad report at the start of each weekly review. File is available any time from the Locad dashboard.

---

## What the Decision Engine Uses from This Source

After ingestion, the Decision Engine reads from `inventory_snapshot` (node = `locad_warehouse`):

| Field | Value |
|-------|-------|
| `available` | `Sellable Stock` from xlsx |
| `inbound` | Always 0 — inbound comes from PO register entries, not Locad |
| `reserved` | Always 0 — already netted out in Sellable Stock |

**Everything else from Locad is ignored by the system.** COGS comes from `sku_master.cogs` (USD). Velocity comes from Noon CSV + Saddl Amazon data. Coverage is computed by the Decision Engine, not taken from Locad's `StockCoverDays`.

---

## Phase 1 vs API Route Comparison

| Aspect | XLSX Upload (Phase 1 Fallback) | Locad API (Future) |
|--------|-------------------------------|---------------------|
| Trigger | Manual operator upload | Automated daily at 6am via pg_cron |
| Freshness | As fresh as last upload | Near-real-time |
| Coverage | Full snapshot per upload | Incremental + webhooks |
| SKU mapping | Required (locad_sku_map) | Same mapping table reused |
| Setup effort | Zero API credentials needed | JWT credentials from Locad |
| Data schema | Identical — both write to `inventory_snapshot` | Identical |

The same `locad_sku_map` table and `inventory_snapshot` schema will serve both routes — switching to API later requires no schema changes.

---

## Resolved Decisions

| Decision | Resolution |
|----------|-----------|
| Upload cadence | **Weekly** — at the start of each weekly decision review |
| Auto-match priority | **FNSKU-first** (Locad `UPC` field vs `sku_master.fnsku`), then exact SKU name, then manual |
| Number of warehouses | **One now** (`LOCAD Umm Ramool FC`) — schema supports a second; Decision Engine sums across all |
| API credentials approach | **Confirmed correct** — xlsx active now, API auto-activates when credentials are added to Supabase secrets |

## Remaining Operator Action

**After first upload:** Complete the one-time SKU mapping exercise. The system will auto-resolve as many SKUs as possible via FNSKU + exact name matching, then surface the remainder in the UI for manual mapping. Once all SKUs are mapped, weekly uploads require no operator intervention beyond uploading the file.
