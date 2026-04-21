const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVpZXpoemxwaXJkaXFzb3R2b2d4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIyMTEwMDMsImV4cCI6MjA4Nzc4NzAwM30.s_vewTvQP-n8j9Z-ncRAsgf_-wslJDk7kBWvMLM7gbg'
const URL = 'https://eiezhzlpirdiqsotvogx.supabase.co/functions/v1/dashboard'

async function checkDetails() {
    const res = await fetch(URL, { headers: { 'Authorization': `Bearer ${ANON_KEY}` } })
    const data = await res.json()

    const target = data.oos_skus_amazon.find(s => s.sku === '6PCGREYNEW')
    console.log('Details for 6PCGREYNEW in OOS list:', JSON.stringify(target, null, 2))

    // Also check if it's in the full list to see if it has other attributes
    // Wait, I can't see the full demand_metrics from here.
}
checkDetails()
