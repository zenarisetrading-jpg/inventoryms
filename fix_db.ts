const url = 'https://eiezhzlpirdiqsotvogx.supabase.co/rest/v1/rpc/execute_sql';
const apiKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVpZXpoemxwaXJkaXFzb3R2b2d4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIyMTEwMDMsImV4cCI6MjA4Nzc4NzAwM30.s_vewTvQP-n8j9Z-ncRAsgf_-wslJDk7kBWvMLM7gbg';

let sql = await Deno.readTextFile('./supabase/migrations/063_saddl_id_inventory_planning.sql');

// Extract only the function definition and execution part
const functionStart = sql.indexOf('CREATE OR REPLACE FUNCTION');
sql = sql.substring(functionStart);

const res = await fetch(url, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${apiKey}`,
    'apikey': apiKey,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ sql })
});

console.log(res.status, await res.text());
