import { parse } from "https://deno.land/std@0.168.0/encoding/csv.ts";

const SUPABASE_URL = 'https://eiezhzlpirdiqsotvogx.supabase.co'
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVpZXpoemxwaXJkaXFzb3R2b2d4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIyMTEwMDMsImV4cCI6MjA4Nzc4NzAwM30.s_vewTvQP-n8j9Z-ncRAsgf_-wslJDk7kBWvMLM7gbg'

async function seedSkus() {
    console.log('--- SEEDING SKU MASTER ---')

    const content = await Deno.readTextFile('data/sku_master.csv')
    const rows = await parse(content, { skipFirstRow: true }) as string[][]

    const skus = rows.map(row => ({
        asin: row[0],
        sku: row[1],
        name: row[2],
        fnsku: row[3],
        category: null,
        sub_category: row[5],
        cogs: parseFloat(row[6]) || 0,
        is_active: true
    }))

    console.log(`Prepared ${skus.length} SKUs for insertion.`)

    for (let i = 0; i < skus.length; i += 50) {
        const chunk = skus.slice(i, i + 50)
        const res = await fetch(`${SUPABASE_URL}/rest/v1/sku_master`, {
            method: 'POST',
            headers: {
                'apikey': ANON_KEY,
                'Authorization': `Bearer ${ANON_KEY}`,
                'Content-Type': 'application/json',
                'Prefer': 'upsert=true'
            },
            body: JSON.stringify(chunk)
        })

        if (!res.ok) {
            const error = await res.text()
            console.error(`Error inserting chunk ${i}:`, error)
        } else {
            console.log(`Inserted chunk ${i / 50 + 1}`)
        }
    }

    console.log('--- SEEDING COMPLETE ---')
}

seedSkus()
