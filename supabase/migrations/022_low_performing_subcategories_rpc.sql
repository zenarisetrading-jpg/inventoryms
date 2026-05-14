-- RPC to get low performing subcategories based on units sold
CREATE OR REPLACE FUNCTION get_low_performing_subcategories(days_count INT)
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
        ORDER BY total_units ASC
    ) sub;
    
    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_low_performing_subcategories(INT) TO anon;
GRANT EXECUTE ON FUNCTION get_low_performing_subcategories(INT) TO authenticated;
