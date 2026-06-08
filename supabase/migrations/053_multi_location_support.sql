-- 053_multi_location_support.sql
-- Adds multi-location Amazon account support.
-- All existing data defaults to 'UAE' so nothing breaks.

-- ============================================================================
-- 1. amazon_locations — registry of Amazon Seller Central accounts
-- ============================================================================

CREATE TABLE IF NOT EXISTS amazon_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  country TEXT UNIQUE NOT NULL,            -- 'UAE', 'KSA', etc.
  saddl_account_id TEXT NOT NULL,          -- account_id in sc_raw.sales_traffic
  saddl_client_id TEXT NOT NULL,           -- client_id in sc_raw.fba_inventory
  display_name TEXT NOT NULL,              -- 'Amazon UAE', 'Amazon KSA'
  flag_emoji TEXT DEFAULT '🏳️',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE amazon_locations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all" ON amazon_locations FOR ALL TO authenticated USING (true);
CREATE POLICY "service_role_all" ON amazon_locations FOR ALL TO service_role USING (true);

-- Seed existing UAE + new KSA
INSERT INTO amazon_locations (country, saddl_account_id, saddl_client_id, display_name, flag_emoji, is_active) VALUES
  ('UAE', 's2c_uae_test', 's2c_uae_test', 'Amazon UAE', '🇦🇪', true),
  ('KSA', 's2c_test', 's2c_test', 'Amazon KSA', '🇸🇦', true)
ON CONFLICT (country) DO NOTHING;

-- ============================================================================
-- 2. Add `country` to sku_master (separate catalogs per location)
-- ============================================================================

ALTER TABLE sku_master ADD COLUMN IF NOT EXISTS country TEXT DEFAULT 'UAE';

-- All existing rows become UAE
UPDATE sku_master SET country = 'UAE' WHERE country IS NULL;

-- Drop the old UNIQUE on just `sku` and create composite unique
-- (only if the old constraint exists — safe to run multiple times)
DO $$
BEGIN
    -- 2a. Drop dependent foreign keys first
    IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'fact_purchase_sku_fkey') THEN
        ALTER TABLE fact_purchase DROP CONSTRAINT fact_purchase_sku_fkey;
    END IF;

    -- 2b. Drop existing unique/primary key constraints on sku_master
    IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'sku_master_sku_key') THEN
        ALTER TABLE sku_master DROP CONSTRAINT sku_master_sku_key;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'sku_master_pkey') THEN
        ALTER TABLE sku_master DROP CONSTRAINT sku_master_pkey;
    END IF;

    -- 2c. Add composite UNIQUE constraint for sku+country
    ALTER TABLE sku_master ADD CONSTRAINT sku_master_sku_country_key UNIQUE (sku, country);

    -- 2d. Recreate foreign keys
    ALTER TABLE fact_purchase ADD CONSTRAINT fact_purchase_sku_country_fkey FOREIGN KEY (sku, country) REFERENCES sku_master(sku, country);
END $$;

-- Index for fast country-filtered lookups
CREATE INDEX IF NOT EXISTS idx_sku_master_country ON sku_master (country);

-- ============================================================================
-- 3. Add `country` to demand_metrics (per-country metrics)
-- ============================================================================

ALTER TABLE demand_metrics ADD COLUMN IF NOT EXISTS country TEXT DEFAULT 'UAE';

-- Update existing rows
UPDATE demand_metrics SET country = 'UAE' WHERE country IS NULL;

-- Change PK from (sku) to (sku, country)
-- First drop the old PK
ALTER TABLE demand_metrics DROP CONSTRAINT IF EXISTS demand_metrics_pkey;

-- Create new composite PK
ALTER TABLE demand_metrics ADD PRIMARY KEY (sku, country);

-- Index for country filtering
CREATE INDEX IF NOT EXISTS idx_demand_metrics_country ON demand_metrics (country);

-- ============================================================================
-- 4. Add `country` to fact_inventory_planning
-- ============================================================================

ALTER TABLE fact_inventory_planning ADD COLUMN IF NOT EXISTS country TEXT DEFAULT 'UAE';

-- Update existing rows
UPDATE fact_inventory_planning SET country = 'UAE' WHERE country IS NULL;

-- Change PK from (sku) to (sku, country)
ALTER TABLE fact_inventory_planning DROP CONSTRAINT IF EXISTS fact_inventory_planning_pkey;
ALTER TABLE fact_inventory_planning ADD PRIMARY KEY (sku, country);

-- Also add product_category if missing (used by dashboard)
ALTER TABLE fact_inventory_planning ADD COLUMN IF NOT EXISTS product_category TEXT;

-- ============================================================================
-- 6. Recreate refresh_fact_inventory_planning() — now country-aware
--    Builds one row per (sku, country) by filtering all source tables by country.
-- ============================================================================

CREATE OR REPLACE FUNCTION refresh_fact_inventory_planning()
RETURNS void AS $$
DECLARE
  loc RECORD;
BEGIN
  -- Truncate the whole table then rebuild per-country
  TRUNCATE TABLE fact_inventory_planning;

  -- Loop through each active location
  FOR loc IN SELECT country FROM amazon_locations WHERE is_active = true
  LOOP
    INSERT INTO fact_inventory_planning (
        sku, country, category, sub_category, product_category, action_flag,
        fba_units, amazon_sv,
        fbn_units, noon_sv,
        minutes_units, minutes_sv,
        locad_units, locad_boxes, units_per_box,
        blended_sv, required_30d, stock_in_hand, shortfall, moq,
        amazon_coverage, noon_coverage, total_coverage,
        cogs,
        suggested_reorder_qty, already_ordered, pending_qty_to_reorder, total_reorder_cost,
        send_to_fba_units, send_to_fbn_units, fba_boxes, fbn_boxes,
        is_active
    )

    WITH latest_date_per_node AS (
        SELECT node, MAX(snapshot_date) as max_date
        FROM public.inventory_snapshot
        WHERE node IN ('noon_fbn', 'Minutes')
          AND country = loc.country
        GROUP BY node
    ),

    latest_snapshot AS (
        SELECT sku, node, available, warehouse_name, snapshot_date,
               ROW_NUMBER() OVER (PARTITION BY sku, node, warehouse_name ORDER BY snapshot_date DESC) AS rn
        FROM public.inventory_snapshot
        WHERE node IN ('amazon_fba', 'locad_warehouse')
          AND country = loc.country

        UNION ALL

        SELECT i.sku, i.node, i.available, i.warehouse_name, i.snapshot_date, 1 AS rn
        FROM public.inventory_snapshot i
        JOIN latest_date_per_node l ON i.node = l.node AND i.snapshot_date = l.max_date
        WHERE i.country = loc.country
    ),

    inventory_data AS (
        SELECT ls.sku,
          SUM(CASE WHEN ls.node = 'amazon_fba' THEN ls.available ELSE 0 END) AS fba_units,
          SUM(CASE WHEN ls.node = 'noon_fbn' THEN ls.available ELSE 0 END) AS fbn_units,
          SUM(CASE WHEN ls.node = 'Minutes' THEN ls.available ELSE 0 END) AS minutes_units,
          SUM(CASE WHEN ls.node = 'locad_warehouse' THEN ls.available ELSE 0 END) AS locad_boxes
        FROM latest_snapshot ls
        WHERE rn = 1
        GROUP BY ls.sku
    ),

    sales_pivot AS (
        SELECT sku,
          SUM(CASE WHEN channel = 'amazon' THEN units_sold ELSE 0 END) AS amazon_units,
          SUM(CASE WHEN channel = 'noon' THEN units_sold ELSE 0 END) AS noon_units,
          SUM(CASE WHEN channel = 'noon_minutes' THEN units_sold ELSE 0 END) AS minutes_sales_units
        FROM sales_snapshot
        WHERE date >= CURRENT_DATE - INTERVAL '30 days'
          AND country = loc.country
        GROUP BY sku
    ),

    fact_purchase_agg AS (
        SELECT sku,
          SUM(COALESCE(units_ordered, 0) - COALESCE(units_received, 0)) AS pending_ordered
        FROM fact_purchase
        WHERE LOWER(TRIM(status)) IN ('ordered', 'shipped', 'in_transit')
          AND COALESCE(country, 'UAE') = loc.country
        GROUP BY sku
    ),

    base AS (
        SELECT i.sku,
          COALESCE(i.fba_units, 0) AS fba_units,
          COALESCE(i.fbn_units, 0) AS fbn_units,
          COALESCE(i.minutes_units, 0) AS minutes_units,
          COALESCE(i.locad_boxes, 0) AS locad_boxes,
          sm.category, sm.sub_category, sm.product_category,
          sm.moq, sm.units_per_box, sm.cogs,
          COALESCE(sm.amazon_active, true) AS amazon_active,
          COALESCE(sm.noon_active, true) AS noon_active,
          COALESCE(i.locad_boxes, 0) * COALESCE(NULLIF(sm.units_per_box, 0), 1) AS locad_units,
          COALESCE(sp.amazon_units, 0) / 30.0 AS amazon_sv,
          COALESCE(sp.noon_units, 0) / 30.0 AS noon_sv,
          COALESCE(sp.minutes_sales_units, 0) / 30.0 AS minutes_sv,
          (COALESCE(sp.amazon_units, 0) + COALESCE(sp.noon_units, 0) + COALESCE(sp.minutes_sales_units, 0)) / 30.0 AS blended_sv,
          COALESCE(sp.amazon_units, 0) AS amazon_required_30,
          COALESCE(sp.noon_units, 0) AS noon_required_30,
          COALESCE(sp.minutes_sales_units, 0) AS minutes_required_30,
          sm.is_active
        FROM sku_master sm
        LEFT JOIN inventory_data i ON sm.sku = i.sku
        LEFT JOIN sales_pivot sp ON sm.sku = sp.sku
        WHERE sm.country = loc.country
    ),

    final_calc AS (
        SELECT *,
          (fba_units + fbn_units + minutes_units + locad_units) AS stock_in_hand,
          (blended_sv * CASE WHEN category = 'A' THEN 60 WHEN category = 'B' THEN 45 ELSE 30 END) AS dynamic_required,
          GREATEST(
            (blended_sv * CASE WHEN category = 'A' THEN 60 WHEN category = 'B' THEN 45 ELSE 30 END) -
            (fba_units + fbn_units + minutes_units + locad_units), 0
          ) AS shortfall,
          CASE WHEN amazon_sv > 0 THEN fba_units / amazon_sv ELSE 0 END AS amazon_coverage,
          CASE WHEN noon_sv > 0 THEN fbn_units / noon_sv ELSE 0 END AS noon_coverage,
          CASE WHEN blended_sv > 0 THEN (fba_units + fbn_units + minutes_units + locad_units) / blended_sv ELSE 0 END AS total_coverage,
          CASE
            WHEN GREATEST(
              (blended_sv * CASE WHEN category = 'A' THEN 60 WHEN category = 'B' THEN 45 ELSE 30 END) -
              (fba_units + fbn_units + minutes_units + locad_units), 0
            ) < NULLIF(units_per_box, 0) THEN 0
            WHEN is_active = FALSE THEN 0
            ELSE GREATEST(
              moq,
              CEIL(
                GREATEST(
                  (blended_sv * CASE WHEN category = 'A' THEN 60 WHEN category = 'B' THEN 45 ELSE 30 END) -
                  (fba_units + fbn_units + minutes_units + locad_units), 0
                ) / NULLIF(units_per_box, 0)
              ) * units_per_box
            )
          END AS suggested_reorder_qty
        FROM base
    ),

    allocation_step1 AS (
        SELECT *,
          CASE
            WHEN amazon_active = false THEN 0
            WHEN fba_units <= 0 AND amazon_sv <= 0 THEN 1
            WHEN fba_units < units_per_box AND amazon_sv > 0 THEN
              GREATEST(1, COALESCE(CEIL(GREATEST(0, amazon_required_30 - fba_units) / NULLIF(units_per_box, 0)), 0))
            ELSE COALESCE(CEIL(GREATEST(0, amazon_required_30 - fba_units) / NULLIF(units_per_box, 0)), 0)
          END AS fba_need_boxes,
          CASE
            WHEN noon_active = false THEN 0
            WHEN fbn_units <= 0 AND noon_sv <= 0 THEN 1
            WHEN fbn_units < units_per_box AND noon_sv > 0 THEN
              GREATEST(1, COALESCE(CEIL(GREATEST(0, noon_required_30 - fbn_units) / NULLIF(units_per_box, 0)), 0))
            ELSE COALESCE(CEIL(GREATEST(0, noon_required_30 - fbn_units) / NULLIF(units_per_box, 0)), 0)
          END AS fbn_need_boxes
        FROM final_calc
    ),

    allocation AS (
        SELECT *,
          CASE WHEN is_active = FALSE THEN 0 ELSE LEAST(locad_boxes, fba_need_boxes) * units_per_box END AS send_to_fba,
          CASE WHEN is_active = FALSE THEN 0 ELSE LEAST(GREATEST(0, locad_boxes - fba_need_boxes), fbn_need_boxes) * units_per_box END AS send_to_fbn
        FROM allocation_step1
    )

    SELECT
      a.sku, loc.country, a.category, a.sub_category, a.product_category,
      CASE
        WHEN blended_sv = 0 THEN 'NO SALES'
        WHEN total_coverage < 15 THEN 'URGENT'
        WHEN total_coverage < 30 THEN 'REORDER'
        ELSE 'OK'
      END AS action_flag,
      fba_units, ROUND(amazon_sv, 2),
      fbn_units, ROUND(noon_sv, 2),
      minutes_units, ROUND(minutes_sv, 2),
      locad_units, locad_boxes, units_per_box,
      ROUND(blended_sv, 2),
      ROUND(dynamic_required, 2), stock_in_hand, shortfall, moq,
      ROUND(amazon_coverage, 2), ROUND(noon_coverage, 2), ROUND(total_coverage, 2),
      cogs,
      suggested_reorder_qty,
      COALESCE(pa.pending_ordered, 0) AS already_ordered,
      GREATEST(0, suggested_reorder_qty - COALESCE(pa.pending_ordered, 0)) AS pending_qty_to_reorder,
      GREATEST(0, suggested_reorder_qty - COALESCE(pa.pending_ordered, 0)) * cogs AS total_reorder_cost,
      send_to_fba, send_to_fbn,
      send_to_fba / NULLIF(units_per_box, 0) AS fba_boxes,
      send_to_fbn / NULLIF(units_per_box, 0) AS fbn_boxes,
      is_active
    FROM allocation a
    LEFT JOIN fact_purchase_agg pa ON a.sku = pa.sku;

  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 7. Update get_inventory_valuation_totals RPC to accept country
-- ============================================================================

CREATE OR REPLACE FUNCTION get_inventory_valuation_totals(p_country TEXT DEFAULT 'UAE')
RETURNS TABLE (
  fba_total_cogs NUMERIC,
  fbn_total_cogs NUMERIC,
  minutes_total_cogs NUMERIC,
  locad_total_cogs NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COALESCE(SUM(fba_units * cogs), 0) AS fba_total_cogs,
    COALESCE(SUM(fbn_units * cogs), 0) AS fbn_total_cogs,
    COALESCE(SUM(minutes_units * cogs), 0) AS minutes_total_cogs,
    COALESCE(SUM(locad_units * cogs), 0) AS locad_total_cogs
  FROM fact_inventory_planning
  WHERE country = p_country
    AND is_active = true;
END;
$$ LANGUAGE plpgsql;
