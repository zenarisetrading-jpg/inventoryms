const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const env = fs.readFileSync('frontend/.env', 'utf8');
const urlMatch = env.match(/VITE_SUPABASE_URL=(.*)/);
const keyMatch = env.match(/VITE_SUPABASE_ANON_KEY=(.*)/);
const supabase = createClient(urlMatch[1], keyMatch[1]);

async function run() {
  const { data, error } = await supabase.rpc('get_detailed_sales_performance', { 
    days_count: 30, 
    p_categories: null,
    p_product_categories: null,
    p_sub_categories: null,
    p_country: 'UAE' 
  });
  console.log('detailed length with filters:', data?.length);
  console.log('error:', error);
}
run();
