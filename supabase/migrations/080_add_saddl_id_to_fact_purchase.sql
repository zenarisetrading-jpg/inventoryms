-- 080_add_saddl_id_to_fact_purchase.sql
-- Add saddl_id to fact_purchase to link POs directly to accounts

ALTER TABLE public.fact_purchase ADD COLUMN IF NOT EXISTS saddl_id VARCHAR(50);

-- Backfill saddl_id based on sku_master matching
UPDATE public.fact_purchase fp
SET saddl_id = sm.saddl_id
FROM public.sku_master sm
WHERE fp.sku = sm.sku AND fp.country = sm.country AND fp.saddl_id IS NULL;
