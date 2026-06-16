CREATE OR REPLACE FUNCTION public.refresh_fact_sales_data(days_back integer DEFAULT 14)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    today_date DATE;
BEGIN
    today_date := (now() AT TIME ZONE 'Asia/Dubai')::date;

    -- DROP TEMP TABLE IF EXISTS
    DROP TABLE IF EXISTS temp_dedup_sales;

    -- CREATE TEMP STAGING TABLE
    CREATE TEMP TABLE temp_dedup_sales AS
    SELECT *
    FROM (
        SELECT 
            *,
            ROW_NUMBER() OVER (
                PARTITION BY 
                    date,
                    sales_channel,
                    fulfillment_model,
                    sku,
                    country,
                    saddl_id
                ORDER BY last_updated DESC
            ) AS rn
        FROM (
            -- =====================================================
            -- AMAZON SALES
            -- =====================================================
            SELECT 
                a.report_date AS date,
                'Amazon' AS sales_channel,
                'Amazon' AS fulfillment_model,
                s.asin,
                COALESCE(s.sku, a.child_asin) AS sku,
                s.category,
                s.product_category,
                s.sub_category,
                UPPER(COALESCE(a.country, 'UAE')) AS country,
                CASE WHEN a.saddl_id = 'none' OR a.saddl_id IS NULL THEN COALESCE(a.account_id, 'none') ELSE a.saddl_id END AS saddl_id,
                SUM(
                    CASE 
                        WHEN UPPER(COALESCE(a.country, 'UAE')) IN ('KSA', 'SA') AND COALESCE(a.ordered_revenue, 0) = 0 
                        THEN COALESCE(a.units_ordered, 0) * COALESCE(s_uae.avg_sell_price_aed, 0)
                        ELSE a.ordered_revenue 
                    END
                ) AS total_sales,
                SUM(a.units_ordered) AS total_units,
                MAX(a.pulled_at) AS last_updated
            FROM amazon_sales a
            LEFT JOIN sku_master s
                ON a.child_asin = s.asin AND UPPER(COALESCE(a.country, 'UAE')) = UPPER(COALESCE(s.country, 'UAE'))
            LEFT JOIN sku_master s_uae
                ON COALESCE(s.sku, a.child_asin) = s_uae.sku AND UPPER(COALESCE(s_uae.country, 'UAE')) = 'UAE'
            WHERE a.report_date >= today_date - (days_back || ' days')::interval
            GROUP BY 
                a.report_date,
                s.asin,
                COALESCE(s.sku, a.child_asin),
                s.category,
                s.product_category,
                s.sub_category,
                UPPER(COALESCE(a.country, 'UAE')),
                CASE WHEN a.saddl_id = 'none' OR a.saddl_id IS NULL THEN COALESCE(a.account_id, 'none') ELSE a.saddl_id END

            UNION ALL

            -- =====================================================
            -- NOON SALES
            -- =====================================================
            SELECT 
                CAST(n.order_timestamp AS DATE) AS date,
                'Noon' AS sales_channel,
                n.fulfillment_model,
                s.asin,
                COALESCE(s.sku, n.partner_sku, n.sku) AS sku,
                s.category,
                s.product_category,
                s.sub_category,
                CASE 
                    WHEN UPPER(COALESCE(n.src_country, 'AE')) = 'AE' THEN 'UAE'
                    WHEN UPPER(COALESCE(n.src_country, 'AE')) IN ('SA', 'KSA') THEN 'KSA'
                    ELSE UPPER(COALESCE(n.src_country, 'UAE'))
                END AS country,
                COALESCE(n.saddl_id, 'none') AS saddl_id,
                SUM(n.offer_price) AS total_sales,
                COUNT(n.item_nr) AS total_units,
                MAX(n.delivered_timestamp) AS last_updated
            FROM noon_sales n
            LEFT JOIN sku_master s
                ON n.partner_sku = s.sku 
                AND (
                    CASE 
                        WHEN UPPER(COALESCE(n.src_country, 'AE')) = 'AE' THEN 'UAE'
                        WHEN UPPER(COALESCE(n.src_country, 'AE')) IN ('SA', 'KSA') THEN 'KSA'
                        ELSE UPPER(COALESCE(n.src_country, 'UAE'))
                    END
                ) = UPPER(COALESCE(s.country, 'UAE'))
            WHERE CAST(n.order_timestamp AS DATE) >= today_date - (days_back || ' days')::interval
            GROUP BY 
                CAST(n.order_timestamp AS DATE),
                n.fulfillment_model,
                s.asin,
                COALESCE(s.sku, n.partner_sku, n.sku),
                s.category,
                s.product_category,
                s.sub_category,
                CASE WHEN UPPER(COALESCE(n.src_country, 'AE')) = 'AE' THEN 'UAE' WHEN UPPER(COALESCE(n.src_country, 'AE')) IN ('SA', 'KSA') THEN 'KSA' ELSE UPPER(COALESCE(n.src_country, 'UAE')) END,
                COALESCE(n.saddl_id, 'none')

            UNION ALL

            -- =====================================================
            -- MINUTES SALES
            -- =====================================================
            SELECT 
                m.order_date AS date,
                'Minutes' AS sales_channel,
                'Minutes' AS fulfillment_model,
                s.asin,
                COALESCE(s.sku, m.partner_sku, m.sku) AS sku,
                s.category,
                s.product_category,
                s.sub_category,
                CASE 
                    WHEN UPPER(COALESCE(m.country_code, 'AE')) = 'AE' THEN 'UAE'
                    WHEN UPPER(COALESCE(m.country_code, 'AE')) IN ('SA', 'KSA') THEN 'KSA'
                    ELSE UPPER(COALESCE(m.country_code, 'UAE'))
                END AS country,
                COALESCE(m.saddl_id, 'none') AS saddl_id,
                SUM(m.price) AS total_sales,
                COUNT(m.item_nr) AS total_units,
                NOW() AS last_updated
            FROM minutes_sales m
            LEFT JOIN sku_master s
                ON m.partner_sku = s.sku
                AND (
                    CASE 
                        WHEN UPPER(COALESCE(m.country_code, 'AE')) = 'AE' THEN 'UAE'
                        WHEN UPPER(COALESCE(m.country_code, 'AE')) IN ('SA', 'KSA') THEN 'KSA'
                        ELSE UPPER(COALESCE(m.country_code, 'UAE'))
                    END
                ) = UPPER(COALESCE(s.country, 'UAE'))
            WHERE m.order_date >= today_date - (days_back || ' days')::interval
            GROUP BY 
                m.order_date,
                s.asin,
                COALESCE(s.sku, m.partner_sku, m.sku),
                s.category,
                s.product_category,
                s.sub_category,
                CASE WHEN UPPER(COALESCE(m.country_code, 'AE')) = 'AE' THEN 'UAE' WHEN UPPER(COALESCE(m.country_code, 'AE')) IN ('SA', 'KSA') THEN 'KSA' ELSE UPPER(COALESCE(m.country_code, 'UAE')) END,
                COALESCE(m.saddl_id, 'none')
        ) sales_data
    ) final_data
    WHERE rn = 1;

    -- =====================================================
    -- EXPIRE OLD RECORDS (SCD TYPE 2)
    -- =====================================================
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
    AND COALESCE(f.country,'') = COALESCE(d.country,'')
    AND COALESCE(f.saddl_id,'') = COALESCE(d.saddl_id,'')
    AND (
           COALESCE(f.total_sales,0) <> COALESCE(d.total_sales,0)
        OR COALESCE(f.total_units,0) <> COALESCE(d.total_units,0)
        OR COALESCE(f.category,'') <> COALESCE(d.category,'')
        OR COALESCE(f.product_category,'') <> COALESCE(d.product_category,'')
        OR COALESCE(f.sub_category,'') <> COALESCE(d.sub_category,'')
    );

    -- =====================================================
    -- INSERT NEW / CHANGED RECORDS
    -- =====================================================
    INSERT INTO fact_sales (
        date,
        sales_channel,
        fulfillment_model,
        asin,
        sku,
        category,
        product_category,
        sub_category,
        country,
        saddl_id,
        total_sales,
        total_units,
        effective_from,
        effective_to,
        is_current,
        last_updated
    )
    SELECT
        d.date,
        d.sales_channel,
        d.fulfillment_model,
        d.asin,
        d.sku,
        d.category,
        d.product_category,
        d.sub_category,
        d.country,
        d.saddl_id,
        d.total_sales,
        d.total_units,
        NOW(),
        NULL,
        TRUE,
        NOW()
    FROM temp_dedup_sales d
    LEFT JOIN fact_sales f
        ON f.is_current = TRUE
        AND f.date = d.date
        AND f.sales_channel = d.sales_channel
        AND COALESCE(f.fulfillment_model,'') = COALESCE(d.fulfillment_model,'')
        AND COALESCE(f.sku,'') = COALESCE(d.sku,'')
        AND COALESCE(f.country,'') = COALESCE(d.country,'')
        AND COALESCE(f.saddl_id,'') = COALESCE(d.saddl_id,'')
    WHERE f.fact_sales_key IS NULL
    OR (
           COALESCE(f.total_sales,0) <> COALESCE(d.total_sales,0)
        OR COALESCE(f.total_units,0) <> COALESCE(d.total_units,0)
        OR COALESCE(f.category,'') <> COALESCE(d.category,'')
        OR COALESCE(f.product_category,'') <> COALESCE(d.product_category,'')
        OR COALESCE(f.sub_category,'') <> COALESCE(d.sub_category,'')
    );

    -- =====================================================
    -- CLEANUP
    -- =====================================================
    DROP TABLE IF EXISTS temp_dedup_sales;

    RAISE NOTICE 'Incremental SCD2 refresh completed successfully';
END;
$function$;

SELECT public.refresh_fact_sales_data(90);
