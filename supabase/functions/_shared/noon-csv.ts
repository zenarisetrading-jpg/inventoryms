/**
 * _shared/noon-csv.ts
 *
 * Parse Noon order-level CSV exports (one row per order unit, NOT pre-aggregated).
 *
 * Confirmed columns:
 *   id_partner, country_code, dest_country, item_nr, partner_sku, sku,
 *   status, offer_price, gmv_lcy, currency_code, brand_code, family,
 *   fulfillment_model, order_timestamp, shipment_timestamp, delivered_timestamp
 *
 * Key field: partner_sku  (NOT "sku" which is Noon's internal ID)
 *
 * Logic:
 *   1. Filter: status IN ('Processing', 'Shipped', 'Delivered')
 *   2. Convert currency to AED: QAR×1.02, KWD×12.25, OMR×9.71, BHD×9.93, AED stays
 *   3. Map fulfillment_model → channel: contains 'MINUTES' → 'noon_minutes', else → 'noon'
 *   4. Group by partner_sku + DATE(order_timestamp) + channel → count rows → units_sold
 *   5. Compute avg(offer_price_aed) per SKU across all orders
 *   6. Handle BOM chars, whitespace, case-insensitive headers
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface NoonOrderRow {
  id_partner: string
  src_country: string
  country_code: string
  dest_country: string
  bayan_nr: string
  item_nr: string
  partner_sku: string
  sku: string
  status: string
  offer_price: number
  gmv_lcy: number
  currency_code: string
  brand_code: string
  family: string
  fulfillment_model: string
  order_timestamp: string
  shipment_timestamp: string
  delivered_timestamp: string
}

export interface MinutesOrderRow {
  country_code: string
  order_nr: string
  item_nr: string
  order_date: string
  sku: string
  title_en: string
  title_ar: string
  brand_en: string
  brand_ar: string
  currency_code: string
  price: number
  partner_sku: string
  item_status: string
  return_date: string
}

export interface ParsedNoonData {
  sales: { sku: string; date: string; channel: 'noon' | 'noon_minutes'; units_sold: number }[]
  avg_prices: { sku: string; avg_sell_price_aed: number }[]
  raw_rows: NoonOrderRow[]
  errors: { row: number; message: string }[]
}

export interface ParsedMinutesData {
  sales: { sku: string; date: string; channel: 'noon_minutes'; units_sold: number }[]
  avg_prices: { sku: string; avg_sell_price_aed: number }[]
  raw_rows: MinutesOrderRow[]
  errors: { row: number; message: string }[]
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CONFIRMED_STATUSES = new Set(['processing', 'shipped', 'delivered'])

const CURRENCY_TO_AED: Record<string, number> = {
  QAR: 1.02,
  KWD: 12.25,
  OMR: 9.71,
  BHD: 9.93,
  AED: 1.0,
  USD: 3.67,
  SAR: 0.98,
  EGP: 0.073,
}

// ---------------------------------------------------------------------------
// parseNoonOrderCSV
// ---------------------------------------------------------------------------

export function parseNoonOrderCSV(csvText: string): ParsedNoonData {
  const errors: { row: number; message: string }[] = []

  // Strip UTF-8 BOM if present
  const cleaned = csvText.replace(/^\uFEFF/, '').trim()
  if (!cleaned) {
    return { sales: [], avg_prices: [], raw_rows: [], errors: [{ row: 0, message: 'Empty CSV file' }] }
  }

  const lines = cleaned.split(/\r?\n/)
  if (lines.length < 2) {
    return { sales: [], avg_prices: [], raw_rows: [], errors: [{ row: 0, message: 'CSV has no data rows' }] }
  }

  // Parse header (case-insensitive, strip whitespace)
  const rawHeader = lines[0]
  const headers = parseCSVRow(rawHeader).map((h) => h.trim().toLowerCase().replace(/\s+/g, '_'))
  const colIndex = buildColumnIndex(headers)

  // Validate required columns
  const required = ['partner_sku', 'status', 'offer_price', 'currency_code', 'order_timestamp']
  for (const col of required) {
    if (colIndex[col] === undefined) {
      // Try alternative names
      if (col === 'partner_sku' && colIndex['seller_sku'] !== undefined) {
        colIndex['partner_sku'] = colIndex['seller_sku']
      } else if (col === 'status' && colIndex['item_status'] !== undefined) {
        colIndex['status'] = colIndex['item_status']
      } else if (col === 'offer_price' && colIndex['price'] !== undefined) {
        colIndex['offer_price'] = colIndex['price']
      } else if (col === 'order_timestamp' && colIndex['order_date'] !== undefined) {
        colIndex['order_timestamp'] = colIndex['order_date']
      } else if (col === 'order_timestamp' && colIndex['order_timestamp'] === undefined) {
        // Already covered by first check, but for clarity
      } else {
        errors.push({ row: 0, message: `Missing required column: "${col}"` })
      }
    }
  }

  if (errors.length > 0) {
    return { sales: [], avg_prices: [], raw_rows: [], errors }
  }

  // Accumulators
  const raw_rows: NoonOrderRow[] = []
  // Key: `${partner_sku}|${date}|${channel}`
  const salesMap = new Map<string, { units: number; channel: 'noon' | 'noon_minutes' }>()
  // Key: partner_sku — accumulate [sum_aed, count]
  const priceMap = new Map<string, [number, number]>()

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue

    const rowNum = i + 1 // 1-indexed for error reporting
    const cols = parseCSVRow(line)

    try {
      const rawRow = extractRow(cols, colIndex)

      // Status filter
      const status = rawRow.status.trim().toLowerCase()
      if (!CONFIRMED_STATUSES.has(status)) continue

      raw_rows.push(rawRow)

      // partner_sku — trim aggressively and remove all internal spaces
      const partner_sku = rawRow.partner_sku.replace(/\s+/g, '')
      if (!partner_sku) {
        errors.push({ row: rowNum, message: 'Empty partner_sku — row skipped' })
        continue
      }

      // Date from order_timestamp
      const date = rawRow.order_timestamp.trim().slice(0, 10)
      if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        errors.push({ row: rowNum, message: `Invalid order_timestamp: "${rawRow.order_timestamp}"` })
        continue
      }

      // Price in AED
      const rawPrice = parseFloat(String(rawRow.offer_price).replace(/,/g, ''))
      const currency = rawRow.currency_code.trim().toUpperCase()
      const rate = CURRENCY_TO_AED[currency] ?? 1.0
      if (!(currency in CURRENCY_TO_AED)) {
        errors.push({ row: rowNum, message: `Unknown currency "${currency}" — treating as 1:1 AED` })
      }
      const priceAed = isNaN(rawPrice) ? 0 : rawPrice * rate

      // Map fulfillment_model to channel
      const fulfillmentModel = rawRow.fulfillment_model.trim().toUpperCase()
      const channel: 'noon' | 'noon_minutes' = fulfillmentModel.includes('MINUTES') ? 'noon_minutes' : 'noon'

      // Accumulate sales count
      const salesKey = `${partner_sku}|${date}|${channel}`
      const existing_sale = salesMap.get(salesKey)
      if (existing_sale) {
        existing_sale.units += 1
      } else {
        salesMap.set(salesKey, { units: 1, channel })
      }

      // Accumulate price
      const existing = priceMap.get(partner_sku)
      if (existing) {
        existing[0] += priceAed
        existing[1] += 1
      } else {
        priceMap.set(partner_sku, [priceAed, 1])
      }
    } catch (err) {
      errors.push({ row: rowNum, message: `Parse error: ${(err as Error).message}` })
    }
  }

  // Build sales output
  const sales: { sku: string; date: string; channel: 'noon' | 'noon_minutes'; units_sold: number }[] = []
  for (const [key, { units, channel }] of salesMap.entries()) {
    const [sku, date] = key.split('|')
    sales.push({ sku, date, channel, units_sold: units })
  }
  // Sort by SKU then date for deterministic output
  sales.sort((a, b) => a.sku.localeCompare(b.sku) || a.date.localeCompare(b.date))

  // Build avg_prices output
  const avg_prices: { sku: string; avg_sell_price_aed: number }[] = []
  for (const [sku, [sumAed, count]] of priceMap.entries()) {
    avg_prices.push({
      sku,
      avg_sell_price_aed: count > 0 ? Math.round((sumAed / count) * 100) / 100 : 0,
    })
  }
  avg_prices.sort((a, b) => a.sku.localeCompare(b.sku))

  return { sales, avg_prices, raw_rows, errors }
}

// ---------------------------------------------------------------------------
// parseMinutesOrderCSV
// ---------------------------------------------------------------------------

export function parseMinutesOrderCSV(csvText: string): ParsedMinutesData {
  const errors: { row: number; message: string }[] = []
  const cleaned = csvText.replace(/^\uFEFF/, '').trim()
  if (!cleaned) {
    return { sales: [], avg_prices: [], raw_rows: [], errors: [{ row: 0, message: 'Empty CSV file' }] }
  }

  const lines = cleaned.split(/\r?\n/)
  if (lines.length < 2) {
    return { sales: [], avg_prices: [], raw_rows: [], errors: [{ row: 0, message: 'CSV has no data rows' }] }
  }

  const headers = parseCSVRow(lines[0]).map((h) => h.trim().toLowerCase().replace(/\s+/g, '_'))
  const colIndex = buildColumnIndex(headers)

  // Required for sales_snapshot
  const required = ['partner_sku', 'item_status', 'price', 'currency_code', 'order_date']
  for (const col of required) {
    if (colIndex[col] === undefined) {
      // Alternatives
      if (col === 'partner_sku' && colIndex['sku'] !== undefined) colIndex['partner_sku'] = colIndex['sku']
      else if (col === 'item_status' && colIndex['status'] !== undefined) colIndex['item_status'] = colIndex['status']
      else errors.push({ row: 0, message: `Missing required column: "${col}"` })
    }
  }

  if (errors.length > 0) return { sales: [], avg_prices: [], raw_rows: [], errors }

  const raw_rows: MinutesOrderRow[] = []
  const salesMap = new Map<string, number>()
  const priceMap = new Map<string, [number, number]>()
  const CHANNEL: 'noon_minutes' = 'noon_minutes'

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue
    const rowNum = i + 1
    const cols = parseCSVRow(line)

    try {
      const get = (key: string): string => {
        const idx = colIndex[key]
        return idx !== undefined ? (cols[idx] ?? '').trim() : ''
      }

      const rawRow: MinutesOrderRow = {
        country_code: get('country_code'),
        order_nr: get('order_nr'),
        item_nr: get('item_nr'),
        order_date: get('order_date'),
        sku: get('sku'),
        title_en: get('title_en'),
        title_ar: get('title_ar'),
        brand_en: get('brand_en'),
        brand_ar: get('brand_ar'),
        currency_code: get('currency_code'),
        price: parseFloat(get('price').replace(/,/g, '')) || 0,
        partner_sku: get('partner_sku'),
        item_status: get('item_status'),
        return_date: get('return_date'),
      }
      raw_rows.push(rawRow)

      // Status filter
      const status = rawRow.item_status.toLowerCase()
      if (!CONFIRMED_STATUSES.has(status)) continue

      const partner_sku = rawRow.partner_sku.replace(/\s+/g, '')
      if (!partner_sku) continue

      // Date format check (YYYY-MM-DD)
      let date = rawRow.order_date.trim().slice(0, 10)
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        // Try to handle M/D/YYYY
        const parts = date.split('/')
        if (parts.length === 3) {
          const m = parts[0].padStart(2, '0')
          const d = parts[1].padStart(2, '0')
          const y = parts[2]
          date = `${y}-${m}-${d}`
        }
      }

      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue

      // Currency
      const currency = rawRow.currency_code.trim().toUpperCase()
      const rate = CURRENCY_TO_AED[currency] ?? 1.0
      const priceAed = rawRow.price * rate

      // Accumulate
      const salesKey = `${partner_sku}|${date}`
      salesMap.set(salesKey, (salesMap.get(salesKey) || 0) + 1)

      const p = priceMap.get(partner_sku) || [0, 0]
      p[0] += priceAed
      p[1] += 1
      priceMap.set(partner_sku, p)

    } catch (err) {
      errors.push({ row: rowNum, message: String(err) })
    }
  }

  const sales = Array.from(salesMap.entries()).map(([key, units]) => {
    const [sku, date] = key.split('|')
    return { sku, date, channel: CHANNEL, units_sold: units }
  })

  const avg_prices = Array.from(priceMap.entries()).map(([sku, [sum, count]]) => ({
    sku,
    avg_sell_price_aed: count > 0 ? Math.round((sum / count) * 100) / 100 : 0,
  }))

  return { sales, avg_prices, raw_rows, errors }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build column name → index map from header array */
function buildColumnIndex(headers: string[]): Record<string, number> {
  const idx: Record<string, number> = {}
  for (let i = 0; i < headers.length; i++) {
    idx[headers[i]] = i
  }
  return idx
}

/** Extract typed row values using the column index */
function extractRow(
  cols: string[],
  idx: Record<string, number>
): NoonOrderRow {
  const get = (key: string): string => {
    const i = idx[key]
    return i !== undefined ? (cols[i] ?? '').trim() : ''
  }
  return {
    id_partner: get('id_partner'),
    src_country: get('src_country'),
    country_code: get('country_code'),
    dest_country: get('dest_country'),
    bayan_nr: get('bayan_nr'),
    item_nr: get('item_nr'),
    partner_sku: get('partner_sku'),
    sku: get('sku'),
    status: get('status'),
    offer_price: parseFloat(get('offer_price').replace(/,/g, '')) || 0,
    gmv_lcy: parseFloat(get('gmv_lcy').replace(/,/g, '')) || 0,
    currency_code: get('currency_code'),
    brand_code: get('brand_code'),
    family: get('family'),
    fulfillment_model: get('fulfillment_model'),
    order_timestamp: get('order_timestamp'),
    shipment_timestamp: get('shipment_timestamp'),
    delivered_timestamp: get('delivered_timestamp'),
  }
}

/**
 * Minimal RFC-4180 CSV row parser.
 * Handles quoted fields (including fields with commas and escaped double-quotes).
 */
function parseCSVRow(line: string): string[] {
  const result: string[] = []
  let field = ''
  let inQuotes = false
  let i = 0

  while (i < line.length) {
    const ch = line[i]

    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        // Escaped double-quote
        field += '"'
        i += 2
        continue
      } else if (ch === '"') {
        inQuotes = false
        i++
        continue
      } else {
        field += ch
        i++
        continue
      }
    }

    if (ch === '"') {
      inQuotes = true
      i++
      continue
    }

    if (ch === ',') {
      result.push(field)
      field = ''
      i++
      continue
    }

    field += ch
    i++
  }

  result.push(field)
  return result
}
