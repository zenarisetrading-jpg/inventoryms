
const url = 'https://eiezhzlpirdiqsotvogx.supabase.co/rest/v1/rpc/execute_sql';
const headers = {
  'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVpZXpoemxwaXJkaXFzb3R2b2d4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIyMTEwMDMsImV4cCI6MjA4Nzc4NzAwM30.s_vewTvQP-n8j9Z-ncRAsgf_-wslJDk7kBWvMLM7gbg',
  'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVpZXpoemxwaXJkaXFzb3R2b2d4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIyMTEwMDMsImV4cCI6MjA4Nzc4NzAwM30.s_vewTvQP-n8j9Z-ncRAsgf_-wslJDk7kBWvMLM7gbg',
  'Content-Type': 'application/json'
};

const sql = `
ALTER TABLE public.fact_inventory_planning ADD COLUMN IF NOT EXISTS country VARCHAR(10) DEFAULT 'UAE';
ALTER TABLE public.demand_metrics ADD COLUMN IF NOT EXISTS country VARCHAR(10) DEFAULT 'UAE';
ALTER TABLE public.po_register ADD COLUMN IF NOT EXISTS country VARCHAR(10) DEFAULT 'UAE';

-- Drop the old primary keys and recreate with country if needed
ALTER TABLE public.demand_metrics DROP CONSTRAINT IF EXISTS demand_metrics_pkey;
DO $$ BEGIN
    ALTER TABLE public.demand_metrics ADD CONSTRAINT demand_metrics_pkey PRIMARY KEY (sku, country);
EXCEPTION WHEN others THEN NULL; END $$;

ALTER TABLE public.fact_inventory_planning DROP CONSTRAINT IF EXISTS fact_inventory_planning_pkey;
DO $$ BEGIN
    ALTER TABLE public.fact_inventory_planning ADD CONSTRAINT fact_inventory_planning_pkey PRIMARY KEY (sku, country);
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
