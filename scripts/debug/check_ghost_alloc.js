const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVpZXpoemxwaXJkaXFzb3R2b2d4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIyMTEwMDMsImV4cCI6MjA4Nzc4NzAwM30.s_vewTvQP-n8j9Z-ncRAsgf_-wslJDk7kBWvMLM7gbg'
const URL = 'https://eiezhzlpirdiqsotvogx.supabase.co/rest/v1/allocation_plans?sku=eq.6PCGREYNEW&status=in.(approved,shipped)'

async function checkAlloc() {
    const res = await fetch(URL, { headers: { 'apikey': ANON_KEY, 'Authorization': `Bearer ${ANON_KEY}` } })
    console.log('Allocations for 6PCGREYNEW:', await res.json())
}
checkAlloc()
