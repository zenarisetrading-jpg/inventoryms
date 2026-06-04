const { createClient } = require('@supabase/supabase-js')

const supabaseUrl = 'https://eiezhzlpirdiqsotvogx.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVpZXpoemxwaXJkaXFzb3R2b2d4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIyMTEwMDMsImV4cCI6MjA4Nzc4NzAwM30.s_vewTvQP-n8j9Z-ncRAsgf_-wslJDk7kBWvMLM7gbg'
const supabase = createClient(supabaseUrl, supabaseKey)

async function check() {
    const { data: invData } = await supabase
        .from('inventory_snapshot')
        .select('sku')
        .eq('snapshot_date', '2026-05-11')
        .eq('node', 'amazon_fba')
        .limit(10)
    
    console.log("May 11 SKUs:", invData)

    const { data: masterData } = await supabase
        .from('sku_master')
        .select('sku, asin')
        .limit(10)

    console.log("Master SKUs:", masterData)
}
check()
