-- Migration 096: Add final_qty to sku_reorder_recommendations table
ALTER TABLE public.sku_reorder_recommendations
ADD COLUMN IF NOT EXISTS final_qty NUMERIC(12, 0);

-- Initialize final_qty from suggested_order_qty for existing records where final_qty is NULL
UPDATE public.sku_reorder_recommendations
SET final_qty = suggested_order_qty
WHERE final_qty IS NULL;

-- Update refresh_sku_reorder_recommendations to preserve final_qty if already saved
-- or initialize it from suggested_order_qty
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
            COALESCE(NULLIF(supplier, ''), 'Direct Supplier') AS supplier
        FROM public.fact_purchase
        WHERE po_status IN ('ORDERED', 'SHIPPED', 'PARTIALLY_DELIVERED', 'PENDING')
        ORDER BY sku, COALESCE(country, 'UAE'), saddl_id, created_at DESC
    ),
    raw_data AS (
        SELECT
            sm.sku,
            COALESCE(sm.country, 'UAE') AS country,
            COALESCE(sm.saddl_id, 's2c_uae_test') AS saddl_id,
            COALESCE(sm.name, sm.sku) AS product_name,
            COALESCE(sm.brand, 'S2C') AS brand,
            COALESCE(NULLIF(sm.category, ''), 'C') AS cat,
            COALESCE(existing.planning_to_discontinue, false) AS planning_to_discontinue,
            COALESCE(existing.final_qty, NULL) AS saved_final_qty,
            COALESCE(ROUND(NULLIF(sm.sales_velocity, 0)::numeric, 3), 0) AS daily_sales,
            (COALESCE(f.fba_units, 0) + COALESCE(f.fbn_units, 0) + COALESCE(f.minutes_units, 0) + COALESCE(f.locad_units, 0))::numeric AS available_stock,
            COALESCE(f.fba_units, 0)::numeric AS fba_units,
            COALESCE(f.fbn_units, 0)::numeric AS fbn_units,
            COALESCE(f.minutes_units, 0)::numeric AS minutes_units,
            COALESCE(f.locad_units, 0)::numeric AS locad_units,
            COALESCE(f.locad_boxes, 0)::numeric AS locad_boxes,
            COALESCE(f.amazon_sv, 0)::numeric AS amazon_sv,
            COALESCE(f.noon_sv, 0)::numeric AS noon_sv,
            COALESCE(f.minutes_sv, 0)::numeric AS minutes_sv,
            COALESCE(f.blended_sv, 0)::numeric AS blended_sv,
            GREATEST(1, COALESCE(sm.units_per_box, 1)) AS case_pack,
            GREATEST(0, COALESCE(sm.lead_time_days, 45)) AS lead_time_days,
            COALESCE(po_s.supplier, 'Direct Supplier') AS supplier,
            COALESCE(ROUND(NULLIF(sm.cogs, 0)::numeric, 2), 0) AS unit_cost,
            GREATEST(0, COALESCE(sm.moq, 0))::numeric AS moq,
            COALESCE(f.already_ordered, 0)::numeric AS existing_po_qty,
            COALESCE(sm.is_active, true) AS is_active
        FROM public.sku_master sm
        LEFT JOIN public.fact_inventory_planning f
            ON f.sku = sm.sku
            AND f.country = sm.country
            AND f.saddl_id = sm.saddl_id
        LEFT JOIN po_supplier po_s
            ON po_s.sku = sm.sku
            AND po_s.country = sm.country
            AND po_s.saddl_id = sm.saddl_id
        LEFT JOIN public.sku_reorder_recommendations existing
            ON existing.sku = sm.sku
            AND existing.country = sm.country
            AND existing.saddl_id = sm.saddl_id
        WHERE COALESCE(sm.is_active, true) = true
    ),
    step1 AS (
        SELECT
            r.*,
            CASE UPPER(r.cat)
                WHEN 'A' THEN p_target_days_a
                WHEN 'B' THEN p_target_days_b
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
        suggested_order_qty, final_qty, unit_cost, total_reorder_cost,
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
        COALESCE(s5.saved_final_qty, s5.suggested_order_qty) AS final_qty,
        s5.unit_cost,
        CASE
            WHEN s5.planning_to_discontinue OR s5.unit_cost <= 0 THEN 0
            ELSE ROUND((COALESCE(s5.saved_final_qty, s5.suggested_order_qty) * s5.unit_cost)::numeric, 2)
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
        final_qty = COALESCE(public.sku_reorder_recommendations.final_qty, EXCLUDED.final_qty, EXCLUDED.suggested_order_qty),
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

NOTIFY pgrst, 'reload schema';
