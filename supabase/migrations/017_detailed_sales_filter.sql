-- Updated RPC to accept a days parameter for filtering detailed performance
CREATE OR REPLACE FUNCTION get_detailed_sales_performance(days_count INT)
RETURNS JSONB AS $$
DECLARE
    result JSONB;
    max_date DATE;
BEGIN
    -- Find the last day we have data for
    SELECT MAX(date) INTO max_date FROM sales_snapshot;

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
        -- Filter based on the last available date in the system
        WHERE a.date > (max_date - (days_count || ' days')::INTERVAL)
          AND a.date <= max_date
        GROUP BY b.category, b.sub_category, a.sku, a.channel
        ORDER BY total_units_sold DESC
        LIMIT 200
    ) sub;
    
    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_detailed_sales_performance(INT) TO anon;
GRANT EXECUTE ON FUNCTION get_detailed_sales_performance(INT) TO authenticated;
