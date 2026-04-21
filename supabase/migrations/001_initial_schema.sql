CREATE TABLE sku_master (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku TEXT UNIQUE NOT NULL,
  name TEXT,
  asin TEXT,
  fnsku TEXT,
  category TEXT CHECK (category IN ('A', 'B', 'C')),
  sub_category TEXT,
  units_per_box INTEGER NOT NULL DEFAULT 1,
  moq INTEGER,
  lead_time_days INTEGER,
  cogs NUMERIC,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE sales_snapshot (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku TEXT REFERENCES sku_master(sku),
  date DATE NOT NULL,
  channel TEXT CHECK (channel IN ('amazon', 'noon')),
  units_sold INTEGER NOT NULL DEFAULT 0,
  synced_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(sku, date, channel)
);

CREATE TABLE inventory_snapshot (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku TEXT REFERENCES sku_master(sku),
  node TEXT CHECK (node IN ('amazon_fba', 'noon_fbn', 'locad_warehouse')),
  -- warehouse_name: NULL for amazon_fba/noon_fbn; Locad facility name for locad_warehouse.
  -- e.g. 'LOCAD Umm Ramool FC'. Supports future second warehouse without schema change.
  -- Decision Engine SUMs available across all warehouse_name values per (sku, node, snapshot_date).
  warehouse_name TEXT DEFAULT NULL,
  available INTEGER DEFAULT 0,
  inbound INTEGER DEFAULT 0,
  reserved INTEGER DEFAULT 0,
  snapshot_date DATE NOT NULL,
  synced_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(sku, node, warehouse_name, snapshot_date)
);

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

CREATE TABLE po_line_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id UUID REFERENCES po_register(id) ON DELETE CASCADE,
  sku TEXT REFERENCES sku_master(sku),
  units_ordered INTEGER NOT NULL,
  units_received INTEGER DEFAULT 0
);

CREATE TABLE allocation_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku TEXT REFERENCES sku_master(sku),
  plan_date DATE NOT NULL,
  node TEXT,
  boxes_to_ship INTEGER,
  units_to_ship INTEGER,
  status TEXT CHECK (status IN ('pending','approved','shipped')) DEFAULT 'pending',
  generated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (sku, node, plan_date)
);

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
  total_available NUMERIC,
  incoming_po_units NUMERIC,
  should_reorder BOOLEAN DEFAULT false,
  suggested_reorder_units INTEGER DEFAULT 0,
  action_flag TEXT,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Locad SKU mapping — translates Locad's SKU codes to our internal sku_master SKUs
-- Required because Locad uses descriptive codes (e.g. "12OZCMAMBERLEAF") while
-- sku_master uses Amazon-assigned codes. Only 23% match directly in Phase 1 data.
CREATE TABLE locad_sku_map (
  locad_sku    TEXT PRIMARY KEY,
  internal_sku TEXT NOT NULL REFERENCES sku_master(sku),
  matched_by   TEXT DEFAULT 'manual',  -- 'exact' | 'fnsku' | 'manual'
  notes        TEXT,
  created_at   TIMESTAMPTZ DEFAULT now()
);

-- Audit log for manual Locad xlsx uploads
CREATE TABLE locad_upload_log (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filename       TEXT NOT NULL,
  report_date    DATE NOT NULL,
  rows_total     INTEGER,
  rows_matched   INTEGER,
  rows_unmatched INTEGER,
  unmatched_skus TEXT[],  -- locad_sku values with no mapping yet
  status         TEXT CHECK (status IN ('processed', 'partial', 'error')) DEFAULT 'processed',
  uploaded_at    TIMESTAMPTZ DEFAULT now()
);

-- system_config — runtime configuration values (thresholds, rates)
-- Read at runtime; never hardcode these in business logic
CREATE TABLE system_config (
  key         TEXT PRIMARY KEY,
  value       TEXT,
  description TEXT,
  updated_at  TIMESTAMPTZ DEFAULT now()
);

INSERT INTO system_config (key, value, description) VALUES
  ('abc_threshold_a', NULL,   'Min 90-day units for Category A — set after threshold analysis'),
  ('abc_threshold_b', NULL,   'Min 90-day units for Category B — set after threshold analysis'),
  ('abc_fee_rate',    '0.40', 'Blended marketplace fee rate applied to sell price'),
  ('abc_usd_to_aed',  '3.67', 'USD to AED conversion rate for COGS');

-- RLS (authenticated users only)
ALTER TABLE sku_master ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_snapshot ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_snapshot ENABLE ROW LEVEL SECURITY;
ALTER TABLE po_register ENABLE ROW LEVEL SECURITY;
ALTER TABLE po_line_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE allocation_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE demand_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE locad_sku_map ENABLE ROW LEVEL SECURITY;
ALTER TABLE locad_upload_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_all" ON sku_master FOR ALL TO authenticated USING (true);
CREATE POLICY "auth_all" ON sales_snapshot FOR ALL TO authenticated USING (true);
CREATE POLICY "auth_all" ON inventory_snapshot FOR ALL TO authenticated USING (true);
CREATE POLICY "auth_all" ON po_register FOR ALL TO authenticated USING (true);
CREATE POLICY "auth_all" ON po_line_items FOR ALL TO authenticated USING (true);
CREATE POLICY "auth_all" ON allocation_plans FOR ALL TO authenticated USING (true);
CREATE POLICY "auth_all" ON demand_metrics FOR ALL TO authenticated USING (true);
CREATE POLICY "auth_all" ON locad_sku_map FOR ALL TO authenticated USING (true);
CREATE POLICY "auth_all" ON locad_upload_log FOR ALL TO authenticated USING (true);
CREATE POLICY "auth_all" ON system_config FOR ALL TO authenticated USING (true);

-- Service role bypass (Edge Functions use service role key)
CREATE POLICY "service_role_all" ON sku_master FOR ALL TO service_role USING (true);
CREATE POLICY "service_role_all" ON sales_snapshot FOR ALL TO service_role USING (true);
CREATE POLICY "service_role_all" ON inventory_snapshot FOR ALL TO service_role USING (true);
CREATE POLICY "service_role_all" ON po_register FOR ALL TO service_role USING (true);
CREATE POLICY "service_role_all" ON po_line_items FOR ALL TO service_role USING (true);
CREATE POLICY "service_role_all" ON allocation_plans FOR ALL TO service_role USING (true);
CREATE POLICY "service_role_all" ON demand_metrics FOR ALL TO service_role USING (true);
CREATE POLICY "service_role_all" ON locad_sku_map FOR ALL TO service_role USING (true);
CREATE POLICY "service_role_all" ON locad_upload_log FOR ALL TO service_role USING (true);
CREATE POLICY "service_role_all" ON system_config FOR ALL TO service_role USING (true);
