-- =========================================================
-- Migration 085: Performance Optimization Indexes
-- Resolves high CPU and full table scans during analytics,
-- sync queries, and dashboard metric calculations.
-- =========================================================

-- 1. sales_snapshot: queried by (country, saddl_id, sku, date)
CREATE INDEX IF NOT EXISTS idx_sales_snapshot_country_saddl_sku_date ON sales_snapshot (
    country,
    saddl_id,
    sku,
    date DESC
);

CREATE INDEX IF NOT EXISTS idx_sales_snapshot_date_channel ON sales_snapshot (date DESC, channel);

-- 2. inventory_snapshot: queried by (country, saddl_id, node, snapshot_date) and (sku)
CREATE INDEX IF NOT EXISTS idx_inventory_snapshot_lookup ON inventory_snapshot (
    country,
    saddl_id,
    sku,
    node,
    snapshot_date DESC
);

CREATE INDEX IF NOT EXISTS idx_inventory_snapshot_latest_node ON inventory_snapshot (
    node,
    country,
    saddl_id,
    snapshot_date DESC
);

-- 3. fact_sales (SCD Type 2): queried heavily in sales performance & summary RPCs
CREATE INDEX IF NOT EXISTS idx_fact_sales_perf_lookup ON fact_sales (
    saddl_id,
    is_current,
    date DESC
) INCLUDE (
    sales_channel,
    total_sales,
    total_units
);

CREATE INDEX IF NOT EXISTS idx_fact_sales_sku_date ON fact_sales (sku, date DESC)
WHERE
    is_current = true;

-- 4. fact_inventory_planning: queried for dashboard, inventory, and valuation
CREATE INDEX IF NOT EXISTS idx_fact_inventory_planning_country_saddl ON fact_inventory_planning (country, saddl_id, is_active);

-- 5. sku_master: queried on active SKUs and location filtering
CREATE INDEX IF NOT EXISTS idx_sku_master_active_country_saddl ON sku_master (country, saddl_id, is_active) INCLUDE (
    sku,
    name,
    category,
    sub_category,
    cogs,
    moq,
    lead_time_days
);

CREATE INDEX IF NOT EXISTS idx_sku_master_asin ON sku_master (asin)
WHERE
    asin IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sku_master_fnsku ON sku_master (fnsku)
WHERE
    fnsku IS NOT NULL;

-- 6. po_line_items & po_register: queried during incoming inventory aggregation
CREATE INDEX IF NOT EXISTS idx_po_line_items_sku ON po_line_items (sku, po_id);

CREATE INDEX IF NOT EXISTS idx_po_register_country_saddl_status ON po_register (country, saddl_id, status);

-- 7. allocation_plans: queried by sku, plan_date, status
CREATE INDEX IF NOT EXISTS idx_allocation_plans_lookup ON allocation_plans (
    country,
    saddl_id,
    sku,
    status,
    plan_date DESC
);