import { createClient } from 'npm:@supabase/supabase-js@2'
import 'npm:dotenv/config'

const supabase = createClient(
  Deno.env.get('VITE_SUPABASE_URL')!,
  Deno.env.get('VITE_SUPABASE_ANON_KEY')!
)

async function run() {
  console.log('Inserting test row...');
  const { data, error } = await supabase.from('fact_purchase').insert({
    po_number: 'TEST_PO',
    po_name: 'Test PO',
    supplier: 'Test Supplier',
    country: 'UAE',
    order_date: '2026-08-18',
    eta: '2026-08-20',
    status: 'draft',
    sku: 'TEST-SKU-123',
    units_ordered: 10,
    units_received: 0,
    saddl_id: 'SDL-TEST-999'
  }).select('*').single()
  
  if (error) {
    console.error('Insert error:', error);
  } else {
    console.log('Inserted row:', data);
    
    // Cleanup
    await supabase.from('fact_purchase').delete().eq('po_number', 'TEST_PO');
  }
}
run()
