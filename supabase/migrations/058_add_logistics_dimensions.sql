-- 058_add_logistics_dimensions.sql
-- Add dimension and logistics columns to sku_master

ALTER TABLE public.sku_master
ADD COLUMN IF NOT EXISTS dimensions TEXT,
ADD COLUMN IF NOT EXISTS weight_kg NUMERIC,
ADD COLUMN IF NOT EXISTS cbm NUMERIC,
ADD COLUMN IF NOT EXISTS country TEXT DEFAULT 'UAE';

-- Reload schema cache to ensure PostgREST picks up the new columns immediately
NOTIFY pgrst, 'reload schema';
