const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVpZXpoemxwaXJkaXFzb3R2b2d4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIyMTEwMDMsImV4cCI6MjA4Nzc4NzAwM30.s_vewTvQP-n8j9Z-ncRAsgf_-wslJDk7kBWvMLM7gbg'
const URL = 'https://eiezhzlpirdiqsotvogx.supabase.co/functions/v1/dashboard'

async function fullAudit() {
    const res = await fetch(URL, { headers: { 'Authorization': `Bearer ${ANON_KEY}` } })
    const data = await res.json()

    console.log('--- FULL CATALOG AUDIT ---')
    console.log(`Live SKUs (Active with History): ${data.live_selling_skus}`)
    console.log(`Live on Amazon: ${data.live_skus_amazon}`)
    console.log(`Live on Noon: ${data.live_skus_noon}`)
    console.log('---------------------------')

    const oosAmz = data.oos_skus_amazon || []
    const oosNoon = data.oos_skus_noon || []

    const zeroVelAmz = oosAmz.filter(s => s.blended_sv === 0)
    const zeroVelNoon = oosNoon.filter(s => s.blended_sv === 0)

    console.log(`OOS Amazon: ${oosAmz.length} total, ${zeroVelAmz.length} with 0 velocity`)
    console.log(`OOS Noon: ${oosNoon.length} total, ${zeroVelNoon.length} with 0 velocity`)

    if (zeroVelAmz.length > 0) {
        console.log('Zero velocity SKUs in Amazon OOS list (SHOULD BE ZERO):', zeroVelAmz.map(s => s.sku))
    }
}

fullAudit()
