require('dotenv').config({path: './frontend/.env'});
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
async function get() {
  const { data, error } = await supabase.rpc('execute_sql', { sql_query: "SELECT pg_get_viewdef('public.v_fact_inventory_with_age', true);" });
  console.log(data, error);
}
get();
