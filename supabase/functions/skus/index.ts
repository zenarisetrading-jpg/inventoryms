import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { corsHeaders } from '../_shared/cors.ts'
import { getSupabaseAdmin } from '../_shared/supabase.ts'
import { INCOMING_PO_STATUSES } from '../_shared/types.ts'
import type { SKUCategory, ActionFlag } from '../_shared/types.ts'

// ---------------------------------------------------------------------------
// Response types
// ---------------------------------------------------------------------------

interface SKUListItem {
  sku: string
  name: string
  asin: string
  fnsku: string | null

  category: SKUCategory
  product_category: string | null
  sub_category: string | null
  units_per_box: number
  moq: number
  lead_time_days: number
  cogs: number
  dimensions: string | null
  is_active: boolean
  is_live: boolean
  demand: {
    blended_sv: number
    total_coverage: number
    projected_coverage: number
    should_reorder: boolean
    suggested_reorder_units: number
  } | null
  action_flag: ActionFlag | null
}

interface NodeDetail {
  available: number
  inbound: number
  coverage_days: number
  snapshot_date: string | null
}

interface PendingPOItem {
  po_number: string
  supplier: string
  eta: string
  status: string
  units_ordered: number
  units_received: number
  units_remaining: number
  units_incoming: number  // alias for units_remaining (matches api_contracts.md)
}

interface SKUDetailResponse {
  sku: string
  name: string
  asin: string
  fnsku: string | null

  category: SKUCategory
  sub_category: string
  units_per_box: number
  moq: number
  lead_time_days: number
  cogs: number
  dimensions: string | null
  is_active: boolean
  demand: {
    sv_7: number
    sv_90: number
    blended_sv: number
    action_flag: ActionFlag | null
    should_reorder: boolean
    suggested_reorder_units: number
    updated_at: string | null
  } | null
  supply: {
    amazon_fba: NodeDetail
    noon_fbn: NodeDetail
    locad_warehouse: NodeDetail
    total_available: number
    incoming_po_units: number
  }
  total_coverage_days: number
  projected_coverage_days: number
  action_flag: string | null
  pending_pos: PendingPOItem[]
}

// ---------------------------------------------------------------------------
// Route dispatcher
// ---------------------------------------------------------------------------
serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const url = new URL(req.url)
  // Path segments after the function name:
  // /skus        → list
  // /skus/:sku   → detail or update
  const pathParts = url.pathname.replace(/^\//, '').split('/')
  // pathParts[0] = 'skus' (function name), pathParts[1] = optional SKU id
  const skuParam = pathParts[1] ? decodeURIComponent(pathParts[1]) : null

  try {
    if (req.method === 'GET') {
      if (skuParam) {
        return await handleDetail(skuParam)
      } else {
        return await handleList(url)
      }
    }

    if (req.method === 'POST') {
      if (skuParam === 'classify') return await handleAutoClassify()
      return await handleCreate(req)
    }

    if (req.method === 'PATCH' && skuParam) {
      return await handleUpdate(skuParam, req)
    }

    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('skus: unhandled error', err)
    return new Response(
      JSON.stringify({ error: 'Internal server error', detail: String(err) }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }
})

// ---------------------------------------------------------------------------
// GET /skus — list with optional filters
// ---------------------------------------------------------------------------
async function handleList(url: URL): Promise<Response> {
  console.log('GET /skus called with params:', url.search)
  const supabase = getSupabaseAdmin()

  const search = url.searchParams.get('search')?.trim() ?? null
  const category = url.searchParams.get('category')?.toUpperCase() ?? null
  const flag = url.searchParams.get('flag')?.toUpperCase() ?? null

  const cutoff60 = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

  // Base query: join sku_master with demand_metrics (left join via foreign key)
  let query = supabase
    .from('sku_master')
    .select(
      `
      sku, name, asin, fnsku, category, product_category, sub_category,
      units_per_box, moq, lead_time_days, cogs, dimensions, is_active,
      demand_metrics(
        blended_sv, total_coverage, projected_coverage,
        action_flag, should_reorder, suggested_reorder_units
      )
      `
    )
    .order('sku', { ascending: true })

  // Apply category filter
  if (category && ['A', 'B', 'C'].includes(category)) {
    query = query.eq('category', category)
  }

  const [{ data, error }, liveSalesResult] = await Promise.all([
    query,
    supabase
      .from('sales_snapshot')
      .select('sku')
      .gte('date', cutoff60)
      .gt('units_sold', 0),
  ])

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  let rows = (data ?? []) as Record<string, unknown>[]

  // Apply search filter (in-memory, case-insensitive on sku or name)
  if (search) {
    const lower = search.toLowerCase()
    rows = rows.filter(
      (r) =>
        (r.sku as string).toLowerCase().includes(lower) ||
        (r.name as string).toLowerCase().includes(lower)
    )
  }

  // Apply action_flag filter
  if (flag) {
    rows = rows.filter((r) => {
      const dm = r.demand_metrics as Record<string, unknown>[] | null
      const metric = Array.isArray(dm) ? dm[0] : null
      return metric && (metric.action_flag as string) === flag
    })
  }

  const liveSkuSet = new Set<string>(
    ((liveSalesResult.data ?? []) as { sku: string }[]).map((r) => r.sku)
  )

  // Build response with demand nested and is_live flag
  const result: SKUListItem[] = rows.map((r) => {
    const dm = r.demand_metrics as Record<string, unknown>[] | null
    const metric = Array.isArray(dm) && dm.length > 0 ? dm[0] : null

    return {
      sku: r.sku as string,
      name: r.name as string,
      asin: r.asin as string,
      fnsku: (r.fnsku as string | null) ?? null,
      category: r.category as SKUCategory,
      product_category: (r.product_category as string | null) ?? null,
      sub_category: (r.sub_category as string | null) ?? null,
      units_per_box: r.units_per_box as number,
      moq: r.moq as number,
      lead_time_days: r.lead_time_days as number,
      cogs: r.cogs as number,
      dimensions: (r.dimensions as string | null) ?? null,
      is_active: r.is_active as boolean,
      is_live: liveSkuSet.has(r.sku as string),
      demand: metric ? {
        blended_sv: metric.blended_sv as number,
        total_coverage: metric.total_coverage as number,
        projected_coverage: metric.projected_coverage as number,
        should_reorder: metric.should_reorder as boolean,
        suggested_reorder_units: metric.suggested_reorder_units as number,
      } : null,
      action_flag: metric ? (metric.action_flag as ActionFlag) : null,
    }
  })

  return new Response(JSON.stringify({ skus: result, count: result.length }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

// ---------------------------------------------------------------------------
// GET /skus/:sku — full detail
// ---------------------------------------------------------------------------
async function handleDetail(skuId: string): Promise<Response> {
  const supabase = getSupabaseAdmin()

  // Run queries in parallel
  const [skuResult, demandResult, snapshotResult, poResult] = await Promise.all([
    // SKU master record
    supabase
      .from('sku_master')
      .select('sku, name, asin, fnsku, category, product_category, sub_category, units_per_box, moq, lead_time_days, cogs, dimensions, is_active')
      .eq('sku', skuId)
      .maybeSingle(),

    // Demand metrics
    supabase
      .from('demand_metrics')
      .select('sv_7, sv_90, blended_sv, action_flag, should_reorder, suggested_reorder_units, updated_at')
      .eq('sku', skuId)
      .maybeSingle(),

    // Latest inventory snapshot — all nodes, all warehouse names
    supabase
      .from('inventory_snapshot')
      .select('node, warehouse_name, available, inbound, reserved, snapshot_date')
      .eq('sku', skuId)
      .order('snapshot_date', { ascending: false }),

    // Pending POs: po_line_items + po_register where status is incoming
    supabase
      .from('po_line_items')
      .select(
        'units_ordered, units_received, po_register!inner(po_number, supplier, eta, status)'
      )
      .eq('sku', skuId)
      .in('po_register.status', INCOMING_PO_STATUSES),
  ])

  // SKU not found
  if (!skuResult.data) {
    return new Response(JSON.stringify({ error: `SKU '${skuId}' not found` }), {
      status: 404,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const skuRow = skuResult.data as Record<string, unknown>
  const demandRow = demandResult.data as Record<string, unknown> | null

  // -------------------------------------------------------------------------
  // Build per-node supply from latest snapshot
  // -------------------------------------------------------------------------
  type SnapshotRow = {
    node: string
    warehouse_name: string | null
    available: number
    inbound: number
    reserved: number
    snapshot_date: string
  }

  const snapshots = (snapshotResult.data ?? []) as SnapshotRow[]

  // Find most recent date per node
  const latestDateByNode: Record<string, string> = {}
  for (const row of snapshots) {
    if (
      !latestDateByNode[row.node] ||
      row.snapshot_date > latestDateByNode[row.node]
    ) {
      latestDateByNode[row.node] = row.snapshot_date
    }
  }

  // Aggregate per node (sum across warehouse names for locad_warehouse)
  type NodeAgg = { available: number; inbound: number; snapshot_date: string | null }
  const nodeAgg: Record<string, NodeAgg> = {
    amazon_fba: { available: 0, inbound: 0, snapshot_date: null },
    noon_fbn: { available: 0, inbound: 0, snapshot_date: null },
    locad_warehouse: { available: 0, inbound: 0, snapshot_date: null },
  }

  for (const row of snapshots) {
    if (row.snapshot_date !== latestDateByNode[row.node]) continue
    if (row.node in nodeAgg) {
      nodeAgg[row.node].available += row.available ?? 0
      nodeAgg[row.node].inbound += row.inbound ?? 0
      nodeAgg[row.node].snapshot_date = row.snapshot_date
    }
  }

  // Compute coverage days using blended_sv from demand_metrics
  const blended_sv = (demandRow?.blended_sv as number) ?? 0
  const coverageDays = (available: number): number => {
    if (blended_sv === 0) return Infinity
    return available / blended_sv
  }

  // -------------------------------------------------------------------------
  // Build incoming PO units + pending_pos list
  // -------------------------------------------------------------------------
  type POLineRow = {
    units_ordered: number
    units_received: number
    po_register: Record<string, unknown>
  }

  const poLines = (poResult.data ?? []) as POLineRow[]
  let incoming_po_units = 0
  const pending_pos: PendingPOItem[] = []

  for (const line of poLines) {
    const remaining = (line.units_ordered ?? 0) - (line.units_received ?? 0)
    if (remaining > 0) incoming_po_units += remaining

    const po = line.po_register
    const units_incoming = Math.max(0, remaining)
    pending_pos.push({
      po_number: po.po_number as string,
      supplier: po.supplier as string,
      eta: po.eta as string,
      status: po.status as string,
      units_ordered: line.units_ordered,
      units_received: line.units_received,
      units_remaining: units_incoming,
      units_incoming,
    })
  }

  const total_available =
    nodeAgg.amazon_fba.available +
    nodeAgg.noon_fbn.available +
    nodeAgg.locad_warehouse.available

  const total_coverage = blended_sv === 0 ? Infinity : total_available / blended_sv
  const projected_coverage =
    blended_sv === 0 ? Infinity : (total_available + incoming_po_units) / blended_sv

  // -------------------------------------------------------------------------
  // Build detail response
  // -------------------------------------------------------------------------
  const mkNode = (key: string): NodeDetail => ({
    available: nodeAgg[key].available,
    inbound: nodeAgg[key].inbound,
    coverage_days: coverageDays(nodeAgg[key].available),
    snapshot_date: nodeAgg[key].snapshot_date,
  })

  const nodes = {
    amazon_fba: mkNode('amazon_fba'),
    noon_fbn: mkNode('noon_fbn'),
    locad_warehouse: mkNode('locad_warehouse'),
  }

  const detail: SKUDetailResponse = {
    sku: skuRow.sku as string,
    name: skuRow.name as string,
    asin: skuRow.asin as string,
    fnsku: skuRow.fnsku as string | null,
    category: skuRow.category as SKUCategory,
    sub_category: skuRow.sub_category as string,
    units_per_box: skuRow.units_per_box as number,
    moq: skuRow.moq as number,
    lead_time_days: skuRow.lead_time_days as number,
    cogs: skuRow.cogs as number,
    dimensions: (skuRow.dimensions as string | null) ?? null,
    is_active: skuRow.is_active as boolean,

    demand: demandRow
      ? {
          sv_7: demandRow.sv_7 as number,
          sv_90: demandRow.sv_90 as number,
          blended_sv: demandRow.blended_sv as number,
          action_flag: demandRow.action_flag as ActionFlag | null,
          should_reorder: (demandRow.should_reorder as boolean) ?? false,
          suggested_reorder_units: (demandRow.suggested_reorder_units as number) ?? 0,
          updated_at: demandRow.updated_at as string | null,
        }
      : null,

    supply: {
      amazon_fba: nodes.amazon_fba,
      noon_fbn: nodes.noon_fbn,
      locad_warehouse: nodes.locad_warehouse,
      total_available,
      incoming_po_units,
    },
    total_coverage_days: total_coverage,
    projected_coverage_days: projected_coverage,
    action_flag: demandRow?.action_flag as string | null,
    pending_pos: pending_pos || [],
  }

  return new Response(JSON.stringify(detail), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

// ---------------------------------------------------------------------------
// POST /skus — create new SKU
// ---------------------------------------------------------------------------
async function handleCreate(req: Request): Promise<Response> {
  const supabase = getSupabaseAdmin()
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch (_) {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  if (!body.sku || !body.name) {
    return new Response(JSON.stringify({ error: 'SKU and Name are required' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const { error } = await supabase.from('sku_master').insert({
    sku: body.sku,
    name: body.name,
    asin: body.asin || null,
    fnsku: body.fnsku || null,
    category: body.category || 'C',
    product_category: body.product_category || null,
    sub_category: body.sub_category || null,
    units_per_box: body.units_per_box || 1,
    moq: body.moq || 0,
    lead_time_days: body.lead_time_days || 0,
    cogs: body.cogs || 0,
    dimensions: body.dimensions || null,
    is_active: body.is_active !== undefined ? body.is_active : true
  })

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  return new Response(JSON.stringify({ ok: true, message: 'SKU created' }), {
    status: 201,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

// ---------------------------------------------------------------------------
// PATCH /skus/:sku — update editable SKU master fields
// ---------------------------------------------------------------------------
async function handleUpdate(skuId: string, req: Request): Promise<Response> {
  const supabase = getSupabaseAdmin()

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch (_) {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Only allow updating specific fields
  const allowed = ['name', 'asin', 'fnsku', 'category', 'product_category', 'sub_category', 'moq', 'lead_time_days', 'cogs', 'units_per_box', 'dimensions', 'is_active']
  const update: Record<string, unknown> = {}
  for (const key of allowed) {
    if (key in body) {
      // Allow null to clear a field
      update[key] = body[key] === '' ? null : body[key]
    }
  }

  if (Object.keys(update).length === 0) {
    return new Response(JSON.stringify({ error: 'No valid fields to update' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const { error } = await supabase.from('sku_master').update(update).eq('sku', skuId)
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  return new Response(JSON.stringify({ ok: true, sku: skuId, updated: update }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

// ---------------------------------------------------------------------------
// POST /skus/classify — auto-classify all active SKUs by velocity
// Top 20% by blended_sv → A, next 30% → B, bottom 50% → C
// ---------------------------------------------------------------------------
async function handleAutoClassify(): Promise<Response> {
  const supabase = getSupabaseAdmin()

  // Fetch all active SKUs with their demand metrics
  const { data, error } = await supabase
    .from('sku_master')
    .select('sku, demand_metrics(blended_sv)')
    .eq('is_active', true)

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const skus = ((data ?? []) as Record<string, unknown>[]).map(r => {
    const dm = r.demand_metrics as Record<string, unknown>[] | null
    const sv = (Array.isArray(dm) && dm.length > 0 ? dm[0].blended_sv : 0) as number
    return { sku: r.sku as string, blended_sv: sv ?? 0 }
  })

  // Sort by velocity descending (nulls/zeros fall to C naturally)
  skus.sort((a, b) => b.blended_sv - a.blended_sv)

  const total = skus.length
  const aCount = Math.max(1, Math.round(total * 0.20))
  const bCount = Math.max(1, Math.round(total * 0.30))

  const assignments: { sku: string; category: string }[] = skus.map((s, i) => ({
    sku: s.sku,
    category: i < aCount ? 'A' : i < aCount + bCount ? 'B' : 'C',
  }))

  // Bulk update in parallel
  await Promise.all(
    assignments.map(a =>
      supabase.from('sku_master').update({ category: a.category }).eq('sku', a.sku)
    )
  )

  const counts = { A: 0, B: 0, C: 0 }
  for (const a of assignments) counts[a.category as 'A' | 'B' | 'C']++

  return new Response(JSON.stringify({ ok: true, total_classified: total, ...counts }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
