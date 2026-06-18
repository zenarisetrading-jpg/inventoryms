import { config } from 'dotenv'; 
config({ path: './frontend/.env' }); 
import { createClient } from '@supabase/supabase-js'; 

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY); 

async function run() { 
  const skus = await supabase.from('sku_master').select('sku, country, saddl_id');
  console.log("SKUs Error:", skus.error);
  console.log("SKUs length:", skus.data?.length);
  if (skus.data?.length) {
    console.log("First 5 SKUs:", skus.data.slice(0, 5));
    // Count by saddl_id
    const counts = {};
    skus.data.forEach(s => {
      const key = `${s.country} - ${s.saddl_id}`;
      counts[key] = (counts[key] || 0) + 1;
    });
    console.log("Counts:", counts);
  }
}; 
run();
