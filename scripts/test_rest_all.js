const REST_URL = 'https://eiezhzlpirdiqsotvogx.supabase.co/rest/v1/demand_metrics?select=sku,coverage_amazon&limit=10'
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVpZXpoemxwaXJkaXFzb3R2b2d4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIyMTEwMDMsImV4cCI6MjA4Nzc4NzAwM30.s_vewTvQP-n8j9Z-ncRAsgf_-wslJDk7kBWvMLM7gbg'

async function testAll() {
    console.log('--- TEST START: Fetching 10 Demand Metrics ---')

    try {
        const res = await fetch(REST_URL, {
            headers: {
                'apikey': ANON_KEY,
                'Authorization': `Bearer ${ANON_KEY}`,
                'Content-Type': 'application/json'
            }
        })

        const data = await res.json()
        console.log(`Found ${data.length} items.`)
        console.log('Sample data:', JSON.stringify(data, null, 2))

    } catch (err) {
        console.error('REST ERROR:', err)
    }
}

testAll()
