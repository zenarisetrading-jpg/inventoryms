const url = 'https://eiezhzlpirdiqsotvogx.supabase.co/rest/v1/rpc/execute_sql';
const headers = {
  'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVpZXpoemxwaXJkaXFzb3R2b2d4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIyMTEwMDMsImV4cCI6MjA4Nzc4NzAwM30.s_vewTvQP-n8j9Z-ncRAsgf_-wslJDk7kBWvMLM7gbg',
  'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVpZXpoemxwaXJkaXFzb3R2b2d4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIyMTEwMDMsImV4cCI6MjA4Nzc4NzAwM30.s_vewTvQP-n8j9Z-ncRAsgf_-wslJDk7kBWvMLM7gbg',
  'Content-Type': 'application/json'
};

const sql = `
SELECT json_agg(t) FROM (
  SELECT 
    (SELECT count(*) FROM inventory_snapshot WHERE node='amazon_fba' AND snapshot_date = current_date) as fba_today,
    (SELECT count(*) FROM inventory_snapshot WHERE node='locad_warehouse' AND snapshot_date = current_date) as locad_today,
    (SELECT count(*) FROM sku_master WHERE asin IS NOT NULL) as mapped_asin,
    (SELECT count(*) FROM sku_master WHERE fnsku IS NOT NULL) as mapped_fnsku,
    (SELECT sum(available) FROM inventory_snapshot WHERE node='amazon_fba' AND snapshot_date = current_date) as fba_qty,
    (SELECT sum(available) FROM inventory_snapshot WHERE node='locad_warehouse' AND snapshot_date = current_date) as locad_qty
) t;
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
