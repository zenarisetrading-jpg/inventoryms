import { config } from 'dotenv'; 
config({ path: './frontend/.env' }); 
import { createClient } from '@supabase/supabase-js'; 

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY); 

async function run() { 
  const { data, error } = await supabase.rpc('execute_sql', { sql: "SELECT matviewname, definition FROM pg_matviews WHERE matviewname = 'fact_inventory_planning' UNION SELECT viewname, definition FROM pg_views WHERE viewname = 'fact_inventory_planning'" }); 
  console.log(data || error); 
}; 
run();
