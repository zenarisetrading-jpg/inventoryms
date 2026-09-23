import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { corsHeaders } from '../_shared/cors.ts'
import { getSupabaseClient } from '../_shared/supabase.ts'
import * as XLSX from 'https://esm.sh/xlsx@0.18.5'

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

interface ParsedRow {
  sku: string
  asin: string
  fnsku: string
  name: string
  category: string
  product_category: string
  sub_category: string
  moq: number | null
  lead_time_days: number | null
  cogs: number | null
  shipping_cost: number | null
  landing_cost: number | null
  units_per_box: number | null
  dimensions: string | null
  weight_kg: number | null
  cbm: number | null
  is_active: boolean
  amazon_active: boolean
  noon_active: boolean
  minutes_active: boolean
  country: string
  saddl_id: string
}

const HEADER_ALIASES: Record<string, string[]> = {
  sku: ['sku', 'item sku', 'seller sku', 'internal sku'],
  asin: ['asin'],
  fnsku: ['fnsku'],
  name: ['name', 'product name', 'item name', 'title'],
  category: ['category', 'class'],
  product_category: ['product_category', 'product category', 'prod_category', 'prod category'],
  sub_category: ['sub_category', 'sub category', 'subcategory'],
  moq: ['moq', 'minimum order quantity'],
  lead_time_days: ['lead_time_days', 'lead time', 'lead time days'],
  cogs: ['cogs', 'cost of goods sold', 'cost'],
  shipping_cost: ['shipping_cost', 'shipping cost', 'shipping', 'freight_cost', 'freight'],
  landing_cost: ['landing_cost', 'landing cost', 'landed cost', 'landed_cost'],
  units_per_box: ['units_per_box', 'units per box', 'qty per box', 'upb'],
  dimensions: ['dimensions', 'dimension', 'size'],
  weight_kg: ['weight_kg', 'weight kg', 'weight', 'weightkg'],
  cbm: ['cbm', 'volume cbm'],
  is_active: ['is_active', 'active', 'status'],
  amazon_active: ['amazon_active', 'amazon active'],
  noon_active: ['noon_active', 'noon active'],
  minutes_active: ['minutes_active', 'minutes active'],
  saddl_id: ['saddl_id', 'saddl id', 'account_id', 'account id'],
  country: ['country', 'region'],
}

function normalizeHeader(v: string): string {
  return String(v ?? '')
    .trim()
    .toLowerCase()
    .replace(/^\ufeff/, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function findColumnIndex(header: string[], logicalCol: keyof typeof HEADER_ALIASES): number {
  const aliases = new Set(HEADER_ALIASES[logicalCol].map(normalizeHeader))
  return header.findIndex((h) => aliases.has(normalizeHeader(h)))
}

function parseCSVLine(line: string): string[] {
  const cols: string[] = []
  let cur = ''
  let inQuote = false

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuote && line[i + 1] === '"') {
        cur += '"'
        i++
        continue
      }
      inQuote = !inQuote
      continue
    }
    if (ch === ',' && !inQuote) {
      cols.push(cur.trim())
      cur = ''
      continue
    }
    cur += ch
  }
  cols.push(cur.trim())
  return cols
}

function parseRowsToParsedRows(rawRows: Record<string, unknown>[]): { rows: Record<string, any>[]; errors: { row: number; message: string }[] } {
  const errors: { row: number; message: string }[] = []
  const rows: Record<string, any>[] = []

  if (!rawRows || rawRows.length === 0) {
    errors.push({ row: 0, message: 'File must have a header row and at least one data row' })
    return { rows, errors }
  }

  const headerKeys = Object.keys(rawRows[0])
  const idxMap = {
    sku: findColumnIndex(headerKeys, 'sku'),
    asin: findColumnIndex(headerKeys, 'asin'),
    fnsku: findColumnIndex(headerKeys, 'fnsku'),
    name: findColumnIndex(headerKeys, 'name'),
    category: findColumnIndex(headerKeys, 'category'),
    product_category: findColumnIndex(headerKeys, 'product_category'),
    sub_category: findColumnIndex(headerKeys, 'sub_category'),
    moq: findColumnIndex(headerKeys, 'moq'),
    lead_time_days: findColumnIndex(headerKeys, 'lead_time_days'),
    cogs: findColumnIndex(headerKeys, 'cogs'),
    shipping_cost: findColumnIndex(headerKeys, 'shipping_cost'),
    landing_cost: findColumnIndex(headerKeys, 'landing_cost'),
    units_per_box: findColumnIndex(headerKeys, 'units_per_box'),
    dimensions: findColumnIndex(headerKeys, 'dimensions'),
    weight_kg: findColumnIndex(headerKeys, 'weight_kg'),
    cbm: findColumnIndex(headerKeys, 'cbm'),
    is_active: findColumnIndex(headerKeys, 'is_active'),
    amazon_active: findColumnIndex(headerKeys, 'amazon_active'),
    noon_active: findColumnIndex(headerKeys, 'noon_active'),
    minutes_active: findColumnIndex(headerKeys, 'minutes_active'),
    saddl_id: findColumnIndex(headerKeys, 'saddl_id'),
    country: findColumnIndex(headerKeys, 'country'),
  }

  if (idxMap.sku === -1) {
    errors.push({ row: 0, message: `Missing required column: sku` })
    return { rows, errors }
  }

  for (let i = 0; i < rawRows.length; i++) {
    const obj = rawRows[i]
    const get = (name: keyof typeof idxMap) => {
      const colIdx = idxMap[name]
      if (colIdx < 0) return undefined
      const key = headerKeys[colIdx]
      const val = obj[key]
      return val !== undefined && val !== null ? String(val).trim() : ''
    }

    const sku = get('sku')
    if (!sku) {
      errors.push({ row: i + 2, message: `Row ${i + 2}: sku is required` })
      continue
    }

    const row: Record<string, any> = { sku }

    if (idxMap.asin !== -1) row.asin = get('asin') || null
    if (idxMap.fnsku !== -1) row.fnsku = get('fnsku') || null
    if (idxMap.name !== -1) row.name = get('name') || null
    if (idxMap.category !== -1) {
      const cat = (get('category') || '').toUpperCase()
      row.category = ['A', 'B', 'C'].includes(cat) ? cat : 'C'
    }
    if (idxMap.product_category !== -1) row.product_category = get('product_category') || null
    if (idxMap.sub_category !== -1) row.sub_category = get('sub_category') || null

    if (idxMap.moq !== -1) {
      const val = parseInt(get('moq') || '', 10)
      row.moq = isNaN(val) ? null : val
    }
    if (idxMap.lead_time_days !== -1) {
      const val = parseInt(get('lead_time_days') || '', 10)
      row.lead_time_days = isNaN(val) ? null : val
    }
    if (idxMap.cogs !== -1) {
      const val = parseFloat(get('cogs') || '')
      row.cogs = isNaN(val) ? null : val
    }
    if (idxMap.shipping_cost !== -1) {
      const val = parseFloat(get('shipping_cost') || '')
      row.shipping_cost = isNaN(val) ? null : val
    }
    if (idxMap.landing_cost !== -1) {
      const val = parseFloat(get('landing_cost') || '')
      row.landing_cost = isNaN(val) ? null : val
    }
    if (idxMap.units_per_box !== -1) {
      const val = parseInt(get('units_per_box') || '', 10)
      row.units_per_box = isNaN(val) ? 1 : val
    }
    if (idxMap.dimensions !== -1) row.dimensions = get('dimensions') || null
    if (idxMap.weight_kg !== -1) {
      const val = parseFloat(get('weight_kg') || '')
      row.weight_kg = isNaN(val) ? null : val
    }
    if (idxMap.cbm !== -1) {
      const val = parseFloat(get('cbm') || '')
      row.cbm = isNaN(val) ? null : val
    }
    if (idxMap.is_active !== -1) {
      const raw = (get('is_active') || '').toLowerCase()
      row.is_active = !(raw === 'false' || raw === '0' || raw === 'no')
    }
    if (idxMap.amazon_active !== -1) {
      const raw = (get('amazon_active') || '').toLowerCase()
      row.amazon_active = !(raw === 'false' || raw === '0' || raw === 'no')
    }
    if (idxMap.noon_active !== -1) {
      const raw = (get('noon_active') || '').toLowerCase()
      row.noon_active = !(raw === 'false' || raw === '0' || raw === 'no')
    }
    if (idxMap.minutes_active !== -1) {
      const raw = (get('minutes_active') || '').toLowerCase()
      row.minutes_active = !(raw === 'false' || raw === '0' || raw === 'no')
    }
    if (idxMap.country !== -1) {
      row.country = get('country') || 'UAE'
    }
    if (idxMap.saddl_id !== -1) {
      row.saddl_id = get('saddl_id') || null
    }

    rows.push(row)
  }

  return { rows, errors }
}

function parseCSV(text: string): { rows: Record<string, any>[]; errors: { row: number; message: string }[] } {
  const lines = text.replace(/^\ufeff/, '').split(/\r?\n/).filter((l) => l.trim().length > 0)
  if (lines.length < 2) {
    return { rows: [], errors: [{ row: 0, message: 'CSV must have a header row and at least one data row' }] }
  }
  const header = parseCSVLine(lines[0])
  const rawRows: Record<string, unknown>[] = lines.slice(1).map((line) => {
    const cols = parseCSVLine(line)
    const row: Record<string, unknown> = {}
    for (let i = 0; i < header.length; i++) row[header[i]] = cols[i] ?? ''
    return row
  })
  return parseRowsToParsedRows(rawRows)
}

function parseXLSX(buffer: ArrayBuffer): { rows: Record<string, any>[]; errors: { row: number; message: string }[] } {
  const workbook = XLSX.read(new Uint8Array(buffer), { type: 'array' })
  const firstSheetName = workbook.SheetNames[0]
  if (!firstSheetName) return { rows: [], errors: [{ row: 0, message: 'XLSX has no sheets' }] }
  const sheet = workbook.Sheets[firstSheetName]
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '', raw: true })
  return parseRowsToParsedRows(rawRows)
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405)

  try {
    const supabase = getSupabaseClient(req)

    const formData = await req.formData()
    const file = formData.get('file') as File | null
    if (!file) return jsonResponse({ error: 'No file uploaded' }, 400)
    
    // Default country and saddl_id from request, if not specified in file
    const defaultCountry = formData.get('country') as string || 'UAE'
    const defaultSaddlId = formData.get('saddl_id') as string | null

    const fileName = file.name?.toLowerCase() ?? ''
    const isXlsx = fileName.endsWith('.xlsx') || fileName.endsWith('.xls') || file.type.includes('spreadsheet')

    let parsed: { rows: Record<string, any>[]; errors: { row: number; message: string }[] }
    if (isXlsx) {
      const buffer = await file.arrayBuffer()
      parsed = parseXLSX(buffer)
    } else {
      const text = await file.text()
      parsed = parseCSV(text)
    }
    const { rows, errors: parseErrors } = parsed

    if (parseErrors.length > 0 && rows.length === 0) {
      return jsonResponse({ error: parseErrors[0].message, errors: parseErrors }, 400)
    }

    if (rows.length === 0) {
      return jsonResponse({ rows_processed: 0, errors: parseErrors })
    }

    // Fetch existing SKUs to merge partial uploads and preserve non-null columns (like name, category)
    const uniqueSkus = Array.from(new Set(rows.map(r => r.sku)))
    const { data: existingRecords } = await supabase
      .from('sku_master')
      .select('*')
      .in('sku', uniqueSkus)

    const existingMap = new Map<string, Record<string, any>>()
    if (existingRecords) {
      for (const rec of existingRecords) {
        const key = `${rec.sku}__${rec.country || 'UAE'}`
        existingMap.set(key, rec)
      }
    }

    // Build final upsert payload by merging with existing rows or supplying safe defaults
    const dbRows = rows.map(r => {
      const country = r.country || defaultCountry
      const key = `${r.sku}__${country}`
      const existing = existingMap.get(key)

      const merged: Record<string, any> = existing ? { ...existing, ...r } : {
        sku: r.sku,
        name: r.name || r.sku,
        asin: r.asin || null,
        fnsku: r.fnsku || null,
        category: r.category || 'C',
        product_category: r.product_category || null,
        sub_category: r.sub_category || null,
        units_per_box: r.units_per_box ?? 1,
        moq: r.moq ?? null,
        lead_time_days: r.lead_time_days ?? null,
        cogs: r.cogs ?? null,
        shipping_cost: r.shipping_cost ?? 0,
        is_active: r.is_active ?? true,
        amazon_active: r.amazon_active ?? true,
        noon_active: r.noon_active ?? true,
        minutes_active: r.minutes_active ?? true,
        ...r,
      }

      // If landing_cost was provided in the upload, adjust shipping_cost so that (cogs + shipping_cost = landing_cost)
      if (r.landing_cost !== undefined && r.landing_cost !== null) {
        const landingVal = Number(r.landing_cost)
        const cogsVal = (r.cogs !== undefined && r.cogs !== null)
          ? Number(r.cogs)
          : (merged.cogs ? Number(merged.cogs) : 0)

        merged.shipping_cost = Math.max(0, Number((landingVal - cogsVal).toFixed(2)))
      }

      merged.country = country
      if (!merged.saddl_id && defaultSaddlId) merged.saddl_id = defaultSaddlId
      if (!merged.name) merged.name = merged.sku

      // Clean up fields that cannot or should not be written directly into sku_master
      delete merged.id
      delete merged.created_at
      delete merged.landing_cost // Generated column in Postgres

      return merged
    })

    // Upsert the SKUs
    // Note: The conflict target is (sku, country) per migration 053
    const { error: upsertError } = await supabase
      .from('sku_master')
      .upsert(dbRows, { onConflict: 'sku, country', ignoreDuplicates: false })

    if (upsertError) {
      return jsonResponse({ error: `Upsert failed: ${upsertError.message}` }, 500)
    }

    // Auto-refresh the inventory fact table so new SKUs appear instantly on the Inventory page
    const { error: refreshError } = await supabase.rpc('refresh_fact_inventory_planning')
    if (refreshError) {
      console.warn('upload-sku-master: failed to auto-refresh fact_inventory_planning', refreshError)
    }

    return jsonResponse({
      rows_processed: rows.length,
      errors: parseErrors,
    })
  } catch (err) {
    console.error('upload-sku-master: unhandled error', err)
    return jsonResponse({ error: 'Internal server error', detail: String(err) }, 500)
  }
})
