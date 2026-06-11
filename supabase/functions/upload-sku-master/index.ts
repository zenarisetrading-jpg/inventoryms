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
  name: string
  asin: string
  fnsku: string
  category: string
  sub_category: string
  moq: number | null
  lead_time_days: number | null
  cogs: number | null
  units_per_box: number | null
  dimensions: string | null
  weight_kg: number | null
  cbm: number | null
  is_active: boolean
  amazon_active: boolean
  noon_active: boolean
  country: string
  saddl_id: string
}

const HEADER_ALIASES: Record<string, string[]> = {
  sku: ['sku', 'item sku', 'seller sku', 'internal sku'],
  name: ['name', 'product name', 'item name', 'title'],
  asin: ['asin'],
  fnsku: ['fnsku'],
  category: ['category', 'class'],
  sub_category: ['sub_category', 'sub category', 'subcategory'],
  moq: ['moq', 'minimum order quantity'],
  lead_time_days: ['lead_time_days', 'lead time', 'lead time days'],
  cogs: ['cogs', 'cost of goods sold', 'cost'],
  units_per_box: ['units_per_box', 'units per box', 'qty per box', 'upb'],
  dimensions: ['dimensions', 'dimension', 'size'],
  weight_kg: ['weight_kg', 'weight kg', 'weight', 'weightkg'],
  cbm: ['cbm', 'volume cbm'],
  is_active: ['is_active', 'active', 'status'],
  amazon_active: ['amazon_active', 'amazon active'],
  noon_active: ['noon_active', 'noon active'],
  country: ['country', 'region'],
  saddl_id: ['saddl_id', 'saddl id'],
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

function parseRowsToParsedRows(rawRows: Record<string, unknown>[]): { rows: ParsedRow[]; errors: { row: number; message: string }[] } {
  const errors: { row: number; message: string }[] = []
  const rows: ParsedRow[] = []

  if (!rawRows || rawRows.length === 0) {
    errors.push({ row: 0, message: 'File must have a header row and at least one data row' })
    return { rows, errors }
  }

  const headerKeys = Object.keys(rawRows[0])
  const idxMap = {
    sku: findColumnIndex(headerKeys, 'sku'),
    name: findColumnIndex(headerKeys, 'name'),
    asin: findColumnIndex(headerKeys, 'asin'),
    fnsku: findColumnIndex(headerKeys, 'fnsku'),
    category: findColumnIndex(headerKeys, 'category'),
    sub_category: findColumnIndex(headerKeys, 'sub_category'),
    moq: findColumnIndex(headerKeys, 'moq'),
    lead_time_days: findColumnIndex(headerKeys, 'lead_time_days'),
    cogs: findColumnIndex(headerKeys, 'cogs'),
    units_per_box: findColumnIndex(headerKeys, 'units_per_box'),
    dimensions: findColumnIndex(headerKeys, 'dimensions'),
    weight_kg: findColumnIndex(headerKeys, 'weight_kg'),
    cbm: findColumnIndex(headerKeys, 'cbm'),
    is_active: findColumnIndex(headerKeys, 'is_active'),
    amazon_active: findColumnIndex(headerKeys, 'amazon_active'),
    noon_active: findColumnIndex(headerKeys, 'noon_active'),
    country: findColumnIndex(headerKeys, 'country'),
    saddl_id: findColumnIndex(headerKeys, 'saddl_id'),
  }

  if (idxMap.sku === -1) {
    errors.push({ row: 0, message: `Missing required column: sku` })
    return { rows, errors }
  }

  for (let i = 0; i < rawRows.length; i++) {
    const obj = rawRows[i]
    const get = (name: keyof typeof idxMap) => {
      const colIdx = idxMap[name]
      if (colIdx < 0) return ''
      const key = headerKeys[colIdx]
      return String(obj[key] ?? '').trim()
    }

    const sku = get('sku')
    if (!sku) {
      errors.push({ row: i + 2, message: `Row ${i + 2}: sku is required` })
      continue
    }

    const name = get('name')
    const asin = get('asin')
    const fnsku = get('fnsku')
    const categoryRaw = get('category').toUpperCase()
    const category = ['A', 'B', 'C'].includes(categoryRaw) ? categoryRaw : 'C'
    const sub_category = get('sub_category')
    
    const moqRaw = parseInt(get('moq'), 10)
    const moq = isNaN(moqRaw) ? null : moqRaw

    const leadTimeRaw = parseInt(get('lead_time_days'), 10)
    const lead_time_days = isNaN(leadTimeRaw) ? null : leadTimeRaw

    const cogsRaw = parseFloat(get('cogs'))
    const cogs = isNaN(cogsRaw) ? null : cogsRaw

    const upbRaw = parseInt(get('units_per_box'), 10)
    const units_per_box = isNaN(upbRaw) ? 1 : upbRaw

    const dimensions = get('dimensions') || null
    const weightRaw = parseFloat(get('weight_kg'))
    const weight_kg = isNaN(weightRaw) ? null : weightRaw
    const cbmRaw = parseFloat(get('cbm'))
    const cbm = isNaN(cbmRaw) ? null : cbmRaw

    const isActiveRaw = get('is_active').toLowerCase()
    const is_active = isActiveRaw === 'false' || isActiveRaw === '0' || isActiveRaw === 'no' ? false : true

    const isAmazonActiveRaw = get('amazon_active').toLowerCase()
    const amazon_active = isAmazonActiveRaw === 'false' || isAmazonActiveRaw === '0' || isAmazonActiveRaw === 'no' ? false : true

    const isNoonActiveRaw = get('noon_active').toLowerCase()
    const noon_active = isNoonActiveRaw === 'false' || isNoonActiveRaw === '0' || isNoonActiveRaw === 'no' ? false : true

    const country = get('country') || 'UAE'
    const saddl_id = get('saddl_id')

    rows.push({
      sku, name, asin, fnsku, category, sub_category, moq, lead_time_days, cogs, units_per_box, 
      dimensions, weight_kg, cbm, is_active, amazon_active, noon_active, country, saddl_id
    })
  }

  return { rows, errors }
}

function parseCSV(text: string): { rows: ParsedRow[]; errors: { row: number; message: string }[] } {
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

function parseXLSX(buffer: ArrayBuffer): { rows: ParsedRow[]; errors: { row: number; message: string }[] } {
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
    
    // Default country from request, if not specified in file
    const defaultCountry = formData.get('country') as string || 'UAE'

    const fileName = file.name?.toLowerCase() ?? ''
    const isXlsx = fileName.endsWith('.xlsx') || fileName.endsWith('.xls') || file.type.includes('spreadsheet')

    let parsed: { rows: ParsedRow[]; errors: { row: number; message: string }[] }
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

    // Map to db format
    const dbRows = rows.map(r => ({
      sku: r.sku,
      name: r.name || null,
      asin: r.asin || null,
      fnsku: r.fnsku || null,
      category: r.category,
      sub_category: r.sub_category || null,
      moq: r.moq,
      lead_time_days: r.lead_time_days,
      cogs: r.cogs,
      units_per_box: r.units_per_box,
      dimensions: r.dimensions,
      weight_kg: r.weight_kg,
      cbm: r.cbm,
      is_active: r.is_active,
      amazon_active: r.amazon_active,
      noon_active: r.noon_active,
      country: r.country || defaultCountry,
      saddl_id: r.saddl_id || null,
    }))

    // Upsert the SKUs
    // Note: The conflict target is (sku, country) per the migration 053
    const { error: upsertError } = await supabase
      .from('sku_master')
      .upsert(dbRows, { onConflict: 'sku, country', ignoreDuplicates: false })

    if (upsertError) {
      return jsonResponse({ error: `Upsert failed: ${upsertError.message}` }, 500)
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
