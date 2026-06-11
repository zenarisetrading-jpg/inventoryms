const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const env = fs.readFileSync('frontend/.env', 'utf8');
const urlMatch = env.match(/VITE_SUPABASE_URL=(.*)/);
const keyMatch = env.match(/VITE_SUPABASE_ANON_KEY=(.*)/);
const supabase = createClient(urlMatch[1], keyMatch[1]);

async function run() {
  const { data, error } = await supabase.rpc('get_unique_suppliers');
  console.log('unique suppliers to test rpc connection:', data);
  
  // Actually we need to test sales_snapshot under SECURITY DEFINER
  // Let's create a temp function in SQL to just SELECT * FROM sales_snapshot LIMIT 1
}
run();
