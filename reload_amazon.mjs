import { createClient } from '@supabase/supabase-js';

const url = 'https://eiezhzlpirdiqsotvogx.supabase.co';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVpZXpoemxwaXJkaXFzb3R2b2d4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIyMTEwMDMsImV4cCI6MjA4Nzc4NzAwM30.s_vewTvQP-n8j9Z-ncRAsgf_-wslJDk7kBWvMLM7gbg';

const supabase = createClient(url, key);

async function execute() {
  console.log("Truncating amazon_sales...");
  const { error: err1 } = await supabase.rpc('execute_sql', { sql: 'TRUNCATE TABLE amazon_sales;' });
  if (err1) {
    console.error("Failed to truncate:", err1);
    return;
  }
  console.log("Truncated successfully.");
  
  console.log("Triggering Amazon sync to reload data for all saddl_ids...");
  // We can trigger it via HTTP since it's an edge function, but we need auth token
  // Let's just ask the user to click the button, or we can use the anon key if allowed.
  const response = await fetch(`${url}/functions/v1/sync/amazon`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${key}`
      }
  });
  
  const text = await response.text();
  console.log("Sync response:", text);
}

execute();
