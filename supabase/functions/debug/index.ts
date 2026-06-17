import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { getSupabaseAdmin } from '../_shared/supabase.ts'

serve(async (req) => {
  const supabase = getSupabaseAdmin()
  const { data: sku_master } = await supabase.from('sku_master').select('saddl_id, country, sku')
  const { data: sales_snapshot } = await supabase.from('sales_snapshot').select('saddl_id, channel, date').limit(100)

  // group by saddl_id
  const skuCounts = (sku_master || []).reduce((acc: any, row: any) => {
    const key = row.saddl_id || 'NULL'
    acc[key] = (acc[key] || 0) + 1
    return acc
  }, {})

  return new Response(JSON.stringify({ skuCounts, sampleSales: sales_snapshot }), {
    headers: { 'Content-Type': 'application/json' }
  })
})
