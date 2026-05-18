-- =========================================================
-- 038_mtd_forecast_rpc.sql
-- Month-to-date forecast by channel and total
-- =========================================================

CREATE OR REPLACE FUNCTION public.get_mtd_forecast()
RETURNS JSONB AS $$
DECLARE
    result JSONB;
BEGIN
    SELECT jsonb_agg(row) INTO result
    FROM (
        WITH mtd_sales AS (
            SELECT 
                sales_channel,
                SUM(total_sales) AS mtd_sales,
                SUM(total_units) AS mtd_units,
                COUNT(DISTINCT date) AS days_completed
            FROM public.fact_sales
            WHERE date >= DATE_TRUNC('month', CURRENT_DATE)
            AND date <= CURRENT_DATE
            AND is_current = TRUE
            GROUP BY sales_channel
        ),
        totals AS (
            SELECT 
                SUM(mtd_sales) AS total_mtd_sales,
                SUM(mtd_units) AS total_mtd_units
            FROM mtd_sales
        )
        SELECT 
            m.sales_channel,
            ROUND(m.mtd_sales, 2) AS mtd_sales,
            m.mtd_units,
            ROUND((m.mtd_sales / NULLIF(t.total_mtd_sales,0)) * 100, 2) AS sales_split_percentage,
            ROUND((m.mtd_units / NULLIF(t.total_mtd_units,0)) * 100, 2) AS units_split_percentage,
            m.days_completed,
            EXTRACT(DAY FROM (DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month - 1 day')) AS total_days_in_month,
            ROUND(m.mtd_sales / NULLIF(m.days_completed, 0), 2) AS avg_daily_sales,
            ROUND(m.mtd_units / NULLIF(m.days_completed, 0), 2) AS avg_daily_units,
            ROUND((m.mtd_sales / NULLIF(m.days_completed, 0)) * EXTRACT(DAY FROM (DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month - 1 day')), 2) AS projected_month_end_sales,
            ROUND((m.mtd_units / NULLIF(m.days_completed, 0)) * EXTRACT(DAY FROM (DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month - 1 day')), 0) AS projected_month_end_units
        FROM mtd_sales m
        CROSS JOIN totals t

        UNION ALL

        SELECT 
            'TOTAL' AS sales_channel,
            ROUND(SUM(m.mtd_sales), 2),
            SUM(m.mtd_units),
            100.00,
            100.00,
            MAX(m.days_completed),
            EXTRACT(DAY FROM (DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month - 1 day')),
            ROUND(SUM(m.mtd_sales) / NULLIF(MAX(m.days_completed), 0), 2),
            ROUND(SUM(m.mtd_units) / NULLIF(MAX(m.days_completed), 0), 2),
            ROUND((SUM(m.mtd_sales) / NULLIF(MAX(m.days_completed), 0)) * EXTRACT(DAY FROM (DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month - 1 day')), 2),
            ROUND((SUM(m.mtd_units) / NULLIF(MAX(m.days_completed), 0)) * EXTRACT(DAY FROM (DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month - 1 day')), 0)
        FROM mtd_sales m
        ORDER BY sales_channel
    ) row;
    
    RETURN COALESCE(result, '[]'::JSONB);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.get_mtd_forecast() TO authenticated, anon, service_role;
