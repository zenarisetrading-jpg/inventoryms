UPDATE fact_sales f
SET 
  total_sales = f.total_units * COALESCE(s.avg_sell_price_aed, 0),
  last_updated = NOW()
FROM sku_master s
WHERE f.country = 'KSA' 
  AND f.sales_channel = 'Amazon' 
  AND f.total_sales = 0 
  AND f.total_units > 0
  AND s.country = 'UAE'
  AND (f.sku = s.sku OR f.asin = s.asin);
