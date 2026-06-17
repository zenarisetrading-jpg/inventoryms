import { createClient } from '@supabase/supabase-js';

const supabase = createClient('http://127.0.0.1:54321', process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRlZmF1bHQiLCJyb2xlIjoic2VydmljZV9yb2xlIiwiaWF0IjoxNjA5NDU5MjAwLCJleHAiOjE5MjUwMTkyMDB9.123');

async function check() {
  console.log("Fetching fact_inventory_planning...");
  const { data, error } = await supabase.from('fact_inventory_planning').select('*').limit(1);
  if (error) console.error("Error:", error);
  else {
    console.log("Keys available:", Object.keys(data[0] || {}));
    console.log("Row:", data[0]);
  }
}

check();
