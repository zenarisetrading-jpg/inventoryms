-- 057_update_sku_master_schema.sql
-- Add missing columns to sku_master based on sku_master upload schema

ALTER TABLE public.sku_master
ADD COLUMN IF NOT EXISTS saddl_id TEXT,
ADD COLUMN IF NOT EXISTS lead_time_for_manufacturing_days INTEGER,
ADD COLUMN IF NOT EXISTS lead_time_days_min INTEGER,
ADD COLUMN IF NOT EXISTS lead_time_days_max INTEGER,
ADD COLUMN IF NOT EXISTS amazon_active BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS noon_active BOOLEAN DEFAULT true;
