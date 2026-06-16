-- 077_fix_sku_master_saddl_ids.sql
-- Fix any sku_master records that have null or incorrect saddl_id
-- We map based on the country column since each account has a specific country in this setup

UPDATE public.sku_master
SET saddl_id = CASE
    WHEN country = 'UAE' AND (saddl_id IS NULL OR saddl_id = 'none') THEN 's2c_uae_test'
    WHEN country = 'KSA' AND (saddl_id IS NULL OR saddl_id = 'none') THEN 's2c_test'
    ELSE saddl_id
END
WHERE saddl_id IS NULL OR saddl_id = 'none';

-- Ensure aurio_uae is handled if they added SKUs with aurio_uae as category/tag or similar?
-- No, if country is UAE it defaults to s2c_uae_test. They will need to manually set aurio_uae 
-- if they want to separate the UAE catalogs.
