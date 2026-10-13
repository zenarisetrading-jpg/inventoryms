const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const env = fs.readFileSync('frontend/.env', 'utf8');
const urlMatch = env.match(/VITE_SUPABASE_URL=(.*)/);
const keyMatch = env.match(/VITE_SUPABASE_ANON_KEY=(.*)/);

const supabase = createClient(urlMatch[1].trim(), keyMatch[1].trim());

async function run() {
  const { data, error } = await supabase.rpc('get_sku_intelligence', {
    p_country: 'UAE',
    p_saddl_id: 's2c_uae_test'
  });

  if (error) {
    console.error(error);
    return;
  }

  console.log('=== GROUP 1: ACTIVE + OOS + SOLD IN LAST 120 DAYS (22 SKUs) ===');
  const g1 = data.filter(d => d.sku_classification === 'Active + OOS + Sold in Last 120 Days');
  g1.sort((a,b) => b.sales_120d - a.sales_120d).forEach((d, i) => {
    console.log(`${i+1}. SKU: ${d.sku} | Name: ${d.name} | 120d Units: ${d.sales_120d} | Rev: AED ${Math.round(d.revenue_120d)} | Last Sold: ${d.last_sale_date || 'N/A'} | Pending Reorder: ${d.pending_qty_to_reorder}`);
  });

  console.log('\n=== GROUP 2: ACTIVE + OOS + NO SALES IN LAST 120 DAYS (7 SKUs) ===');
  const g2 = data.filter(d => d.sku_classification === 'Active + OOS + No Sales in Last 120 Days');
  g2.forEach((d, i) => {
    console.log(`${i+1}. SKU: ${d.sku} | Name: ${d.name} | Lifetime Units: ${d.sales_all_time} | Last Sold: ${d.last_sale_date || 'N/A'}`);
  });

  console.log('\n=== GROUP 3: ACTIVE + NO SALES HISTORY (1 SKU) ===');
  const g3 = data.filter(d => d.sku_classification === 'Active + No Sales History');
  g3.forEach((d, i) => {
    console.log(`${i+1}. SKU: ${d.sku} | Name: ${d.name}`);
  });

  console.log('\n=== GROUP 4: INACTIVE LISTINGS (46 SKUs) ===');
  const g4 = data.filter(d => d.listing_status === 'Inactive');
  g4.forEach((d, i) => {
    console.log(`${i+1}. SKU: ${d.sku} | Name: ${d.name}`);
  });
}

run();
