/**
 * _shared/saddl.ts
 *
 * READ-ONLY connector to the Saddl Supabase instance.
 * NEVER issue INSERT / UPDATE / DELETE / CREATE / DROP / ALTER against Saddl.
 *
 * Confirmed Saddl schema (discovered 2026-02-27):
 *
 * sc_raw.fba_inventory
 *   asin, fnsku, client_id, snapshot_date,
 *   afn_fulfillable_quantity  → available
 *   afn_inbound_working_quantity + afn_inbound_shipped_quantity + afn_inbound_receiving_quantity → inbound
 *   afn_reserved_quantity     → reserved
 *   NOTE: sku column is always NULL — data is keyed by asin only.
 *         Caller must resolve asin → internal SKU via sku_master.
 *
 * sc_raw.sales_traffic (filter: account_id = 's2c_uae_test')
 *   child_asin, report_date, units_ordered → units_sold
 *   NOTE: returns asin, not sku. Caller resolves.
 *
 * sc_analytics.account_daily — account-level totals only, no per-SKU data
 */

import { Pool } from 'https://deno.land/x/postgres@v0.17.0/mod.ts'

// Default account/client IDs (UAE). Other locations are passed in dynamically.
const DEFAULT_ACCOUNT_ID = 's2c_uae_test'
const DEFAULT_CLIENT_ID = 's2c_uae_test'

export function getPool(): Pool {
  const dbUrl = Deno.env.get('SADDL_DB_URL')
  if (!dbUrl) throw new Error('SADDL_DB_URL is not set')
  return new Pool(dbUrl, 3, true)
}

// ---------------------------------------------------------------------------
// fetchAmazonInventory
// Returns the most recent snapshot per ASIN/SKU using DISTINCT ON.
// ---------------------------------------------------------------------------
export async function fetchAmazonInventory(
  clientId: string = DEFAULT_CLIENT_ID
): Promise<
  {
    asin: string
    sku?: string | null
    fnsku?: string | null
    available: number
    inbound: number
    reserved: number
    unfulfillable: number
    snapshot_date: string
  }[]
> {
  const pool = getPool()
  const conn = await pool.connect()
  try {
    const { rows } = await conn.queryObject<{
      asin: string
      sku: string | null
      fnsku: string | null
      available: number
      inbound: number
      reserved: number
      unfulfillable: number
      snapshot_date: string
    }>(`
      SELECT DISTINCT ON (asin)
        asin,
        sku,
        fnsku,
        COALESCE(afn_fulfillable_quantity, 0)                            AS available,
        COALESCE(afn_inbound_working_quantity, 0)
          + COALESCE(afn_inbound_shipped_quantity, 0)
          + COALESCE(afn_inbound_receiving_quantity, 0)                  AS inbound,
        COALESCE(afn_reserved_quantity, 0)                               AS reserved,
        COALESCE(afn_unsellable_quantity, 0)                            AS unfulfillable,
        snapshot_date::text                                              AS snapshot_date
      FROM sc_raw.fba_inventory
      WHERE client_id = $1
        AND asin IS NOT NULL
        AND asin <> ''
      ORDER BY asin, snapshot_date DESC, pulled_at DESC
    `, [clientId])
    console.log(`[saddl] fetchAmazonInventory (client=${clientId}): ${rows.length} ASINs`)
    return rows.map(r => ({
      asin:          String(r.asin),
      sku:           r.sku ? String(r.sku).trim() : null,
      fnsku:         r.fnsku ? String(r.fnsku).trim() : null,
      available:     Number(r.available) || 0,
      inbound:       Number(r.inbound)   || 0,
      reserved:      Number(r.reserved)  || 0,
      unfulfillable: Number(r.unfulfillable) || 0,
      snapshot_date: String(r.snapshot_date || '').slice(0, 10),
    }))
  } catch (err) {
    console.error('[saddl] fetchAmazonInventory error:', err)
    throw err  // surface to sync/index.ts so it appears in errors[] response
  } finally {
    conn.release()
    await pool.end()
  }
}


// ---------------------------------------------------------------------------
// fetchAmazonSales
// Reads sc_raw.sales_traffic filtered by account_id.
// Returns asin (not sku) — caller must resolve via sku_master.
// ---------------------------------------------------------------------------
export async function fetchAmazonSales(
  days: number,
  accountId: string = DEFAULT_ACCOUNT_ID
): Promise<{ 
  asin: string; 
  date: string; 
  units_sold: number; 
  revenue: number;
}[]> {
  const pool = getPool()
  const conn = await pool.connect()
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - days)
  const cutoffStr = cutoff.toISOString().split('T')[0]

  try {
    const { rows } = await conn.queryObject<{
      asin: string
      report_date: string
      units_sold: number
      revenue: number
      marketplace_id: string
      parent_asin: string
      ordered_revenue_currency: string
      total_order_items: number
      page_views: number
      sessions: number
      buy_box_percentage: number
      unit_session_percentage: number
    }>(`
      SELECT
        child_asin                   AS asin,
        report_date::text            AS report_date,
        SUM(units_ordered)           AS units_sold,
        SUM(COALESCE(ordered_revenue, 0)) AS revenue
      FROM sc_raw.sales_traffic
      WHERE account_id = $1
        AND report_date >= $2
        AND (units_ordered > 0 OR COALESCE(ordered_revenue, 0) > 0)
        AND child_asin IS NOT NULL
        AND child_asin <> ''
      GROUP BY child_asin, report_date
    `, [accountId, cutoffStr])

    console.log(`[saddl] fetchAmazonSales (account=${accountId}): ${rows.length} rows since ${cutoffStr}`)
    return rows.map(r => ({
      asin:       String(r.asin),
      date:       String(r.report_date).slice(0, 10),
      units_sold: Number(r.units_sold) || 0,
      revenue:    Number(r.revenue) || 0
    }))
  } catch (err) {
    console.error('[saddl] fetchAmazonSales error:', err)
    throw err
  } finally {
    conn.release()
    await pool.end()
  }
}

// ---------------------------------------------------------------------------
// fetchAmazonSalesRevenue
// Reads sc_raw.sales_traffic and returns direct ordered revenue per ASIN/date.
// ---------------------------------------------------------------------------
export async function fetchAmazonSalesRevenue(
  days: number,
  accountId: string = DEFAULT_ACCOUNT_ID
): Promise<{ asin: string; date: string; revenue: number }[]> {
  const pool = getPool()
  const conn = await pool.connect()
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - days)
  const cutoffStr = cutoff.toISOString().split('T')[0]

  try {
    const { rows } = await conn.queryObject<{
      asin: string
      report_date: string
      revenue: number
    }>(`
      SELECT
        child_asin AS asin,
        report_date::text AS report_date,
        SUM(COALESCE(ordered_revenue, 0)) AS revenue
      FROM sc_raw.sales_traffic
      WHERE account_id = $1
        AND report_date >= $2
        AND COALESCE(ordered_revenue, 0) > 0
        AND child_asin IS NOT NULL
        AND child_asin <> ''
      GROUP BY child_asin, report_date
    `, [accountId, cutoffStr])

    console.log(`[saddl] fetchAmazonSalesRevenue (account=${accountId}): ${rows.length} rows since ${cutoffStr}`)
    return rows.map(r => ({
      asin: String(r.asin),
      date: String(r.report_date).slice(0, 10),
      revenue: Number(r.revenue) || 0,
    }))
  } catch (err) {
    console.error('[saddl] fetchAmazonSalesRevenue error:', err)
    return []
  } finally {
    conn.release()
    await pool.end()
  }
}

// ---------------------------------------------------------------------------
// getSaddlConnectionStatus
// ---------------------------------------------------------------------------
let _lastSynced: string | null = null

export async function getSaddlConnectionStatus(): Promise<{
  status: 'connected' | 'error'
  last_synced: string | null
}> {
  const pool = getPool()
  const conn = await pool.connect()
  try {
    await conn.queryObject(`SELECT 1 FROM sc_raw.fba_inventory LIMIT 1`)
    _lastSynced = new Date().toISOString()
    return { status: 'connected', last_synced: _lastSynced }
  } catch (err) {
    console.error('[saddl] connection check failed:', err)
    return { status: 'error', last_synced: _lastSynced }
  } finally {
    conn.release()
    await pool.end()
  }
}


// ---------------------------------------------------------------------------
// Noon API Integration (Database: saddlos, Schema: noon_api)
// Source of truth: noon_api.v_fbn_inventory_current
// Daily automated pull: fbn_saleable, darkstore_saleable, partner_sku_latest
// ---------------------------------------------------------------------------

export interface NoonInventoryItem {
  client_id: string
  country: string
  sku: string
  partner_sku: string | null
  close_date: string
  fbn_saleable: number
  darkstore_saleable: number
  non_saleable: number
}

export async function fetchNoonInventory(
  clientId: string = DEFAULT_CLIENT_ID
): Promise<NoonInventoryItem[]> {
  const pool = getPool()
  const conn = await pool.connect()
  try {
    const { rows } = await conn.queryObject<{
      client_id: string
      country: string
      sku: string
      close_date: string
      fbn_saleable: number | string
      darkstore_saleable: number | string
      non_saleable: number | string
      partner_sku_latest: string | null
      partner_sku_on_date: string | null
    }>(
      'SELECT client_id, country, sku, close_date::text AS close_date, ' +
      'COALESCE(fbn_saleable, 0) AS fbn_saleable, ' +
      'COALESCE(darkstore_saleable, 0) AS darkstore_saleable, ' +
      'COALESCE(non_saleable, 0) AS non_saleable, ' +
      'partner_sku_latest, partner_sku_on_date ' +
      'FROM noon_api.v_fbn_inventory_current ' +
      'WHERE client_id = $1 ' +
      'ORDER BY close_date DESC, sku ASC',
      [clientId]
    )

    console.log('[saddl] fetchNoonInventory (client=' + clientId + '): ' + rows.length + ' Noon SKUs')
    return rows.map(r => ({
      client_id: String(r.client_id),
      country: String(r.country),
      sku: String(r.sku || '').trim(),
      partner_sku: r.partner_sku_latest
        ? String(r.partner_sku_latest).trim()
        : (r.partner_sku_on_date ? String(r.partner_sku_on_date).trim() : null),
      close_date: String(r.close_date || '').slice(0, 10),
      fbn_saleable: Number(r.fbn_saleable) || 0,
      darkstore_saleable: Number(r.darkstore_saleable) || 0,
      non_saleable: Number(r.non_saleable) || 0,
    }))
  } catch (err) {
    console.error('[saddl] fetchNoonInventory error:', err)
    throw err
  } finally {
    conn.release()
    await pool.end()
  }
}

// ---------------------------------------------------------------------------
// fetchNoonReconciliation
// Compares Detail total vs Aging report saleable (alert if variance > 3%)
// ---------------------------------------------------------------------------
export async function fetchNoonReconciliation(
  clientId: string = DEFAULT_CLIENT_ID
): Promise<{
  client_id: string
  detail_close_date: string
  detail_fbn_total: number
  aging_saleable_gross_total: number
  abs_variance: number
  pct_variance: number
  alert: boolean
  sku_count: number
  sku_mismatch_count: number
} | null> {
  const pool = getPool()
  const conn = await pool.connect()
  try {
    const { rows } = await conn.queryObject<{
      client_id: string
      detail_close_date: string
      detail_fbn_total: number | string
      aging_saleable_gross_total: number | string
      abs_variance: number | string
      pct_variance: number | string
      alert: boolean
      sku_count: number | string
      sku_mismatch_count: number | string
    }>(
      'SELECT client_id, detail_close_date::text AS detail_close_date, ' +
      'COALESCE(detail_fbn_total, 0) AS detail_fbn_total, ' +
      'COALESCE(aging_saleable_gross_total, 0) AS aging_saleable_gross_total, ' +
      'COALESCE(abs_variance, 0) AS abs_variance, ' +
      'COALESCE(pct_variance, 0) AS pct_variance, ' +
      'alert, ' +
      'COALESCE(sku_count, 0) AS sku_count, ' +
      'COALESCE(sku_mismatch_count, 0) AS sku_mismatch_count ' +
      'FROM noon_api.fbn_inventory_reconciliation ' +
      'WHERE client_id = $1 ' +
      'ORDER BY detail_close_date DESC ' +
      'LIMIT 1',
      [clientId]
    )

    if (!rows || rows.length === 0) return null
    const r = rows[0]
    return {
      client_id: String(r.client_id),
      detail_close_date: String(r.detail_close_date || '').slice(0, 10),
      detail_fbn_total: Number(r.detail_fbn_total) || 0,
      aging_saleable_gross_total: Number(r.aging_saleable_gross_total) || 0,
      abs_variance: Number(r.abs_variance) || 0,
      pct_variance: Number(r.pct_variance) || 0,
      alert: Boolean(r.alert),
      sku_count: Number(r.sku_count) || 0,
      sku_mismatch_count: Number(r.sku_mismatch_count) || 0,
    }
  } catch (err) {
    console.error('[saddl] fetchNoonReconciliation error:', err)
    return null
  } finally {
    conn.release()
    await pool.end()
  }
}

// ---------------------------------------------------------------------------
// getNoonConnectionStatus
// ---------------------------------------------------------------------------
export async function getNoonConnectionStatus(): Promise<{
  status: 'connected' | 'error'
  last_synced: string | null
}> {
  const pool = getPool()
  const conn = await pool.connect()
  try {
    await conn.queryObject('SELECT 1 FROM noon_api.v_fbn_inventory_current LIMIT 1')
    return { status: 'connected', last_synced: new Date().toISOString() }
  } catch (err) {
    console.error('[saddl] noon connection check failed:', err)
    return { status: 'error', last_synced: null }
  } finally {
    conn.release()
    await pool.end()
  }
}
