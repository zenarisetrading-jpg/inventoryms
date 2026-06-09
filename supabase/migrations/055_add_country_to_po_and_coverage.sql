-- =========================================================
-- 055_add_country_to_po_and_coverage.sql
-- Add p_country filter to get_po_status_distribution and get_coverage_health
-- =========================================================

-- DROP OLD SIGNATURES
DROP FUNCTION IF EXISTS public.get_po_status_distribution();
DROP FUNCTION IF EXISTS public.get_po_status_distribution(text);

DROP FUNCTION IF EXISTS public.get_coverage_health();
DROP FUNCTION IF EXISTS public.get_coverage_health(text[], text[], text[]);
DROP FUNCTION IF EXISTS public.get_coverage_health(text[], text[], text[], text);

-- 1. get_po_status_distribution
CREATE OR REPLACE FUNCTION public.get_po_status_distribution(
    p_country TEXT DEFAULT 'UAE'
)
RETURNS JSONB AS $$
DECLARE
    result JSONB;
BEGIN
    SELECT jsonb_agg(sub) INTO result
    FROM (
        SELECT 
            UPPER(status) AS status,
            COUNT(DISTINCT po_number) AS po_count,
            SUM(units_ordered) AS total_units
        FROM fact_purchase
        WHERE UPPER(status) IN ('ORDERED', 'SHIPPED')
        AND COALESCE(country, 'UAE') = p_country
        GROUP BY UPPER(status)
        ORDER BY po_count DESC
    ) sub;
    
    RETURN COALESCE(result, '[]'::JSONB);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 2. get_coverage_health
CREATE OR REPLACE FUNCTION public.get_coverage_health(
    p_categories TEXT[] DEFAULT NULL,
    p_product_categories TEXT[] DEFAULT NULL,
    p_sub_categories TEXT[] DEFAULT NULL,
    p_country TEXT DEFAULT 'UAE'
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
        AND COALESCE(country, 'UAE') = p_country
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
            CASE coverage_tier
                WHEN '0-15 Days (Critical)' THEN 1
                WHEN '15-30 Days (Warning)' THEN 2
                WHEN '30-60 Days (Healthy)' THEN 3
                ELSE 4
            END
    ) sub;
    
    RETURN COALESCE(result, '[]'::JSONB);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


GRANT EXECUTE ON FUNCTION public.get_po_status_distribution(text) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.get_coverage_health(text[], text[], text[], text) TO authenticated, anon, service_role;
