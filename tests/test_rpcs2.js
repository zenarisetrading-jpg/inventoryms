const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const env = fs.readFileSync('frontend/.env', 'utf8');
const urlMatch = env.match(/VITE_SUPABASE_URL=(.*)/);
const keyMatch = env.match(/VITE_SUPABASE_ANON_KEY=(.*)/);
const supabase = createClient(urlMatch[1], keyMatch[1]);

async function run() {
  const { data: dbData } = await supabase.rpc('get_sales_velocity_trend', { days_count: 30, p_country: 'UAE' });
  console.log('trend length:', dbData?.length);
  const { data: dbData2, error } = await supabase.rpc('get_detailed_sales_performance', { days_count: 30, p_country: 'UAE' });
  console.log('detailed length:', dbData2?.length, 'error:', error);
}
run();
