import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { corsHeaders } from '../_shared/cors.ts'
import { getSupabaseClient } from '../_shared/supabase.ts'

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
    const supabase = getSupabaseClient(req)

    const url = new URL(req.url)
    const country = url.searchParams.get('country') || 'UAE'
    const accountId = url.searchParams.get('account_id')

    let factQuery = supabase.from('v_fact_inventory_with_age').select('*').eq('country', country)

    if (accountId) {
      factQuery = factQuery.eq('saddl_id', accountId)
    }

    // Fetch data from v_fact_inventory_with_age
    const factRes = await factQuery

    if (factRes.error) throw factRes.error

    const factRows = factRes.data || []
    const rawData = factRows // view now contains all necessary data

    const response = {
      raw_data: rawData,
      fact_count: factRows.length,
      master_count: factRows.length,
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
