const BASE_URL = 'https://eiezhzlpirdiqsotvogx.supabase.co/rest/v1/inventory_snapshot?select=sku,available&node=eq.noon_fbn'
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVpZXpoemxwaXJkaXFzb3R2b2d4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIyMTEwMDMsImV4cCI6MjA4Nzc4NzAwM30.s_vewTvQP-n8j9Z-ncRAsgf_-wslJDk7kBWvMLM7gbg'

async function checkNoonHistory() {
    console.log('--- NOON OOS INVESTIGATION ---')

    try {
        const res = await fetch(BASE_URL, {
            headers: {
                'apikey': ANON_KEY,
                'Authorization': `Bearer ${ANON_KEY}`,
                'Content-Type': 'application/json'
            }
        })

        const rows = await res.json()
        const skusEverOnNoon = new Set(rows.map(r => r.sku))

        const latestSnapshot = {}
        rows.forEach(r => {
            if (!latestSnapshot[r.sku] || r.available > latestSnapshot[r.sku]) {
                latestSnapshot[r.sku] = r.available
            }
        })

        const oosNoon = Object.keys(latestSnapshot).filter(sku => latestSnapshot[sku] <= 0)
        const inStockNoon = Object.keys(latestSnapshot).filter(sku => latestSnapshot[sku] > 0)

        console.log(`SKUs ever seen on Noon: ${skusEverOnNoon.size}`)
        console.log(`SKUs with latest stock > 0 on Noon: ${inStockNoon.length}`)
        console.log(`SKUs currently OOS on Noon (Available <= 0): ${oosNoon.length}`)

        const masterRes = await fetch('https://eiezhzlpirdiqsotvogx.supabase.co/rest/v1/sku_master?select=sku,is_active', {
            headers: { 'apikey': ANON_KEY, 'Authorization': `Bearer ${ANON_KEY}` }
        })
        const master = await masterRes.json()
        console.log(`Total Active SKUs in Master: ${master.filter(m => m.is_active).length}`)

    } catch (err) {
        console.error('DIAGNOSTIC ERROR:', err)
    }
}

checkNoonHistory()
