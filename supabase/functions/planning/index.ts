import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { corsHeaders } from '../_shared/cors.ts'
import { getSupabaseAdmin } from '../_shared/supabase.ts'

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'GET') return jsonResponse({ error: 'Method not allowed' }, 405)

  try {
    const supabase = getSupabaseAdmin()

    // 1. Fetch data from fact_inventory_planning and sku_master separately
    const [factRes, masterRes] = await Promise.all([
      supabase.from('fact_inventory_planning').select('*'),
      supabase.from('sku_master').select('sku, name, is_active')
    ])

    if (factRes.error) throw factRes.error
    if (masterRes.error) throw masterRes.error

    const factRows = factRes.data || []
    const masterRows = masterRes.data || []
    
    const masterMap = new Map()
    masterRows.forEach(m => masterMap.set(String(m.sku).trim().toUpperCase(), m))

    const rawData = factRows.map(row => {
      const meta = masterMap.get(String(row.sku).trim().toUpperCase())
      return {
        ...row,
        name: meta?.name || row.sku,
        category: meta?.category || row.category,
        sub_category: meta?.sub_category || row.sub_category,
        is_active: meta?.is_active ?? true
      }
    })

    const response = {
      raw_data: rawData,
      fact_count: factRows.length,
      master_count: masterRows.length,
      generated_at: new Date().toISOString()
    }

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err: any) {
    console.error('planning: unhandled error', err)
    return new Response(
      JSON.stringify({ error: err.message, stack: err.stack }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }
})
