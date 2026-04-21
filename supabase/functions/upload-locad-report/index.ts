/**
 * upload-locad-report/index.ts — Deno Edge Function
 *
 * Routes:
 *   POST   /upload-locad-report         — multipart/form-data, field "file" (xlsx)
 *   GET    /upload-locad-report/unmatched — list Locad SKUs with no internal mapping
 *   POST   /upload-locad-report/map       — body { locad_sku, internal_sku } → upsert locad_sku_map
 *
 * Upload flow:
 *   1. Parse multipart body → extract xlsx file
 *   2. parseLocadXLSX(buffer, filename)
 *   3. resolveLocadSKUs(items, supabase) — auto-match (FNSKU, exact SKU, manual)
 *   4. Upsert matched items to inventory_snapshot (node: 'locad_warehouse')
 *      CONFLICT key: (sku, node, warehouse_name, snapshot_date)
 *   5. Insert row to locad_upload_log
 *   6. Return summary
 *
 * HTTP status codes:
 *   400 — no file provided
 *   422 — xlsx unreadable or required sheet missing
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { corsHeaders } from '../_shared/cors.ts'
import { getSupabaseAdmin } from '../_shared/supabase.ts'
import { parseLocadXLSX, resolveLocadSKUs } from '../_shared/locad-xlsx.ts'
import { refreshAllMetrics } from '../_shared/velocity.ts'

// ---------------------------------------------------------------------------
// serve
// ---------------------------------------------------------------------------

serve(async (req: Request) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const url = new URL(req.url)
  const segments = url.pathname.replace(/^\/upload-locad-report\/?/, '').split('/')
  const action = segments[0] ?? ''

  try {
    // GET /upload-locad-report/unmatched
    if (req.method === 'GET' && action === 'unmatched') {
      return await handleGetUnmatched()
    }

    // POST /upload-locad-report/map
    if (req.method === 'POST' && action === 'map') {
      return await handlePostMap(req)
    }

    // POST /upload-locad-report  (xlsx upload)
    if (req.method === 'POST' && !action) {
      return await handleUpload(req)
    }

    return jsonResponse({ error: 'Not found', path: url.pathname }, 404)
  } catch (err) {
    console.error('[upload-locad-report] Unhandled error:', err)
    return jsonResponse({ error: String((err as Error).message) }, 500)
  }
})

// ---------------------------------------------------------------------------
// handleUpload
// ---------------------------------------------------------------------------

async function handleUpload(req: Request): Promise<Response> {
  // Parse multipart form
  let formData: FormData
  try {
    formData = await req.formData()
  } catch (err) {
    return jsonResponse({ error: `Failed to parse multipart body: ${(err as Error).message}` }, 400)
  }

  const file = formData.get('file')
  if (!file || !(file instanceof File)) {
    return jsonResponse({ error: 'No file provided. Send a multipart/form-data POST with field "file".' }, 400)
  }

  // Read file buffer
  let buffer: ArrayBuffer
  try {
    buffer = await file.arrayBuffer()
  } catch (err) {
    return jsonResponse({ error: `Failed to read file buffer: ${(err as Error).message}` }, 400)
  }

  const filename = file.name ?? 'unknown.xlsx'

  // Parse xlsx
  let parsedResult: { items: ReturnType<typeof parseLocadXLSX>['items']; report_date: string }
  try {
    parsedResult = parseLocadXLSX(buffer, filename)
  } catch (err) {
    return jsonResponse(
      { error: `Failed to parse xlsx: ${(err as Error).message}` },
      422
    )
  }

  const { items, report_date } = parsedResult

  if (items.length === 0) {
    return jsonResponse({
      upload_id: crypto.randomUUID(),
      report_date,
      rows_parsed: 0,
      rows_matched: 0,
      rows_unmatched: 0,
      unmatched_skus: [],
      status: 'processed',
    })
  }

  const supabase = getSupabaseAdmin()

  // Resolve SKUs (auto-match passes 1–3)
  const { matched, unmatched } = await resolveLocadSKUs(items, supabase)

  // Upsert matched items to inventory_snapshot
  // Deduplicate by (sku, warehouse_name) — xlsx may list the same product multiple
  // times (different bins, conditions, etc.). Sum sellable_stock across duplicates.
  let upsertError: string | null = null
  if (matched.length > 0) {
    const dedupMap = new Map<string, { sku: string; warehouse_name: string; available: number }>()
    for (const item of matched) {
      const key = `${item.internal_sku}||${item.warehouse_name}`
      const existing = dedupMap.get(key)
      if (existing) {
        existing.available += item.sellable_stock
      } else {
        dedupMap.set(key, { sku: item.internal_sku, warehouse_name: item.warehouse_name, available: item.sellable_stock })
      }
    }
    const snapRows = Array.from(dedupMap.values()).map((item) => ({
      sku: item.sku,
      node: 'locad_warehouse',
      warehouse_name: item.warehouse_name,
      available: item.available,
      inbound: 0,
      reserved: 0,
      snapshot_date: report_date,
    }))

    const { error } = await supabase
      .from('inventory_snapshot')
      .upsert(snapRows, {
        onConflict: 'sku,node,warehouse_name,snapshot_date',
      })
    if (error) {
      upsertError = error.message
      console.error('[upload-locad-report] inventory_snapshot upsert error:', error.message)
    }
  }

  const upload_id = crypto.randomUUID()
  const unmatched_skus = unmatched.map((u) => u.locad_sku)

  // Insert row to locad_upload_log
  const { error: logErr } = await supabase.from('locad_upload_log').insert({
    id: upload_id,
    filename,
    report_date,
    rows_parsed: items.length,
    rows_matched: matched.length,
    rows_unmatched: unmatched.length,
    unmatched_skus: unmatched_skus,
    uploaded_at: new Date().toISOString(),
    status: upsertError ? 'error' : unmatched.length > 0 ? 'partial' : 'processed',
  })
  if (logErr) {
    console.error('[upload-locad-report] locad_upload_log insert error:', logErr.message)
  }

  const status =
    upsertError
      ? 'error'
      : unmatched.length > 0
      ? 'partial'
      : 'processed'

  // Refresh decision engine metrics so Command Center reflects the new inventory
  if (!upsertError && matched.length > 0) {
    try {
      await refreshAllMetrics(supabase)
    } catch (err) {
      console.error('[upload-locad-report] refreshAllMetrics error:', err)
    }
  }

  return jsonResponse({
    upload_id,
    report_date,
    rows_parsed: items.length,
    rows_matched: matched.length,
    rows_unmatched: unmatched.length,
    unmatched_skus,
    status,
    ...(upsertError ? { error: upsertError } : {}),
  })
}

// ---------------------------------------------------------------------------
// handleGetUnmatched
// ---------------------------------------------------------------------------

async function handleGetUnmatched(): Promise<Response> {
  const supabase = getSupabaseAdmin()

  // Get the most recent upload's unmatched_skus array from locad_upload_log
  const { data: logs, error: logErr } = await supabase
    .from('locad_upload_log')
    .select('unmatched_skus, uploaded_at')
    .order('uploaded_at', { ascending: false })
    .limit(1)

  if (logErr) {
    return jsonResponse({ error: `Failed to query locad_upload_log: ${logErr.message}` }, 500)
  }

  const latestLog = logs?.[0] ?? null
  const unmatchedSkus: string[] = latestLog?.unmatched_skus ?? []

  if (unmatchedSkus.length === 0) {
    return jsonResponse({ unmatched: [], last_upload: latestLog?.uploaded_at ?? null })
  }

  // Fetch any available product_name hints from locad_sku_map where matched_by is null
  // (i.e. never matched). We'll join what we can.
  const { data: mapRows } = await supabase
    .from('locad_sku_map')
    .select('locad_sku, internal_sku')
    .in('locad_sku', unmatchedSkus)

  // Build a set of already-mapped SKUs
  const alreadyMapped = new Set((mapRows ?? []).map((r: { locad_sku: string }) => r.locad_sku))

  const unmatched = unmatchedSkus
    .filter((sku) => !alreadyMapped.has(sku))
    .map((locad_sku) => ({ locad_sku, product_name: null }))

  return jsonResponse({
    unmatched,
    last_upload: latestLog?.uploaded_at ?? null,
    count: unmatched.length,
  })
}

// ---------------------------------------------------------------------------
// handlePostMap
// ---------------------------------------------------------------------------

async function handlePostMap(req: Request): Promise<Response> {
  let body: { locad_sku?: string; internal_sku?: string }
  try {
    body = await req.json()
  } catch (_) {
    return jsonResponse({ error: 'Invalid JSON body' }, 400)
  }

  const { locad_sku, internal_sku } = body
  if (!locad_sku || !internal_sku) {
    return jsonResponse({ error: 'Both "locad_sku" and "internal_sku" are required' }, 400)
  }

  const supabase = getSupabaseAdmin()

  // Verify that internal_sku exists in sku_master table
  const { data: skuData, error: skuErr } = await supabase
    .from('sku_master')
    .select('sku')
    .eq('sku', internal_sku)
    .limit(1)

  if (skuErr) {
    return jsonResponse({ error: `Error looking up internal_sku: ${skuErr.message}` }, 500)
  }
  if (!skuData || skuData.length === 0) {
    return jsonResponse(
      { error: `internal_sku "${internal_sku}" not found in sku_master table` },
      422
    )
  }

  // Upsert to locad_sku_map with matched_by='manual'
  const { error: upsertErr } = await supabase
    .from('locad_sku_map')
    .upsert(
      { locad_sku, internal_sku, matched_by: 'manual', updated_at: new Date().toISOString() },
      { onConflict: 'locad_sku' }
    )

  if (upsertErr) {
    return jsonResponse({ error: `Failed to save mapping: ${upsertErr.message}` }, 500)
  }

  return jsonResponse({
    status: 'mapped',
    locad_sku,
    internal_sku,
    matched_by: 'manual',
  })
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
