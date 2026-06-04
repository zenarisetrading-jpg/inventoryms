

const url = 'https://eiezhzlpirdiqsotvogx.supabase.co/rest/v1/rpc/execute_sql';
const headers = {
  'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVpZXpoemxwaXJkaXFzb3R2b2d4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIyMTEwMDMsImV4cCI6MjA4Nzc4NzAwM30.s_vewTvQP-n8j9Z-ncRAsgf_-wslJDk7kBWvMLM7gbg',
  'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVpZXpoemxwaXJkaXFzb3R2b2d4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIyMTEwMDMsImV4cCI6MjA4Nzc4NzAwM30.s_vewTvQP-n8j9Z-ncRAsgf_-wslJDk7kBWvMLM7gbg',
  'Content-Type': 'application/json'
};

const sql = `
CREATE OR REPLACE FUNCTION public.refresh_fact_sales_data()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    today_date DATE;
BEGIN
    today_date := (now() AT TIME ZONE 'Asia/Dubai')::date;

    DROP TABLE IF EXISTS temp_dedup_sales;

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
                    country
                ORDER BY last_updated DESC
            ) AS rn
        FROM (
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
                MAX(a.pulled_at) AS last_updated,
                COALESCE(a.country, 'UAE') AS country
            FROM amazon_sales a
            LEFT JOIN sku_master s ON a.child_asin = s.asin
            WHERE a.report_date >= today_date - INTERVAL '7 days'
            GROUP BY 
                a.report_date, s.asin, s.sku, s.category, s.product_category, s.sub_category, COALESCE(a.country, 'UAE')

            UNION ALL

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
                MAX(n.delivered_timestamp) AS last_updated,
                COALESCE(n.country, 'UAE') AS country
            FROM noon_sales n
            LEFT JOIN sku_master s ON n.partner_sku = s.sku
            WHERE CAST(n.order_timestamp AS DATE) >= today_date - INTERVAL '7 days'
            GROUP BY 
                CAST(n.order_timestamp AS DATE), n.fulfillment_model, s.asin, s.sku, s.category, s.product_category, s.sub_category, COALESCE(n.country, 'UAE')

            UNION ALL

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
                NOW() AS last_updated,
                COALESCE(m.country, 'UAE') AS country
            FROM minutes_sales m
            LEFT JOIN sku_master s ON m.partner_sku = s.sku
            WHERE m.order_date >= today_date - INTERVAL '7 days'
            GROUP BY 
                m.order_date, s.asin, s.sku, s.category, s.product_category, s.sub_category, COALESCE(m.country, 'UAE')
        ) sales_data
    ) final_data
    WHERE rn = 1;

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
    AND COALESCE(f.country,'UAE') = COALESCE(d.country,'UAE')
    AND (
           COALESCE(f.total_sales,0) <> COALESCE(d.total_sales,0)
        OR COALESCE(f.total_units,0) <> COALESCE(d.total_units,0)
        OR COALESCE(f.category,'') <> COALESCE(d.category,'')
        OR COALESCE(f.product_category,'') <> COALESCE(d.product_category,'')
        OR COALESCE(f.sub_category,'') <> COALESCE(d.sub_category,'')
    );

    INSERT INTO fact_sales (
        date, sales_channel, fulfillment_model, asin, sku, category, product_category, sub_category, total_sales, total_units, effective_from, effective_to, is_current, last_updated, country
    )
    SELECT
        d.date, d.sales_channel, d.fulfillment_model, d.asin, d.sku, d.category, d.product_category, d.sub_category, d.total_sales, d.total_units, NOW(), NULL, TRUE, NOW(), d.country
    FROM temp_dedup_sales d
    LEFT JOIN fact_sales f
        ON f.is_current = TRUE
        AND f.date = d.date
        AND f.sales_channel = d.sales_channel
        AND COALESCE(f.fulfillment_model,'') = COALESCE(d.fulfillment_model,'')
        AND COALESCE(f.sku,'') = COALESCE(d.sku,'')
        AND COALESCE(f.country,'UAE') = COALESCE(d.country,'UAE')
    WHERE f.fact_sales_key IS NULL
    OR (
           COALESCE(f.total_sales,0) <> COALESCE(d.total_sales,0)
        OR COALESCE(f.total_units,0) <> COALESCE(d.total_units,0)
        OR COALESCE(f.category,'') <> COALESCE(d.category,'')
        OR COALESCE(f.product_category,'') <> COALESCE(d.product_category,'')
        OR COALESCE(f.sub_category,'') <> COALESCE(d.sub_category,'')
    );

    DROP TABLE IF EXISTS temp_dedup_sales;
    RAISE NOTICE 'Incremental SCD2 refresh with country completed successfully';
END;
$function$;
`;

fetch(url, {
  method: 'POST',
  headers,
  body: JSON.stringify({ sql })
}).then(async res => {
  const text = await res.text();
  console.log('Status:', res.status);
  console.log('Response:', text);
}).catch(err => console.error(err));
