import { createClient } from '@supabase/supabase-js';

const url = 'https://eiezhzlpirdiqsotvogx.supabase.co';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVpZXpoemxwaXJkaXFzb3R2b2d4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIyMTEwMDMsImV4cCI6MjA4Nzc4NzAwM30.s_vewTvQP-n8j9Z-ncRAsgf_-wslJDk7kBWvMLM7gbg';

async function execute() {
  const response = await fetch(`${url}/functions/v1/sync/debug-saddl`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${key}`
      }
  });
  
  const text = await response.text();
  console.log("Debug Saddl response:", text);
}

execute();
