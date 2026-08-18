import { createClient } from 'npm:@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('VITE_SUPABASE_URL')!,
  Deno.env.get('VITE_SUPABASE_ANON_KEY')!
)

async function run() {
  const { data, error } = await supabase
    .from('fact_purchase')
    .select('po_number, sku')
    .in('po_number', ['PO2026080101', 'PO2026080102'])
  
  console.log('Result:', data)
  if (error) console.error('Error:', error)
}
run()
