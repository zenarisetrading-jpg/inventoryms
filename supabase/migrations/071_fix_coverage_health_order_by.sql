-- =========================================================
-- 071_fix_coverage_health_order_by.sql
-- Fix ORDER BY clause in get_coverage_health
-- =========================================================

CREATE OR REPLACE FUNCTION public.get_coverage_health(
    p_categories TEXT[] DEFAULT NULL,
    p_product_categories TEXT[] DEFAULT NULL,
    p_sub_categories TEXT[] DEFAULT NULL,
    p_saddl_id TEXT DEFAULT 's2c_uae_test'
)
RETURNS JSONB AS $$
DECLARE
    result JSONB;
BEGIN
    SELECT jsonb_agg(sub) INTO result
    FROM (
        SELECT 
            CASE 
                WHEN total_coverage < 15 THEN '0-15 Days (Critical)'
                WHEN total_coverage >= 15 AND total_coverage < 30 THEN '15-30 Days (Warning)'
                WHEN total_coverage >= 30 AND total_coverage < 60 THEN '30-60 Days (Healthy)'
                ELSE '60+ Days (Overstocked)'
            END AS coverage_tier,
            COUNT(DISTINCT sku) AS sku_count,
            SUM(stock_in_hand) AS total_units,
            SUM(stock_in_hand * COALESCE(cogs, 0)) AS total_value
        FROM fact_inventory_planning
        WHERE is_active = true
        AND COALESCE(saddl_id, 'none') = p_saddl_id
        AND (p_categories IS NULL OR category = ANY(p_categories))
        AND (p_product_categories IS NULL OR product_category = ANY(p_product_categories))
        AND (p_sub_categories IS NULL OR sub_category = ANY(p_sub_categories))
        GROUP BY 
            CASE 
                WHEN total_coverage < 15 THEN '0-15 Days (Critical)'
                WHEN total_coverage >= 15 AND total_coverage < 30 THEN '15-30 Days (Warning)'
                WHEN total_coverage >= 30 AND total_coverage < 60 THEN '30-60 Days (Healthy)'
                ELSE '60+ Days (Overstocked)'
            END
        ORDER BY 
            CASE 
                WHEN CASE 
                    WHEN total_coverage < 15 THEN '0-15 Days (Critical)'
                    WHEN total_coverage >= 15 AND total_coverage < 30 THEN '15-30 Days (Warning)'
                    WHEN total_coverage >= 30 AND total_coverage < 60 THEN '30-60 Days (Healthy)'
                    ELSE '60+ Days (Overstocked)'
                END = '0-15 Days (Critical)' THEN 1
                WHEN CASE 
                    WHEN total_coverage < 15 THEN '0-15 Days (Critical)'
                    WHEN total_coverage >= 15 AND total_coverage < 30 THEN '15-30 Days (Warning)'
                    WHEN total_coverage >= 30 AND total_coverage < 60 THEN '30-60 Days (Healthy)'
                    ELSE '60+ Days (Overstocked)'
                END = '15-30 Days (Warning)' THEN 2
                WHEN CASE 
                    WHEN total_coverage < 15 THEN '0-15 Days (Critical)'
                    WHEN total_coverage >= 15 AND total_coverage < 30 THEN '15-30 Days (Warning)'
                    WHEN total_coverage >= 30 AND total_coverage < 60 THEN '30-60 Days (Healthy)'
                    ELSE '60+ Days (Overstocked)'
                END = '30-60 Days (Healthy)' THEN 3
                ELSE 4
            END
    ) sub;
    
    RETURN COALESCE(result, '[]'::JSONB);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.get_coverage_health(text[], text[], text[], text) TO authenticated, anon, service_role;
