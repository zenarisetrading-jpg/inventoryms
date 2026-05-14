-- Migration: 025_filtered_subcategory_rpc.sql
-- Updates get_subcategory_performance to support filtering by category/class/subcategory

CREATE OR REPLACE FUNCTION get_subcategory_performance(
    days_count INT,
    p_categories TEXT[] DEFAULT NULL,
    p_product_categories TEXT[] DEFAULT NULL,
    p_sub_categories TEXT[] DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    result JSONB;
BEGIN
    SELECT jsonb_agg(sub) INTO result
    FROM (
        SELECT  
            COALESCE(sm.sub_category, 'Uncategorized') AS sub_category,
            COALESCE(SUM(s.units_sold), 0) AS total_units
        FROM sales_snapshot s
        JOIN sku_master sm ON s.sku = sm.sku
        WHERE s.date >= (SELECT MAX(date) FROM sales_snapshot) - (days_count || ' days')::INTERVAL
          AND (p_categories IS NULL OR p_categories = '{}' OR sm.category = ANY(p_categories))
          AND (p_product_categories IS NULL OR p_product_categories = '{}' OR sm.product_category = ANY(p_product_categories))
          AND (p_sub_categories IS NULL OR p_sub_categories = '{}' OR sm.sub_category = ANY(p_sub_categories))
        GROUP BY sm.sub_category
        ORDER BY total_units DESC
    ) sub;
    
    RETURN COALESCE(result, '[]'::JSONB);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_subcategory_performance(INT, TEXT[], TEXT[], TEXT[]) TO anon;
GRANT EXECUTE ON FUNCTION get_subcategory_performance(INT, TEXT[], TEXT[], TEXT[]) TO authenticated;
