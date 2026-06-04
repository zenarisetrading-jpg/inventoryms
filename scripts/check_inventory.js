const { createClient } = require('@supabase/supabase-js')

const supabaseUrl = 'https://eiezhzlpirdiqsotvogx.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVpZXpoemxwaXJkaXFzb3R2b2d4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIyMTEwMDMsImV4cCI6MjA4Nzc4NzAwM30.s_vewTvQP-n8j9Z-ncRAsgf_-wslJDk7kBWvMLM7gbg'
const supabase = createClient(supabaseUrl, supabaseKey)

async function check() {
    const { data: invData, error: invErr } = await supabase
        .from('inventory_snapshot')
        .select('*')
    
    if (invErr) {
        console.error('Error fetching inventory:', invErr)
        return
    }

    if (!invData || invData.length === 0) {
        console.log("No inventory data found in DB at all.")
        return
    }

    const dates = [...new Set(invData.map(d => d.snapshot_date))].sort().reverse()
    console.log("Available dates:", dates)

    for (const today of dates.slice(0, 2)) {
        const todayData = invData.filter(d => d.snapshot_date === today);
        
        const fba = todayData.filter(d => d.node === 'amazon_fba')
        const locad = todayData.filter(d => d.node === 'locad')

        let fbaTotal = fba.reduce((acc, curr) => acc + curr.available, 0)
        let locadTotal = locad.reduce((acc, curr) => acc + curr.available, 0)

        console.log(`\n--- Inventory Snapshot For (${today}) ---`)
        console.log(`FBA Items Count: ${fba.length}`)
        console.log(`FBA Total Available Units: ${fbaTotal}`)
        console.log(`Locad Items Count: ${locad.length}`)
        console.log(`Locad Total Available Units: ${locadTotal}`)
    }
}
check()
