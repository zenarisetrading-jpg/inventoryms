-- Migration 095: Create and Populate sku_reorder_recommendations Table
-- Stores the SKU-Wise Reorder Dashboard table rows in Supabase, preserving planning_to_discontinue state.

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

-- Function to refresh/populate sku_reorder_recommendations from live inventory, sales, and PO tables
-- while preserving user-toggled planning_to_discontinue flags.
CREATE OR REPLACE FUNCTION public.refresh_sku_reorder_recommendations(
    p_target_days_a INTEGER DEFAULT 60,
    p_target_days_b INTEGER DEFAULT 45,
    p_target_days_c INTEGER DEFAULT 30,
    p_apply_moq BOOLEAN DEFAULT TRUE,
    p_apply_case_pack BOOLEAN DEFAULT TRUE
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Remove SKUs that are no longer active in sku_master
    DELETE FROM public.sku_reorder_recommendations r
    WHERE NOT EXISTS (
        SELECT 1 FROM public.sku_master sm
        WHERE sm.sku = r.sku
          AND sm.country = r.country
          AND sm.saddl_id = r.saddl_id
          AND COALESCE(sm.is_active, true) = true
    );

    -- Upsert all active SKUs with exact Reorder Dashboard calculations
    WITH po_supplier AS (
        SELECT DISTINCT ON (sku, COALESCE(country, 'UAE'), saddl_id)
            sku,
            COALESCE(country, 'UAE') AS country,
            saddl_id,
            supplier
        FROM public.fact_purchase
        WHERE supplier IS NOT NULL AND TRIM(supplier) <> ''
        ORDER BY sku, COALESCE(country, 'UAE'), saddl_id, order_date DESC NULLS LAST
    ),
    raw_data AS (
        SELECT
            f.sku,
            f.country,
            f.saddl_id,
            COALESCE(sm.name, f.sku) AS product_name,
            CASE
                WHEN COALESCE(sm.name, '') ILIKE 'PETSLY%' OR f.sku ILIKE 'PTSLY%' THEN 'PETSLY'
                WHEN COALESCE(sm.name, '') ILIKE 'Bath & Relax%' THEN 'Bath & Relax'
                WHEN COALESCE(sm.name, '') ILIKE 'Raymond Home%' THEN 'Raymond Home'
                ELSE 'S2C'
            END AS brand,
            CASE
                WHEN UPPER(TRIM(COALESCE(f.category, sm.category, 'C'))) IN ('A', 'B', 'C')
                THEN UPPER(TRIM(COALESCE(f.category, sm.category, 'C')))
                ELSE 'C'
            END AS cat,
            COALESCE(existing.planning_to_discontinue, FALSE) AS planning_to_discontinue,
            GREATEST(0, COALESCE(f.fba_units, 0))::numeric AS fba_units,
            GREATEST(0, COALESCE(f.fbn_units, 0))::numeric AS fbn_units,
            GREATEST(0, COALESCE(f.minutes_units, 0))::numeric AS minutes_units,
            GREATEST(0, COALESCE(f.locad_units, 0))::numeric AS locad_units,
            GREATEST(0, COALESCE(f.locad_boxes, 0))::numeric AS locad_boxes,
            GREATEST(0, COALESCE(f.amazon_sv, 0))::numeric AS amazon_sv,
            GREATEST(0, COALESCE(f.noon_sv, 0))::numeric AS noon_sv,
            GREATEST(0, COALESCE(f.minutes_sv, 0))::numeric AS minutes_sv,
            GREATEST(0, COALESCE(f.blended_sv, 0))::numeric AS blended_sv,
            GREATEST(0, COALESCE(f.moq, sm.moq, 0))::numeric AS moq,
            GREATEST(1, COALESCE(NULLIF(f.units_per_box, 0), NULLIF(sm.units_per_box, 0), 1))::integer AS case_pack,
            COALESCE(NULLIF(sm.lead_time_days, 0), 45)::integer AS lead_time_days,
            CASE
                WHEN COALESCE(f.cogs, sm.cogs, 0) > 0 THEN ROUND(COALESCE(f.cogs, sm.cogs, 0)::numeric, 2)
                WHEN COALESCE(sm.landing_cost, 0) > 0 THEN ROUND(sm.landing_cost::numeric, 2)
                ELSE 0
            END AS unit_cost,
            GREATEST(0, COALESCE(f.already_ordered, 0))::numeric AS existing_po_qty,
            COALESCE(ps.supplier, 'Direct Supplier') AS supplier,
            COALESCE(f.is_active, true) AS is_active
        FROM public.fact_inventory_planning f
        INNER JOIN public.sku_master sm
            ON sm.sku = f.sku
           AND sm.country = f.country
           AND sm.saddl_id = f.saddl_id
        LEFT JOIN po_supplier ps
            ON ps.sku = f.sku
           AND ps.country = f.country
           AND ps.saddl_id = f.saddl_id
        LEFT JOIN public.sku_reorder_recommendations existing
            ON existing.sku = f.sku
           AND existing.country = f.country
           AND existing.saddl_id = f.saddl_id
        WHERE COALESCE(f.is_active, true) = true
          AND COALESCE(sm.is_active, true) = true
    ),
    step1 AS (
        SELECT
            r.*,
            ROUND((r.amazon_sv + r.noon_sv + r.minutes_sv)::numeric, 3) AS daily_sales,
            (r.fba_units + r.fbn_units + r.minutes_units + r.locad_units) AS available_stock,
            CASE
                WHEN r.cat = 'A' THEN p_target_days_a
                WHEN r.cat = 'B' THEN p_target_days_b
                ELSE p_target_days_c
            END AS target_days
        FROM raw_data r
    ),
    step2 AS (
        SELECT
            s1.*,
            (s1.daily_sales <= 0) AS is_zero_sales,
            CASE
                WHEN s1.daily_sales <= 0 AND s1.available_stock = 0 THEN 0::numeric
                WHEN s1.daily_sales <= 0 THEN NULL::numeric
                ELSE ROUND((s1.available_stock / s1.daily_sales)::numeric, 1)
            END AS days_left,
            CASE
                WHEN s1.daily_sales <= 0 AND s1.available_stock = 0 THEN s1.moq
                WHEN s1.daily_sales <= 0 THEN 0
                ELSE CEIL(s1.daily_sales * s1.target_days)
            END AS calc_target_stock,
            CASE
                WHEN s1.daily_sales <= 0 AND s1.available_stock = 0 THEN s1.moq
                WHEN s1.daily_sales <= 0 THEN 0
                ELSE GREATEST(0, CEIL(s1.daily_sales * s1.target_days) - s1.available_stock)
            END AS calc_reorder_qty
        FROM step1 s1
    ),
    step3 AS (
        SELECT
            s2.*,
            s2.calc_target_stock AS target_stock,
            CASE WHEN s2.planning_to_discontinue THEN 0 ELSE s2.calc_reorder_qty END AS reorder_qty,
            CASE
                WHEN s2.planning_to_discontinue THEN 0
                ELSE GREATEST(0, s2.calc_reorder_qty - s2.existing_po_qty)
            END AS remaining_reorder_qty
        FROM step2 s2
    ),
    step4 AS (
        SELECT
            s3.*,
            CASE
                WHEN s3.planning_to_discontinue OR s3.remaining_reorder_qty <= 0 THEN 0
                WHEN p_apply_moq AND s3.moq > 0 AND s3.remaining_reorder_qty < s3.moq THEN s3.moq
                ELSE s3.remaining_reorder_qty
            END AS after_moq_qty,
            CASE
                WHEN NOT s3.planning_to_discontinue
                     AND s3.remaining_reorder_qty > 0
                     AND p_apply_moq
                     AND s3.moq > 0
                     AND s3.remaining_reorder_qty < s3.moq
                THEN TRUE
                ELSE FALSE
            END AS is_moq_applied
        FROM step3 s3
    ),
    step5 AS (
        SELECT
            s4.*,
            CASE
                WHEN s4.planning_to_discontinue OR s4.after_moq_qty <= 0 THEN 0
                WHEN p_apply_case_pack AND s4.case_pack > 1
                THEN CEIL(s4.after_moq_qty / s4.case_pack::numeric) * s4.case_pack
                ELSE s4.after_moq_qty
            END AS suggested_order_qty,
            CASE
                WHEN NOT s4.planning_to_discontinue
                     AND s4.after_moq_qty > 0
                     AND p_apply_case_pack
                     AND s4.case_pack > 1
                     AND (CEIL(s4.after_moq_qty / s4.case_pack::numeric) * s4.case_pack) > s4.after_moq_qty
                THEN TRUE
                ELSE FALSE
            END AS is_case_pack_applied
        FROM step4 s4
    )
    INSERT INTO public.sku_reorder_recommendations (
        sku, country, saddl_id, product_name, brand, cat, planning_to_discontinue,
        daily_sales, available_stock, days_left, target_days, target_stock,
        reorder_qty, existing_po_qty, remaining_reorder_qty, moq,
        suggested_order_qty, unit_cost, total_reorder_cost,
        fba_units, fbn_units, minutes_units, locad_units, locad_boxes,
        amazon_sv, noon_sv, minutes_sv, blended_sv,
        case_pack, lead_time_days, supplier,
        is_zero_sales, is_missing_cost, is_missing_moq,
        is_moq_applied, is_case_pack_applied, is_reorder_required,
        is_zero_stock, is_low_days, is_stockout_risk, is_active, updated_at
    )
    SELECT
        s5.sku,
        s5.country,
        s5.saddl_id,
        s5.product_name,
        s5.brand,
        s5.cat,
        s5.planning_to_discontinue,
        s5.daily_sales,
        s5.available_stock,
        s5.days_left,
        s5.target_days,
        s5.target_stock,
        s5.reorder_qty,
        s5.existing_po_qty,
        s5.remaining_reorder_qty,
        s5.moq,
        s5.suggested_order_qty,
        s5.unit_cost,
        CASE
            WHEN s5.planning_to_discontinue OR s5.unit_cost <= 0 THEN 0
            ELSE ROUND((s5.suggested_order_qty * s5.unit_cost)::numeric, 2)
        END AS total_reorder_cost,
        s5.fba_units,
        s5.fbn_units,
        s5.minutes_units,
        s5.locad_units,
        s5.locad_boxes,
        s5.amazon_sv,
        s5.noon_sv,
        s5.minutes_sv,
        s5.blended_sv,
        s5.case_pack,
        s5.lead_time_days,
        s5.supplier,
        s5.is_zero_sales,
        (s5.unit_cost <= 0) AS is_missing_cost,
        (s5.moq <= 0 AND (s5.remaining_reorder_qty > 0 OR (s5.is_zero_sales AND s5.available_stock = 0))) AS is_missing_moq,
        s5.is_moq_applied,
        s5.is_case_pack_applied,
        CASE
            WHEN s5.planning_to_discontinue THEN FALSE
            ELSE (s5.remaining_reorder_qty > 0 OR s5.suggested_order_qty > 0)
        END AS is_reorder_required,
        (s5.available_stock = 0) AS is_zero_stock,
        (s5.days_left IS NOT NULL AND (s5.days_left < 15 OR s5.days_left < s5.target_days)) AS is_low_days,
        (s5.available_stock = 0 OR (s5.days_left IS NOT NULL AND s5.days_left < s5.lead_time_days)) AS is_stockout_risk,
        s5.is_active,
        NOW()
    FROM step5 s5
    ON CONFLICT (sku, country, saddl_id)
    DO UPDATE SET
        product_name = EXCLUDED.product_name,
        brand = EXCLUDED.brand,
        cat = EXCLUDED.cat,
        planning_to_discontinue = EXCLUDED.planning_to_discontinue,
        daily_sales = EXCLUDED.daily_sales,
        available_stock = EXCLUDED.available_stock,
        days_left = EXCLUDED.days_left,
        target_days = EXCLUDED.target_days,
        target_stock = EXCLUDED.target_stock,
        reorder_qty = EXCLUDED.reorder_qty,
        existing_po_qty = EXCLUDED.existing_po_qty,
        remaining_reorder_qty = EXCLUDED.remaining_reorder_qty,
        moq = EXCLUDED.moq,
        suggested_order_qty = EXCLUDED.suggested_order_qty,
        unit_cost = EXCLUDED.unit_cost,
        total_reorder_cost = EXCLUDED.total_reorder_cost,
        fba_units = EXCLUDED.fba_units,
        fbn_units = EXCLUDED.fbn_units,
        minutes_units = EXCLUDED.minutes_units,
        locad_units = EXCLUDED.locad_units,
        locad_boxes = EXCLUDED.locad_boxes,
        amazon_sv = EXCLUDED.amazon_sv,
        noon_sv = EXCLUDED.noon_sv,
        minutes_sv = EXCLUDED.minutes_sv,
        blended_sv = EXCLUDED.blended_sv,
        case_pack = EXCLUDED.case_pack,
        lead_time_days = EXCLUDED.lead_time_days,
        supplier = EXCLUDED.supplier,
        is_zero_sales = EXCLUDED.is_zero_sales,
        is_missing_cost = EXCLUDED.is_missing_cost,
        is_missing_moq = EXCLUDED.is_missing_moq,
        is_moq_applied = EXCLUDED.is_moq_applied,
        is_case_pack_applied = EXCLUDED.is_case_pack_applied,
        is_reorder_required = EXCLUDED.is_reorder_required,
        is_zero_stock = EXCLUDED.is_zero_stock,
        is_low_days = EXCLUDED.is_low_days,
        is_stockout_risk = EXCLUDED.is_stockout_risk,
        is_active = EXCLUDED.is_active,
        updated_at = NOW();
END;
$$;

GRANT EXECUTE ON FUNCTION public.refresh_sku_reorder_recommendations(INTEGER, INTEGER, INTEGER, BOOLEAN, BOOLEAN) TO anon, authenticated, service_role;

-- Populate the new table immediately
SELECT public.refresh_sku_reorder_recommendations();

NOTIFY pgrst, 'reload schema';

