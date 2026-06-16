-- 074_add_amazon_sales_metrics.sql
-- Add the missing analytical columns to amazon_sales so the sync function stops failing

ALTER TABLE public.amazon_sales 
ADD COLUMN IF NOT EXISTS marketplace_id TEXT,
ADD COLUMN IF NOT EXISTS parent_asin TEXT,
ADD COLUMN IF NOT EXISTS ordered_revenue_currency TEXT,
ADD COLUMN IF NOT EXISTS total_order_items INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS page_views INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS sessions INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS buy_box_percentage NUMERIC(5,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS unit_session_percentage NUMERIC(5,2) DEFAULT 0;
