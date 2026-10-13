import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { getPool } from '../_shared/saddl.ts'
import { corsHeaders } from '../_shared/cors.ts'

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body = await req.json().catch(() => ({}))
    if (body.check_env) {
      return new Response(JSON.stringify({
        has_supabase_url: !!Deno.env.get('SUPABASE_URL'),
        has_service_role_key: !!Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
        service_role_key_prefix: (Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '').slice(0, 15),
        has_anon_key: !!Deno.env.get('SUPABASE_ANON_KEY'),
        anon_key_prefix: (Deno.env.get('SUPABASE_ANON_KEY') || '').slice(0, 15),
        has_saddl_db_url: !!Deno.env.get('SADDL_DB_URL'),
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      })
    }

    const query = body.query as string


    if (!query || !query.trim().toLowerCase().startsWith('select')) {
      return new Response(JSON.stringify({ error: 'Only SELECT queries allowed' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400
      })
    }

    const pool = getPool()
    const conn = await pool.connect()
    try {
      const { rows } = await conn.queryObject(query)
      return new Response(JSON.stringify({ rows }, (k, v) => typeof v === 'bigint' ? v.toString() : v, 2), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      })
    } finally {
      conn.release()
      await pool.end()
    }
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})

