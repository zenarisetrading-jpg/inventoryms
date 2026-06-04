const { createClient } = require('@supabase/supabase-js')

const supabaseUrl = 'https://eiezhzlpirdiqsotvogx.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVpZXpoemxwaXJkaXFzb3R2b2d4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIyMTEwMDMsImV4cCI6MjA4Nzc4NzAwM30.s_vewTvQP-n8j9Z-ncRAsgf_-wslJDk7kBWvMLM7gbg'
const supabase = createClient(supabaseUrl, supabaseKey)

async function test() {
    console.log("Testing sales_snapshot upsert...")
    const { data, error } = await supabase.from('sales_snapshot').upsert([{
        sku: 'TEST_SKU',
        date: '2025-01-01',
        channel: 'amazon',
        units_sold: 1
    }], { onConflict: 'sku,date,channel' })
    console.log("Sales Error:", error)
}
test()
