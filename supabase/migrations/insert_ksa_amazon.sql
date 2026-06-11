INSERT INTO amazon_sales (report_date, child_asin, country, units_ordered, ordered_revenue)
SELECT 
    s.date AS report_date,
    COALESCE(m.asin, s.sku) AS child_asin,
    s.country,
    s.units_sold AS units_ordered,
    s.revenue AS ordered_revenue
FROM sales_snapshot s
LEFT JOIN sku_master m ON s.sku = m.sku AND s.country = m.country
WHERE s.channel ILIKE 'amazon' AND s.country = 'KSA'
ON CONFLICT (report_date, child_asin, country) DO UPDATE
SET 
    units_ordered = EXCLUDED.units_ordered,
    ordered_revenue = EXCLUDED.ordered_revenue;
