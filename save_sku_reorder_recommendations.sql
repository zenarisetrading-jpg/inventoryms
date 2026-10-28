-- Run this in Supabase SQL Editor to create and populate the `sku_reorder_recommendations` table
-- (Also saved in supabase/migrations/095_create_sku_reorder_recommendations_table.sql)

CREATE TABLE IF NOT EXISTS public.sku_reorder_recommendations (
    sku TEXT NOT NULL,
    country TEXT NOT NULL DEFAULT 'UAE',
    saddl_id TEXT NOT NULL DEFAULT 's2c_uae_test',
    product_name TEXT,
    brand TEXT DEFAULT 'S2C',
    cat TEXT NOT NULL DEFAULT 'C',
    planning_to_discontinue BOOLEAN NOT NULL DEFAULT FALSE,
    daily_sales NUMERIC(12, 3) NOT NULL DEFAULT 0,
    available_stock NUMERIC(12, 0) NOT NULL DEFAULT 0,
    days_left NUMERIC(12, 1),
    target_days INTEGER NOT NULL DEFAULT 30,
    target_stock NUMERIC(12, 0) NOT NULL DEFAULT 0,
    reorder_qty NUMERIC(12, 0) NOT NULL DEFAULT 0,
    existing_po_qty NUMERIC(12, 0) NOT NULL DEFAULT 0,
    remaining_reorder_qty NUMERIC(12, 0) NOT NULL DEFAULT 0,
    moq NUMERIC(12, 0) NOT NULL DEFAULT 0,
    suggested_order_qty NUMERIC(12, 0) NOT NULL DEFAULT 0,
    unit_cost NUMERIC(12, 2) NOT NULL DEFAULT 0,
    total_reorder_cost NUMERIC(14, 2) NOT NULL DEFAULT 0,

    -- Channel & supply chain breakdown
    fba_units NUMERIC(12, 0) NOT NULL DEFAULT 0,
    fbn_units NUMERIC(12, 0) NOT NULL DEFAULT 0,
    minutes_units NUMERIC(12, 0) NOT NULL DEFAULT 0,
    locad_units NUMERIC(12, 0) NOT NULL DEFAULT 0,
    locad_boxes NUMERIC(12, 0) NOT NULL DEFAULT 0,
    amazon_sv NUMERIC(12, 3) NOT NULL DEFAULT 0,
    noon_sv NUMERIC(12, 3) NOT NULL DEFAULT 0,
    minutes_sv NUMERIC(12, 3) NOT NULL DEFAULT 0,
    blended_sv NUMERIC(12, 3) NOT NULL DEFAULT 0,
    case_pack INTEGER NOT NULL DEFAULT 1,
    lead_time_days INTEGER NOT NULL DEFAULT 45,
    supplier TEXT DEFAULT 'Direct Supplier',

    -- Flags
    is_zero_sales BOOLEAN NOT NULL DEFAULT FALSE,
    is_missing_cost BOOLEAN NOT NULL DEFAULT FALSE,
    is_missing_moq BOOLEAN NOT NULL DEFAULT FALSE,
    is_moq_applied BOOLEAN NOT NULL DEFAULT FALSE,
    is_case_pack_applied BOOLEAN NOT NULL DEFAULT FALSE,
    is_reorder_required BOOLEAN NOT NULL DEFAULT FALSE,
    is_zero_stock BOOLEAN NOT NULL DEFAULT FALSE,
    is_low_days BOOLEAN NOT NULL DEFAULT FALSE,
    is_stockout_risk BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,

    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT sku_reorder_recommendations_pkey PRIMARY KEY (sku, country, saddl_id)
);

CREATE INDEX IF NOT EXISTS idx_sku_reorder_recommendations_lookup
    ON public.sku_reorder_recommendations (country, saddl_id, cat);

CREATE INDEX IF NOT EXISTS idx_sku_reorder_recommendations_reorder_req
    ON public.sku_reorder_recommendations (country, saddl_id, is_reorder_required);

ALTER TABLE public.sku_reorder_recommendations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow_all_sku_reorder_recommendations" ON public.sku_reorder_recommendations;
CREATE POLICY "allow_all_sku_reorder_recommendations"
    ON public.sku_reorder_recommendations
    FOR ALL
    USING (true)
    WITH CHECK (true);

GRANT ALL ON public.sku_reorder_recommendations TO anon, authenticated, service_role;

SELECT public.refresh_sku_reorder_recommendations();

NOTIFY pgrst, 'reload schema';

