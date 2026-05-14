-- Updated RPC to pivot sales by channel (Amazon, Noon, Minutes)
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
            COALESCE(b.product_category, 'Uncategorized') AS product_category,
            COALESCE(b.sub_category, 'Uncategorized') AS sub_category, 
            a.sku,

            SUM(CASE WHEN a.channel = 'amazon' THEN a.units_sold ELSE 0 END) AS amazon_units,
            SUM(CASE WHEN a.channel = 'noon' THEN a.units_sold ELSE 0 END) AS noon_units,
            SUM(CASE WHEN a.channel = 'noon_minutes' THEN a.units_sold ELSE 0 END) AS minutes_units,

            SUM(a.units_sold) AS total_units

        FROM sales_snapshot a
        JOIN sku_master b 
            ON a.sku = b.sku
        -- Filter based on the last available date in the system if days_count is provided
        WHERE (days_count IS NULL OR a.date > (max_date - (days_count || ' days')::INTERVAL))
          AND (days_count IS NULL OR a.date <= max_date)
        GROUP BY 
            b.category,
            b.product_category,
            b.sub_category,
            a.sku
        ORDER BY total_units DESC
    ) sub;
    
    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_detailed_sales_performance(INT) TO anon;
GRANT EXECUTE ON FUNCTION get_detailed_sales_performance(INT) TO authenticated;
