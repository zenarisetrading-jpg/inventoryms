
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7'

const supabaseUrl = 'https://eiezhzlpirdiqsotvogx.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVpZXpoemxwaXJkaXFzb3R2b2d4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIyMTEwMDMsImV4cCI6MjA4Nzc4NzAwM30.s_vewTvQP-n8j9Z-ncRAsgf_-wslJDk7kBWvMLM7gbg'
const supabase = createClient(supabaseUrl, supabaseKey)

async function checkLocadSync() {
    console.log('--- Checking Locad Sync Status ---')
    
    // Check locad_raw_staging for sync attempts
    const { data: staging, error: stagingErr } = await supabase
        .from('locad_raw_staging')
        .select('*')
        .order('synced_at', { ascending: false })
        .limit(5)
    
    if (stagingErr) console.error('Error fetching staging:', stagingErr)
    else console.log('Recent Locad Raw Staging rows:', staging)

    // Check locad_upload_log
    const { data: logs, error: logErr } = await supabase
        .from('locad_upload_log')
        .select('*')
        .order('uploaded_at', { ascending: false })
        .limit(5)
    
    if (logErr) console.error('Error fetching logs:', logErr)
    else console.log('Recent Locad Upload Logs:', logs)

    // Check sync status via the sync/status function
    const statusRes = await fetch(`${supabaseUrl}/functions/v1/sync/status`, {
        headers: { 'Authorization': `Bearer ${supabaseKey}` }
    })
    const statusData = await statusRes.json()
    console.log('Overall Sync Status API:', JSON.stringify(statusData, null, 2))
}

checkLocadSync()
