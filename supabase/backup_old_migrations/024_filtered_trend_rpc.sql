-- Migration: 024_filtered_trend_rpc.sql
-- Updates get_sales_velocity_trend to support filtering by category/class/subcategory

CREATE OR REPLACE FUNCTION get_sales_velocity_trend(
    days_count INT,
    p_categories TEXT[] DEFAULT NULL,
    p_product_categories TEXT[] DEFAULT NULL,
    p_sub_categories TEXT[] DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    result JSONB;
    max_date DATE;
BEGIN
    -- Get the most recent date in the system to anchor the trend
    SELECT MAX(date) INTO max_date FROM sales_snapshot;
    IF max_date IS NULL THEN RETURN '[]'::JSONB; END IF;

    SELECT jsonb_agg(row) INTO result
    FROM (
        SELECT 
            s.date,
            COALESCE(SUM(CASE WHEN s.channel = 'amazon' THEN s.units_sold ELSE 0 END), 0) AS amazon,
            COALESCE(SUM(CASE WHEN s.channel = 'noon' THEN s.units_sold ELSE 0 END), 0) AS noon,
            COALESCE(SUM(CASE WHEN s.channel = 'noon_minutes' THEN s.units_sold ELSE 0 END), 0) AS minutes,
            COALESCE(SUM(s.units_sold), 0) AS total
        FROM sales_snapshot s
        LEFT JOIN sku_master sm ON s.sku = sm.sku
        WHERE s.date > (max_date - (days_count || ' days')::INTERVAL)
          AND s.date <= max_date
          AND (p_categories IS NULL OR p_categories = '{}' OR sm.category = ANY(p_categories))
          AND (p_product_categories IS NULL OR p_product_categories = '{}' OR sm.product_category = ANY(p_product_categories))
          AND (p_sub_categories IS NULL OR p_sub_categories = '{}' OR sm.sub_category = ANY(p_sub_categories))
        GROUP BY s.date
        ORDER BY s.date ASC
    ) row;
    
    RETURN COALESCE(result, '[]'::JSONB);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_sales_velocity_trend(INT, TEXT[], TEXT[], TEXT[]) TO anon;
GRANT EXECUTE ON FUNCTION get_sales_velocity_trend(INT, TEXT[], TEXT[], TEXT[]) TO authenticated;
