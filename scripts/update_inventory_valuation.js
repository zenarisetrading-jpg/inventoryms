const url = 'https://eiezhzlpirdiqsotvogx.supabase.co/rest/v1/rpc/execute_sql';
const headers = {
  'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVpZXpoemxwaXJkaXFzb3R2b2d4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIyMTEwMDMsImV4cCI6MjA4Nzc4NzAwM30.s_vewTvQP-n8j9Z-ncRAsgf_-wslJDk7kBWvMLM7gbg',
  'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVpZXpoemxwaXJkaXFzb3R2b2d4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIyMTEwMDMsImV4cCI6MjA4Nzc4NzAwM30.s_vewTvQP-n8j9Z-ncRAsgf_-wslJDk7kBWvMLM7gbg',
  'Content-Type': 'application/json'
};

const sql = `
CREATE OR REPLACE FUNCTION get_inventory_valuation_totals(p_country varchar DEFAULT 'UAE')
RETURNS TABLE (
    fba_total_cogs numeric,
    fbn_total_cogs numeric,
    minutes_total_cogs numeric,
    locad_total_cogs numeric
) 
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COALESCE(SUM(fba_units * cogs), 0) AS fba_total_cogs,
        COALESCE(SUM(fbn_units * cogs), 0) AS fbn_total_cogs,
        COALESCE(SUM(minutes_units * cogs), 0) AS minutes_total_cogs,
        COALESCE(SUM(locad_units * cogs), 0) AS locad_total_cogs
    FROM fact_inventory_planning
    WHERE country = p_country;
END;
$$;
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
