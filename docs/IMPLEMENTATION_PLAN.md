# S2C Inventory OS — Multi-Agent Implementation Plan

**Version:** 2.0 | **Date:** 2026-02-27
**Build Mode:** Orchestrator + Sub-Agents via Claude Code CLI
**Target MVP:** 5 weeks

---

## 1. What We're Building

A supply chain decision system for an e-commerce operator selling on Amazon (UAE/ME) and Noon. The system:

- Pulls live inventory and sales data from Amazon (via Saddl PostgreSQL, read-only) and Locad warehouse (via REST API)
- Accepts manual Noon CSV uploads
- Runs a blended demand / sales velocity engine
- Applies a Decision Engine that outputs actionable alerts: Ship Now, Reorder, Transfer, Hold
- Presents everything through a decision-first Operator Dashboard

---

## 2. Tech Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| Frontend | React (Vite + TypeScript) | Deployed on Vercel |
| Styling | Tailwind CSS + shadcn/ui | |
| Backend API | Supabase Edge Functions (Deno/TypeScript) | Serverless, no separate server |
| Database | Supabase PostgreSQL | App data store |
| Source DB (Amazon) | Saddl PostgreSQL — read-only | Separate connection from Edge Functions |
| Locad Integration | Locad REST API (JWT, OpenAPI 3.0 spec provided) | Called from Edge Functions |
| Noon Integration | CSV upload → Edge Function → Supabase | Manual operator upload |
| Auth | Supabase Auth | Simple operator login |
| Scheduling | Supabase pg_cron | Daily 6am sync jobs |

**Why this stack:**
- No separate backend server — Supabase Edge Functions handle all API logic
- Language is unified as TypeScript across frontend and backend
- Supabase handles DB + functions + auth + storage in one platform
- Vercel + Supabase = zero-infrastructure MVP

---

## 3. Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│              Vercel — React (Vite + TS)                  │
│              Operator Dashboard UI                        │
└──────────────────────────┬──────────────────────────────┘
                           │ HTTPS calls to Supabase Edge Functions
┌──────────────────────────▼──────────────────────────────┐
│              Supabase Platform                            │
│  ┌──────────────────────────────────────────────────┐   │
│  │  Edge Functions (Deno/TypeScript)                 │   │
│  │  /dashboard  /skus  /po  /upload  /sync           │   │
│  │  _shared/: locad.ts, saddl.ts, velocity.ts, ...  │   │
│  └──────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────┐   │
│  │  PostgreSQL (App DB)                              │   │
│  │  sku_master, inventory_snapshot, sales_snapshot,  │   │
│  │  po_register, po_line_items, allocation_plans,    │   │
│  │  demand_metrics                                   │   │
│  └──────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────┐   │
│  │  pg_cron — Daily 6am sync scheduler               │   │
│  └──────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
          │                    │
    ┌─────▼──────┐    ┌────────▼───────┐    ┌─────────────┐
    │Saddl Postgres│   │  Locad REST API │    │ Noon CSV    │
    │(Amazon data) │   │  (JWT + REST)   │    │ (upload)    │
    │ Read-only   │   │  locad.yaml     │    │             │
    └─────────────┘   └────────────────┘    └─────────────┘
```

---

## 4. Repository Structure

```
s2c-inventory-os/
├── supabase/
│   ├── functions/
│   │   ├── dashboard/
│   │   │   └── index.ts          # GET /dashboard → Command Center data
│   │   ├── skus/
│   │   │   └── index.ts          # GET /skus, GET /skus/:sku
│   │   ├── po/
│   │   │   └── index.ts          # GET/POST/PATCH /po, /po/:id
│   │   ├── upload-noon/
│   │   │   └── index.ts          # POST /upload-noon (CSV multipart)
│   │   ├── sync/
│   │   │   └── index.ts          # POST /sync/:source (amazon|locad|all)
│   │   └── _shared/
│   │       ├── cors.ts           # CORS headers for all functions
│   │       ├── supabase.ts       # Supabase admin client
│   │       ├── locad.ts          # Locad API client (JWT + REST)
│   │       ├── saddl.ts          # Saddl Postgres reader (Amazon data)
│   │       ├── noon-csv.ts       # Noon CSV parser
│   │       ├── velocity.ts       # BlendedSV computation
│   │       ├── coverage.ts       # Coverage days computation
│   │       ├── allocation.ts     # Allocation engine
│   │       ├── reorder.ts        # Reorder trigger
│   │       ├── transfer.ts       # Transfer recommendation
│   │       └── types.ts          # Shared TypeScript interfaces
│   ├── migrations/
│   │   └── 001_initial_schema.sql
│   └── config.toml
├── frontend/
│   ├── src/
│   │   ├── pages/
│   │   │   ├── index.tsx         # Command Center (home)
│   │   │   ├── sku/[sku].tsx     # SKU Detail
│   │   │   ├── po.tsx            # PO Register
│   │   │   └── upload.tsx        # Upload Center
│   │   ├── components/
│   │   │   ├── dashboard/
│   │   │   │   ├── AlertBanner.tsx
│   │   │   │   ├── ShipNowTable.tsx
│   │   │   │   ├── ReorderTable.tsx
│   │   │   │   ├── TransferTable.tsx
│   │   │   │   └── InboundPipeline.tsx
│   │   │   ├── sku/
│   │   │   │   ├── DemandCard.tsx
│   │   │   │   ├── SupplyGrid.tsx
│   │   │   │   └── CoverageBar.tsx
│   │   │   └── shared/
│   │   │       ├── StatusBadge.tsx
│   │   │       └── DataTable.tsx
│   │   ├── lib/
│   │   │   └── api.ts            # Typed Supabase Edge Function client
│   │   ├── types/
│   │   │   └── index.ts          # Shared TS types (mirrors backend)
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── index.html
│   ├── vite.config.ts
│   ├── tailwind.config.ts
│   ├── package.json
│   └── .env.example
├── docs/
│   └── api_contracts.md
└── README.md
```

---

## 5. Database Schema (Supabase PostgreSQL)

Write to `supabase/migrations/001_initial_schema.sql`:

```sql
-- Enable pg_cron for scheduled syncs
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- SKU Master
CREATE TABLE sku_master (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku TEXT UNIQUE NOT NULL,
  name TEXT,
  category TEXT CHECK (category IN ('A', 'B', 'C')),
  units_per_box INTEGER NOT NULL DEFAULT 1,
  moq INTEGER,
  lead_time_days INTEGER,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Sales Snapshot (daily, per channel)
CREATE TABLE sales_snapshot (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku TEXT REFERENCES sku_master(sku),
  date DATE NOT NULL,
  channel TEXT CHECK (channel IN ('amazon', 'noon')),
  units_sold INTEGER NOT NULL DEFAULT 0,
  synced_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(sku, date, channel)
);

-- Inventory Snapshot (per node, refreshed daily)
CREATE TABLE inventory_snapshot (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku TEXT REFERENCES sku_master(sku),
  node TEXT CHECK (node IN ('amazon_fba', 'noon_fbn', 'locad_warehouse')),
  available INTEGER DEFAULT 0,
  inbound INTEGER DEFAULT 0,
  reserved INTEGER DEFAULT 0,
  snapshot_date DATE NOT NULL,
  synced_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(sku, node, snapshot_date)
);

-- PO Register
CREATE TABLE po_register (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  po_number TEXT UNIQUE NOT NULL,
  supplier TEXT,
  order_date DATE,
  eta DATE,
  status TEXT CHECK (status IN ('draft','ordered','shipped','in_transit','arrived','closed')) DEFAULT 'draft',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- PO Line Items
CREATE TABLE po_line_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id UUID REFERENCES po_register(id) ON DELETE CASCADE,
  sku TEXT REFERENCES sku_master(sku),
  units_ordered INTEGER NOT NULL,
  units_received INTEGER DEFAULT 0
);

-- Allocation Plans
CREATE TABLE allocation_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku TEXT REFERENCES sku_master(sku),
  plan_date DATE NOT NULL,
  node TEXT,
  boxes_to_ship INTEGER,
  units_to_ship INTEGER,
  status TEXT CHECK (status IN ('pending','approved','shipped')) DEFAULT 'pending',
  generated_at TIMESTAMPTZ DEFAULT now()
);

-- SKU Master additional columns (ABC classification support)
ALTER TABLE sku_master ADD COLUMN cogs NUMERIC;                         -- in USD, seeded from sku_master.csv
ALTER TABLE sku_master ADD COLUMN is_manually_classified BOOLEAN DEFAULT false;
ALTER TABLE sku_master ADD COLUMN computed_category TEXT;               -- engine suggestion (null until thresholds set)
ALTER TABLE sku_master ADD COLUMN units_90d INTEGER;                    -- trailing 90-day unit sales, all channels
ALTER TABLE sku_master ADD COLUMN avg_sell_price_aed NUMERIC;           -- blended across channels
ALTER TABLE sku_master ADD COLUMN avg_net_profit_per_unit NUMERIC;      -- (sell_aed × 0.60) - (cogs × 3.67)
-- return_rate: excluded Phase 1, add in future phase
ALTER TABLE sku_master ADD COLUMN classification_updated_at TIMESTAMPTZ;

-- Demand Metrics (computed cache, refreshed after each sync)
CREATE TABLE demand_metrics (
  sku TEXT PRIMARY KEY REFERENCES sku_master(sku),
  sv_7 NUMERIC,
  sv_90 NUMERIC,
  blended_sv NUMERIC,
  coverage_amazon NUMERIC,
  coverage_noon NUMERIC,
  coverage_warehouse NUMERIC,
  total_coverage NUMERIC,
  projected_coverage NUMERIC,
  action_flag TEXT,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- System config (runtime-editable settings, including ABC thresholds)
CREATE TABLE system_config (
  key TEXT PRIMARY KEY,
  value TEXT,                    -- null = not yet set
  description TEXT,
  updated_at TIMESTAMPTZ DEFAULT now()
);

INSERT INTO system_config (key, value, description) VALUES
  ('abc_threshold_a', NULL,   'Min 90-day units for Category A — set after descriptive analysis'),
  ('abc_threshold_b', NULL,   'Min 90-day units for Category B — set after descriptive analysis'),
  ('abc_fee_rate',    '0.40', 'Blended marketplace fee rate (40% of sell price)'),
  ('abc_usd_to_aed',  '3.67', 'USD to AED conversion rate for COGS');

-- RLS: enable for all tables (operator-only access via Supabase Auth)
ALTER TABLE sku_master ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_snapshot ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_snapshot ENABLE ROW LEVEL SECURITY;
ALTER TABLE po_register ENABLE ROW LEVEL SECURITY;
ALTER TABLE po_line_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE allocation_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE demand_metrics ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read/write all tables
CREATE POLICY "authenticated_all" ON sku_master FOR ALL TO authenticated USING (true);
CREATE POLICY "authenticated_all" ON sales_snapshot FOR ALL TO authenticated USING (true);
CREATE POLICY "authenticated_all" ON inventory_snapshot FOR ALL TO authenticated USING (true);
CREATE POLICY "authenticated_all" ON po_register FOR ALL TO authenticated USING (true);
CREATE POLICY "authenticated_all" ON po_line_items FOR ALL TO authenticated USING (true);
CREATE POLICY "authenticated_all" ON allocation_plans FOR ALL TO authenticated USING (true);
CREATE POLICY "authenticated_all" ON demand_metrics FOR ALL TO authenticated USING (true);

-- pg_cron: daily sync at 6am UTC
SELECT cron.schedule('daily-sync', '0 6 * * *', $$
  SELECT net.http_post(
    url := current_setting('app.sync_function_url'),
    body := '{"source": "all"}'::jsonb
  );
$$);
```

---

## 6. Core Business Logic Contracts

### Sales Velocity
```typescript
SV7  = total units sold (amazon + noon), last 7 days / 7
SV90 = total units sold (amazon + noon), last 90 days / 90
BlendedSV = (SV7 * 0.6) + (SV90 * 0.4)
// If < 30 days of data available, use SV7 only
```

### Coverage
```typescript
CoverageDays(node) = node.available / BlendedSV
TotalCoverage = sum(all available) / BlendedSV
IncomingPO = sum(po_line_items.units_ordered - units_received)
             WHERE po.status IN ('ordered', 'shipped', 'in_transit')
ProjectedCoverage = (TotalAvailable + IncomingPO) / BlendedSV
```

### Category Thresholds
| Category | Min Coverage | Reorder Trigger |
|----------|-------------|----------------|
| A | 60 days | < 45 days projected |
| B | 45 days | < 30 days projected |
| C | 20 days | < 20 days projected |

### Action Flag Priority (computed per SKU)
```typescript
if total_coverage <= 7         → 'CRITICAL_OOS_RISK'
else if total_coverage <= 14   → 'OOS_RISK'
else if warehouse.available > 0 AND (amazon.coverage < trigger OR noon.coverage < trigger)
                               → 'SHIP_NOW'
else if projected_coverage < reorder_trigger
                               → 'REORDER'
else if total_coverage > min_coverage * 2.0
                               → 'EXCESS'
else                           → 'OK'
```

### Allocation (whole boxes, Amazon-first)
```typescript
boxes_for_amazon = floor(available_warehouse / units_per_box)
// Fill amazon to its reorder threshold first
// Remainder goes to noon
```

### ABC Classification (auto-computed daily, manually overridable)
```typescript
// Thresholds are NOT hardcoded — read from system_config table at runtime
// Thresholds set by operator after reviewing descriptive analysis report
A: units_90d >= system_config('abc_threshold_a')  AND  avg_net_profit_per_unit > 0
B: units_90d >= system_config('abc_threshold_b')  AND  avg_net_profit_per_unit > 0
C: everything else

// avg_net_profit_per_unit = (avg_sell_price_aed × 0.60) - (cogs_usd × 3.67)
// 0.60 = net after 40% blended marketplace fees (flat rate, same for all SKUs)
// If thresholds are null in system_config → skip auto-classification, leave computed_category = null
// Returns excluded from Phase 1 — add in future phase
// Written to sku_master.computed_category; only touches category if is_manually_classified = false
// Full spec + threshold analysis task: see ABC_Classification.md
```

### Noon CSV — Actual Format (order-level export)
The Noon file is NOT a snapshot — it is one row per order/unit sold.
```
Columns: id_partner, country_code, dest_country, item_nr, partner_sku, sku,
         status, offer_price, gmv_lcy, currency_code, brand_code, family,
         fulfillment_model, order_timestamp, shipment_timestamp, delivered_timestamp

SKU field:   partner_sku  (NOT the sku column — that is Noon's internal ID)
Date field:  order_timestamp

Status mapping:
  Sale   → Processing, Shipped, Delivered
  Return → Cancelled, CIR, Could Not Be Delivered

Parser logic:
  1. Filter rows where status IN ('Processing', 'Shipped', 'Delivered')
  2. Group by partner_sku + date(order_timestamp)
  3. count(*) = units_sold for that day → upsert to sales_snapshot(channel='noon')
  4. Separately tally returns per SKU for return_rate calculation
  5. NO inventory data in this file — Noon FBN available/inbound is separate
```

### PO Status Transitions (strictly enforced)
```typescript
VALID_TRANSITIONS = {
  draft: ['ordered'],
  ordered: ['shipped'],
  shipped: ['in_transit'],
  in_transit: ['arrived'],
  arrived: ['closed']
}
```

---

## 7. API Contracts

All Edge Functions are invoked at:
`https://<project>.supabase.co/functions/v1/<function-name>`

Authorization header: `Bearer <supabase_anon_key>` (or JWT from Supabase Auth)

### GET /functions/v1/dashboard
Response:
```json
{
  "alerts": [{ "sku": "SKU001", "name": "Product A", "risk": "OOS", "coverage_days": 3 }],
  "ship_now": [{ "sku": "SKU001", "boxes": 5, "units": 100, "destination": "amazon_fba", "plan_id": "uuid" }],
  "reorder_now": [{ "sku": "SKU002", "category": "A", "suggested_units": 500, "blended_sv": 10.5 }],
  "transfers": [{ "sku": "SKU003", "from": "locad_warehouse", "to": "noon_fbn", "units": 100 }],
  "inbound": [{ "po_number": "PO-001", "sku": "SKU001", "units": 200, "eta": "2026-03-05", "status": "in_transit" }],
  "excess": [{ "sku": "SKU004", "node": "amazon_fba", "coverage_days": 145 }],
  "last_synced": "2026-02-27T06:00:00Z"
}
```

### GET /functions/v1/skus?search=&category=
### GET /functions/v1/skus/:sku
```json
{
  "sku": "SKU001", "name": "Product A", "category": "A",
  "demand": { "sv_7": 12.5, "sv_90": 10.2, "blended_sv": 11.58 },
  "supply": {
    "amazon_fba": { "available": 120, "inbound": 50, "reserved": 10, "coverage_days": 10.4 },
    "noon_fbn": { "available": 60, "inbound": 0, "coverage_days": 5.2 },
    "locad_warehouse": { "available": 500, "inbound": 0, "coverage_days": 43.2 }
  },
  "total_coverage_days": 58.8,
  "projected_coverage_days": 72.1,
  "action_flag": "SHIP_NOW",
  "pending_pos": [{ "po_number": "PO-002", "units_incoming": 500, "eta": "2026-04-01" }]
}
```

### GET /functions/v1/po?status=&sku=&supplier=
### POST /functions/v1/po — `{ po_number, supplier, order_date, eta, line_items: [{sku, units_ordered}] }`
### PATCH /functions/v1/po/:id — `{ status }` or `{ eta, notes }`

### POST /functions/v1/upload-noon — multipart form with CSV file
Response: `{ rows_processed: N, skus_updated: [...], errors: [...] }`

### POST /functions/v1/sync/:source — source: `amazon | locad | all`
Response: `{ status: "ok", synced_at: "...", skus_processed: N }`

---

## 8. Agent Roles & Ownership

### Agent 0 — Orchestrator (master Claude Code session)
Initializes repo, schema, shared types, contracts, then spawns Agents 1–4 in parallel via Task tool.

### Agent 1 — Data Integration Engineer
**Owns:** `supabase/functions/_shared/saddl.ts`, `locad.ts`, `noon-csv.ts`, `supabase/functions/sync/`

1. Explore Saddl Postgres schema (information_schema) to find Amazon inventory + sales tables
2. Write `saddl.ts` — read-only Postgres client using `postgres` npm package in Deno context
3. Write `locad.ts` — JWT token management + inventory snapshot + inbound consignments
4. Write `noon-csv.ts` — CSV parser for operator uploads
5. Write `sync/index.ts` — orchestrates all three, upserts to Supabase, triggers metrics refresh

### Agent 2 — Decision Engine Engineer
**Owns:** `_shared/velocity.ts`, `coverage.ts`, `allocation.ts`, `reorder.ts`, `transfer.ts`, `supabase/functions/dashboard/`, `supabase/functions/skus/`

1. Write `velocity.ts` — BlendedSV from `sales_snapshot`
2. Write `coverage.ts` — coverage per node + projected (including POs)
3. Write `allocation.ts` — whole-box, Amazon-first
4. Write `reorder.ts` — trigger + suggested quantity
5. Write `transfer.ts` — cross-node recommendations
6. Write `dashboard/index.ts` — assembles Command Center response
7. Write `skus/index.ts` — list + detail endpoints

### Agent 3 — PO Register Engineer
**Owns:** `supabase/functions/po/`, `supabase/functions/upload-noon/`

1. Write `po/index.ts` — full CRUD with status transition validation
2. Write `upload-noon/index.ts` — multipart CSV → parse → upsert inventory/sales snapshots

### Agent 4 — Frontend Engineer
**Owns:** `frontend/` entirely

1. Vite + React + TypeScript + Tailwind + shadcn/ui setup
2. `lib/api.ts` — typed fetch client calling Supabase Edge Function URLs
3. Command Center (home) — Alerts → Ship Now → Reorder → Transfers → Inbound → Excess
4. SKU Detail page — demand metrics, supply by node, coverage bars, PO pipeline
5. PO Register page — table, create modal, status transitions
6. Upload Center — drag-and-drop Noon CSV with parse result feedback

### Agent 5 — QA Agent
**Owns:** test files for Edge Functions + frontend

---

## 9. Execution Timeline

```
Day 1-2   Orchestrator: repo init, schema migration, shared types, contracts
Days 2-7  Parallel: Agents 1, 2, 3, 4 work simultaneously
Days 8-10 QA Agent: tests, integration, edge cases
Days 10-14 Orchestrator: wire everything, deploy to Supabase + Vercel
Week 3-5  Hardening, real data testing, UI polish
```

---

## 10. Environment Variables

### Supabase Edge Functions (set via `supabase secrets set`)
```
SUPABASE_URL=https://<project>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service_role_key>
SADDL_DB_URL=postgresql://user:pass@host:5432/saddl_db
LOCAD_BASE_URL=https://dashboard.golocad.com
LOCAD_USERNAME=
LOCAD_PASSWORD=
LOCAD_BRAND_ID=
```

### Frontend `.env`
```
VITE_SUPABASE_URL=https://<project>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon_key>
```

---

## 11. MVP Checklist

- [ ] Amazon data syncs from Saddl Postgres (daily + manual trigger)
- [ ] Locad inventory and inbound syncs via API
- [ ] Noon CSV upload parses and writes to snapshots
- [ ] BlendedSV computes correctly for all active SKUs
- [ ] Coverage days display correctly per node and total
- [ ] Command Center shows correct Ship Now / Reorder / Transfer / Alerts
- [ ] PO Register supports full Draft → Closed lifecycle
- [ ] Frontend deployed on Vercel; Edge Functions deployed on Supabase
- [ ] All decision engine logic unit tested

---

## 12. Open Questions (resolve before build)

| # | Question | Impact |
|---|----------|--------|
| 1 | Where does the canonical SKU list live? (Saddl DB, Locad, or manual?) | Agent 1 seeding strategy |
| 2 | Exact Noon CSV column headers? (need a real sample file) | Agent 3 parser accuracy |
| 3 | How are SKU categories (A/B/C) assigned? Manual or in source data? | Data model + UI |
| 4 | Saddl DB connection string + read-only credentials ready? | Day 1 blocker for Agent 1 |
| 5 | Locad credentials (username, password, brand_id) ready? | Day 1 blocker for Agent 1 |
| 6 | Supabase project already created? | Day 1 blocker for Orchestrator |
