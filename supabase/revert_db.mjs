import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '../frontend/.env' })

const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseServiceKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function run() {
  console.log('Fetching locations...')
  const { data, error } = await supabase.from('amazon_locations').select('*')
  console.log(data)

  // keep the first UAE, KSA, etc, delete duplicates
  const seen = new Set()
  for (const loc of data || []) {
    if (seen.has(loc.country)) {
      console.log('Deleting duplicate:', loc.id)
      await supabase.from('amazon_locations').delete().eq('id', loc.id)
    } else {
      seen.add(loc.country)
    }
  }

  // Restore the constraint
  console.log('Restoring constraint...')
  const { error: rpcError } = await supabase.rpc('execute_sql', {
    sql: `
      ALTER TABLE amazon_locations DROP CONSTRAINT IF EXISTS amazon_locations_saddl_account_id_key;
      ALTER TABLE amazon_locations ADD CONSTRAINT amazon_locations_country_key UNIQUE (country);
    `
  })
  if (rpcError) console.error('RPC Error:', rpcError)
  else console.log('Constraint restored.')
}

run()
