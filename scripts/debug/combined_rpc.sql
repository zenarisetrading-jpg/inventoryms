-- Function to get inventory totals matching the user's requirement
CREATE OR REPLACE FUNCTION get_inventory_valuation_totals()
RETURNS TABLE (
    fba_total_cogs numeric,
    fbn_total_cogs numeric,
    minutes_total_cogs numeric,
    locad_total_cogs numeric
) 
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COALESCE(SUM(fba_units * cogs), 0) AS fba_total_cogs,
        COALESCE(SUM(fbn_units * cogs), 0) AS fbn_total_cogs,
        COALESCE(SUM(minutes_units * cogs), 0) AS minutes_total_cogs,
        COALESCE(SUM(locad_units * cogs), 0) AS locad_total_cogs
    FROM fact_inventory_planning;
END;
$$;
-- RPC to get detailed sales performance for the last 30 days
CREATE OR REPLACE FUNCTION get_detailed_sales_performance()
RETURNS JSONB AS $$
DECLARE
    result JSONB;
BEGIN
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
        WHERE a.date >= (SELECT MAX(date) FROM sales_snapshot) - INTERVAL '30 days'
        GROUP BY b.category, b.sub_category, a.sku, a.channel
        ORDER BY total_units_sold DESC
        LIMIT 50
    ) sub;
    
    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_detailed_sales_performance() TO anon;
GRANT EXECUTE ON FUNCTION get_detailed_sales_performance() TO authenticated;
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
-- RPC to get PO status distribution for Performance dashboard
CREATE OR REPLACE FUNCTION get_po_status_distribution()
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
        GROUP BY UPPER(status)
        ORDER BY po_count DESC
    ) sub;
    
    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_po_status_distribution() TO anon;
GRANT EXECUTE ON FUNCTION get_po_status_distribution() TO authenticated;
-- Updated RPC to get Median Coverage Health using user-provided logic
CREATE OR REPLACE FUNCTION get_coverage_health()
RETURNS JSONB AS $$
DECLARE
    result JSONB;
BEGIN
    SELECT jsonb_build_object(
        'amazon', median_fba_coverage,
        'noon', median_noon_coverage,
        'minutes', median_minutes_coverage,
        'locad', median_locad_coverage
    ) INTO result
    FROM (
        SELECT 
            PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY fba_units / NULLIF(amazon_sv, 0)) AS median_fba_coverage,
            PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY fbn_units / NULLIF(noon_sv, 0)) AS median_noon_coverage,
            PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY minutes_units / NULLIF(minutes_sv, 0)) AS median_minutes_coverage,
            PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY locad_units / NULLIF(blended_sv, 0)) AS median_locad_coverage
        FROM fact_inventory_planning
        WHERE is_active = true
          AND (
                (fba_units > 0 AND amazon_sv > 0)
             OR (fbn_units > 0 AND noon_sv > 0)
             OR (minutes_units > 0 AND minutes_sv > 0)
             OR (locad_units > 0 AND blended_sv > 0)
          )
    ) sub;
    
    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_coverage_health () TO anon;

GRANT EXECUTE ON FUNCTION get_coverage_health () TO authenticated;
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
-- Migration: 023_dashboard_stats_rpc.sql
-- Adds pricing metadata and RPC for dashboard summary cards

-- 1. Add pricing to sku_master
ALTER TABLE sku_master ADD COLUMN IF NOT EXISTS avg_sell_price_aed NUMERIC DEFAULT 0;

-- 2. Populate some dummy prices based on COGS if they are 0 (COGS * 2.5 is a safe guess for these categories)
UPDATE sku_master SET avg_sell_price_aed = cogs * 2.5 WHERE (avg_sell_price_aed IS NULL OR avg_sell_price_aed = 0) AND cogs > 0;

-- 3. Add advertising rate to system_config if missing
INSERT INTO system_config (key, value, description) 
VALUES ('abc_adv_rate', '0.15', 'Estimated advertising cost as percentage of revenue')
ON CONFLICT (key) DO NOTHING;

-- 4. Create RPC for Dashboard Stats
CREATE OR REPLACE FUNCTION get_dashboard_sales_summary()
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
    -- Get current context
    SELECT MAX(date) INTO max_date FROM sales_snapshot;
    IF max_date IS NULL THEN RETURN '{}'::JSONB; END IF;
    
    today_date := max_date;
    yesterday_date := max_date - INTERVAL '1 day';
    mtd_start := DATE_TRUNC('month', max_date);
    last_month_start := mtd_start - INTERVAL '1 month';
    last_month_end := mtd_start - INTERVAL '1 day';
    
    days_in_month := EXTRACT(DAY FROM (DATE_TRUNC('month', max_date) + INTERVAL '1 month' - INTERVAL '1 day'));
    days_passed_mtd := EXTRACT(DAY FROM max_date);

    -- Get rates from config
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
            COALESCE(SUM(s.units_sold), 0) as units,
            COALESCE(COUNT(DISTINCT s.id), 0) as orders, -- Note: this is a proxy since we don't have order_id
            COALESCE(SUM(s.units_sold * sm.avg_sell_price_aed), 0) as sales_aed,
            COALESCE(SUM(s.units_sold * sm.cogs), 0) as total_cogs,
            -- Breakdown by channel
            COALESCE(SUM(CASE WHEN s.channel = 'amazon' THEN s.units_sold * sm.avg_sell_price_aed ELSE 0 END), 0) as amazon_sales,
            COALESCE(SUM(CASE WHEN s.channel = 'amazon' THEN s.units_sold ELSE 0 END), 0) as amazon_units,
            COALESCE(SUM(CASE WHEN s.channel = 'noon' THEN s.units_sold * sm.avg_sell_price_aed ELSE 0 END), 0) as noon_sales,
            COALESCE(SUM(CASE WHEN s.channel = 'noon' THEN s.units_sold ELSE 0 END), 0) as noon_units,
            COALESCE(SUM(CASE WHEN s.channel = 'noon_minutes' THEN s.units_sold * sm.avg_sell_price_aed ELSE 0 END), 0) as minutes_sales,
            COALESCE(SUM(CASE WHEN s.channel = 'noon_minutes' THEN s.units_sold ELSE 0 END), 0) as minutes_units
        FROM date_ranges dr
        LEFT JOIN sales_snapshot s ON s.date >= dr.start_d AND s.date <= dr.end_d
        LEFT JOIN sku_master sm ON s.sku = sm.sku
        GROUP BY dr.label
    ),
    calculated_stats AS (
        SELECT 
            *,
            (sales_aed * adv_rate) as adv_cost,
            (sales_aed * (1 - fee_rate)) as est_payout,
            (sales_aed * (1 - fee_rate) - total_cogs) as gross_profit,
            (sales_aed * (1 - fee_rate) - total_cogs - (sales_aed * adv_rate)) as net_profit,
            CASE 
                WHEN label = 'mtd' THEN (sales_aed / days_passed_mtd) * days_in_month 
                ELSE 0 
            END as forecast_sales
        FROM range_stats
    )
    SELECT jsonb_object_agg(label, row_to_json(calculated_stats)) INTO result FROM calculated_stats;
    
    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_dashboard_sales_summary() TO anon;
GRANT EXECUTE ON FUNCTION get_dashboard_sales_summary() TO authenticated;
-- Migration: 024_filtered_trend_rpc.sql
-- Updates get_sales_velocity_trend to support filtering by category/class/subcategory

CREATE OR REPLACE FUNCTION get_sales_velocity_trend(
    days_count INT,
    p_categories TEXT[] DEFAULT NULL,
    p_product_categories TEXT[] DEFAULT NULL,
    p_sub_categories TEXT[] DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    result JSONB;
    max_date DATE;
BEGIN
    -- Get the most recent date in the system to anchor the trend
    SELECT MAX(date) INTO max_date FROM sales_snapshot;
    IF max_date IS NULL THEN RETURN '[]'::JSONB; END IF;

    SELECT jsonb_agg(row) INTO result
    FROM (
        SELECT 
            s.date,
            COALESCE(SUM(CASE WHEN s.channel = 'amazon' THEN s.units_sold ELSE 0 END), 0) AS amazon,
            COALESCE(SUM(CASE WHEN s.channel = 'noon' THEN s.units_sold ELSE 0 END), 0) AS noon,
            COALESCE(SUM(CASE WHEN s.channel = 'noon_minutes' THEN s.units_sold ELSE 0 END), 0) AS minutes,
            COALESCE(SUM(s.units_sold), 0) AS total
        FROM sales_snapshot s
        LEFT JOIN sku_master sm ON s.sku = sm.sku
        WHERE s.date > (max_date - (days_count || ' days')::INTERVAL)
          AND s.date <= max_date
          AND (p_categories IS NULL OR p_categories = '{}' OR sm.category = ANY(p_categories))
          AND (p_product_categories IS NULL OR p_product_categories = '{}' OR sm.product_category = ANY(p_product_categories))
          AND (p_sub_categories IS NULL OR p_sub_categories = '{}' OR sm.sub_category = ANY(p_sub_categories))
        GROUP BY s.date
        ORDER BY s.date ASC
    ) row;
    
    RETURN COALESCE(result, '[]'::JSONB);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_sales_velocity_trend(INT, TEXT[], TEXT[], TEXT[]) TO anon;
GRANT EXECUTE ON FUNCTION get_sales_velocity_trend(INT, TEXT[], TEXT[], TEXT[]) TO authenticated;
-- Migration: 025_filtered_subcategory_rpc.sql
-- Updates get_subcategory_performance to support filtering by category/class/subcategory

CREATE OR REPLACE FUNCTION get_subcategory_performance(
    days_count INT,
    p_categories TEXT[] DEFAULT NULL,
    p_product_categories TEXT[] DEFAULT NULL,
    p_sub_categories TEXT[] DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    result JSONB;
BEGIN
    SELECT jsonb_agg(sub) INTO result
    FROM (
        SELECT  
            COALESCE(sm.sub_category, 'Uncategorized') AS sub_category,
            COALESCE(SUM(s.units_sold), 0) AS total_units
        FROM sales_snapshot s
        JOIN sku_master sm ON s.sku = sm.sku
        WHERE s.date >= (SELECT MAX(date) FROM sales_snapshot) - (days_count || ' days')::INTERVAL
          AND (p_categories IS NULL OR p_categories = '{}' OR sm.category = ANY(p_categories))
          AND (p_product_categories IS NULL OR p_product_categories = '{}' OR sm.product_category = ANY(p_product_categories))
          AND (p_sub_categories IS NULL OR p_sub_categories = '{}' OR sm.sub_category = ANY(p_sub_categories))
        GROUP BY sm.sub_category
        ORDER BY total_units DESC
    ) sub;
    
    RETURN COALESCE(result, '[]'::JSONB);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_subcategory_performance(INT, TEXT[], TEXT[], TEXT[]) TO anon;
GRANT EXECUTE ON FUNCTION get_subcategory_performance(INT, TEXT[], TEXT[], TEXT[]) TO authenticated;
-- Migration: 026_filtered_coverage_rpc.sql
-- Updates get_coverage_health to support filtering by category/class/subcategory

CREATE OR REPLACE FUNCTION get_coverage_health(
    p_categories TEXT[] DEFAULT NULL,
    p_product_categories TEXT[] DEFAULT NULL,
    p_sub_categories TEXT[] DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    result JSONB;
BEGIN
    SELECT jsonb_build_object(
        'amazon', COALESCE(median_fba_coverage, 0),
        'noon', COALESCE(median_noon_coverage, 0),
        'minutes', COALESCE(median_minutes_coverage, 0),
        'locad', COALESCE(median_locad_coverage, 0)
    ) INTO result
    FROM (
        SELECT 
            PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY f.fba_units / NULLIF(f.amazon_sv, 0)) AS median_fba_coverage,
            PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY f.fbn_units / NULLIF(f.noon_sv, 0)) AS median_noon_coverage,
            PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY f.minutes_units / NULLIF(f.minutes_sv, 0)) AS median_minutes_coverage,
            PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY f.locad_units / NULLIF(f.blended_sv, 0)) AS median_locad_coverage
        FROM fact_inventory_planning f
        LEFT JOIN sku_master sm ON f.sku = sm.sku
        WHERE f.is_active = true
          AND (p_categories IS NULL OR p_categories = '{}' OR sm.category = ANY(p_categories))
          AND (p_product_categories IS NULL OR p_product_categories = '{}' OR sm.product_category = ANY(p_product_categories))
          AND (p_sub_categories IS NULL OR p_sub_categories = '{}' OR sm.sub_category = ANY(p_sub_categories))
          AND (
                (f.fba_units > 0 AND f.amazon_sv > 0)
             OR (f.fbn_units > 0 AND f.noon_sv > 0)
             OR (f.minutes_units > 0 AND f.minutes_sv > 0)
             OR (f.locad_units > 0 AND f.blended_sv > 0)
          )
    ) sub;
    
    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_coverage_health(TEXT[], TEXT[], TEXT[]) TO anon;
GRANT EXECUTE ON FUNCTION get_coverage_health(TEXT[], TEXT[], TEXT[]) TO authenticated;
-- =========================================================
-- 035_mtd_sales_rpc.sql
-- Month to date performance by sales channel
-- =========================================================

CREATE OR REPLACE FUNCTION public.get_mtd_sales()
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
        WHERE date >= DATE_TRUNC('month', CURRENT_DATE)
        AND date <= CURRENT_DATE
        AND is_current = TRUE
        GROUP BY sales_channel

        UNION ALL

        SELECT 
            'TOTAL' AS sales_channel,
            ROUND(SUM(total_sales), 2) AS total_sales,
            SUM(total_units) AS total_units
        FROM public.fact_sales
        WHERE date >= DATE_TRUNC('month', CURRENT_DATE)
        AND date <= CURRENT_DATE
        AND is_current = TRUE
        ORDER BY sales_channel
    ) row;
    
    RETURN COALESCE(result, '[]'::JSONB);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.get_mtd_sales() TO authenticated, anon, service_role;
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
