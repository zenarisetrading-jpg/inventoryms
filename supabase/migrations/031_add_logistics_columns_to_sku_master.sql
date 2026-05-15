-- Migration: 031_add_logistics_columns_to_sku_master.sql
-- Adding missing columns for SKU registration

ALTER TABLE public.sku_master 
ADD COLUMN IF NOT EXISTS dimensions TEXT,
ADD COLUMN IF NOT EXISTS weight_kg DECIMAL(10,3),
ADD COLUMN IF NOT EXISTS cbm DECIMAL(10,4);

-- Also ensuring ASIN and FNSKU are present (though they likely are)
ALTER TABLE public.sku_master
ADD COLUMN IF NOT EXISTS asin TEXT,
ADD COLUMN IF NOT EXISTS fnsku TEXT;
