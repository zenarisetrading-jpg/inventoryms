const url = 'https://eiezhzlpirdiqsotvogx.supabase.co/rest/v1/rpc/execute_sql';
const headers = {
  'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVpZXpoemxwaXJkaXFzb3R2b2d4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIyMTEwMDMsImV4cCI6MjA4Nzc4NzAwM30.s_vewTvQP-n8j9Z-ncRAsgf_-wslJDk7kBWvMLM7gbg',
  'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVpZXpoemxwaXJkaXFzb3R2b2d4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIyMTEwMDMsImV4cCI6MjA4Nzc4NzAwM30.s_vewTvQP-n8j9Z-ncRAsgf_-wslJDk7kBWvMLM7gbg',
  'Content-Type': 'application/json'
};

const sql = `
ALTER TABLE public.inventory_snapshot ADD COLUMN IF NOT EXISTS country VARCHAR(10) DEFAULT 'UAE';
ALTER TABLE public.sales_snapshot ADD COLUMN IF NOT EXISTS country VARCHAR(10) DEFAULT 'UAE';
ALTER TABLE public.fact_purchase ADD COLUMN IF NOT EXISTS country VARCHAR(10) DEFAULT 'UAE';

-- Drop the old primary keys and recreate with country if needed
DO $$ BEGIN
    ALTER TABLE public.inventory_snapshot DROP CONSTRAINT IF EXISTS inventory_snapshot_pkey;
    ALTER TABLE public.inventory_snapshot ADD CONSTRAINT inventory_snapshot_pkey PRIMARY KEY (sku, node, warehouse_name, snapshot_date, country);
EXCEPTION WHEN others THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE public.sales_snapshot DROP CONSTRAINT IF EXISTS sales_snapshot_pkey;
    ALTER TABLE public.sales_snapshot ADD CONSTRAINT sales_snapshot_pkey PRIMARY KEY (sku, date, channel, country);
EXCEPTION WHEN others THEN NULL; END $$;
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
