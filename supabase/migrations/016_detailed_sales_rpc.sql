-- RPC to get detailed sales performance for the last 30 days
CREATE OR REPLACE FUNCTION get_detailed_sales_performance()
RETURNS JSONB AS $$
DECLARE
    result JSONB;
BEGIN
    SELECT jsonb_agg(sub) INTO result
    FROM (
        SELECT  
            COALESCE(b.category, 'Uncategorized') AS category,
            COALESCE(b.sub_category, 'Uncategorized') AS sub_category, 
            a.sku,
            a.channel,
            SUM(a.units_sold) AS total_units_sold
        FROM sales_snapshot a
        JOIN sku_master b ON a.sku = b.sku
        WHERE a.date >= (SELECT MAX(date) FROM sales_snapshot) - INTERVAL '30 days'
        GROUP BY b.category, b.sub_category, a.sku, a.channel
        ORDER BY total_units_sold DESC
        LIMIT 50
    ) sub;
    
    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_detailed_sales_performance() TO anon;
GRANT EXECUTE ON FUNCTION get_detailed_sales_performance() TO authenticated;
