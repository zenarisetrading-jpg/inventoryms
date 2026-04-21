import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { corsHeaders } from '../_shared/cors.ts'
import { getSupabaseAdmin } from '../_shared/supabase.ts'
import { classifyABC, refreshABCCategories } from '../_shared/abc.ts'

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
    const url = new URL(req.url)
    const days = Number(url.searchParams.get('days') ?? '60')
    const rangeDays = Number.isFinite(days) && days > 0 ? Math.floor(days) : 60
    const apply = url.searchParams.get('apply') === 'true'

    const supabase = getSupabaseAdmin()
    const result = await classifyABC(supabase, rangeDays)

    if (apply) {
      await refreshABCCategories(supabase, rangeDays)
    }

    return jsonResponse({ ...result, applied_to_db: apply })
  } catch (err) {
    console.error('abc-classify: unhandled error', err)
    return jsonResponse({ error: 'Internal server error', detail: String(err) }, 500)
  }
})
