const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const env = fs.readFileSync('frontend/.env', 'utf8');
const urlMatch = env.match(/VITE_SUPABASE_URL=(.*)/);
const keyMatch = env.match(/VITE_SUPABASE_ANON_KEY=(.*)/);
const supabase = createClient(urlMatch[1], keyMatch[1]);

async function run() {
  const { data, error } = await supabase.from('fact_purchase').select('status, units_ordered, country, po_number');
  console.log('total rows:', data ? data.length : 0);
  console.log('error:', error);
  if (data) {
    const statuses = {};
    for (const row of data) {
      statuses[row.status] = (statuses[row.status] || 0) + 1;
    }
    console.log('statuses:', statuses);
  }
}
run();
