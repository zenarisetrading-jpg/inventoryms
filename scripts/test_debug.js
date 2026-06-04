const url = 'https://eiezhzlpirdiqsotvogx.supabase.co/functions/v1/debug-sync';
const headers = {
  'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVpZXpoemxwaXJkaXFzb3R2b2d4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIyMTEwMDMsImV4cCI6MjA4Nzc4NzAwM30.s_vewTvQP-n8j9Z-ncRAsgf_-wslJDk7kBWvMLM7gbg',
  'Content-Type': 'application/json'
};

fetch(url, { method: 'POST', headers }).then(async res => {
  const text = await res.text();
  console.log('Response:', text);
}).catch(err => console.error(err));
