
const DASHBOARD_URL = 'https://eiezhzlpirdiqsotvogx.supabase.co/functions/v1/dashboard'
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVpZXpoemxwaXJkaXFzb3R2b2d4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIyMTEwMDMsImV4cCI6MjA4Nzc4NzAwM30.s_vewTvQP-n8j9Z-ncRAsgf_-wslJDk7kBWvMLM7gbg'

async function checkDashboard() {
    console.log('--- Calling Dashboard API ---')
    const res = await fetch(DASHBOARD_URL, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${ANON_KEY}` }
    })
    const data = await res.json()
    console.log('Dashboard Response Snippet:')
    console.log('latest_snapshot_amazon:', data.latest_snapshot_amazon)
    console.log('latest_snapshot_noon:', data.latest_snapshot_noon)
    console.log('latest_snapshot_locad:', data.latest_snapshot_locad)
    console.log('last_synced:', data.last_synced)
    console.log('generated_at:', data.generated_at)
}

checkDashboard()
