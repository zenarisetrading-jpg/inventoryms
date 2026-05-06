const REST_URL = 'https://eiezhzlpirdiqsotvogx.supabase.co/rest/v1/demand_metrics?select=sku,coverage_amazon,coverage_noon,sku_master(name)&coverage_amazon=eq.0'
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVpZXpoemxwaXJkaXFzb3R2b2d4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIyMTEwMDMsImV4cCI6MjA4Nzc4NzAwM30.s_vewTvQP-n8j9Z-ncRAsgf_-wslJDk7kBWvMLM7gbg'

async function testRest() {
    console.log('--- TEST START: Fetching via PostgREST ---')

    try {
        const res = await fetch(REST_URL, {
            headers: {
                'apikey': ANON_KEY,
                'Authorization': `Bearer ${ANON_KEY}`,
                'Content-Type': 'application/json'
            }
        })

        const data = await res.json()
        console.log(`Found ${data.length} items OOS on Amazon via REST.`)
        if (data.length > 0) {
            console.log('Sample item:', JSON.stringify(data[0], null, 2))
            console.log('✅ SUCCESS: We can fetch the OOS list directly from the frontend!')
        }

    } catch (err) {
        console.error('REST ERROR:', err)
    }
}

testRest()
