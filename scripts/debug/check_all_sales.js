const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVpZXpoemxwaXJkaXFzb3R2b2d4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIyMTEwMDMsImV4cCI6MjA4Nzc4NzAwM30.s_vewTvQP-n8j9Z-ncRAsgf_-wslJDk7kBWvMLM7gbg'
const URL = 'https://eiezhzlpirdiqsotvogx.supabase.co/rest/v1/sales_snapshot?sku=eq.6PCGREYNEW&select=date,units_sold,channel'

async function checkAllSales() {
    const res = await fetch(URL, { headers: { 'apikey': ANON_KEY, 'Authorization': `Bearer ${ANON_KEY}` } })
    const data = await res.json()
    console.log('All Sales for 6PCGREYNEW:', data)
}

checkAllSales()
