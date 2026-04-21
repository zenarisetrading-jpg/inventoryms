/**
 * get_unmatched_skus.ts
 * 
 * Run this script to see the exact list of Locad SKUs that are not yet 
 * mapped to your internal SKU master list.
 * 
 * Usage:
 *   deno run --allow-net --allow-env get_unmatched_skus.ts
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Load from .env if available, or set these manually
const SUPABASE_URL = Deno.env.get('VITE_SUPABASE_URL')
const SUPABASE_ANON_KEY = Deno.env.get('VITE_SUPABASE_ANON_KEY')

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('Error: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set in your environment.')
  Deno.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

async function main() {
  console.log('Fetching unmatched Locad SKUs...')

  const { data, error } = await supabase
    .from('locad_raw_staging')
    .select('locad_sku, locad_upc, matched_sku')
    .eq('match_method', 'unmatched')
    .order('locad_sku', { ascending: true })

  if (error) {
    console.error('Database error:', error.message)
    return
  }

  if (!data || data.length === 0) {
    console.log('No unmatched SKUs found! Everything is mapped.')
    return
  }

  console.log(`\nFound ${data.length} unmatched SKUs:\n`)
  console.log(''.padEnd(30, '-') + ' ' + ''.padEnd(15, '-') + ' ' + ''.padEnd(30, '-'))
  console.log('Locad SKU'.padEnd(30) + ' | ' + 'UPC/FNSKU'.padEnd(15) + ' | ' + 'Matched SKU')
  console.log(''.padEnd(30, '-') + ' ' + ''.padEnd(15, '-') + ' ' + ''.padEnd(30, '-'))

  data.forEach((row: any) => {
    console.log(
      String(row.locad_sku).padEnd(30) + ' | ' + 
      String(row.locad_upc || '—').padEnd(15) + ' | ' + 
      (row.matched_sku || 'UNMAPPED')
    )
  })

  console.log('\nTo fix these, use the "Upload Center -> Map Locad SKUs" section in the dashboard.')
}

main()
