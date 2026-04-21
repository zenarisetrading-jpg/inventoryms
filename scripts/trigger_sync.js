const SYNC_URL = 'https://eiezhzlpirdiqsotvogx.supabase.co/functions/v1/sync/all'
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVpZXpoemxwaXJkaXFzb3R2b2d4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIyMTEwMDMsImV4cCI6MjA4Nzc4NzAwM30.s_vewTvQP-n8j9Z-ncRAsgf_-wslJDk7kBWvMLM7gbg'

async function triggerSync() {
    console.log('--- TRIGGERING FULL SYNC & REFRESH ---')
    const res = await fetch(SYNC_URL, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${ANON_KEY}` }
    })
    const data = await res.json()
    console.log('Sync Response:', JSON.stringify(data, null, 2))
}

triggerSync()
