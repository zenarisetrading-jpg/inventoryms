const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const env = fs.readFileSync('frontend/.env', 'utf8');
const urlMatch = env.match(/VITE_SUPABASE_URL=(.*)/);
const keyMatch = env.match(/VITE_SUPABASE_ANON_KEY=(.*)/);
const supabase = createClient(urlMatch[1], keyMatch[1]);

async function run() {
  const { data, error } = await supabase.from('fact_sales').select('count', { count: 'exact' }).gte('date', '2026-05-10').eq('is_current', true).eq('country', 'UAE');
  console.log('count UAE gte 2026-05-10:', data);
  const { data: d2 } = await supabase.from('fact_sales').select('count', { count: 'exact' });
  console.log('count all:', d2);
  const { data: d3 } = await supabase.from('fact_sales').select('country').limit(10);
  console.log('countries:', d3);
}
run();
