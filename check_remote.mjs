import { createClient } from '@supabase/supabase-js';

const url = 'https://eiezhzlpirdiqsotvogx.supabase.co';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVpZXpoemxwaXJkaXFzb3R2b2d4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIyMTEwMDMsImV4cCI6MjA4Nzc4NzAwM30.s_vewTvQP-n8j9Z-ncRAsgf_-wslJDk7kBWvMLM7gbg';

const supabase = createClient(url, key);

async function execute() {
  const sql = `
    ALTER TABLE public.amazon_sales DISABLE ROW LEVEL SECURITY;
  `;
  const { error: err1 } = await supabase.rpc('execute_sql', { sql });
  if (err1) {
    console.error("Failed to disable RLS:", err1);
    return;
  }
  console.log("RLS disabled.");
  
  const response = await fetch(`${url}/functions/v1/sync/amazon`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${key}`
      }
  });
  
  const text = await response.text();
  console.log("Sync response:", text);

  const { data, error } = await supabase.from('amazon_sales').select('*').limit(5);
  console.log("Amazon sales rows:", data?.length, error || "");
}

execute();
