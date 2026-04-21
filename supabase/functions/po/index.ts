import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { corsHeaders } from '../_shared/cors.ts'
import { getSupabaseAdmin } from '../_shared/supabase.ts'
import { VALID_PO_TRANSITIONS } from '../_shared/types.ts'
import type { POStatus } from '../_shared/types.ts'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function errorResponse(error: string, status: number, details?: unknown): Response {
  return new Response(JSON.stringify({ error, ...(details !== undefined ? { details } : {}) }), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

// Extract UUID segment from path. Routes are:
//   /po          -> undefined
//   /po/:id      -> id
function extractId(url: URL): string | undefined {
  // pathname examples: "/po", "/po/", "/po/some-uuid"
  const parts = url.pathname.replace(/^\/po\/?/, '').split('/').filter(Boolean)
  return parts[0] ?? undefined
}

// ---------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------

// POST /po  — create PO (flattened into fact_purchase)
async function handleCreate(req: Request): Promise<Response> {
  let body: any
  try {
    body = await req.json()
  } catch {
    return errorResponse('Request body must be valid JSON', 400)
  }

  const { po_number, po_name, supplier, order_date, eta, tracking_number, notes, line_items } = body

  if (!po_number || !supplier || !order_date || !eta || !Array.isArray(line_items) || line_items.length === 0) {
    return errorResponse('Missing required fields or line_items', 400)
  }

  const supabase = getSupabaseAdmin()

  // Check po_number uniqueness (across all rows)
  const { data: existing, error: checkErr } = await supabase
    .from('fact_purchase')
    .select('id')
    .eq('po_number', po_number.trim())
    .limit(1)

  if (existing && existing.length > 0) {
    return errorResponse(`PO number "${po_number}" already exists`, 400)
  }

  // Insert multiple rows into fact_purchase
  const rows = line_items.map((li: any) => ({
    po_number: po_number.trim(),
    po_name: po_name ?? null,
    supplier: supplier.trim(),
    order_date,
    eta,
    status: 'ordered', // default for new PO
    tracking_number: tracking_number ?? null,
    notes: notes ?? null,
    sku: li.sku,
    units_ordered: li.units_ordered,
    units_received: li.units_received ?? 0,
    units_per_box: li.units_per_box ?? null,
    box_count: li.box_count ?? null,
    dimensions: li.dimensions ?? null,
    cogs_per_unit: li.cogs_per_unit ?? null,
    shipping_cost_per_unit: li.cogs_per_unit ?? null, // for now
  }))

  const { data: inserted, error: insertErr } = await supabase
    .from('fact_purchase')
    .insert(rows)
    .select()

  if (insertErr) {
    console.error('[po create] insert error:', insertErr)
    return errorResponse('Failed to create purchase records', 500, insertErr.message)
  }

  return jsonResponse({
    po_number,
    po_name,
    supplier,
    order_date,
    eta,
    status: 'ordered',
    line_items: inserted
  }, 201)
}

// GET /po  — list with grouping
async function handleList(url: URL): Promise<Response> {
  const supabase = getSupabaseAdmin()
  const statusParam = url.searchParams.get('status')
  const supplierParam = url.searchParams.get('supplier')

  let query = supabase.from('fact_purchase').select('*')
  if (statusParam) query = query.eq('status', statusParam)
  if (supplierParam) query = query.ilike('supplier', `%${supplierParam}%`)

  const { data, error } = await query.order('created_at', { ascending: false })

  if (error) return errorResponse('Failed to fetch purchases', 500, error.message)

  // Group by po_number
  const poMap = new Map<string, any>()
  for (const row of (data ?? [])) {
    if (!poMap.has(row.po_number)) {
      poMap.set(row.po_number, {
        id: row.id, // technically many IDs, but used for UI key
        po_number: row.po_number,
        po_name: row.po_name,
        supplier: row.supplier,
        order_date: row.order_date,
        eta: row.eta,
        status: row.status,
        tracking_number: row.tracking_number,
        notes: row.notes,
        created_at: row.created_at,
        line_items: []
      })
    }
    poMap.get(row.po_number).line_items.push({
      id: row.id,
      sku: row.sku,
      units_ordered: row.units_ordered,
      units_received: row.units_received,
      units_per_box: row.units_per_box,
      box_count: row.box_count,
      dimensions: row.dimensions,
      cogs_per_unit: row.cogs_per_unit,
      shipping_cost_per_unit: row.shipping_cost_per_unit
    })
  }

  const pos = Array.from(poMap.values()).map(po => ({
    ...po,
    sku_count: po.line_items.length
  }))

  return jsonResponse({ pos, count: pos.length })
}

// GET /po/:po_number - Detail (renamed from ID to accommodate flat table better if needed)
// Actually we'll keep the ID logic for compatibility but search by po_number
async function handleDetail(idOrPo: string): Promise<Response> {
  const supabase = getSupabaseAdmin()
  
  // First try by ID, then by PO number
  const { data } = await supabase
    .from('fact_purchase')
    .select('po_number')
    .eq('id', idOrPo)
    .maybeSingle()

  const po_number = data?.po_number ?? idOrPo

  const { data: rows, error } = await supabase
    .from('fact_purchase')
    .select('*')
    .eq('po_number', po_number)

  if (error) return errorResponse('Failed to fetch PO detail', 500, error.message)
  if (!rows || rows.length === 0) return errorResponse('PO not found', 404)

  const first = rows[0]
  const po = {
    id: first.id,
    po_number: first.po_number,
    po_name: first.po_name,
    supplier: first.supplier,
    order_date: first.order_date,
    eta: first.eta,
    status: first.status,
    tracking_number: first.tracking_number,
    notes: first.notes,
    created_at: first.created_at,
    line_items: rows.map(r => ({
      id: r.id,
      sku: r.sku,
      units_ordered: r.units_ordered,
      units_received: r.units_received,
      units_per_box: r.units_per_box,
      box_count: r.box_count,
      dimensions: r.dimensions,
      cogs_per_unit: r.cogs_per_unit,
      shipping_cost_per_unit: r.shipping_cost_per_unit
    }))
  }

  return jsonResponse(po)
}

// PATCH /po/:id - update status or fields
async function handleUpdate(id: string, req: Request): Promise<Response> {
  const body = await req.json()
  const supabase = getSupabaseAdmin()

  // Find the po_number first to update all rows for that PO
  const { data } = await supabase.from('fact_purchase').select('po_number').eq('id', id).maybeSingle()
  if (!data) return errorResponse('Record not found', 404)

  const { error } = await supabase
    .from('fact_purchase')
    .update({ ...body, updated_at: new Date().toISOString() })
    .eq('po_number', data.po_number)

  if (error) return errorResponse('Update failed', 500, error.message)

  return handleDetail(data.po_number)
}

// DELETE /po/:id - close
async function handleDelete(id: string): Promise<Response> {
  const supabase = getSupabaseAdmin()
  const { data } = await supabase.from('fact_purchase').select('po_number').eq('id', id).maybeSingle()
  if (!data) return errorResponse('Record not found', 404)

  const { error } = await supabase
    .from('fact_purchase')
    .update({ status: 'closed', updated_at: new Date().toISOString() })
    .eq('po_number', data.po_number)

  if (error) return errorResponse('Close failed', 500, error.message)
  return jsonResponse({ message: 'PO closed' })
}

// GET /po/suppliers - unique supplier names
async function handleSuppliers(): Promise<Response> {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase.rpc('get_unique_suppliers')
  
  if (error) {
    // If RPC doesn't exist, fallback to select (less efficient but works)
    const { data: raw, error: selectErr } = await supabase.from('fact_purchase').select('supplier')
    if (selectErr) return errorResponse('Failed to fetch suppliers', 500, selectErr.message)
    const unique = [...new Set((raw ?? []).map((r: any) => r.supplier))].filter(Boolean)
    return jsonResponse({ suppliers: unique })
  }
  
  return jsonResponse({ suppliers: data })
}

// ---------------------------------------------------------------------------
// Main router
// ---------------------------------------------------------------------------

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const url = new URL(req.url)
    const id = extractId(url)
    const method = req.method

    // Special routes
    if (url.pathname.endsWith('/suppliers')) {
      return await handleSuppliers()
    }

    if (id) {
      if (method === 'GET') return await handleDetail(id)
      if (method === 'PATCH') return await handleUpdate(id, req)
      if (method === 'DELETE') return await handleDelete(id)
    } else {
      if (method === 'GET') return await handleList(url)
      if (method === 'POST') return await handleCreate(req)
    }
    return errorResponse(`Method ${method} not allowed`, 405)
  } catch (err) {
    console.error('[po] error:', err)
    return errorResponse('Internal error', 500)
  }
})
