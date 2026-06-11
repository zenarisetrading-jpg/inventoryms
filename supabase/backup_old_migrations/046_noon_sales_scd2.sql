-- Migration: 046_noon_sales_scd2.sql
-- Add SCD Type 2 tracking columns to noon_sales and minutes_sales

-- 1. Add SCD2 columns to noon_sales
ALTER TABLE public.noon_sales
ADD COLUMN IF NOT EXISTS id SERIAL PRIMARY KEY,
ADD COLUMN IF NOT EXISTS is_current BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS valid_from TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS valid_to TIMESTAMP WITH TIME ZONE DEFAULT '9999-12-31 23:59:59+00';

-- Set all existing rows as current
UPDATE public.noon_sales SET is_current = true, valid_from = created_at WHERE is_current IS NULL;

-- Ensure item_nr is unique for active records (prevents multiple active states for same item)
CREATE UNIQUE INDEX IF NOT EXISTS idx_noon_sales_active_item ON public.noon_sales (item_nr) WHERE is_current = true AND item_nr IS NOT NULL AND item_nr != '';

-- 2. Add SCD2 columns to minutes_sales
ALTER TABLE public.minutes_sales
ADD COLUMN IF NOT EXISTS id SERIAL PRIMARY KEY,
ADD COLUMN IF NOT EXISTS is_current BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS valid_from TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS valid_to TIMESTAMP WITH TIME ZONE DEFAULT '9999-12-31 23:59:59+00';

-- Set all existing rows as current
UPDATE public.minutes_sales SET is_current = true, valid_from = created_at WHERE is_current IS NULL;

-- Ensure order_nr + item_nr + sku is unique for active records (item_nr can be duplicated in minutes_sales or not exist, we'll try to unique on item_nr if possible, but let's use order_nr + sku as a safe composite)
-- Looking at minutes_sales, item_nr and order_nr exist. Noon minutes order items might just need order_nr + sku
CREATE UNIQUE INDEX IF NOT EXISTS idx_minutes_sales_active_item ON public.minutes_sales (order_nr, sku) WHERE is_current = true AND order_nr IS NOT NULL AND order_nr != '';
