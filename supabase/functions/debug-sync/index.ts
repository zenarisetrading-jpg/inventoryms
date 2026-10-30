import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { getPool } from '../_shared/saddl.ts'
import { corsHeaders } from '../_shared/cors.ts'
import { getSupabaseAdmin } from '../_shared/supabase.ts'

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

    if (body.action === 'backfill_sales' || body.action === 'sync_wishmaster') {
      const accountId = body.account_id || 'wishmaster'
      const country = body.country || 'UAE'
      const days = body.days || 180

      const supabase = getSupabaseAdmin()
      const pool = getPool()
      const conn = await pool.connect()
      let salesRows: any[] = []
      try {
        const { rows } = await conn.queryObject<{
          asin: string
          report_date: string
          units_sold: number
          revenue: number
        }>(`
          SELECT
            child_asin AS asin,
            report_date::text AS report_date,
            SUM(units_ordered) AS units_sold,
            SUM(COALESCE(ordered_revenue, 0)) AS revenue
          FROM sc_raw.sales_traffic
          WHERE account_id = $1
            AND report_date >= CURRENT_DATE - ($2 || ' days')::interval
            AND (units_ordered > 0 OR COALESCE(ordered_revenue, 0) > 0)
            AND child_asin IS NOT NULL
            AND child_asin <> ''
          GROUP BY child_asin, report_date
        `, [accountId, days])
        salesRows = rows
      } finally {
        conn.release()
        await pool.end()
      }

      // Fetch all sku_master for this account with full pagination
      const skuMasterRows: any[] = []
      let from = 0
      while (true) {
        const { data: page, error: smErr } = await supabase
          .from('sku_master')
          .select('sku, asin, fnsku')
          .eq('country', country)
          .eq('saddl_id', accountId)
          .range(from, from + 999)
        if (smErr || !page || page.length === 0) break
        skuMasterRows.push(...page)
        if (page.length < 1000) break
        from += 1000
      }

      const asinToSku = new Map<string, string>()
      for (const r of skuMasterRows) {
        if (r.asin && r.sku) asinToSku.set(r.asin.trim(), r.sku)
      }

      const snapshotRows: any[] = []
      const rawAmzRows: any[] = []
      let totalUnits = 0
      let totalRevenue = 0
      let matchedCount = 0
      let unmatchedCount = 0
      let earliestDate = ''
      let latestDate = ''

      for (const s of salesRows) {
        const asin = String(s.asin || '').trim()
        const date = String(s.report_date).slice(0, 10)
        const units = Number(s.units_sold) || 0
        const rev = Number(s.revenue) || 0

        if (!earliestDate || date < earliestDate) earliestDate = date
        if (!latestDate || date > latestDate) latestDate = date

        rawAmzRows.push({
          report_date: date,
          child_asin: asin,
          country,
          units_ordered: units,
          ordered_revenue: rev,
          saddl_id: accountId
        })

        if (asinToSku.has(asin)) {
          const sku = asinToSku.get(asin)!
          snapshotRows.push({
            sku,
            date,
            channel: 'amazon',
            units_sold: units,
            revenue: rev,
            country,
            saddl_id: accountId,
            synced_at: new Date().toISOString()
          })
          totalUnits += units
          totalRevenue += rev
          matchedCount++
        } else {
          unmatchedCount++
        }
      }

      // Upsert into sales_snapshot in chunks of 500
      for (let i = 0; i < snapshotRows.length; i += 500) {
        const chunk = snapshotRows.slice(i, i + 500)
        await supabase.from('sales_snapshot').upsert(chunk, { onConflict: 'sku,date,channel,country,saddl_id' })
      }

      // Upsert into amazon_sales in chunks of 500
      for (let i = 0; i < rawAmzRows.length; i += 500) {
        const chunk = rawAmzRows.slice(i, i + 500)
        await supabase.from('amazon_sales').upsert(chunk, { onConflict: 'report_date,child_asin,country,saddl_id' })
      }

      // Refresh planning fact and sku reorder recommendations
      await supabase.rpc('refresh_fact_inventory_planning')
      await supabase.rpc('refresh_sku_reorder_recommendations')

      return new Response(JSON.stringify({
        status: 'success',
        account_id: accountId,
        days_requested: days,
        date_range: { earliest: earliestDate, latest: latestDate },
        saddl_sales_rows: salesRows.length,
        sku_master_loaded: skuMasterRows.length,
        snapshot_rows_upserted: snapshotRows.length,
        total_units_backfilled: totalUnits,
        total_revenue_backfilled: totalRevenue,
        matched_asins_count: matchedCount,
        unmatched_asins_count: unmatchedCount
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
