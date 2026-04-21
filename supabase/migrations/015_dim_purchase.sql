-- 015_dim_purchase.sql
-- Renaming dim_sku to dim_purchase and populating fact_purchase defaults

-- 1. Rename dim_sku to dim_purchase if it exists
DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'dim_sku') THEN
        ALTER TABLE dim_sku RENAME TO dim_purchase;
    END IF;
END $$;

-- 2. Add dimensions column to sku_master if missing
ALTER TABLE sku_master ADD COLUMN IF NOT EXISTS dimensions TEXT;

-- 3. Sync dimensions, units_per_box, and cogs from dim_purchase to sku_master
UPDATE sku_master sm
SET 
    dimensions = dp.dimension,
    units_per_box = COALESCE(NULLIF(dp.units_per_box, 0), sm.units_per_box),
    cogs = COALESCE(NULLIF(dp.cogs, 0), sm.cogs)
FROM dim_purchase dp
WHERE sm.sku = dp.sku;

-- 4. Populate fact_purchase defaults from dim_purchase
-- This fills in the NULLs left by the initial migration (011)
UPDATE fact_purchase fp
SET
    dimensions = dp.dimension,
    units_per_box = COALESCE(fp.units_per_box, dp.units_per_box),
    cogs_per_unit = COALESCE(fp.cogs_per_unit, dp.cogs::numeric)
FROM dim_purchase dp
WHERE fp.sku = dp.sku;

-- Also update based on sku_master for items that might be in sku_master but missing in dp
UPDATE fact_purchase fp
SET
    dimensions = COALESCE(fp.dimensions, sm.dimensions),
    units_per_box = COALESCE(fp.units_per_box, sm.units_per_box),
    cogs_per_unit = COALESCE(fp.cogs_per_unit, sm.cogs::numeric)
FROM sku_master sm
WHERE fp.sku = sm.sku
AND (fp.dimensions IS NULL OR fp.units_per_box IS NULL OR fp.cogs_per_unit IS NULL);
