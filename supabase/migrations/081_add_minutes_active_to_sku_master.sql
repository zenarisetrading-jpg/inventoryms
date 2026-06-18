-- 081_add_minutes_active_to_sku_master.sql
-- Add minutes_active boolean flag to sku_master for Noon Minutes activation control

ALTER TABLE public.sku_master ADD COLUMN IF NOT EXISTS minutes_active BOOLEAN DEFAULT true;
