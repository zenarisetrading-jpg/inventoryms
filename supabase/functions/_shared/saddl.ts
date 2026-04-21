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

const ACCOUNT_ID = 's2c_uae_test'

function getPool(): Pool {
  const dbUrl = Deno.env.get('SADDL_DB_URL')
  if (!dbUrl) throw new Error('SADDL_DB_URL is not set')
  return new Pool(dbUrl, 3, true)
}

// ---------------------------------------------------------------------------
// fetchAmazonInventory
// Returns the most recent snapshot per ASIN (sku column is always NULL).
// Caller must resolve asin → internal SKU via sku_master.
// ---------------------------------------------------------------------------
export async function fetchAmazonInventory(): Promise<
  { asin: string; available: number; inbound: number; reserved: number }[]
> {
  const pool = getPool()
  const conn = await pool.connect()
  try {
    const { rows } = await conn.queryObject<{
      asin: string
      available: number
      inbound: number
      reserved: number
    }>(`
      SELECT
        asin,
        COALESCE(afn_fulfillable_quantity, 0)                            AS available,
        COALESCE(afn_inbound_working_quantity, 0)
          + COALESCE(afn_inbound_shipped_quantity, 0)
          + COALESCE(afn_inbound_receiving_quantity, 0)                  AS inbound,
        COALESCE(afn_reserved_quantity, 0)                               AS reserved
      FROM sc_raw.fba_inventory fi
      WHERE client_id = 's2c_uae_test'
        AND snapshot_date = (
          SELECT MAX(snapshot_date) FROM sc_raw.fba_inventory fi2
          WHERE fi2.asin = fi.asin AND fi2.client_id = fi.client_id
        )
        AND asin IS NOT NULL
        AND asin <> ''
    `)
    console.log(`[saddl] fetchAmazonInventory: ${rows.length} ASINs`)
    return rows.map(r => ({
      asin:      String(r.asin),
      available: Number(r.available) || 0,
      inbound:   Number(r.inbound)   || 0,
      reserved:  Number(r.reserved)  || 0,
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
  days: number
): Promise<{ asin: string; date: string; units_sold: number }[]> {
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
    }>(`
      SELECT
        child_asin            AS asin,
        report_date::text     AS report_date,
        SUM(units_ordered)    AS units_sold
      FROM sc_raw.sales_traffic
      WHERE account_id = $1
        AND report_date >= $2
        AND units_ordered > 0
        AND child_asin IS NOT NULL
        AND child_asin <> ''
      GROUP BY child_asin, report_date
    `, [ACCOUNT_ID, cutoffStr])

    console.log(`[saddl] fetchAmazonSales: ${rows.length} rows since ${cutoffStr}`)
    return rows.map(r => ({
      asin:       String(r.asin),
      date:       String(r.report_date).slice(0, 10),
      units_sold: Number(r.units_sold) || 0,
    }))
  } catch (err) {
    console.error('[saddl] fetchAmazonSales error:', err)
    return []
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
  days: number
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
    `, [ACCOUNT_ID, cutoffStr])

    console.log(`[saddl] fetchAmazonSalesRevenue: ${rows.length} rows since ${cutoffStr}`)
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
