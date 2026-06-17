ALTER TABLE public.amazon_sales
ADD COLUMN IF NOT EXISTS marketplace_id text,
ADD COLUMN IF NOT EXISTS parent_asin text,
ADD COLUMN IF NOT EXISTS ordered_revenue_currency text,
ADD COLUMN IF NOT EXISTS total_order_items integer,
ADD COLUMN IF NOT EXISTS page_views integer,
ADD COLUMN IF NOT EXISTS sessions integer,
ADD COLUMN IF NOT EXISTS buy_box_percentage numeric,
ADD COLUMN IF NOT EXISTS unit_session_percentage numeric;
