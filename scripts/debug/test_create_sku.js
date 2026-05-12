
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

const URL = 'https://eiezhzlpirdiqsotvogx.supabase.co/functions/v1/skus'
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVpZXpoemxwaXJkaXFzb3R2b2d4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIyMTEwMDMsImV4cCI6MjA4Nzc4NzAwM30.s_vewTvQP-n8j9Z-ncRAsgf_-wslJDk7kBWvMLM7gbg'

async function test() {
    const res = await fetch(URL, {
        method: 'POST',
        headers: {
            'apikey': ANON_KEY,
            'Authorization': `Bearer ${ANON_KEY}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            sku: 'TEST_SKU',
            name: 'Test Product'
        })
    })
    const data = await res.json()
    console.log('Response:', data)
}

test()
