const REST_URL = "https://eiezhzlpirdiqsotvogx.supabase.co/rest/v1/sku_master?sku=ilike.*GREYNEW*&select=sku,is_active,created_at"
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVpZXpoemxwaXJkaXFzb3R2b2d4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIyMTEwMDMsImV4cCI6MjA4Nzc4NzAwM30.s_vewTvQP-n8j9Z-ncRAsgf_-wslJDk7kBWvMLM7gbg'

async function checkSkus() {
    const res = await fetch(REST_URL, {
        headers: { 'apikey': ANON_KEY, 'Authorization': `Bearer ${ANON_KEY}` }
    })
    const data = await res.json()
    console.log('SKU Status:', JSON.stringify(data, null, 2))
}

checkSkus()
