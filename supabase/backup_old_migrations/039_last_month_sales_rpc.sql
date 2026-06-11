-- =========================================================
-- 039_last_month_sales_rpc.sql
-- Last month sales by channel and total
-- =========================================================

CREATE OR REPLACE FUNCTION public.get_last_month_sales()
RETURNS JSONB AS $$
DECLARE
    result JSONB;
BEGIN
    SELECT jsonb_agg(row) INTO result
    FROM (
        WITH last_month_sales AS (
            SELECT 
                sales_channel,
                SUM(total_sales) AS total_sales,
                SUM(total_units) AS total_units
            FROM public.fact_sales
            WHERE date >= DATE_TRUNC('month', CURRENT_DATE - INTERVAL '1 month')
            AND date < DATE_TRUNC('month', CURRENT_DATE)
            AND is_current = TRUE
            GROUP BY sales_channel
        ),
        totals AS (
            SELECT 
                SUM(total_sales) AS grand_total_sales,
                SUM(total_units) AS grand_total_units
            FROM last_month_sales
        )
        SELECT 
            l.sales_channel,
            ROUND(l.total_sales, 2) AS total_sales,
            l.total_units,
            ROUND((l.total_sales / NULLIF(t.grand_total_sales,0)) * 100, 2) AS sales_split_percentage,
            ROUND((l.total_units / NULLIF(t.grand_total_units,0)) * 100, 2) AS units_split_percentage
        FROM last_month_sales l
        CROSS JOIN totals t

        UNION ALL

        SELECT 
            'TOTAL' AS sales_channel,
            ROUND(SUM(l.total_sales), 2),
            SUM(l.total_units),
            100.00,
            100.00
        FROM last_month_sales l
        ORDER BY sales_channel
    ) row;
    
    RETURN COALESCE(result, '[]'::JSONB);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.get_last_month_sales() TO authenticated, anon, service_role;
