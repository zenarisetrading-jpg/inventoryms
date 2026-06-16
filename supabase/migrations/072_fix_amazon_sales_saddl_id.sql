-- 072_fix_amazon_sales_saddl_id.sql

-- 1. Update existing amazon_sales records that have saddl_id = 'none' 
--    by mapping from amazon_locations using the country column
UPDATE public.amazon_sales a
SET saddl_id = l.saddl_account_id
FROM public.amazon_locations l
WHERE UPPER(COALESCE(a.country, 'UAE')) = UPPER(l.country)
  AND a.saddl_id = 'none'
  AND l.is_active = true;

-- 2. Run the refresh fact sales data to populate the missing amazon data
SELECT public.refresh_fact_sales_data(90);
