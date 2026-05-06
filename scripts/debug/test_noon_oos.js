const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVpZXpoemxwaXJkaXFzb3R2b2d4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIyMTEwMDMsImV4cCI6MjA4Nzc4NzAwM30.s_vewTvQP-n8j9Z-ncRAsgf_-wslJDk7kBWvMLM7gbg'
const URL = 'https://eiezhzlpirdiqsotvogx.supabase.co/functions/v1/dashboard'

async function checkNoonOosRate() {
    const res = await fetch(URL, { headers: { 'Authorization': `Bearer ${ANON_KEY}` } })
    const data = await res.json()

    console.log('--- NOON OOS RATE TEST ---')
    console.log(`Reported NOON OOS Rate: ${data.oos_pct_noon}%`)
    console.log(`Live SKUs (Base): ${data.live_skus_noon}`)
    console.log(`OOS SKUs (Count): ${data.oos_count_noon}`)

    // Verify math: (OOS / Live) * 100
    const calculated = data.live_skus_noon > 0 ? (data.oos_count_noon / data.live_skus_noon * 100) : 0
    console.log(`Verification Math: (${data.oos_count_noon} / ${data.live_skus_noon}) * 100 = ${calculated.toFixed(1)}%`)
}

checkNoonOosRate()
