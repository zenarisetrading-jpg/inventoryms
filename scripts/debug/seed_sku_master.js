
const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')

const supabaseUrl = 'https://eiezhzlpirdiqsotvogx.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVpZXpoemxwaXJkaXFzb3R2b2d4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIyMTEwMDMsImV4cCI6MjA4Nzc4NzAwM30.s_vewTvQP-n8j9Z-ncRAsgf_-wslJDk7kBWvMLM7gbg'
const supabase = createClient(supabaseUrl, supabaseKey)

async function seed() {
    console.log('--- SEEDING SKU MASTER ---')
    
    const csvData = fs.readFileSync('data/sku_master.csv', 'utf8')
    const lines = csvData.split('\n').filter(line => line.trim() !== '')
    const headers = lines[0].split(',')
    
    // Simple CSV parser (doesn't handle quotes perfectly but should work for this file)
    // Actually, Title has commas, so we need a better parser.
    const parseLine = (line) => {
        const result = []
        let current = ''
        let inQuotes = false
        for (let i = 0; i < line.length; i++) {
            if (line[i] === '"') {
                inQuotes = !inQuotes
            } else if (line[i] === ',' && !inQuotes) {
                result.push(current)
                current = ''
            } else {
                current += line[i]
            }
        }
        result.push(current)
        return result
    }

    const rows = lines.slice(1).map(parseLine)

    const skus = rows.map(row => ({
        asin: row[0],
        sku: row[1],
        name: row[2],
        fnsku: row[3],
        product_category: row[4],
        sub_category: row[5],
        cogs: parseFloat(row[6]) || 0,
        is_active: true,
        amazon_active: true,
        noon_active: true,
        category: 'C' // Default tier
    }))

    console.log(`Prepared ${skus.length} SKUs for insertion.`)

    const { error } = await supabase.from('sku_master').upsert(skus, { onConflict: 'sku' })

    if (error) {
        console.error('Error seeding SKUs:', error)
    } else {
        console.log('Successfully seeded SKUs.')
    }
}

seed()
