-- Updated RPC to accept a days parameter for filtering performance
CREATE OR REPLACE FUNCTION get_subcategory_performance(days_count INT)
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
        WHERE a.date >= (SELECT MAX(date) FROM sales_snapshot) - (days_count || ' days')::INTERVAL
        GROUP BY b.sub_category
        ORDER BY total_units DESC
    ) sub;
    
    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_subcategory_performance (INT) TO anon;

GRANT
EXECUTE ON FUNCTION get_subcategory_performance (INT) TO authenticated;