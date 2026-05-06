const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVpZXpoemxwaXJkaXFzb3R2b2d4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIyMTEwMDMsImV4cCI6MjA4Nzc4NzAwM30.s_vewTvQP-n8j9Z-ncRAsgf_-wslJDk7kBWvMLM7gbg'
const URL = 'https://eiezhzlpirdiqsotvogx.supabase.co/functions/v1/dashboard'

async function checkAmazonOosRate() {
    const res = await fetch(URL, { headers: { 'Authorization': `Bearer ${ANON_KEY}` } })
    const data = await res.json()

    console.log('--- AMAZON OOS RATE TEST ---')
    console.log(`Reported AMZ OOS Rate: ${data.oos_pct_amazon}%`)
    console.log(`Live SKUs (Base): ${data.live_skus_amazon}`)
    console.log(`OOS SKUs (Count): ${data.oos_count_amazon}`)

    // Verify math: (OOS / Live) * 100
    const calculated = data.live_skus_amazon > 0 ? (data.oos_count_amazon / data.live_skus_amazon * 100) : 0
    console.log(`Verification Math: (${data.oos_count_amazon} / ${data.live_skus_amazon}) * 100 = ${calculated.toFixed(1)}%`)

    // Note: If pct is based on "In Stock" then it should be 100 - (InStock / Live)
    // Our code used: 100 - (InStock / Live)
}

checkAmazonOosRate()
