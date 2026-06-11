-- =========================================================
-- 036_today_sales_rpc.sql
-- Today's performance by sales channel
-- =========================================================

CREATE OR REPLACE FUNCTION public.get_today_sales()
RETURNS JSONB AS $$
DECLARE
    result JSONB;
BEGIN
    SELECT jsonb_agg(row) INTO result
    FROM (
        SELECT 
            sales_channel,
            ROUND(SUM(total_sales), 2) AS total_sales,
            SUM(total_units) AS total_units
        FROM public.fact_sales
        WHERE date = CURRENT_DATE
        AND is_current = TRUE
        GROUP BY sales_channel

        UNION ALL

        SELECT 
            'TOTAL' AS sales_channel,
            ROUND(SUM(total_sales), 2) AS total_sales,
            SUM(total_units) AS total_units
        FROM public.fact_sales
        WHERE date = CURRENT_DATE
        AND is_current = TRUE
        ORDER BY sales_channel
    ) row;
    
    RETURN COALESCE(result, '[]'::JSONB);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.get_today_sales() TO authenticated, anon, service_role;
