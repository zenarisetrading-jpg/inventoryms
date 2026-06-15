-- =========================================================
-- 065_amazon_sales_saddl_id.sql
-- Add country and saddl_id to amazon_sales to support multiple accounts
-- =========================================================

-- 1. Add country and saddl_id columns to amazon_sales
ALTER TABLE public.amazon_sales ADD COLUMN IF NOT EXISTS country TEXT DEFAULT 'UAE' NOT NULL;
ALTER TABLE public.amazon_sales ADD COLUMN IF NOT EXISTS saddl_id TEXT DEFAULT 'none' NOT NULL;

-- 2. Safely drop old constraints
DO $$
DECLARE
    con_name TEXT;
BEGIN
    FOR con_name IN 
        SELECT conname 
        FROM pg_constraint 
        WHERE conrelid = 'public.amazon_sales'::regclass 
        AND contype = 'u'
    LOOP
        EXECUTE 'ALTER TABLE public.amazon_sales DROP CONSTRAINT ' || quote_ident(con_name);
    END LOOP;
END $$;

-- 3. Now create the new composite unique constraint
ALTER TABLE public.amazon_sales 
ADD CONSTRAINT amazon_sales_composite_key 
UNIQUE (report_date, child_asin, country, saddl_id);
