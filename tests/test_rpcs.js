const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const env = fs.readFileSync('frontend/.env', 'utf8');
const urlMatch = env.match(/VITE_SUPABASE_URL=(.*)/);
const keyMatch = env.match(/VITE_SUPABASE_ANON_KEY=(.*)/);
const supabase = createClient(urlMatch[1], keyMatch[1]);

async function run() {
  const { data: d1, error: e1 } = await supabase.rpc('get_subcategory_performance', { days_count: 30, p_country: 'UAE' });
  console.log('get_subcategory_performance error:', e1);
  const { data: d2, error: e2 } = await supabase.rpc('get_detailed_sales_performance', { days_count: 30, p_country: 'UAE' });
  console.log('get_detailed_sales_performance error:', e2);
}
run();
