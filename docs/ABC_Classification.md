# ABC Classification — S2C Inventory OS

## Formula

```
A: units_90d >= THRESHOLD_A  AND  avg_net_profit_per_unit > 0
B: units_90d >= THRESHOLD_B  AND  avg_net_profit_per_unit > 0
C: everything else
```

**THRESHOLD_A and THRESHOLD_B are not hardcoded.**
They are determined by descriptive analysis on the actual 90-day sales distribution
after real data is pulled from Saddl (Amazon) and Noon. See **Agent Task: ABC Threshold Analysis** below.

---

## Definitions

### units_90d
- Total units sold across Amazon + Noon over the trailing 90 calendar days
- Count only confirmed sales: Noon status IN ('Processing', 'Shipped', 'Delivered')
- Amazon equivalent statuses from Saddl DB (to be mapped during integration)
- This is a rolling window, re-computed after each daily sync

### avg_net_profit_per_unit
```
avg_net_profit_per_unit = (avg_sell_price_aed × 0.60) - cogs_aed
```

Where:
- `avg_sell_price_aed` = average `offer_price` from Noon orders in AED
  - Cross-currency conversion (approximate fixed rates):
    - QAR → AED: × 1.02
    - KWD → AED: × 12.25
    - OMR → AED: × 9.71
    - BHD → AED: × 9.93
  - Amazon sell price: from Saddl DB (column to be discovered during integration)
- `0.60` = net revenue after 40% blended marketplace fees (Amazon + Noon combined average)
- `cogs_aed` = `sku_master.cogs` (stored in USD) × 3.67 AED/USD

The 40% marketplace fee is a consistent approximation across all SKUs. Actual per-platform fees (Amazon referral + FBA, Noon commission) will replace this in a future phase when fee data is pulled from both platforms.

---

## Phase 1 Simplifications

| Factor | Phase 1 | Future Phase |
|--------|---------|-------------|
| Marketplace fees | Flat 40% of sell price | Actual per-platform per-SKU fee data |
| Return rate | **Not used** — excluded from formula | Add when return data is reliable |
| Unit window | Trailing 90 days | Rolling 90 days (same, improves with more history) |
| Thresholds | Set after descriptive analysis on real data | Re-evaluated quarterly |
| Amazon sell price | From Saddl DB (discovered during integration) | Live pricing API |

---

## Agent Task: ABC Threshold Analysis

**When:** Run this AFTER Agent 1 has completed the first full sync (Amazon + Noon data loaded into `sales_snapshot`).

**Who runs it:** Agent 2 (Decision Engine) as a pre-classification step, before hardcoding any thresholds.

**What to compute:**

```typescript
// For every active SKU, compute units_90d
SELECT
  sku,
  SUM(units_sold) AS units_90d
FROM sales_snapshot
WHERE date >= CURRENT_DATE - INTERVAL '90 days'
GROUP BY sku
ORDER BY units_90d DESC
```

**Descriptive stats to output (write to a report file `docs/abc_threshold_analysis.md`):**

```
Total SKUs with sales data: N
SKUs with zero sales in 90d: N

Distribution of units_90d:
  Min:    X
  P10:    X
  P25:    X
  Median: X
  P75:    X
  P90:    X
  Max:    X
  Mean:   X
  StdDev: X

Top 10 SKUs by volume:
  SKU | units_90d | category (current)
  ...

Natural breakpoints observed:
  [Agent: describe any visible gaps or clusters in the distribution]

Suggested thresholds:
  THRESHOLD_A (top ~20% of SKUs): ~X units
  THRESHOLD_B (next ~30% of SKUs): ~X units
  These are SUGGESTIONS — operator must confirm before enabling auto-classification.
```

**Then:** Pause and surface this report to the operator (Aslam) for review. Do NOT apply thresholds until confirmed. Store confirmed thresholds in a `system_config` table:

```sql
CREATE TABLE system_config (
  key TEXT PRIMARY KEY,
  value TEXT,
  description TEXT,
  updated_at TIMESTAMPTZ DEFAULT now()
);

INSERT INTO system_config VALUES
  ('abc_threshold_a', NULL, 'Minimum 90-day units for Category A classification'),
  ('abc_threshold_b', NULL, 'Minimum 90-day units for Category B classification'),
  ('abc_fee_rate',    '0.40', 'Blended marketplace fee rate applied to sell price'),
  ('abc_usd_to_aed',  '3.67', 'USD to AED conversion rate for COGS');
```

The classification engine reads `THRESHOLD_A` and `THRESHOLD_B` from this table at runtime — never from hardcoded constants. This means thresholds can be updated without redeploying code.

---

## Implementation

### Schema columns on `sku_master`
```sql
ALTER TABLE sku_master ADD COLUMN cogs NUMERIC;                            -- in USD, from sku_master.csv
ALTER TABLE sku_master ADD COLUMN is_manually_classified BOOLEAN DEFAULT false;
ALTER TABLE sku_master ADD COLUMN computed_category TEXT;                  -- engine suggestion
ALTER TABLE sku_master ADD COLUMN units_90d INTEGER;                       -- trailing 90-day total, all channels
ALTER TABLE sku_master ADD COLUMN avg_sell_price_aed NUMERIC;              -- blended across channels
ALTER TABLE sku_master ADD COLUMN avg_net_profit_per_unit NUMERIC;         -- (sell × 0.60) - cogs_aed
ALTER TABLE sku_master ADD COLUMN classification_updated_at TIMESTAMPTZ;
```

### Classification logic (TypeScript)
```typescript
// Thresholds read from system_config table at runtime — NOT hardcoded
const threshold_a = Number(await getConfig('abc_threshold_a'))  // set after analysis
const threshold_b = Number(await getConfig('abc_threshold_b'))  // set after analysis
const fee_rate    = Number(await getConfig('abc_fee_rate'))      // default 0.40
const usd_to_aed  = Number(await getConfig('abc_usd_to_aed'))   // default 3.67

function classifySKU(sku: {
  cogs: number                   // in USD
  avg_sell_price_aed: number
  units_90d: number
  is_manually_classified: boolean
}): 'A' | 'B' | 'C' {
  const cogs_aed = sku.cogs * usd_to_aed
  const net_profit = (sku.avg_sell_price_aed * (1 - fee_rate)) - cogs_aed

  if (sku.units_90d >= threshold_a && net_profit > 0) return 'A'
  if (sku.units_90d >= threshold_b && net_profit > 0) return 'B'
  return 'C'
}

// NOTE: If threshold_a or threshold_b are null (not yet set by operator),
// skip auto-classification entirely and leave computed_category = null.
// This prevents garbage classifications before the analysis is reviewed.
```

### Daily refresh logic
```typescript
// After each sync:
// 1. Compute annual_units_sold per SKU (annualize from available data range)
// 2. Compute avg_sell_price_aed from sales history (Noon offer_price + Amazon equivalent)
// 3. Run classifySKU() → write to sku_master.computed_category
// 4. If is_manually_classified = false → also update sku_master.category
// 5. Write classification_updated_at = now()
```

### Manual override rule
- `is_manually_classified = true` → engine writes to `computed_category` only, never touches `category`
- UI shows: current category + computed suggestion + last updated timestamp
- Operator can toggle `is_manually_classified` on/off per SKU

---

## Future Phase: Returns
When return data is available from both channels, add:
```
return_rate = returns / (sales + returns)
A: ... AND return_rate <= 0.05
B: ... AND return_rate <= 0.10
```

Noon return statuses: `Cancelled`, `CIR`, `Could Not Be Delivered`
Amazon return data: to be sourced from Saddl DB return tables (discover during integration)

---

## Noon CSV — Actual Export Format

The Noon file is an **order-level export** — one row per unit sold, not a pre-aggregated snapshot.

**Confirmed columns** (from `sales_export_02-27-2026_*.csv`):
```
id_partner, country_code, dest_country, item_nr, partner_sku, sku,
status, offer_price, gmv_lcy, currency_code, brand_code, family,
fulfillment_model, order_timestamp, shipment_timestamp, delivered_timestamp
```

**Key mappings:**
- `partner_sku` → `sku_master.sku` (use this field, NOT `sku` which is Noon's internal ID)
- `offer_price` + `currency_code` → convert to AED for profit calculation
- `order_timestamp` → date dimension for sales velocity

**Status codes (from Feb 2026 sample, n=890):**
| Status | Count | Treatment |
|--------|-------|-----------|
| Delivered | 806 | ✅ Sale |
| CIR | 30 | ❌ Return/cancel (future) |
| Shipped | 17 | ✅ Sale |
| Could Not Be Delivered | 17 | ❌ Return (future) |
| Processing | 13 | ✅ Sale |
| Cancelled | 7 | ❌ Return (future) |

**Phase 1 parser logic:**
1. Filter: `status IN ('Processing', 'Shipped', 'Delivered')`
2. Group by: `partner_sku` + `DATE(order_timestamp)`
3. Count: rows per group → `units_sold`
4. Upsert: `sales_snapshot(sku, date, channel='noon', units_sold)`
5. Also compute: `avg(offer_price_aed)` per SKU → store for profit calculation
