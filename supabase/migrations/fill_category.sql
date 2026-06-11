UPDATE sku_master s1
SET 
  product_category = COALESCE(s1.product_category, s2.product_category),
  category = COALESCE(s1.category, s2.category),
  sub_category = COALESCE(s1.sub_category, s2.sub_category)
FROM sku_master s2
WHERE s1.sku = s2.sku
  AND s2.product_category IS NOT NULL
  AND (s1.product_category IS NULL OR s1.category IS NULL OR s1.sub_category IS NULL);

-- Refresh the fact_sales to pick up the updated product categories
SELECT refresh_fact_sales_data(180);
