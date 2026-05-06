const URL = 'https://eiezhzlpirdiqsotvogx.supabase.co/functions/v1/dashboard'
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVpZXpoemxwaXJkaXFzb3R2b2d4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIyMTEwMDMsImV4cCI6MjA4Nzc4NzAwM30.s_vewTvQP-n8j9Z-ncRAsgf_-wslJDk7kBWvMLM7gbg'

async function checkDashboard() {
    const res = await fetch(URL, { headers: { 'Authorization': `Bearer ${ANON_KEY}` } })
    const data = await res.json()

    const discontinued = ['6PCGREYNEW', '6PCGREYNEWS', '500MLTEAPINK', '500MLTEAPINKS', '500MLBLACK', '500MLBLACKS']

    const foundAlerts = (data.alerts || []).filter(a => discontinued.includes(a.sku))
    console.log('Discontinued SKUs in Alerts:', foundAlerts)

    const foundOosAmazon = (data.oos_skus_amazon || []).filter(a => discontinued.includes(a.sku))
    console.log('Discontinued SKUs in OOS Amazon:', foundOosAmazon)

    const foundOosNoon = (data.oos_skus_noon || []).filter(a => discontinued.includes(a.sku))
    console.log('Discontinued SKUs in OOS Noon:', foundOosNoon)
}

checkDashboard()
