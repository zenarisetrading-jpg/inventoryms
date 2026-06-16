-- =========================================================
-- 070_update_rpcs_for_saddl_id.sql
-- Update all performance RPCs to accept and filter by p_saddl_id
-- =========================================================

-- DROP OLD SIGNATURES
DROP FUNCTION IF EXISTS public.get_final_valuation(text);
DROP FUNCTION IF EXISTS public.get_dashboard_sales_summary(text[], text[], text[], text);
DROP FUNCTION IF EXISTS public.get_mtd_forecast(text[], text[], text[], text);
DROP FUNCTION IF EXISTS public.get_last_month_sales(text[], text[], text[], text);
DROP FUNCTION IF EXISTS public.get_mtd_sales(text);
DROP FUNCTION IF EXISTS public.get_today_sales(text);
DROP FUNCTION IF EXISTS public.get_subcategory_performance(int, text[], text[], text[], text);
DROP FUNCTION IF EXISTS public.get_sales_velocity_trend(int, text[], text[], text[], text);
DROP FUNCTION IF EXISTS public.get_detailed_sales_performance(int, text[], text[], text[], text);
DROP FUNCTION IF EXISTS public.get_po_status_distribution(text);
DROP FUNCTION IF EXISTS public.get_coverage_health(text[], text[], text[], text);

-- 1. get_final_valuation
CREATE OR REPLACE FUNCTION get_final_valuation(p_saddl_id TEXT DEFAULT 's2c_uae_test')
RETURNS JSONB AS $$
DECLARE
    result JSONB;
BEGIN
    SELECT jsonb_build_object(
        'fba', COALESCE(SUM(fba_units * cogs), 0),
        'fbn', COALESCE(SUM(fbn_units * cogs), 0),
        'min', COALESCE(SUM(minutes_units * cogs), 0),
        'loc', COALESCE(SUM(locad_units * cogs), 0)
    ) INTO result
    FROM fact_inventory_planning
    WHERE COALESCE(saddl_id, 'none') = p_saddl_id
    AND is_active = true;
    
    RETURN COALESCE(result, '{}'::JSONB);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. get_dashboard_sales_summary
CREATE OR REPLACE FUNCTION public.get_dashboard_sales_summary(
    p_categories TEXT[] DEFAULT NULL,
    p_product_categories TEXT[] DEFAULT NULL,
    p_sub_categories TEXT[] DEFAULT NULL,
    p_saddl_id TEXT DEFAULT 's2c_uae_test'
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
    
    SELECT COALESCE(COUNT(DISTINCT date), 0) INTO days_passed_mtd
    FROM public.fact_sales
    WHERE date >= mtd_start AND date <= today_date AND is_current = TRUE
      AND COALESCE(saddl_id, 'none') = p_saddl_id;
    
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
            AND COALESCE(f.saddl_id, 'none') = p_saddl_id
            AND (p_categories IS NULL OR f.category = ANY(p_categories))
            AND (p_product_categories IS NULL OR f.product_category = ANY(p_product_categories))
            AND (p_sub_categories IS NULL OR f.sub_category = ANY(p_sub_categories))
        LEFT JOIN sku_master sm ON f.sku = sm.sku AND sm.country = COALESCE(f.country, 'UAE')
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

-- 3. get_mtd_forecast
CREATE OR REPLACE FUNCTION public.get_mtd_forecast(
    p_categories TEXT[] DEFAULT NULL,
    p_product_categories TEXT[] DEFAULT NULL,
    p_sub_categories TEXT[] DEFAULT NULL,
    p_saddl_id TEXT DEFAULT 's2c_uae_test'
)
RETURNS JSONB AS $$
DECLARE
    result JSONB;
    today_date DATE;
    v_days_completed INT;
BEGIN
    today_date := (now() AT TIME ZONE 'Asia/Dubai')::date;
    
    SELECT COALESCE(COUNT(DISTINCT date), 1) INTO v_days_completed
    FROM public.fact_sales
    WHERE date >= DATE_TRUNC('month', today_date)
    AND date <= today_date
    AND is_current = TRUE
    AND COALESCE(saddl_id, 'none') = p_saddl_id;
    
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
            AND COALESCE(saddl_id, 'none') = p_saddl_id
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

-- 4. get_last_month_sales
CREATE OR REPLACE FUNCTION public.get_last_month_sales(
    p_categories TEXT[] DEFAULT NULL,
    p_product_categories TEXT[] DEFAULT NULL,
    p_sub_categories TEXT[] DEFAULT NULL,
    p_saddl_id TEXT DEFAULT 's2c_uae_test'
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
            AND COALESCE(saddl_id, 'none') = p_saddl_id
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

-- 5. get_mtd_sales
CREATE OR REPLACE FUNCTION public.get_mtd_sales(p_saddl_id TEXT DEFAULT 's2c_uae_test')
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
        AND COALESCE(saddl_id, 'none') = p_saddl_id
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
        AND COALESCE(saddl_id, 'none') = p_saddl_id
        ORDER BY sales_channel
    ) row;
    
    RETURN COALESCE(result, '[]'::JSONB);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. get_today_sales
CREATE OR REPLACE FUNCTION public.get_today_sales(p_saddl_id TEXT DEFAULT 's2c_uae_test')
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
        AND COALESCE(saddl_id, 'none') = p_saddl_id
        GROUP BY sales_channel

        UNION ALL

        SELECT 
            'TOTAL' AS sales_channel,
            ROUND(SUM(total_sales), 2) AS total_sales,
            SUM(total_units) AS total_units
        FROM public.fact_sales
        WHERE date = today_date
        AND is_current = TRUE
        AND COALESCE(saddl_id, 'none') = p_saddl_id
        ORDER BY sales_channel
    ) row;
    
    RETURN COALESCE(result, '[]'::JSONB);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. get_subcategory_performance
CREATE OR REPLACE FUNCTION public.get_subcategory_performance(
  days_count integer DEFAULT 30,
  p_categories text[] DEFAULT NULL::text[],
  p_product_categories text[] DEFAULT NULL::text[],
  p_sub_categories text[] DEFAULT NULL::text[],
  p_saddl_id text DEFAULT 's2c_uae_test'
)
RETURNS TABLE(sub_category text, total_units bigint)
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  RETURN QUERY
  SELECT 
    f.sub_category::TEXT,
    SUM(f.total_units)::BIGINT as total_units
  FROM public.fact_sales f
  WHERE f.date >= CURRENT_DATE - days_count
  AND f.is_current = true
  AND COALESCE(f.saddl_id, 'none') = p_saddl_id
  AND (p_categories IS NULL OR f.category = ANY(p_categories))
  AND (p_product_categories IS NULL OR f.product_category = ANY(p_product_categories))
  AND (p_sub_categories IS NULL OR f.sub_category = ANY(p_sub_categories))
  GROUP BY f.sub_category
  ORDER BY total_units DESC
  LIMIT 10;
END;
$function$;

-- 8. get_sales_velocity_trend
CREATE OR REPLACE FUNCTION public.get_sales_velocity_trend(
  days_count integer DEFAULT 30,
  p_categories text[] DEFAULT NULL::text[],
  p_product_categories text[] DEFAULT NULL::text[],
  p_sub_categories text[] DEFAULT NULL::text[],
  p_saddl_id text DEFAULT 's2c_uae_test'
)
RETURNS TABLE(date date, amazon bigint, noon bigint, minutes bigint, total bigint)
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  RETURN QUERY
  WITH daily_sales AS (
    SELECT 
      f.date,
      SUM(CASE WHEN LOWER(f.sales_channel) = 'amazon' THEN f.total_units ELSE 0 END) as amazon_units,
      SUM(CASE WHEN LOWER(f.sales_channel) = 'noon' THEN f.total_units ELSE 0 END) as noon_units,
      SUM(CASE WHEN LOWER(f.sales_channel) = 'minutes' THEN f.total_units ELSE 0 END) as minutes_units,
      SUM(f.total_units) as total_units
    FROM public.fact_sales f
    WHERE f.date >= CURRENT_DATE - days_count
    AND f.is_current = true
    AND COALESCE(f.saddl_id, 'none') = p_saddl_id
    AND (p_categories IS NULL OR f.category = ANY(p_categories))
    AND (p_product_categories IS NULL OR f.product_category = ANY(p_product_categories))
    AND (p_sub_categories IS NULL OR f.sub_category = ANY(p_sub_categories))
    GROUP BY f.date
  )
  SELECT 
    d.date::DATE,
    COALESCE(d.amazon_units, 0)::BIGINT,
    COALESCE(d.noon_units, 0)::BIGINT,
    COALESCE(d.minutes_units, 0)::BIGINT,
    COALESCE(d.total_units, 0)::BIGINT
  FROM daily_sales d
  ORDER BY d.date ASC;
END;
$function$;

-- 9. get_detailed_sales_performance
CREATE OR REPLACE FUNCTION public.get_detailed_sales_performance(
    days_count INT DEFAULT 30,
    p_categories TEXT[] DEFAULT NULL,
    p_product_categories TEXT[] DEFAULT NULL,
    p_sub_categories TEXT[] DEFAULT NULL,
    p_saddl_id TEXT DEFAULT 's2c_uae_test'
)
RETURNS TABLE (
    sku TEXT,
    category TEXT,
    product_category TEXT,
    sub_category TEXT,
    amazon_units BIGINT,
    noon_units BIGINT,
    minutes_units BIGINT,
    total_units BIGINT
) AS $$
DECLARE
    max_date DATE;
BEGIN
    SELECT MAX(date) INTO max_date FROM fact_sales WHERE is_current = true AND COALESCE(saddl_id, 'none') = p_saddl_id;
    
    IF max_date IS NULL THEN
        SELECT MAX(date) INTO max_date FROM sales_snapshot WHERE COALESCE(saddl_id, 'none') = p_saddl_id;
        
        IF max_date IS NULL THEN RETURN; END IF;

        RETURN QUERY
        SELECT 
            s.sku::TEXT,
            MAX(s.category)::TEXT as category,
            MAX(s.product_category)::TEXT as product_category,
            MAX(s.sub_category)::TEXT as sub_category,
            SUM(CASE WHEN LOWER(s.sales_channel) = 'amazon' THEN s.total_units ELSE 0 END)::BIGINT as amazon_units,
            SUM(CASE WHEN LOWER(s.sales_channel) = 'noon' THEN s.total_units ELSE 0 END)::BIGINT as noon_units,
            SUM(CASE WHEN LOWER(s.sales_channel) = 'minutes' THEN s.total_units ELSE 0 END)::BIGINT as minutes_units,
            SUM(s.total_units)::BIGINT as total_units
        FROM sales_snapshot s
        WHERE s.date >= max_date - days_count
        AND COALESCE(s.saddl_id, 'none') = p_saddl_id
        AND (p_categories IS NULL OR p_categories = '{}' OR s.category = ANY(p_categories))
        AND (p_product_categories IS NULL OR p_product_categories = '{}' OR s.product_category = ANY(p_product_categories))
        AND (p_sub_categories IS NULL OR p_sub_categories = '{}' OR s.sub_category = ANY(p_sub_categories))
        GROUP BY s.sku
        ORDER BY total_units DESC;
        RETURN;
    END IF;

    RETURN QUERY
    SELECT 
        f.sku::TEXT,
        MAX(f.category)::TEXT as category,
        MAX(f.product_category)::TEXT as product_category,
        MAX(f.sub_category)::TEXT as sub_category,
        SUM(CASE WHEN LOWER(f.sales_channel) = 'amazon' THEN f.total_units ELSE 0 END)::BIGINT as amazon_units,
        SUM(CASE WHEN LOWER(f.sales_channel) = 'noon' THEN f.total_units ELSE 0 END)::BIGINT as noon_units,
        SUM(CASE WHEN LOWER(f.sales_channel) = 'minutes' THEN f.total_units ELSE 0 END)::BIGINT as minutes_units,
        SUM(f.total_units)::BIGINT as total_units
    FROM fact_sales f
    WHERE f.date >= max_date - days_count
    AND f.is_current = true
    AND COALESCE(f.saddl_id, 'none') = p_saddl_id
    AND (p_categories IS NULL OR p_categories = '{}' OR f.category = ANY(p_categories))
    AND (p_product_categories IS NULL OR p_product_categories = '{}' OR f.product_category = ANY(p_product_categories))
    AND (p_sub_categories IS NULL OR p_sub_categories = '{}' OR f.sub_category = ANY(p_sub_categories))
    GROUP BY f.sku
    ORDER BY total_units DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 10. get_po_status_distribution
CREATE OR REPLACE FUNCTION public.get_po_status_distribution(
    p_saddl_id TEXT DEFAULT 's2c_uae_test'
)
RETURNS JSONB AS $$
DECLARE
    result JSONB;
BEGIN
    SELECT jsonb_agg(sub) INTO result
    FROM (
        SELECT 
            UPPER(status) AS status,
            COUNT(DISTINCT po_number) AS po_count,
            SUM(units_ordered) AS total_units
        FROM fact_purchase
        WHERE UPPER(status) IN ('ORDERED', 'SHIPPED')
        AND COALESCE(saddl_id, 'none') = p_saddl_id
        GROUP BY UPPER(status)
        ORDER BY po_count DESC
    ) sub;
    
    RETURN COALESCE(result, '[]'::JSONB);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 11. get_coverage_health
CREATE OR REPLACE FUNCTION public.get_coverage_health(
    p_categories TEXT[] DEFAULT NULL,
    p_product_categories TEXT[] DEFAULT NULL,
    p_sub_categories TEXT[] DEFAULT NULL,
    p_saddl_id TEXT DEFAULT 's2c_uae_test'
)
RETURNS JSONB AS $$
DECLARE
    result JSONB;
BEGIN
    SELECT jsonb_agg(sub) INTO result
    FROM (
        SELECT 
            CASE 
                WHEN total_coverage < 15 THEN '0-15 Days (Critical)'
                WHEN total_coverage >= 15 AND total_coverage < 30 THEN '15-30 Days (Warning)'
                WHEN total_coverage >= 30 AND total_coverage < 60 THEN '30-60 Days (Healthy)'
                ELSE '60+ Days (Overstocked)'
            END AS coverage_tier,
            COUNT(DISTINCT sku) AS sku_count,
            SUM(stock_in_hand) AS total_units,
            SUM(stock_in_hand * COALESCE(cogs, 0)) AS total_value
        FROM fact_inventory_planning
        WHERE is_active = true
        AND COALESCE(saddl_id, 'none') = p_saddl_id
        AND (p_categories IS NULL OR category = ANY(p_categories))
        AND (p_product_categories IS NULL OR product_category = ANY(p_product_categories))
        AND (p_sub_categories IS NULL OR sub_category = ANY(p_sub_categories))
        GROUP BY 
            CASE 
                WHEN total_coverage < 15 THEN '0-15 Days (Critical)'
                WHEN total_coverage >= 15 AND total_coverage < 30 THEN '15-30 Days (Warning)'
                WHEN total_coverage >= 30 AND total_coverage < 60 THEN '30-60 Days (Healthy)'
                ELSE '60+ Days (Overstocked)'
            END
        ORDER BY 
            CASE coverage_tier
                WHEN '0-15 Days (Critical)' THEN 1
                WHEN '15-30 Days (Warning)' THEN 2
                WHEN '30-60 Days (Healthy)' THEN 3
                ELSE 4
            END
    ) sub;
    
    RETURN COALESCE(result, '[]'::JSONB);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.get_final_valuation(text) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.get_dashboard_sales_summary(text[], text[], text[], text) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.get_mtd_forecast(text[], text[], text[], text) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.get_last_month_sales(text[], text[], text[], text) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.get_mtd_sales(text) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.get_today_sales(text) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.get_subcategory_performance(int, text[], text[], text[], text) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.get_sales_velocity_trend(int, text[], text[], text[], text) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.get_detailed_sales_performance(INT, TEXT[], TEXT[], TEXT[], TEXT) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.get_po_status_distribution(text) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.get_coverage_health(text[], text[], text[], text) TO authenticated, anon, service_role;
