import { createClient } from 'https://esm.sh/@supabase/supabase-admin'

const supabase = createClient(
  'https://s2cinventory.supabase.co', // Replace with actual URL if known, or use env
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function checkSKU() {
  const { data, error } = await supabase
    .from('sku_master')
    .select('sku')
    .eq('sku', 'V8-OT2I-663N')
    .maybeSingle()

  if (error) console.error('Error:', error)
  else console.log('SKU exists:', data)
}

checkSKU()
