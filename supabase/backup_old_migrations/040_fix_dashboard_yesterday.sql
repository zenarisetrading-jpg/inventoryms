-- =========================================================
-- 040_fix_dashboard_yesterday.sql
-- Update get_dashboard_sales_summary, get_mtd_forecast, and get_last_month_sales
-- to support categories/sub-categories filtering for responsiveness.
-- Bases all calculations on the Asia/Dubai timezone.
-- Also fixes days_passed_mtd calculation in get_dashboard_sales_summary
-- to use actual completed days with sales rather than calendar days.
-- =========================================================

-- DROP OLD SIGNATURES
DROP FUNCTION IF EXISTS public.get_dashboard_sales_summary();
DROP FUNCTION IF EXISTS public.get_dashboard_sales_summary(text[], text[], text[]);
DROP FUNCTION IF EXISTS public.get_mtd_forecast();
DROP FUNCTION IF EXISTS public.get_mtd_forecast(text[], text[], text[]);
DROP FUNCTION IF EXISTS public.get_last_month_sales();
DROP FUNCTION IF EXISTS public.get_last_month_sales(text[], text[], text[]);
DROP FUNCTION IF EXISTS public.get_mtd_sales();
DROP FUNCTION IF EXISTS public.get_today_sales();

-- 1. get_dashboard_sales_summary
CREATE OR REPLACE FUNCTION public.get_dashboard_sales_summary(
    p_categories TEXT[] DEFAULT NULL,
    p_product_categories TEXT[] DEFAULT NULL,
    p_sub_categories TEXT[] DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
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
    today_date := (now() AT TIME ZONE 'Asia/Dubai')::date;
    yesterday_date := today_date - INTERVAL '1 day';
    mtd_start := DATE_TRUNC('month', today_date);
    last_month_start := mtd_start - INTERVAL '1 month';
    last_month_end := mtd_start - INTERVAL '1 day';
    
    days_in_month := EXTRACT(DAY FROM (DATE_TRUNC('month', today_date) + INTERVAL '1 month' - INTERVAL '1 day'));
    
    -- Count actual completed days with sales in current month to date to avoid forecast dilution
    SELECT COALESCE(COUNT(DISTINCT date), 0) INTO days_passed_mtd
    FROM public.fact_sales
    WHERE date >= mtd_start AND date <= today_date AND is_current = TRUE;
    
    IF days_passed_mtd = 0 THEN
        days_passed_mtd := 1;
    END IF;

    SELECT value::NUMERIC INTO fee_rate FROM system_config WHERE key = 'abc_fee_rate';
    SELECT value::NUMERIC INTO adv_rate FROM system_config WHERE key = 'abc_adv_rate';
    
    WITH date_ranges AS (
        SELECT 'today' as label, today_date as start_d, today_date as end_d
        UNION ALL
        SELECT 'yesterday', yesterday_date, yesterday_date
        UNION ALL
        SELECT 'mtd', mtd_start, today_date
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
            AND (p_categories IS NULL OR f.category = ANY(p_categories))
            AND (p_product_categories IS NULL OR f.product_category = ANY(p_product_categories))
            AND (p_sub_categories IS NULL OR f.sub_category = ANY(p_sub_categories))
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

GRANT EXECUTE ON FUNCTION public.get_dashboard_sales_summary(text[], text[], text[]) TO authenticated, anon, service_role;


-- 2. get_mtd_forecast
CREATE OR REPLACE FUNCTION public.get_mtd_forecast(
    p_categories TEXT[] DEFAULT NULL,
    p_product_categories TEXT[] DEFAULT NULL,
    p_sub_categories TEXT[] DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    result JSONB;
    today_date DATE;
    v_days_completed INT;
BEGIN
    today_date := (now() AT TIME ZONE 'Asia/Dubai')::date;
    
    -- Calculate global completed days to avoid projection skew
    SELECT COALESCE(COUNT(DISTINCT date), 1) INTO v_days_completed
    FROM public.fact_sales
    WHERE date >= DATE_TRUNC('month', today_date)
    AND date <= today_date
    AND is_current = TRUE;
    
    IF v_days_completed = 0 THEN
        v_days_completed := 1;
    END IF;

    SELECT jsonb_agg(row) INTO result
    FROM (
        WITH mtd_sales AS (
            SELECT 
                sales_channel,
                SUM(total_sales) AS mtd_sales,
                SUM(total_units) AS mtd_units
            FROM public.fact_sales
            WHERE date >= DATE_TRUNC('month', today_date)
            AND date <= today_date
            AND is_current = TRUE
            AND (p_categories IS NULL OR category = ANY(p_categories))
            AND (p_product_categories IS NULL OR product_category = ANY(p_product_categories))
            AND (p_sub_categories IS NULL OR sub_category = ANY(p_sub_categories))
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
            v_days_completed AS days_completed,
            EXTRACT(DAY FROM (DATE_TRUNC('month', today_date) + INTERVAL '1 month - 1 day')) AS total_days_in_month,
            ROUND(m.mtd_sales / v_days_completed, 2) AS avg_daily_sales,
            ROUND(m.mtd_units / v_days_completed, 2) AS avg_daily_units,
            ROUND((m.mtd_sales / v_days_completed) * EXTRACT(DAY FROM (DATE_TRUNC('month', today_date) + INTERVAL '1 month - 1 day')), 2) AS projected_month_end_sales,
            ROUND((m.mtd_units / v_days_completed) * EXTRACT(DAY FROM (DATE_TRUNC('month', today_date) + INTERVAL '1 month - 1 day')), 0) AS projected_month_end_units
        FROM mtd_sales m
        CROSS JOIN totals t

        UNION ALL

        SELECT 
            'TOTAL' AS sales_channel,
            ROUND(SUM(m.mtd_sales), 2),
            SUM(m.mtd_units),
            100.00,
            100.00,
            v_days_completed,
            EXTRACT(DAY FROM (DATE_TRUNC('month', today_date) + INTERVAL '1 month - 1 day')),
            ROUND(SUM(m.mtd_sales) / v_days_completed, 2),
            ROUND(SUM(m.mtd_units) / v_days_completed, 2),
            ROUND((SUM(m.mtd_sales) / v_days_completed) * EXTRACT(DAY FROM (DATE_TRUNC('month', today_date) + INTERVAL '1 month - 1 day')), 2),
            ROUND((SUM(m.mtd_units) / v_days_completed) * EXTRACT(DAY FROM (DATE_TRUNC('month', today_date) + INTERVAL '1 month - 1 day')), 0)
        FROM mtd_sales m
        ORDER BY sales_channel
    ) row;
    
    RETURN COALESCE(result, '[]'::JSONB);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.get_mtd_forecast(text[], text[], text[]) TO authenticated, anon, service_role;


-- 3. get_last_month_sales
CREATE OR REPLACE FUNCTION public.get_last_month_sales(
    p_categories TEXT[] DEFAULT NULL,
    p_product_categories TEXT[] DEFAULT NULL,
    p_sub_categories TEXT[] DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    result JSONB;
    today_date DATE;
BEGIN
    today_date := (now() AT TIME ZONE 'Asia/Dubai')::date;
    
    SELECT jsonb_agg(row) INTO result
    FROM (
        WITH last_month_sales AS (
            SELECT 
                sales_channel,
                SUM(total_sales) AS total_sales,
                SUM(total_units) AS total_units
            FROM public.fact_sales
            WHERE date >= DATE_TRUNC('month', today_date - INTERVAL '1 month')
            AND date < DATE_TRUNC('month', today_date)
            AND is_current = TRUE
            AND (p_categories IS NULL OR category = ANY(p_categories))
            AND (p_product_categories IS NULL OR product_category = ANY(p_product_categories))
            AND (p_sub_categories IS NULL OR sub_category = ANY(p_sub_categories))
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

GRANT EXECUTE ON FUNCTION public.get_last_month_sales(text[], text[], text[]) TO authenticated, anon, service_role;


-- 4. get_mtd_sales
CREATE OR REPLACE FUNCTION public.get_mtd_sales()
RETURNS JSONB AS $$
DECLARE
    result JSONB;
    today_date DATE;
BEGIN
    today_date := (now() AT TIME ZONE 'Asia/Dubai')::date;
    
    SELECT jsonb_agg(row) INTO result
    FROM (
        SELECT 
            sales_channel,
            ROUND(SUM(total_sales), 2) AS total_sales,
            SUM(total_units) AS total_units
        FROM public.fact_sales
        WHERE date >= DATE_TRUNC('month', today_date)
        AND date <= today_date
        AND is_current = TRUE
        GROUP BY sales_channel

        UNION ALL

        SELECT 
            'TOTAL' AS sales_channel,
            ROUND(SUM(total_sales), 2) AS total_sales,
            SUM(total_units) AS total_units
        FROM public.fact_sales
        WHERE date >= DATE_TRUNC('month', today_date)
        AND date <= today_date
        AND is_current = TRUE
        ORDER BY sales_channel
    ) row;
    
    RETURN COALESCE(result, '[]'::JSONB);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.get_mtd_sales() TO authenticated, anon, service_role;


-- 5. get_today_sales
CREATE OR REPLACE FUNCTION public.get_today_sales()
RETURNS JSONB AS $$
DECLARE
    result JSONB;
    today_date DATE;
BEGIN
    today_date := (now() AT TIME ZONE 'Asia/Dubai')::date;
    
    SELECT jsonb_agg(row) INTO result
    FROM (
        SELECT 
            sales_channel,
            ROUND(SUM(total_sales), 2) AS total_sales,
            SUM(total_units) AS total_units
        FROM public.fact_sales
        WHERE date = today_date
        AND is_current = TRUE
        GROUP BY sales_channel

        UNION ALL

        SELECT 
            'TOTAL' AS sales_channel,
            ROUND(SUM(total_sales), 2) AS total_sales,
            SUM(total_units) AS total_units
        FROM public.fact_sales
        WHERE date = today_date
        AND is_current = TRUE
        ORDER BY sales_channel
    ) row;
    
    RETURN COALESCE(result, '[]'::JSONB);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.get_today_sales() TO authenticated, anon, service_role;
