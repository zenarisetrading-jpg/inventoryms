-- =============================================================================
-- View: v_fact_inventory_with_age
--
-- Joins fact_inventory_planning with pivoted inventory_age data.
-- The inventory_age table stores age buckets as rows:
--   (report_date, account_id, sku, bucket, item_count)
-- where bucket ∈ {'0-60', '61-90', '91-180', '181+'}
--
-- This view pivots those rows into columns using conditional aggregation
-- and joins to fact_inventory_planning on SKU + account_id using the
-- latest report_date. It also OVERRIDES the stale fba_age_* columns on
-- the base table with the correctly tenant-filtered values.
-- =============================================================================

CREATE OR REPLACE VIEW public.v_fact_inventory_with_age AS
SELECT
    -- All columns from fact_inventory_planning EXCEPT the stale fba_age_* ones
    f.sku,
    f.country,
    f.saddl_id,
    f.category,
    f.sub_category,
    f.product_category,
    f.is_active,
    f.fba_units,
    f.fbn_units,
    f.minutes_units,
    f.locad_units,
    f.locad_boxes,
    f.units_per_box,
    f.amazon_sv,
    f.noon_sv,
    f.minutes_sv,
    f.blended_sv,
    f.amazon_coverage,
    f.noon_coverage,
    f.total_coverage,
    f.cogs,
    f.moq,
    f.required_30d,
    f.stock_in_hand,
    f.shortfall,
    f.suggested_reorder_qty,
    f.already_ordered,
    f.pending_qty_to_reorder,
    f.total_reorder_cost,
    f.send_to_fba_units,
    f.send_to_fbn_units,
    f.send_to_minutes_units,
    f.fba_boxes,
    f.fbn_boxes,
    f.minutes_boxes,
    f.priority_rank,
    f.allocation_reason,
    f.action_flag,
    f.loaded_at,
    f.sales_yesterday,
    -- Override fba_age_* with correctly tenant-filtered values
    COALESCE(ia.age_0_60_days,   0) AS fba_age_0_60_days,
    COALESCE(ia.age_61_90_days,  0) AS fba_age_61_90_days,
    COALESCE(ia.age_91_180_days, 0) AS fba_age_91_180_days,
    COALESCE(ia.age_181_plus_days, 0) AS fba_age_181_plus_days,
    -- Also keep the age_*_days aliases for backward compatibility
    COALESCE(ia.age_0_60_days,   0) AS age_0_60_days,
    COALESCE(ia.age_61_90_days,  0) AS age_61_90_days,
    COALESCE(ia.age_91_180_days, 0) AS age_91_180_days,
    COALESCE(ia.age_181_plus_days, 0) AS age_181_plus_days
FROM public.fact_inventory_planning f
LEFT JOIN (
    -- Pivot inventory_age: convert bucket rows into columns per SKU and account
    -- Uses the latest report_date only so we get the most current age data
    SELECT
        account_id,
        sku,
        SUM(CASE WHEN bucket = '0-60'   THEN item_count ELSE 0 END) AS age_0_60_days,
        SUM(CASE WHEN bucket = '61-90'  THEN item_count ELSE 0 END) AS age_61_90_days,
        SUM(CASE WHEN bucket = '91-180' THEN item_count ELSE 0 END) AS age_91_180_days,
        SUM(CASE WHEN bucket = '181+'   THEN item_count ELSE 0 END) AS age_181_plus_days
    FROM public.inventory_age
    WHERE report_date = (SELECT MAX(report_date) FROM public.inventory_age)
    GROUP BY account_id, sku
) ia ON f.sku = ia.sku AND f.saddl_id = ia.account_id;

