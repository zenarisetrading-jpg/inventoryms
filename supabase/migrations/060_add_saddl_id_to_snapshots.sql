-- =========================================================
-- 060_add_saddl_id_to_snapshots.sql
-- Add saddl_id to inventory_snapshot and sales_snapshot
-- to track exactly which Saddl account data originated from.
-- =========================================================

-- 1. Add column to inventory_snapshot
ALTER TABLE public.inventory_snapshot ADD COLUMN IF NOT EXISTS saddl_id TEXT;

-- Safely drop old constraints (covering multiple possible historic names)
DO $$
DECLARE
    con_name TEXT;
BEGIN
    -- Ensure country column exists before constraints
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'inventory_snapshot' AND column_name = 'country') THEN
        ALTER TABLE public.inventory_snapshot ADD COLUMN country TEXT DEFAULT 'UAE' NOT NULL;
    END IF;

    FOR con_name IN 
        SELECT conname 
        FROM pg_constraint 
        WHERE conrelid = 'public.inventory_snapshot'::regclass 
        AND contype = 'u'
    LOOP
        EXECUTE 'ALTER TABLE public.inventory_snapshot DROP CONSTRAINT ' || quote_ident(con_name);
    END LOOP;
END $$;

-- Add new composite unique constraint including saddl_id
-- We coalesce saddl_id to 'default' in the constraint logic to allow NULLs but keep uniqueness
-- Actually, we can just use the columns directly. PostgreSQL allows multiple NULLs in unique constraints,
-- so we'll use a COALESCE trick or just add it normally. 
-- Wait, if saddl_id is NULL, Postgres treats each NULL as distinct, breaking upsert onConflict.
-- So we MUST set a default for saddl_id if we want onConflict to work properly for Locad/Noon.
-- We will use 's2c_uae_test' or similar as default, but to be safe: 'none'.

-- Let's define default empty strings instead of NULL for constraints to work predictably.
UPDATE public.inventory_snapshot SET saddl_id = 'none' WHERE saddl_id IS NULL;
ALTER TABLE public.inventory_snapshot ALTER COLUMN saddl_id SET DEFAULT 'none';
ALTER TABLE public.inventory_snapshot ALTER COLUMN saddl_id SET NOT NULL;

-- Now create the constraint
ALTER TABLE public.inventory_snapshot 
ADD CONSTRAINT inventory_snapshot_composite_key 
UNIQUE (sku, node, warehouse_name, snapshot_date, country, saddl_id);


-- 2. Add column to sales_snapshot
ALTER TABLE public.sales_snapshot ADD COLUMN IF NOT EXISTS saddl_id TEXT;

-- Safely drop old constraints
DO $$
DECLARE
    con_name TEXT;
BEGIN
    -- Ensure country column exists before constraints
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sales_snapshot' AND column_name = 'country') THEN
        ALTER TABLE public.sales_snapshot ADD COLUMN country TEXT DEFAULT 'UAE' NOT NULL;
    END IF;

    FOR con_name IN 
        SELECT conname 
        FROM pg_constraint 
        WHERE conrelid = 'public.sales_snapshot'::regclass 
        AND contype = 'u'
    LOOP
        EXECUTE 'ALTER TABLE public.sales_snapshot DROP CONSTRAINT ' || quote_ident(con_name);
    END LOOP;
END $$;

-- Define default so unique constraint works reliably with upsert
UPDATE public.sales_snapshot SET saddl_id = 'none' WHERE saddl_id IS NULL;
ALTER TABLE public.sales_snapshot ALTER COLUMN saddl_id SET DEFAULT 'none';
ALTER TABLE public.sales_snapshot ALTER COLUMN saddl_id SET NOT NULL;

-- Now create the constraint
ALTER TABLE public.sales_snapshot 
ADD CONSTRAINT sales_snapshot_composite_key 
UNIQUE (sku, date, channel, country, saddl_id);

