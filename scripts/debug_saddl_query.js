const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVpZXpoemxwaXJkaXFzb3R2b2d4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIyMTEwMDMsImV4cCI6MjA4Nzc4NzAwM30.s_vewTvQP-n8j9Z-ncRAsgf_-wslJDk7kBWvMLM7gbg';

async function querySaddl(query) {
  const res = await fetch('https://eiezhzlpirdiqsotvogx.supabase.co/functions/v1/debug-sync', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query })
  });
  return await res.json();
}

async function run() {
  const q = `
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_schema = 'sc_raw' AND table_name = 'fba_inventory'
  `;
  const res = await querySaddl(q);
  console.log('Columns of fba_inventory:', res.rows);
}
run();






