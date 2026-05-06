const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVpZXpoemxwaXJkaXFzb3R2b2d4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIyMTEwMDMsImV4cCI6MjA4Nzc4NzAwM30.s_vewTvQP-n8j9Z-ncRAsgf_-wslJDk7kBWvMLM7gbg'
const URL = 'https://eiezhzlpirdiqsotvogx.supabase.co/rest/v1/sku_master?asin=eq.B0C71HYMWC&select=sku,is_active,created_at'

async function checkAsin() {
    const res = await fetch(URL, { headers: { 'apikey': ANON_KEY, 'Authorization': `Bearer ${ANON_KEY}` } })
    const data = await res.json()
    console.log('SKUs for ASIN B0C71HYMWC:', data)
}

checkAsin()
