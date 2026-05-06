const BASE_URL = 'https://eiezhzlpirdiqsotvogx.supabase.co/functions/v1/dashboard'
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVpZXpoemxwaXJkaXFzb3R2b2d4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIyMTEwMDMsImV4cCI6MjA4Nzc4NzAwM30.s_vewTvQP-n8j9Z-ncRAsgf_-wslJDk7kBWvMLM7gbg'

async function checkNoonSv() {
    console.log('--- NOON SV DIAGNOSTIC ---')

    try {
        const res = await fetch(BASE_URL, {
            headers: {
                'Authorization': `Bearer ${ANON_KEY}`,
                'Content-Type': 'application/json'
            }
        })

        const data = await res.json()
        const alertsWithNoonSv = (data.alerts || []).filter(a => a.noon_sv > 0)
        console.log(`Alerts with Noon SV > 0: ${alertsWithNoonSv.length}`)

        const reorderWithNoonSv = (data.reorder_now || []).filter(a => a.noon_sv > 0)
        console.log(`Reorder items with Noon SV > 0: ${reorderWithNoonSv.length}`)

    } catch (err) {
        console.error('DIAGNOSTIC ERROR:', err)
    }
}

checkNoonSv()
