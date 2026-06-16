-- =========================================================
-- 066_noon_minutes_saddl_id.sql
-- Add saddl_id to noon_sales and minutes_sales tables
-- =========================================================

-- 1. Add saddl_id column to noon_sales
ALTER TABLE public.noon_sales ADD COLUMN IF NOT EXISTS saddl_id TEXT DEFAULT 'none' NOT NULL;

-- 2. Add saddl_id column to minutes_sales
ALTER TABLE public.minutes_sales ADD COLUMN IF NOT EXISTS saddl_id TEXT DEFAULT 'none' NOT NULL;

-- 3. Safely drop old unique index for noon_sales active item
DROP INDEX IF EXISTS public.idx_noon_sales_active_item;

-- 4. Re-create unique index with saddl_id for noon_sales
CREATE UNIQUE INDEX IF NOT EXISTS idx_noon_sales_active_item ON public.noon_sales (item_nr, saddl_id) WHERE is_current = true AND item_nr IS NOT NULL AND item_nr != '';

-- 5. Safely drop old unique index for minutes_sales active item
DROP INDEX IF EXISTS public.idx_minutes_sales_active_item;

-- 6. Re-create unique index with saddl_id for minutes_sales
CREATE UNIQUE INDEX IF NOT EXISTS idx_minutes_sales_active_item ON public.minutes_sales (order_nr, sku, saddl_id) WHERE is_current = true AND order_nr IS NOT NULL AND order_nr != '';
