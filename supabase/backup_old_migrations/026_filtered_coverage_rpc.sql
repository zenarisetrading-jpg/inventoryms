-- Migration: 026_filtered_coverage_rpc.sql
-- Updates get_coverage_health to support filtering by category/class/subcategory

CREATE OR REPLACE FUNCTION get_coverage_health(
    p_categories TEXT[] DEFAULT NULL,
    p_product_categories TEXT[] DEFAULT NULL,
    p_sub_categories TEXT[] DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    result JSONB;
BEGIN
    SELECT jsonb_build_object(
        'amazon', COALESCE(median_fba_coverage, 0),
        'noon', COALESCE(median_noon_coverage, 0),
        'minutes', COALESCE(median_minutes_coverage, 0),
        'locad', COALESCE(median_locad_coverage, 0)
    ) INTO result
    FROM (
        SELECT 
            PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY f.fba_units / NULLIF(f.amazon_sv, 0)) AS median_fba_coverage,
            PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY f.fbn_units / NULLIF(f.noon_sv, 0)) AS median_noon_coverage,
            PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY f.minutes_units / NULLIF(f.minutes_sv, 0)) AS median_minutes_coverage,
            PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY f.locad_units / NULLIF(f.blended_sv, 0)) AS median_locad_coverage
        FROM fact_inventory_planning f
        LEFT JOIN sku_master sm ON f.sku = sm.sku
        WHERE f.is_active = true
          AND (p_categories IS NULL OR p_categories = '{}' OR sm.category = ANY(p_categories))
          AND (p_product_categories IS NULL OR p_product_categories = '{}' OR sm.product_category = ANY(p_product_categories))
          AND (p_sub_categories IS NULL OR p_sub_categories = '{}' OR sm.sub_category = ANY(p_sub_categories))
          AND (
                (f.fba_units > 0 AND f.amazon_sv > 0)
             OR (f.fbn_units > 0 AND f.noon_sv > 0)
             OR (f.minutes_units > 0 AND f.minutes_sv > 0)
             OR (f.locad_units > 0 AND f.blended_sv > 0)
          )
    ) sub;
    
    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_coverage_health(TEXT[], TEXT[], TEXT[]) TO anon;
GRANT EXECUTE ON FUNCTION get_coverage_health(TEXT[], TEXT[], TEXT[]) TO authenticated;
