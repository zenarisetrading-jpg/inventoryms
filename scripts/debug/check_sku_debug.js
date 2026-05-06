const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVpZXpoemxwaXJkaXFzb3R2b2d4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIyMTEwMDMsImV4cCI6MjA4Nzc4NzAwM30.s_vewTvQP-n8j9Z-ncRAsgf_-wslJDk7kBWvMLM7gbg'
// I'll try to reach the /dashboard endpoint as it has service role access
// and I noticed it returns data. Wait, I can't look at sales from there.
// I'll try to use the Sync function to just log some info to console if I can? No.

// I'll try to query /sku_master directly for this SKU to see created_at
async function check() {
    const url = 'https://eiezhzlpirdiqsotvogx.supabase.co/rest/v1/sku_master?sku=eq.6PCGREYNEW&select=sku,is_active,created_at'
    const res = await fetch(url, { headers: { 'apikey': ANON_KEY, 'Authorization': `Bearer ${ANON_KEY}` } })
    console.log('SKU:', await res.json())
}
check()
