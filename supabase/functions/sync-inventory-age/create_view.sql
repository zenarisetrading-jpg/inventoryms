-- =============================================================================
-- View: v_fact_inventory_with_age
--
-- Joins fact_inventory_planning with pivoted inventory_age data.
-- The inventory_age table stores age buckets as rows:
--   (report_date, account_id, sku, bucket, item_count)
-- where bucket ∈ {'0-60', '61-90', '91-180', '181+'}
--
-- This view pivots those rows into columns using conditional aggregation
-- and joins to fact_inventory_planning on SKU using the latest report_date.
-- =============================================================================

CREATE OR REPLACE VIEW public.v_fact_inventory_with_age AS
SELECT
    f.*,
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
