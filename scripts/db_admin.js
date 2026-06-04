const url = 'https://eiezhzlpirdiqsotvogx.supabase.co/rest/v1/rpc/execute_sql';
const headers = {
  'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVpZXpoemxwaXJkaXFzb3R2b2d4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIyMTEwMDMsImV4cCI6MjA4Nzc4NzAwM30.s_vewTvQP-n8j9Z-ncRAsgf_-wslJDk7kBWvMLM7gbg',
  'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVpZXpoemxwaXJkaXFzb3R2b2d4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIyMTEwMDMsImV4cCI6MjA4Nzc4NzAwM30.s_vewTvQP-n8j9Z-ncRAsgf_-wslJDk7kBWvMLM7gbg',
  'Content-Type': 'application/json'
};

const sql = `
-- 1. Add country columns
ALTER TABLE public.fact_sales ADD COLUMN IF NOT EXISTS country VARCHAR(10) DEFAULT 'UAE';
ALTER TABLE public.amazon_sales ADD COLUMN IF NOT EXISTS country VARCHAR(10) DEFAULT 'UAE';
ALTER TABLE public.sales_snapshot ADD COLUMN IF NOT EXISTS country VARCHAR(10) DEFAULT 'UAE';
ALTER TABLE public.inventory_snapshot ADD COLUMN IF NOT EXISTS country VARCHAR(10) DEFAULT 'UAE';
ALTER TABLE public.noon_sales ADD COLUMN IF NOT EXISTS country VARCHAR(10) DEFAULT 'UAE';
ALTER TABLE public.minutes_sales ADD COLUMN IF NOT EXISTS country VARCHAR(10) DEFAULT 'UAE';

-- 2. Update Constraints and Indices
DROP INDEX IF EXISTS idx_fact_sales_lookup;
CREATE INDEX IF NOT EXISTS idx_fact_sales_lookup ON public.fact_sales (date, sales_channel, sku, country) WHERE is_current = TRUE;

ALTER TABLE public.sales_snapshot DROP CONSTRAINT IF EXISTS sales_snapshot_sku_date_channel_key;
DO $$ BEGIN
    ALTER TABLE public.sales_snapshot ADD CONSTRAINT sales_snapshot_sku_date_channel_country_key UNIQUE (sku, date, channel, country);
EXCEPTION
    WHEN duplicate_table THEN NULL;
END $$;

ALTER TABLE public.inventory_snapshot DROP CONSTRAINT IF EXISTS inventory_snapshot_sku_node_warehouse_name_snapshot_date_key;
DO $$ BEGIN
    ALTER TABLE public.inventory_snapshot ADD CONSTRAINT inventory_snapshot_sku_node_warehouse_snapshot_country_key UNIQUE (sku, node, warehouse_name, snapshot_date, country);
EXCEPTION
    WHEN duplicate_table THEN NULL;
END $$;
`;

fetch(url, {
  method: 'POST',
  headers,
  body: JSON.stringify({ sql })
}).then(async res => {
  const text = await res.text();
  console.log('Status:', res.status);
  console.log('Response:', text);
}).catch(err => console.error(err));
