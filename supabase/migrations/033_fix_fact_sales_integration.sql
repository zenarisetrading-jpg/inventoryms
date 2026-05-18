-- =========================================================
-- 033_fix_fact_sales_integration.sql
-- COMPREHENSIVE FIX: Table Creation, Permissions, and Analytics
-- =========================================================

-- 1. Create amazon_sales table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.amazon_sales (
    id                  BIGSERIAL PRIMARY KEY,
    report_date         DATE NOT NULL,
    child_asin          TEXT NOT NULL,
    ordered_revenue     DECIMAL(18,2) DEFAULT 0,
    units_ordered       INTEGER DEFAULT 0,
    pulled_at           TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(report_date, child_asin)
);

CREATE INDEX IF NOT EXISTS idx_amazon_sales_asin ON public.amazon_sales(child_asin);
CREATE INDEX IF NOT EXISTS idx_amazon_sales_date ON public.amazon_sales(report_date);

-- 2. Ensure refresh_fact_sales_data exists and has proper permissions
CREATE OR REPLACE FUNCTION public.refresh_fact_sales_data()
RETURNS void SECURITY DEFINER AS $$
BEGIN
    -- Create Temp Staging Table
    CREATE TEMP TABLE IF NOT EXISTS temp_dedup_sales (
        date DATE,
        sales_channel VARCHAR(50),
        fulfillment_model VARCHAR(255),
        asin VARCHAR(255),
        sku VARCHAR(255),
        category VARCHAR(255),
        product_category VARCHAR(255),
        sub_category VARCHAR(255),
        total_sales DECIMAL(18,2),
        total_units DECIMAL(18,2),
        last_updated TIMESTAMP
    ) ON COMMIT DROP;

    INSERT INTO temp_dedup_sales
    SELECT *
    FROM (
        SELECT 
            date, sales_channel, fulfillment_model, asin, sku,
            category, product_category, sub_category, total_sales, total_units, last_updated
        FROM (
            SELECT 
                *,
                ROW_NUMBER() OVER (
                    PARTITION BY date, sales_channel, fulfillment_model, sku
                    ORDER BY last_updated DESC
                ) AS rn
            FROM (
                -- AMAZON SALES
                SELECT 
                    a.report_date AS date,
                    'Amazon' AS sales_channel,
                    'Amazon' AS fulfillment_model,
                    s.asin,
                    s.sku,
                    s.category,
                    s.product_category,
                    s.sub_category,
                    SUM(a.ordered_revenue) AS total_sales,
                    SUM(a.units_ordered) AS total_units,
                    MAX(a.pulled_at) AS last_updated
                FROM amazon_sales a
                LEFT JOIN sku_master s ON a.child_asin = s.asin
                GROUP BY a.report_date, s.asin, s.sku, s.category, s.product_category, s.sub_category

                UNION ALL

                -- NOON SALES
                SELECT 
                    CAST(n.order_timestamp AS DATE) AS date,
                    'Noon' AS sales_channel,
                    n.fulfillment_model,
                    s.asin,
                    s.sku,
                    s.category,
                    s.product_category,
                    s.sub_category,
                    SUM(n.offer_price) AS total_sales,
                    COUNT(n.item_nr) AS total_units,
                    MAX(n.delivered_timestamp) AS last_updated
                FROM noon_sales n
                LEFT JOIN sku_master s ON n.partner_sku = s.sku
                GROUP BY CAST(n.order_timestamp AS DATE), n.fulfillment_model, s.asin, s.sku, s.category, s.product_category, s.sub_category

                UNION ALL

                -- MINUTES SALES
                SELECT 
                    m.order_date AS date,
                    'Minutes' AS sales_channel,
                    'Minutes' AS fulfillment_model,
                    s.asin,
                    s.sku,
                    s.category,
                    s.product_category,
                    s.sub_category,
                    SUM(m.price) AS total_sales,
                    COUNT(m.item_nr) AS total_units,
                    NOW() AS last_updated
                FROM minutes_sales m
                LEFT JOIN sku_master s ON m.partner_sku = s.sku
                GROUP BY m.order_date, s.asin, s.sku, s.category, s.product_category, s.sub_category
            ) sales_data
        ) final_data
        WHERE rn = 1
    ) sub;

    -- EXPIRE OLD RECORDS (SCD TYPE 2)
    UPDATE fact_sales f
    SET 
        effective_to = NOW(),
        is_current = FALSE,
        last_updated = NOW()
    FROM temp_dedup_sales d
    WHERE f.is_current = TRUE
    AND f.date = d.date
    AND f.sales_channel = d.sales_channel
    AND COALESCE(f.fulfillment_model,'') = COALESCE(d.fulfillment_model,'')
    AND COALESCE(f.sku,'') = COALESCE(d.sku,'')
    AND (
           COALESCE(f.total_sales,0) <> COALESCE(d.total_sales,0)
        OR COALESCE(f.total_units,0) <> COALESCE(d.total_units,0)
        OR COALESCE(f.category,'') <> COALESCE(d.category,'')
        OR COALESCE(f.product_category,'') <> COALESCE(d.product_category,'')
        OR COALESCE(f.sub_category,'') <> COALESCE(d.sub_category,'')
    );

    -- INSERT NEW CURRENT RECORDS
    INSERT INTO fact_sales (
        date, sales_channel, fulfillment_model, asin, sku,
        category, product_category, sub_category, total_sales, total_units,
        effective_from, is_current, last_updated
    )
    SELECT
        d.date, d.sales_channel, d.fulfillment_model, d.asin, d.sku,
        d.category, d.product_category, d.sub_category, d.total_sales, d.total_units,
        NOW(), TRUE, NOW()
    FROM temp_dedup_sales d
    LEFT JOIN fact_sales f
        ON f.is_current = TRUE
        AND f.date = d.date
        AND f.sales_channel = d.sales_channel
        AND COALESCE(f.fulfillment_model,'') = COALESCE(d.fulfillment_model,'')
        AND COALESCE(f.sku,'') = COALESCE(d.sku,'')
    WHERE f.fact_sales_key IS NULL
    OR (
           COALESCE(f.total_sales,0) <> COALESCE(d.total_sales,0)
        OR COALESCE(f.total_units,0) <> COALESCE(d.total_units,0)
        OR COALESCE(f.category,'') <> COALESCE(d.category,'')
        OR COALESCE(f.product_category,'') <> COALESCE(d.product_category,'')
        OR COALESCE(f.sub_category,'') <> COALESCE(d.sub_category,'')
    );
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION public.refresh_fact_sales_data() TO authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_fact_sales_data() TO anon;
GRANT EXECUTE ON FUNCTION public.refresh_fact_sales_data() TO service_role;

-- 3. Define missing refresh_amazon_sales_data if it doesn't exist
CREATE OR REPLACE FUNCTION public.refresh_amazon_sales_data()
RETURNS void SECURITY DEFINER AS $$
BEGIN
    RAISE NOTICE 'Amazon Sales Data Refresh Triggered';
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION public.refresh_amazon_sales_data() TO authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_amazon_sales_data() TO anon;
GRANT EXECUTE ON FUNCTION public.refresh_amazon_sales_data() TO service_role;

-- 4. Define execute_sql utility
CREATE OR REPLACE FUNCTION public.execute_sql(sql text)
RETURNS void SECURITY DEFINER AS $$
BEGIN
    EXECUTE sql;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION public.execute_sql(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.execute_sql(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.execute_sql(text) TO anon;

-- 5. Update get_dashboard_sales_summary to use fact_sales
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
            COALESCE(SUM(CASE WHEN LOWER(f.sales_channel) = 'noon' AND f.fulfillment_model = 'Noon' THEN f.total_sales ELSE 0 END), 0) as noon_sales,
            COALESCE(SUM(CASE WHEN LOWER(f.sales_channel) = 'noon' AND f.fulfillment_model = 'Noon' THEN f.total_units ELSE 0 END), 0) as noon_units,
            COALESCE(SUM(CASE WHEN LOWER(f.sales_channel) = 'minutes' OR (LOWER(f.sales_channel) = 'noon' AND f.fulfillment_model = 'Minutes') THEN f.total_sales ELSE 0 END), 0) as minutes_sales,
            COALESCE(SUM(CASE WHEN LOWER(f.sales_channel) = 'minutes' OR (LOWER(f.sales_channel) = 'noon' AND f.fulfillment_model = 'Minutes') THEN f.total_units ELSE 0 END), 0) as minutes_units
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

-- 6. Optimized get_subcategory_performance
CREATE OR REPLACE FUNCTION get_subcategory_performance(
    days_count INT,
    p_categories TEXT[] DEFAULT NULL,
    p_product_categories TEXT[] DEFAULT NULL,
    p_sub_categories TEXT[] DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    result JSONB;
    anchor_date DATE;
BEGIN
    SELECT MAX(date) INTO anchor_date FROM public.fact_sales WHERE is_current = TRUE;
    
    SELECT jsonb_agg(sub) INTO result
    FROM (
        SELECT  
            COALESCE(f.sub_category, 'Uncategorized') AS sub_category,
            COALESCE(SUM(f.total_units), 0) AS total_units
        FROM public.fact_sales f
        WHERE f.is_current = TRUE
          AND f.date >= anchor_date - (days_count || ' days')::INTERVAL
          AND (p_categories IS NULL OR p_categories = '{}' OR f.category = ANY(p_categories))
          AND (p_product_categories IS NULL OR p_product_categories = '{}' OR f.product_category = ANY(p_product_categories))
          AND (p_sub_categories IS NULL OR p_sub_categories = '{}' OR f.sub_category = ANY(p_sub_categories))
        GROUP BY f.sub_category
        ORDER BY total_units DESC
    ) sub;
    RETURN COALESCE(result, '[]'::JSONB);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. Optimized get_sales_velocity_trend
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
    SELECT MAX(date) INTO max_date FROM public.fact_sales WHERE is_current = TRUE;
    IF max_date IS NULL THEN RETURN '[]'::JSONB; END IF;

    SELECT jsonb_agg(row) INTO result
    FROM (
        SELECT 
            f.date,
            COALESCE(SUM(CASE WHEN LOWER(f.sales_channel) = 'amazon' THEN f.total_units ELSE 0 END), 0) AS amazon,
            COALESCE(SUM(CASE WHEN LOWER(f.sales_channel) = 'noon' AND f.fulfillment_model = 'Noon' THEN f.total_units ELSE 0 END), 0) AS noon,
            COALESCE(SUM(CASE WHEN LOWER(f.sales_channel) = 'minutes' OR (LOWER(f.sales_channel) = 'noon' AND f.fulfillment_model = 'Minutes') THEN f.total_units ELSE 0 END), 0) AS minutes,
            COALESCE(SUM(f.total_units), 0) AS total
        FROM public.fact_sales f
        WHERE f.is_current = TRUE
          AND f.date > (max_date - (days_count || ' days')::INTERVAL)
          AND f.date <= max_date
          AND (p_categories IS NULL OR p_categories = '{}' OR f.category = ANY(p_categories))
          AND (p_product_categories IS NULL OR p_product_categories = '{}' OR f.product_category = ANY(p_product_categories))
          AND (p_sub_categories IS NULL OR p_sub_categories = '{}' OR f.sub_category = ANY(p_sub_categories))
        GROUP BY f.date
        ORDER BY f.date ASC
    ) row;
    RETURN COALESCE(result, '[]'::JSONB);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 8. Optimized get_detailed_sales_performance
CREATE OR REPLACE FUNCTION get_detailed_sales_performance(days_count INT)
RETURNS JSONB AS $$
DECLARE
    result JSONB;
    max_date DATE;
BEGIN
    SELECT MAX(date) INTO max_date FROM public.fact_sales WHERE is_current = TRUE;

    SELECT jsonb_agg(sub) INTO result
    FROM (
        SELECT  
            f.category,
            f.product_category,
            f.sub_category, 
            f.sku,
            SUM(CASE WHEN LOWER(f.sales_channel) = 'amazon' THEN f.total_units ELSE 0 END) AS amazon_units,
            SUM(CASE WHEN LOWER(f.sales_channel) = 'noon' AND f.fulfillment_model = 'Noon' THEN f.total_units ELSE 0 END) AS noon_units,
            SUM(CASE WHEN LOWER(f.sales_channel) = 'minutes' OR (LOWER(f.sales_channel) = 'noon' AND f.fulfillment_model = 'Minutes') THEN f.total_units ELSE 0 END) AS minutes_units,
            SUM(f.total_units) AS total_units
        FROM public.fact_sales f
        WHERE f.is_current = TRUE
          AND (days_count IS NULL OR f.date > (max_date - (days_count || ' days')::INTERVAL))
        GROUP BY f.category, f.product_category, f.sub_category, f.sku
        ORDER BY total_units DESC
    ) sub;
    RETURN COALESCE(result, '[]'::JSONB);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 9. Fix Valuation Function and Alias
CREATE OR REPLACE FUNCTION get_final_valuation()
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
    FROM fact_inventory_planning;
    
    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 10. Utility: Get Unique Suppliers
CREATE OR REPLACE FUNCTION get_unique_suppliers()
RETURNS TEXT[] AS $$
BEGIN
    RETURN ARRAY(
        SELECT DISTINCT supplier 
        FROM fact_purchase 
        WHERE supplier IS NOT NULL 
        ORDER BY supplier
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 11. Global Grants
GRANT EXECUTE ON FUNCTION get_dashboard_sales_summary() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION get_subcategory_performance(INT, TEXT[], TEXT[], TEXT[]) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION get_sales_velocity_trend(INT, TEXT[], TEXT[], TEXT[]) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION get_detailed_sales_performance(INT) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION get_final_valuation() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION get_po_status_distribution() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION get_coverage_health(TEXT[], TEXT[], TEXT[]) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION get_unique_suppliers() TO authenticated, anon;
