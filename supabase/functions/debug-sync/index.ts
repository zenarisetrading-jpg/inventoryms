import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1"
import { fetchAmazonInventory } from '../_shared/saddl.ts'
import { corsHeaders } from '../_shared/cors.ts'

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { data: snapshot } = await supabase
        .from('inventory_snapshot')
        .select('sku, snapshot_date')
        .eq('snapshot_date', '2026-05-11')
        .eq('node', 'amazon_fba')
        .limit(5)

    const { data: latestUnmatched } = await supabase
        .from('locad_raw_staging')
        .select('locad_sku, locad_upc, available, match_method')
        .limit(10)

    return new Response(JSON.stringify({
      may11_skus: snapshot,
      locad_staging_sample: latestUnmatched
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})
