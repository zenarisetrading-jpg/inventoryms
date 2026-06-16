-- =========================================================
-- 069_force_recreate_snapshot_constraints.sql
-- Force drop any old constraints and recreate the exact constraints
-- needed for Noon CSV upload upserts to work correctly.
-- =========================================================

DO $$
DECLARE
    con_name TEXT;
BEGIN
    -- Drop all unique constraints from sales_snapshot
    FOR con_name IN 
        SELECT conname 
        FROM pg_constraint 
        WHERE conrelid = 'public.sales_snapshot'::regclass 
        AND contype = 'u'
    LOOP
        EXECUTE 'ALTER TABLE public.sales_snapshot DROP CONSTRAINT ' || quote_ident(con_name);
    END LOOP;

    -- Drop all unique constraints from inventory_snapshot
    FOR con_name IN 
        SELECT conname 
        FROM pg_constraint 
        WHERE conrelid = 'public.inventory_snapshot'::regclass 
        AND contype = 'u'
    LOOP
        EXECUTE 'ALTER TABLE public.inventory_snapshot DROP CONSTRAINT ' || quote_ident(con_name);
    END LOOP;
END $$;

-- Guarantee the columns have defaults and are NOT NULL
UPDATE public.sales_snapshot SET saddl_id = 'none' WHERE saddl_id IS NULL;
ALTER TABLE public.sales_snapshot ALTER COLUMN saddl_id SET DEFAULT 'none';
ALTER TABLE public.sales_snapshot ALTER COLUMN saddl_id SET NOT NULL;

UPDATE public.inventory_snapshot SET saddl_id = 'none' WHERE saddl_id IS NULL;
ALTER TABLE public.inventory_snapshot ALTER COLUMN saddl_id SET DEFAULT 'none';
ALTER TABLE public.inventory_snapshot ALTER COLUMN saddl_id SET NOT NULL;

-- Recreate exact constraints matched by the Edge Functions
ALTER TABLE public.sales_snapshot 
ADD CONSTRAINT sales_snapshot_composite_key 
UNIQUE (sku, date, channel, country, saddl_id);

ALTER TABLE public.inventory_snapshot 
ADD CONSTRAINT inventory_snapshot_composite_key 
UNIQUE (sku, node, warehouse_name, snapshot_date, country, saddl_id);
