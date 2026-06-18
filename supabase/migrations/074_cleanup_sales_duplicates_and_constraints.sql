-- 074_cleanup_sales_duplicates_and_constraints.sql

-- ==========================================
-- 1. AMAZON SALES CLEANUP & CONSTRAINTS
-- ==========================================
-- Delete orphaned 'none' or null saddl_id rows if a valid row already exists for the same combination
DELETE FROM public.amazon_sales a
WHERE COALESCE(a.saddl_id, 'none') = 'none'
  AND EXISTS (
    SELECT 1 
    FROM public.amazon_sales a2 
    WHERE a2.report_date = a.report_date 
      AND a2.child_asin = a.child_asin 
      AND UPPER(COALESCE(a2.country, 'UAE')) = UPPER(COALESCE(a.country, 'UAE'))
      AND COALESCE(a2.saddl_id, 'none') != 'none'
  );

-- Remove the old composite unique constraints
ALTER TABLE public.amazon_sales 
  DROP CONSTRAINT IF EXISTS amazon_sales_report_date_child_asin_country_saddl_id_key,
  DROP CONSTRAINT IF EXISTS amazon_sales_report_date_child_asin_country_key,
  DROP CONSTRAINT IF EXISTS amazon_sales_report_date_child_asin_key;

-- Apply the new unique constraint without saddl_id
ALTER TABLE public.amazon_sales 
  ADD CONSTRAINT amazon_sales_report_date_child_asin_country_key 
  UNIQUE (report_date, child_asin, country);

-- ==========================================
-- 2. NOON SALES CLEANUP & CONSTRAINTS
-- ==========================================
-- Delete duplicates, keeping the one with a valid saddl_id if possible
DELETE FROM public.noon_sales n
WHERE COALESCE(n.saddl_id, 'none') = 'none'
  AND EXISTS (
    SELECT 1 
    FROM public.noon_sales n2 
    WHERE n2.item_nr = n.item_nr 
      AND COALESCE(n2.saddl_id, 'none') != 'none'
  );

-- For any remaining absolute duplicates (e.g. multiple 'none'), keep the most recent one
DELETE FROM public.noon_sales n
WHERE n.id NOT IN (
    SELECT DISTINCT ON (item_nr) id
    FROM public.noon_sales
    ORDER BY item_nr, id DESC
);

-- Safely drop old unique index and recreate without saddl_id
DROP INDEX IF EXISTS idx_noon_sales_active_item;
CREATE UNIQUE INDEX idx_noon_sales_active_item ON public.noon_sales (item_nr) WHERE is_current = true AND item_nr IS NOT NULL AND item_nr != '';

-- ==========================================
-- 3. MINUTES SALES CLEANUP & CONSTRAINTS
-- ==========================================
-- Delete duplicates, keeping the one with a valid saddl_id if possible
DELETE FROM public.minutes_sales m
WHERE COALESCE(m.saddl_id, 'none') = 'none'
  AND EXISTS (
    SELECT 1 
    FROM public.minutes_sales m2 
    WHERE m2.order_nr = m.order_nr 
      AND m2.sku = m.sku
      AND COALESCE(m2.saddl_id, 'none') != 'none'
  );

-- For any remaining absolute duplicates, keep the most recent
DELETE FROM public.minutes_sales m
WHERE m.id NOT IN (
    SELECT DISTINCT ON (order_nr, sku) id
    FROM public.minutes_sales
    ORDER BY order_nr, sku, id DESC
);

-- Safely drop old unique index and recreate without saddl_id
DROP INDEX IF EXISTS idx_minutes_sales_active_item;
CREATE UNIQUE INDEX idx_minutes_sales_active_item ON public.minutes_sales (order_nr, sku) WHERE is_current = true AND order_nr IS NOT NULL AND order_nr != '';
