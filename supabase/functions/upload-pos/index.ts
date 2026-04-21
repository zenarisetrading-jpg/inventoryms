import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { corsHeaders } from '../_shared/cors.ts'
import { getSupabaseAdmin } from '../_shared/supabase.ts'
import { refreshAllMetrics } from '../_shared/velocity.ts'
import * as XLSX from 'https://esm.sh/xlsx@0.18.5'

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

interface ParsedRow {
  po_number: string
  supplier: string
  order_date: string
  eta: string
  status: string
  notes: string
  sku: string
  units_ordered: number
  units_received: number
}

interface POGroup {
  po_number: string
  supplier: string
  order_date: string
  eta: string
  status: string
  notes: string
  line_items: { sku: string; units_ordered: number; units_received: number }[]
}

const VALID_STATUSES = new Set(['draft', 'ordered', 'shipped', 'in_transit', 'arrived', 'closed'])

const HEADER_ALIASES: Record<string, string[]> = {
  po_number: ['po_number', 'po number', 'po#', 'po #', 'ponumber'],
  supplier: ['supplier', 'vendor'],
  order_date: ['order_date', 'order date', 'po date'],
  eta: ['eta', 'eta date', 'expected date', 'expected arrival'],
  status: ['status', 'po_status', 'po status'],
  notes: ['notes', 'remarks', 'comment', 'comments'],
  sku: ['sku', 'internal sku', 'item sku', 'seller sku'],
  units_ordered: ['units_ordered', 'units ordered', 'qty ordered', 'quantity ordered', 'ordered qty'],
  units_received: ['units_received', 'units received', 'qty received', 'quantity received', 'received qty'],
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
      // Escaped quote ("")
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

function normalizeDate(raw: unknown): string {
  if (raw === null || raw === undefined) return ''
  const s = String(raw).trim()
  if (!s) return ''
  // Already ISO date
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  // Explicit DD-MM-YYYY support (common in your PO files)
  const dmy = s.match(/^(\d{2})-(\d{2})-(\d{4})$/)
  if (dmy) {
    const dd = Number(dmy[1])
    const mm = Number(dmy[2])
    const yyyy = Number(dmy[3])
    if (dd >= 1 && dd <= 31 && mm >= 1 && mm <= 12) {
      const date = new Date(Date.UTC(yyyy, mm - 1, dd))
      return date.toISOString().slice(0, 10)
    }
  }
  // Excel serial numbers occasionally arrive as numeric strings in CSV/XLSX.
  if (/^\d+(\.\d+)?$/.test(s)) {
    const serial = Number(s)
    const parsed = XLSX.SSF.parse_date_code(serial)
    if (parsed) {
      const mm = String(parsed.m).padStart(2, '0')
      const dd = String(parsed.d).padStart(2, '0')
      return `${parsed.y}-${mm}-${dd}`
    }
  }
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return ''
  return d.toISOString().slice(0, 10)
}

function normalizeStatus(raw: unknown): string {
  const s = String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
  return VALID_STATUSES.has(s) ? s : 'draft'
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
    po_number: findColumnIndex(headerKeys, 'po_number'),
    supplier: findColumnIndex(headerKeys, 'supplier'),
    order_date: findColumnIndex(headerKeys, 'order_date'),
    eta: findColumnIndex(headerKeys, 'eta'),
    status: findColumnIndex(headerKeys, 'status'),
    notes: findColumnIndex(headerKeys, 'notes'),
    sku: findColumnIndex(headerKeys, 'sku'),
    units_ordered: findColumnIndex(headerKeys, 'units_ordered'),
    units_received: findColumnIndex(headerKeys, 'units_received'),
  }

  const required = ['po_number', 'supplier', 'order_date', 'eta', 'sku', 'units_ordered']
  for (const col of required) {
    if (idxMap[col as keyof typeof idxMap] === -1) {
      errors.push({ row: 0, message: `Missing required column: ${col}` })
    }
  }
  if (errors.length > 0) return { rows, errors }

  for (let i = 0; i < rawRows.length; i++) {
    const obj = rawRows[i]
    const get = (name: keyof typeof idxMap) => {
      const colIdx = idxMap[name]
      if (colIdx < 0) return ''
      const key = headerKeys[colIdx]
      return String(obj[key] ?? '').trim()
    }

    const po_number = get('po_number')
    const supplier = get('supplier')
    const order_date = normalizeDate(get('order_date'))
    const eta = normalizeDate(get('eta'))
    const sku = get('sku')
    const units_ordered_raw = get('units_ordered')
    const units_received_raw = get('units_received')
    const notes = get('notes')
    const status = normalizeStatus(get('status'))

    if (!po_number) { errors.push({ row: i + 2, message: `Row ${i + 2}: po_number is required` }); continue }
    if (!supplier) { errors.push({ row: i + 2, message: `Row ${i + 2}: supplier is required` }); continue }
    if (!order_date) { errors.push({ row: i + 2, message: `Row ${i + 2}: order_date is required` }); continue }
    if (!eta) { errors.push({ row: i + 2, message: `Row ${i + 2}: eta is required` }); continue }
    if (!sku) { errors.push({ row: i + 2, message: `Row ${i + 2}: sku is required` }); continue }

    const units_ordered = parseInt(units_ordered_raw, 10)
    if (isNaN(units_ordered) || units_ordered < 1) {
      errors.push({ row: i + 2, message: `Row ${i + 2}: units_ordered must be a positive integer (got "${units_ordered_raw}")` })
      continue
    }

    const units_received = parseInt(units_received_raw, 10)
    rows.push({ po_number, supplier, order_date, eta, status, notes, sku, units_ordered, units_received: isNaN(units_received) ? 0 : units_received })
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

function groupByPO(rows: ParsedRow[]): POGroup[] {
  const map = new Map<string, POGroup>()
  for (const row of rows) {
    if (!map.has(row.po_number)) {
      map.set(row.po_number, {
        po_number: row.po_number,
        supplier: row.supplier,
        order_date: row.order_date,
        eta: row.eta,
        status: row.status,
        notes: row.notes,
        line_items: [],
      })
    }
    map.get(row.po_number)!.line_items.push({
      sku: row.sku,
      units_ordered: row.units_ordered,
      units_received: row.units_received,
    })
  }
  // Collapse duplicate SKU rows within the same PO into one line item for idempotent imports.
  return Array.from(map.values()).map((g) => {
    const bySku = new Map<string, { sku: string; units_ordered: number; units_received: number }>()
    for (const li of g.line_items) {
      const key = normalizeSkuKey(li.sku)
      const existing = bySku.get(key)
      if (existing) {
        existing.units_ordered += li.units_ordered
        existing.units_received += li.units_received
      } else {
        bySku.set(key, { ...li })
      }
    }
    return { ...g, line_items: Array.from(bySku.values()) }
  })
}

function normalizeSkuKey(v: string): string {
  return String(v ?? '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '')
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405)

  try {
    const supabase = getSupabaseAdmin()

    const formData = await req.formData()
    const file = formData.get('file') as File | null
    if (!file) return jsonResponse({ error: 'No file uploaded' }, 400)

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
      return jsonResponse({ pos_created: 0, pos_skipped: 0, rows_processed: 0, errors: parseErrors, skipped_pos: [] })
    }

    const groups = groupByPO(rows)

    // Check which po_numbers already exist
    const allPONumbers = groups.map(g => g.po_number)
    const { data: existingPOs } = await supabase
      .from('po_register')
      .select('id, po_number')
      .in('po_number', allPONumbers)

    const existingMap = new Map<string, string>(
      ((existingPOs ?? []) as Record<string, string>[]).map((r) => [r.po_number, r.id])
    )
    const skippedPos: string[] = []
    const toCreate = groups.filter(g => !existingMap.has(g.po_number))
    const toMerge = groups.filter(g => existingMap.has(g.po_number))

    // Validate SKUs across all uploaded POs
    const allSkusRaw = [...new Set(groups.flatMap(g => g.line_items.map(li => li.sku)))]
    const { data: skuMasterRows } = await supabase.from('sku_master').select('sku')
    const canonicalByNorm = new Map<string, string>()
    for (const row of (skuMasterRows ?? []) as Record<string, string>[]) {
      const canonical = row.sku
      canonicalByNorm.set(normalizeSkuKey(canonical), canonical)
    }

    const unknownSkus = allSkusRaw.filter((s) => !canonicalByNorm.has(normalizeSkuKey(s)))

    const rowErrors = [...parseErrors]
    if (unknownSkus.length > 0) {
      rowErrors.push({ row: -1, message: `Unknown SKUs (not in sku_master): ${unknownSkus.join(', ')}` })
    }

    // Create new POs and merge into existing POs (record-keeping mode)
    const createdPOs: string[] = []
    const mergedPOs: string[] = []
    const failedPOs: { po_number: string; reason: string }[] = []

    // Preload existing line-item SKUs for merge targets.
    const existingIds = toMerge
      .map((g) => existingMap.get(g.po_number))
      .filter((id): id is string => Boolean(id))
    const existingLineSkuByPoId = new Map<string, Set<string>>()
    if (existingIds.length > 0) {
      const { data: existingLines } = await supabase
        .from('po_line_items')
        .select('po_id, sku')
        .in('po_id', existingIds)
      for (const row of (existingLines ?? []) as { po_id: string; sku: string }[]) {
        if (!existingLineSkuByPoId.has(row.po_id)) existingLineSkuByPoId.set(row.po_id, new Set())
        existingLineSkuByPoId.get(row.po_id)!.add(normalizeSkuKey(row.sku))
      }
    }

    for (const group of toCreate) {
      const validItems = group.line_items
        .map((li) => {
          const canonical = canonicalByNorm.get(normalizeSkuKey(li.sku))
          if (!canonical) return null
          return {
            sku: canonical,
            units_ordered: li.units_ordered,
            units_received: li.units_received,
          }
        })
        .filter((li): li is { sku: string; units_ordered: number; units_received: number } => li !== null)
      const invalidSkus = group.line_items
        .filter((li) => !canonicalByNorm.has(normalizeSkuKey(li.sku)))
        .map((li) => li.sku)

      if (validItems.length === 0) {
        failedPOs.push({ po_number: group.po_number, reason: `All SKUs unknown: ${invalidSkus.join(', ')}` })
        continue
      }

      // Insert PO header
      const { data: newPO, error: poErr } = await supabase
        .from('po_register')
        .insert({
          po_number: group.po_number,
          supplier: group.supplier,
          order_date: group.order_date,
          eta: group.eta,
          status: group.status,
          notes: group.notes || null,
        })
        .select('id')
        .single()

      if (poErr || !newPO) {
        failedPOs.push({ po_number: group.po_number, reason: poErr?.message ?? 'Insert failed' })
        continue
      }

      // Insert line items
      const { error: liErr } = await supabase.from('po_line_items').insert(
        validItems.map(li => ({
          po_id: newPO.id,
          sku: li.sku,
          units_ordered: li.units_ordered,
          units_received: li.units_received,
        }))
      )

      if (liErr) {
        // Roll back PO header
        await supabase.from('po_register').delete().eq('id', newPO.id)
        failedPOs.push({ po_number: group.po_number, reason: liErr.message })
        continue
      }

      if (invalidSkus.length > 0) {
        rowErrors.push({ row: -1, message: `PO ${group.po_number}: skipped unknown SKUs: ${invalidSkus.join(', ')}` })
      }

      createdPOs.push(group.po_number)
    }

    for (const group of toMerge) {
      const poId = existingMap.get(group.po_number)
      if (!poId) continue
      const existingSkuSet = existingLineSkuByPoId.get(poId) ?? new Set<string>()
      const mappedItems = group.line_items
        .map((li) => {
          const canonical = canonicalByNorm.get(normalizeSkuKey(li.sku))
          if (!canonical) return null
          return {
            sku: canonical,
            units_ordered: li.units_ordered,
            units_received: li.units_received,
          }
        })
        .filter((li): li is { sku: string; units_ordered: number; units_received: number } => li !== null)

      if (mappedItems.length === 0) {
        failedPOs.push({ po_number: group.po_number, reason: 'No valid SKUs to merge' })
        continue
      }

      const toInsert = mappedItems.filter((li) => !existingSkuSet.has(normalizeSkuKey(li.sku)))
      if (toInsert.length === 0) {
        skippedPos.push(group.po_number)
        continue
      }

      const { error: mergeErr } = await supabase.from('po_line_items').insert(
        toInsert.map((li) => ({
          po_id: poId,
          sku: li.sku,
          units_ordered: li.units_ordered,
          units_received: li.units_received,
        }))
      )
      if (mergeErr) {
        failedPOs.push({ po_number: group.po_number, reason: `Merge failed: ${mergeErr.message}` })
        continue
      }

      mergedPOs.push(group.po_number)
    }

    if (createdPOs.length > 0 || mergedPOs.length > 0) {
      try {
        await refreshAllMetrics(supabase)
      } catch (e) {
        console.error('upload-pos: refreshAllMetrics error', e)
      }
    }

    return jsonResponse({
      pos_created: createdPOs.length,
      pos_merged: mergedPOs.length,
      pos_skipped: skippedPos.length,
      pos_failed: failedPOs.length,
      rows_processed: rows.length,
      created_pos: createdPOs,
      merged_pos: mergedPOs,
      skipped_pos: skippedPos,
      failed_pos: failedPOs,
      errors: rowErrors,
    })
  } catch (err) {
    console.error('upload-pos: unhandled error', err)
    return jsonResponse({ error: 'Internal server error', detail: String(err) }, 500)
  }
})
