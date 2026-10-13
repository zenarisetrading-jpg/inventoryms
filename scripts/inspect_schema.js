const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVpZXpoemxwaXJkaXFzb3R2b2d4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIyMTEwMDMsImV4cCI6MjA4Nzc4NzAwM30.s_vewTvQP-n8j9Z-ncRAsgf_-wslJDk7kBWvMLM7gbg';

async function inspect() {
  const tables = ['sku_master', 'sales_snapshot', 'amazon_sales', 'inventory_snapshot', 'fact_inventory_planning', 'pos'];
  for (const t of tables) {
    const res = await fetch(`https://eiezhzlpirdiqsotvogx.supabase.co/rest/v1/${t}?limit=1`, {
      headers: { 'apikey': key, 'Authorization': 'Bearer ' + key }
    }).then(r => r.json());
    console.log('=== TABLE:', t, '===');
    if (res && res.length > 0) {
      console.log('Keys:', Object.keys(res[0]));
      console.log('Sample:', JSON.stringify(res[0], null, 2));
    } else {
      console.log('Empty or response:', res);
    }
  }
}

inspect().catch(console.error);
