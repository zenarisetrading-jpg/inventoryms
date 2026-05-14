-- RPC to get daily sales velocity trend per channel
CREATE OR REPLACE FUNCTION get_sales_velocity_trend(days_count INT)
RETURNS JSONB AS $$
DECLARE
    result JSONB;
    max_date DATE;
BEGIN
    SELECT MAX(date) INTO max_date FROM sales_snapshot;

    SELECT jsonb_agg(row) INTO result
    FROM (
        SELECT 
            date,
            SUM(CASE WHEN channel = 'amazon' THEN units_sold ELSE 0 END) AS amazon,
            SUM(CASE WHEN channel = 'noon' THEN units_sold ELSE 0 END) AS noon,
            SUM(CASE WHEN channel = 'noon_minutes' THEN units_sold ELSE 0 END) AS minutes,
            SUM(units_sold) AS total
        FROM sales_snapshot
        WHERE date > (max_date - (days_count || ' days')::INTERVAL)
          AND date <= max_date
        GROUP BY date
        ORDER BY date ASC
    ) row;
    
    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_sales_velocity_trend(INT) TO anon;
GRANT EXECUTE ON FUNCTION get_sales_velocity_trend(INT) TO authenticated;
