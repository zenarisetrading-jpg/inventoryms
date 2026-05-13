-- RPC to get sub-category performance for the last 30 days
CREATE OR REPLACE FUNCTION get_subcategory_performance()
RETURNS JSONB AS $$
DECLARE
    result JSONB;
BEGIN
    SELECT jsonb_agg(sub) INTO result
    FROM (
        SELECT  
            COALESCE(b.sub_category, 'Uncategorized') AS sub_category,
            SUM(a.units_sold) AS total_units
        FROM sales_snapshot a
        JOIN sku_master b ON a.sku = b.sku
        WHERE a.date >= CURRENT_DATE - INTERVAL '30 days'
        GROUP BY b.sub_category
        ORDER BY total_units DESC
        LIMIT 10
    ) sub;
    
    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_subcategory_performance() TO anon;
GRANT EXECUTE ON FUNCTION get_subcategory_performance() TO authenticated;
