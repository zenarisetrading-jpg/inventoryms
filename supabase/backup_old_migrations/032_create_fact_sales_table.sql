-- =========================================================
-- 032_create_fact_sales_table.sql
-- IMPLEMENTATION: SCD TYPE 2 FACT TABLE FOR MULTI-CHANNEL SALES
-- =========================================================

-- 1. Create the Fact Table
CREATE TABLE IF NOT EXISTS public.fact_sales (
    fact_sales_key      BIGSERIAL PRIMARY KEY,
    date                DATE NOT NULL,
    sales_channel       VARCHAR(50) NOT NULL,
    fulfillment_model   VARCHAR(255),
    asin                VARCHAR(255),
    sku                 VARCHAR(255),
    category            VARCHAR(255),
    product_category    VARCHAR(255),
    sub_category        VARCHAR(255),
    total_sales         DECIMAL(18,2) DEFAULT 0,
    total_units         DECIMAL(18,2) DEFAULT 0,
    effective_from      TIMESTAMP DEFAULT NOW(),
    effective_to        TIMESTAMP,
    is_current          BOOLEAN DEFAULT TRUE,
    last_updated        TIMESTAMP DEFAULT NOW()
);

-- Indexing for performance
CREATE INDEX IF NOT EXISTS idx_fact_sales_lookup ON fact_sales (date, sales_channel, sku) WHERE is_current = TRUE;
CREATE INDEX IF NOT EXISTS idx_fact_sales_current ON fact_sales (is_current);

-- 2. Stored Procedure to Refresh Fact Table
CREATE OR REPLACE FUNCTION refresh_fact_sales_data()
RETURNS void SECURITY DEFINER AS $$
BEGIN
    -- Create Temp Staging Table
    CREATE TEMP TABLE temp_dedup_sales ON COMMIT DROP AS
    SELECT *
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
    WHERE rn = 1;

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
