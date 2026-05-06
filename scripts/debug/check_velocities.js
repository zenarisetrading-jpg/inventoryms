const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVpZXpoemxwaXJkaXFzb3R2b2d4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIyMTEwMDMsImV4cCI6MjA4Nzc4NzAwM30.s_vewTvQP-n8j9Z-ncRAsgf_-wslJDk7kBWvMLM7gbg'
const URL = 'https://eiezhzlpirdiqsotvogx.supabase.co/functions/v1/dashboard'

async function checkVelocities() {
    const res = await fetch(URL, { headers: { 'Authorization': `Bearer ${ANON_KEY}` } })
    const data = await res.json()

    const targetSkus = ['6PCGREYNEW', '500MLTEAPINK', '500MLBLACK', '5PCGREYNEW']

    const results = targetSkus.map(s => {
        const oos = data.oos_skus_amazon.find(o => o.sku === s) || data.oos_skus_noon.find(o => o.sku === s)
        return {
            sku: s,
            found: !!oos,
            blended_sv: oos ? oos.blended_sv : 'N/A'
        }
    })

    console.log('Velocity Check:', results)
}

checkVelocities()
