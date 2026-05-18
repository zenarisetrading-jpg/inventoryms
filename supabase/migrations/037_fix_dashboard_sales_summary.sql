-- =========================================================
-- 037_fix_dashboard_sales_summary.sql
-- Fix the MTD mismatch by ensuring dashboard summary uses 
-- fact_sales accurately and matches the manual query logic
-- =========================================================

CREATE OR REPLACE FUNCTION public.get_dashboard_sales_summary()
RETURNS JSONB AS $$
DECLARE
    max_date DATE;
    today_date DATE;
    yesterday_date DATE;
    mtd_start DATE;
    last_month_start DATE;
    last_month_end DATE;
    days_in_month INT;
    days_passed_mtd INT;
    fee_rate NUMERIC;
    adv_rate NUMERIC;
    result JSONB;
BEGIN
    SELECT MAX(date) INTO max_date FROM public.fact_sales WHERE is_current = TRUE;
    IF max_date IS NULL THEN SELECT MAX(date) INTO max_date FROM sales_snapshot; END IF;
    IF max_date IS NULL THEN RETURN '{}'::JSONB; END IF;
    
    today_date := max_date;
    yesterday_date := max_date - INTERVAL '1 day';
    mtd_start := DATE_TRUNC('month', max_date);
    last_month_start := mtd_start - INTERVAL '1 month';
    last_month_end := mtd_start - INTERVAL '1 day';
    
    days_in_month := EXTRACT(DAY FROM (DATE_TRUNC('month', max_date) + INTERVAL '1 month' - INTERVAL '1 day'));
    days_passed_mtd := EXTRACT(DAY FROM max_date);

    SELECT value::NUMERIC INTO fee_rate FROM system_config WHERE key = 'abc_fee_rate';
    SELECT value::NUMERIC INTO adv_rate FROM system_config WHERE key = 'abc_adv_rate';
    
    WITH date_ranges AS (
        SELECT 'today' as label, today_date as start_d, today_date as end_d
        UNION ALL
        SELECT 'yesterday', yesterday_date, yesterday_date
        UNION ALL
        SELECT 'mtd', mtd_start, max_date
        UNION ALL
        SELECT 'last_month', last_month_start, last_month_end
    ),
    range_stats AS (
        SELECT 
            dr.label,
            COALESCE(SUM(f.total_units), 0) as units,
            COALESCE(SUM(f.total_units), 0) as orders, 
            COALESCE(SUM(f.total_sales), 0) as sales_aed,
            COALESCE(SUM(f.total_units * sm.cogs), 0) as total_cogs,
            COALESCE(SUM(CASE WHEN LOWER(f.sales_channel) = 'amazon' THEN f.total_sales ELSE 0 END), 0) as amazon_sales,
            COALESCE(SUM(CASE WHEN LOWER(f.sales_channel) = 'amazon' THEN f.total_units ELSE 0 END), 0) as amazon_units,
            COALESCE(SUM(CASE WHEN LOWER(f.sales_channel) = 'noon' THEN f.total_sales ELSE 0 END), 0) as noon_sales,
            COALESCE(SUM(CASE WHEN LOWER(f.sales_channel) = 'noon' THEN f.total_units ELSE 0 END), 0) as noon_units,
            COALESCE(SUM(CASE WHEN LOWER(f.sales_channel) = 'minutes' THEN f.total_sales ELSE 0 END), 0) as minutes_sales,
            COALESCE(SUM(CASE WHEN LOWER(f.sales_channel) = 'minutes' THEN f.total_units ELSE 0 END), 0) as minutes_units
        FROM date_ranges dr
        LEFT JOIN public.fact_sales f ON f.date >= dr.start_d AND f.date <= dr.end_d AND f.is_current = TRUE
        LEFT JOIN sku_master sm ON f.sku = sm.sku
        GROUP BY dr.label
    ),
    calculated_stats AS (
        SELECT 
            *,
            (sales_aed * COALESCE(adv_rate, 0.15)) as adv_cost,
            (sales_aed * (1 - COALESCE(fee_rate, 0.40))) as est_payout,
            (sales_aed * (1 - COALESCE(fee_rate, 0.40)) - total_cogs) as gross_profit,
            (sales_aed * (1 - COALESCE(fee_rate, 0.40)) - total_cogs - (sales_aed * COALESCE(adv_rate, 0.15))) as net_profit,
            CASE WHEN label = 'mtd' AND days_passed_mtd > 0 THEN (sales_aed / days_passed_mtd) * days_in_month ELSE sales_aed END as forecast_sales
        FROM range_stats
    )
    SELECT jsonb_object_agg(label, row_to_json(calculated_stats)) INTO result FROM calculated_stats;
    RETURN COALESCE(result, '{}'::JSONB);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.get_dashboard_sales_summary() TO authenticated, anon, service_role;
