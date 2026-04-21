/**
 * _shared/locad-xlsx.ts
 *
 * Parse the Locad Inventory Report xlsx and resolve Locad SKUs to internal SKUs.
 *
 * Confirmed xlsx format:
 *   Sheet  : "Inventory"
 *   Columns: SKU (string), Sellable Stock (integer)
 *             UPC, ProductName, Warehouse — used for matching only, not stored
 *             All other columns ignored
 *
 * Filename date pattern: InventoryReport_YYYY-MM-DD-*
 *
 * SKU resolution passes:
 *   Pass 1 — FNSKU via UPC: if UPC matches /^X[0-9A-Z]{9}$/ look up skus.fnsku
 *   Pass 2 — Exact SKU name match against skus.sku
 *   Pass 3 — Unresolved items surface in UI
 *
 * Auto-matched SKUs are persisted to locad_sku_map.
 */

import * as XLSX from 'https://esm.sh/xlsx@0.18.5'
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const FNSKU_PATTERN = /^X[0-9A-Z]{9}$/i
const DEFAULT_WAREHOUSE = 'LOCAD Umm Ramool FC'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LocadParsedItem {
  locad_sku: string
  sellable_stock: number
  warehouse_name: string
  upc: string | null
  product_name: string | null
}

// ---------------------------------------------------------------------------
// parseLocadXLSX
// ---------------------------------------------------------------------------

export function parseLocadXLSX(
  fileBuffer: ArrayBuffer,
  filename: string
): { items: LocadParsedItem[]; report_date: string } {
  // Parse report_date from filename: InventoryReport_YYYY-MM-DD-*
  const dateMatch = filename.match(/InventoryReport_(\d{4}-\d{2}-\d{2})/)
  const report_date = dateMatch
    ? dateMatch[1]
    : new Date().toISOString().split('T')[0]

  // Read workbook
  const workbook = XLSX.read(new Uint8Array(fileBuffer), { type: 'array' })

  // Find "Inventory" sheet (case-insensitive)
  const sheetName = workbook.SheetNames.find(
    (n) => n.trim().toLowerCase() === 'inventory'
  )
  if (!sheetName) {
    throw new Error(
      `Sheet "Inventory" not found in workbook. Available sheets: ${workbook.SheetNames.join(', ')}`
    )
  }

  const sheet = workbook.Sheets[sheetName]
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: null,
    raw: false,
  })

  if (!rows || rows.length === 0) {
    return { items: [], report_date }
  }

  // Build a case-insensitive column map from the first row
  const firstRow = rows[0]
  const colMap = buildColMap(Object.keys(firstRow))

  const items: LocadParsedItem[] = []

  for (const row of rows) {
    const skuRaw = getCol(row, colMap, ['sku', 'seller sku', 'sellersku', 'item sku', 'itemsku'])
    if (!skuRaw) continue

    const locad_sku = String(skuRaw).trim()
    if (!locad_sku) continue

    const sellableRaw = getCol(row, colMap, [
      'sellable stock',
      'sellablestock',
      'sellable_stock',
      'available stock',
      'available',
      'quantity',
    ])
    const sellable_stock = parseInt(String(sellableRaw ?? '0').replace(/,/g, ''), 10)

    const warehouseRaw = getCol(row, colMap, ['warehouse', 'warehouse name', 'warehousename', 'fc'])
    const warehouse_name = warehouseRaw ? String(warehouseRaw).trim() || DEFAULT_WAREHOUSE : DEFAULT_WAREHOUSE

    const upcRaw = getCol(row, colMap, ['upc', 'barcode', 'ean', 'fnsku'])
    const upc = upcRaw ? String(upcRaw).trim() || null : null

    const nameRaw = getCol(row, colMap, ['productname', 'product name', 'name', 'title', 'item name'])
    const product_name = nameRaw ? String(nameRaw).trim() || null : null

    items.push({
      locad_sku,
      sellable_stock: isNaN(sellable_stock) ? 0 : Math.max(0, sellable_stock),
      warehouse_name,
      upc,
      product_name,
    })
  }

  return { items, report_date }
}

// ---------------------------------------------------------------------------
// resolveLocadSKUs
// ---------------------------------------------------------------------------

export async function resolveLocadSKUs(
  items: LocadParsedItem[],
  supabase: SupabaseClient
): Promise<{
  matched: { internal_sku: string; sellable_stock: number; warehouse_name: string }[]
  unmatched: { locad_sku: string; product_name: string | null }[]
}> {
  if (items.length === 0) {
    return { matched: [], unmatched: [] }
  }

  // Load existing mappings from locad_sku_map
  const locadSkus = items.map((i) => i.locad_sku)
  const { data: existingMaps, error: mapErr } = await supabase
    .from('locad_sku_map')
    .select('locad_sku, internal_sku')
    .in('locad_sku', locadSkus)

  if (mapErr) {
    console.error('[locad-xlsx] Error loading locad_sku_map:', mapErr.message)
  }

  const knownMap = new Map<string, string>()
  for (const row of existingMaps ?? []) {
    knownMap.set(row.locad_sku, row.internal_sku)
  }

  const matched: { internal_sku: string; sellable_stock: number; warehouse_name: string }[] = []
  const unmatched: { locad_sku: string; product_name: string | null }[] = []
  const newMappings: { locad_sku: string; internal_sku: string; matched_by: string }[] = []

  for (const item of items) {
    // Check existing mapping first
    if (knownMap.has(item.locad_sku)) {
      matched.push({
        internal_sku: knownMap.get(item.locad_sku)!,
        sellable_stock: item.sellable_stock,
        warehouse_name: item.warehouse_name,
      })
      continue
    }

    let resolved: string | null = null
    let matchedBy: string | null = null

    // Pass 1 — FNSKU via UPC (only if UPC matches FNSKU_PATTERN)
    if (item.upc && FNSKU_PATTERN.test(item.upc)) {
      const { data: skuRows } = await supabase
        .from('sku_master')
        .select('sku')
        .eq('fnsku', item.upc)
        .limit(1)
      if (skuRows && skuRows.length > 0) {
        resolved = skuRows[0].sku
        matchedBy = 'fnsku'
      }
    }

    // Pass 2 — Exact SKU name match
    if (!resolved) {
      const { data: skuRows } = await supabase
        .from('sku_master')
        .select('sku')
        .eq('sku', item.locad_sku)
        .limit(1)
      if (skuRows && skuRows.length > 0) {
        resolved = skuRows[0].sku
        matchedBy = 'exact_sku'
      }
    }

    // Pass 2.5 — Strip trailing 's' from Locad SKU and try again
    // Locad sometimes appends 's' to Amazon seller SKUs (e.g. "B09XYZS" → "B09XYZ")
    if (!resolved) {
      const strippedSku = item.locad_sku.replace(/s$/i, '')
      if (strippedSku !== item.locad_sku) {
        const { data: skuRows } = await supabase
          .from('sku_master')
          .select('sku')
          .eq('sku', strippedSku)
          .limit(1)
        if (skuRows && skuRows.length > 0) {
          resolved = skuRows[0].sku
          matchedBy = 'stripped_s'
        }
      }
    }

    if (resolved && matchedBy) {
      matched.push({
        internal_sku: resolved,
        sellable_stock: item.sellable_stock,
        warehouse_name: item.warehouse_name,
      })
      knownMap.set(item.locad_sku, resolved)
      newMappings.push({
        locad_sku: item.locad_sku,
        internal_sku: resolved,
        matched_by: matchedBy,
      })
    } else {
      // Pass 3 — Unresolved, surfaces in UI
      unmatched.push({
        locad_sku: item.locad_sku,
        product_name: item.product_name,
      })
    }
  }

  // Persist new auto-matches
  if (newMappings.length > 0) {
    const { error: upsertErr } = await supabase
      .from('locad_sku_map')
      .upsert(newMappings, { onConflict: 'locad_sku' })
    if (upsertErr) {
      console.error('[locad-xlsx] Error persisting locad_sku_map:', upsertErr.message)
    }
  }

  return { matched, unmatched }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a map of lowercased column name -> original column name */
function buildColMap(keys: string[]): Map<string, string> {
  const m = new Map<string, string>()
  for (const k of keys) {
    m.set(k.trim().toLowerCase(), k)
  }
  return m
}

/** Get a value from a row using a list of candidate column name aliases */
function getCol(
  row: Record<string, unknown>,
  colMap: Map<string, string>,
  aliases: string[]
): unknown {
  for (const alias of aliases) {
    const original = colMap.get(alias.toLowerCase())
    if (original !== undefined && row[original] !== undefined && row[original] !== null) {
      return row[original]
    }
  }
  return null
}
