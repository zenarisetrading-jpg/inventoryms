-- =========================================================
-- 061_backfill_saddl_account_id.sql
-- Backfills the 'none' default values with the correct 
-- saddl_account_id from amazon_locations.
-- =========================================================

-- 1. Backfill inventory_snapshot for Amazon FBA
UPDATE public.inventory_snapshot i
SET saddl_id = a.saddl_account_id
FROM public.amazon_locations a
WHERE i.node = 'amazon_fba'
  AND i.country = a.country
  AND i.saddl_id = 'none';

-- 2. Backfill sales_snapshot for Amazon
UPDATE public.sales_snapshot s
SET saddl_id = a.saddl_account_id
FROM public.amazon_locations a
WHERE s.channel = 'amazon'
  AND s.country = a.country
  AND s.saddl_id = 'none';

-- 3. Refresh planning to reflect any changes if needed
SELECT refresh_fact_inventory_planning();
