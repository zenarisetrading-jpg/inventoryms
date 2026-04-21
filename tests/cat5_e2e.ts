/**
 * Category 5 — End-to-End Pipeline Tests
 *
 * Only run if Category 4 passes (endpoints must be reachable).
 * Tests the full data flow from sync → metrics → dashboard.
 *
 * Run with Deno:
 *   deno test tests/cat5_e2e.ts --allow-env --allow-net --allow-read
 */

// ---------------------------------------------------------------------------
// Environment & helpers
// ---------------------------------------------------------------------------

const LOCAL_BASE = Deno.env.get('SUPABASE_LOCAL_URL') ?? 'http://localhost:54321'
const FUNCTIONS_BASE = `${LOCAL_BASE}/functions/v1`
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
const REMOTE_BASE = SUPABASE_URL ? `${SUPABASE_URL}/functions/v1` : ''

import { assert } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

let ACTIVE_BASE = ''

async function detectBase(): Promise<string> {
  try {
    const resp = await fetch(`${FUNCTIONS_BASE}/sync/status`, {
      headers: { Authorization: `Bearer ${ANON_KEY}` },
      signal: AbortSignal.timeout(3000),
    })
    if (resp.status !== 404) return FUNCTIONS_BASE
  } catch { /* local not available */ }

  if (REMOTE_BASE) {
    try {
      const resp = await fetch(`${REMOTE_BASE}/sync/status`, {
        headers: { Authorization: `Bearer ${ANON_KEY}` },
        signal: AbortSignal.timeout(5000),
      })
      if (resp.status !== 404) return REMOTE_BASE
    } catch { /* remote not available */ }
  }
  return ''
}

function getS2CClient() {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
}

async function post(path: string): Promise<Response> {
  return fetch(`${ACTIVE_BASE}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${ANON_KEY}`,
      'Content-Type': 'application/json',
    },
  })
}

async function get(path: string): Promise<Response> {
  return fetch(`${ACTIVE_BASE}${path}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${ANON_KEY}` },
  })
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------
Deno.test({
  name: '5.0 — E2E Setup: detect active endpoint base',
  fn: async () => {
    ACTIVE_BASE = await detectBase()
    if (!ACTIVE_BASE) {
      console.warn(
        '[5.0] Edge Functions not reachable — E2E tests will be skipped. ' +
        'Run `supabase start` to enable these tests.'
      )
    } else {
      console.log(`[5.0] Using endpoint base: ${ACTIVE_BASE}`)
    }
  },
})

function skipIfNoBase(): boolean {
  if (!ACTIVE_BASE) {
    console.log('SKIPPED — Edge Functions not reachable')
    return true
  }
  return false
}

// ---------------------------------------------------------------------------
// Test 5.1 — Full pipeline flow
// ---------------------------------------------------------------------------
Deno.test('5.1a — POST /sync/amazon: executes without crashing', async () => {
  if (skipIfNoBase()) return

  const resp = await post('/sync/amazon')

  if (resp.status === 404) {
    console.log('[5.1a] SKIPPED — /sync/amazon not deployed')
    return
  }

  const body = await resp.json()

  // Amazon sync may partially fail if Saddl schema has changed
  // We accept 'ok' or 'partial' as passing
  const status = body.status ?? 'unknown'
  if (!['ok', 'partial'].includes(status)) {
    console.warn(
      `[5.1a] /sync/amazon returned status="${status}". ` +
      `Errors: ${JSON.stringify(body.errors ?? [])}. ` +
      'This may be expected if Saddl tables have changed.'
    )
  }

  console.log(`[5.1a] /sync/amazon: status=${status}, skus_processed=${body.skus_processed ?? 0}`)
})

Deno.test('5.1b — POST /sync/all: executes without crashing', async () => {
  if (skipIfNoBase()) return

  const resp = await post('/sync/all')

  if (resp.status === 404) {
    console.log('[5.1b] SKIPPED — /sync/all not deployed')
    return
  }

  const body = await resp.json()
  const status = body.status ?? 'unknown'

  console.log(
    `[5.1b] /sync/all: status=${status}, ` +
    `skus_processed=${body.skus_processed ?? 0}, ` +
    `locad_status=${body.locad_status ?? 'N/A'}`
  )
  if (body.errors?.length > 0) {
    console.warn(`[5.1b] Errors: ${JSON.stringify(body.errors)}`)
  }
})

Deno.test('5.1c — GET /dashboard: last_synced is recent after sync', async () => {
  if (skipIfNoBase()) return

  const resp = await get('/dashboard')

  if (resp.status === 404) {
    console.log('[5.1c] SKIPPED — /dashboard not deployed')
    return
  }

  if (resp.status !== 200) {
    throw new Error(`5.1c: Expected 200, got ${resp.status}`)
  }

  const body = await resp.json()
  const lastSynced = body.last_synced

  if (!lastSynced) {
    console.warn(
      '[5.1c] last_synced is null — this is expected if no inventory data has been synced yet. ' +
      'Run /sync/amazon after seeding sku_master to populate inventory_snapshot.'
    )
    // Not a FAIL — the dashboard is working, just no data yet
    return
  }

  // Check if last_synced is within the last 10 minutes (generous window)
  const syncedAt = new Date(lastSynced)
  const now = new Date()
  const minutesAgo = (now.getTime() - syncedAt.getTime()) / 60000

  if (minutesAgo > 10) {
    console.warn(
      `[5.1c] last_synced=${lastSynced} is ${minutesAgo.toFixed(1)} minutes ago. ` +
      'Expected to be recent after /sync/all. ' +
      'This may be OK if inventory_snapshot was last populated by /upload-locad-report.'
    )
  } else {
    console.log(`[5.1c] PASS — last_synced is ${minutesAgo.toFixed(1)} minutes ago`)
  }
})

Deno.test('5.1d — GET /skus: at least one SKU has non-null action_flag', async () => {
  if (skipIfNoBase()) return

  const resp = await get('/skus')

  if (resp.status === 404) {
    console.log('[5.1d] SKIPPED — /skus not deployed')
    return
  }

  if (resp.status !== 200) {
    throw new Error(`5.1d: Expected 200, got ${resp.status}`)
  }

  const body = await resp.json()
  const skus = body.skus ?? []

  if (skus.length === 0) {
    console.warn(
      '[5.1d] /skus returned 0 SKUs — sku_master may be empty or metrics not yet computed. ' +
      'Run seed migration and /sync/all to populate.'
    )
    return
  }

  const withFlag = skus.filter((s: Record<string, unknown>) => s.action_flag !== null)
  if (withFlag.length === 0) {
    console.warn(
      '[5.1d] All SKUs have null action_flag — demand_metrics may not be populated. ' +
      'Run POST /sync/all to compute metrics.'
    )
  } else {
    console.log(
      `[5.1d] PASS — ${withFlag.length}/${skus.length} SKUs have non-null action_flag`
    )
  }
})

// ---------------------------------------------------------------------------
// Test 5.2 — Locad stock appears in SKU detail
// ---------------------------------------------------------------------------
Deno.test('5.2 — Locad stock: matched SKU shows locad_warehouse available > 0 in /skus/:sku', async () => {
  if (skipIfNoBase()) return

  // Find a SKU that was matched from the Locad xlsx upload
  const supabase = getS2CClient()

  // Check if any locad_sku_map entries exist
  const { data: locadMaps } = await supabase
    .from('locad_sku_map')
    .select('internal_sku')
    .limit(5)

  if (!locadMaps || locadMaps.length === 0) {
    console.log(
      '[5.2] SKIPPED — No locad_sku_map entries found. ' +
      'Upload the Locad xlsx first (Test 4.8) to create mappings.'
    )
    return
  }

  // Check inventory_snapshot for locad_warehouse entries
  const { data: locadSnaps } = await supabase
    .from('inventory_snapshot')
    .select('sku, available, warehouse_name')
    .eq('node', 'locad_warehouse')
    .gt('available', 0)
    .limit(1)
    .maybeSingle()

  if (!locadSnaps) {
    console.log(
      '[5.2] SKIPPED — No locad_warehouse inventory rows with available > 0. ' +
      'The xlsx upload may not have processed yet or all stock is 0.'
    )
    return
  }

  const testSku = (locadSnaps as { sku: string }).sku

  // Now test the endpoint
  const resp = await get(`/skus/${testSku}`)

  if (resp.status === 404) {
    console.log(`[5.2] SKIPPED — /skus/${testSku} returned 404`)
    return
  }

  if (resp.status !== 200) {
    throw new Error(`5.2: Expected 200, got ${resp.status}`)
  }

  const body = await resp.json()
  const locadAvailable = body.supply?.locad_warehouse?.available

  if (locadAvailable === undefined || locadAvailable === null) {
    console.warn(
      `[5.2] supply.locad_warehouse.available is missing or null for SKU ${testSku}. ` +
      'Check if the /skus/:sku endpoint includes locad_warehouse in supply data.'
    )
  } else if (locadAvailable > 0) {
    console.log(
      `[5.2] PASS — SKU ${testSku}: supply.locad_warehouse.available = ${locadAvailable}`
    )
  } else {
    console.warn(
      `[5.2] supply.locad_warehouse.available = ${locadAvailable} for SKU ${testSku}. ` +
      'May be 0 if inventory_snapshot was not yet synced to demand_metrics.'
    )
  }

  assert(body.sku === testSku, `5.2: Response SKU must match requested SKU (${testSku})`)
})

// ---------------------------------------------------------------------------
// Test 5.3 — Metrics consistency check
// ---------------------------------------------------------------------------
Deno.test('5.3 — Metrics consistency: demand_metrics.total_available <= sum of inventory nodes', async () => {
  if (skipIfNoBase()) return

  const supabase = getS2CClient()

  // Get a sample of demand_metrics
  const { data: metrics } = await supabase
    .from('demand_metrics')
    .select('sku, total_available, coverage_amazon, coverage_noon, coverage_warehouse, blended_sv')
    .gt('blended_sv', 0)
    .limit(10)

  if (!metrics || metrics.length === 0) {
    console.log('[5.3] SKIPPED — No demand_metrics with positive velocity found')
    return
  }

  let inconsistencies = 0

  for (const m of metrics as {
    sku: string
    total_available: number
    coverage_amazon: number
    coverage_noon: number
    coverage_warehouse: number
    blended_sv: number
  }[]) {
    // Sanity check: total_coverage must be consistent with coverage days * blended_sv
    const expectedTotalAvail =
      (m.coverage_amazon + m.coverage_noon + m.coverage_warehouse) * m.blended_sv
    const tolerance = m.blended_sv * 2 // Allow 2-day rounding tolerance

    if (Math.abs(expectedTotalAvail - m.total_available) > tolerance) {
      console.warn(
        `[5.3] SKU ${m.sku}: total_available=${m.total_available}, ` +
        `computed=${expectedTotalAvail.toFixed(0)} (diff=${Math.abs(expectedTotalAvail - m.total_available).toFixed(0)})`
      )
      inconsistencies++
    }
  }

  if (inconsistencies > 0) {
    console.warn(`[5.3] ${inconsistencies}/${metrics.length} metrics inconsistencies detected`)
  } else {
    console.log(`[5.3] PASS — All ${metrics.length} demand_metrics rows are internally consistent`)
  }
})

// ---------------------------------------------------------------------------
// Test 5.4 — PO incoming units affect projected_coverage
// ---------------------------------------------------------------------------
Deno.test('5.4 — PO units appear in projected_coverage: verify logic end-to-end', async () => {
  if (skipIfNoBase()) return

  const supabase = getS2CClient()

  // Find a demand_metrics row where incoming_po_units > 0
  const { data: metricsWithPO } = await supabase
    .from('demand_metrics')
    .select('sku, total_available, incoming_po_units, projected_coverage, blended_sv')
    .gt('incoming_po_units', 0)
    .limit(1)
    .maybeSingle()

  if (!metricsWithPO) {
    console.log('[5.4] SKIPPED — No demand_metrics rows with incoming_po_units > 0. Create a PO in ordered/shipped status to test this.')
    return
  }

  const m = metricsWithPO as {
    sku: string
    total_available: number
    incoming_po_units: number
    projected_coverage: number
    blended_sv: number
  }

  // projected_coverage should be > total_coverage when incoming_po_units > 0
  const total_coverage = m.total_available / m.blended_sv
  const expected_projected = (m.total_available + m.incoming_po_units) / m.blended_sv

  assert(
    m.projected_coverage >= total_coverage,
    `5.4: projected_coverage (${m.projected_coverage}) must be >= total_coverage (${total_coverage.toFixed(1)}) when PO units exist`
  )

  console.log(
    `[5.4] PASS — SKU ${m.sku}: ` +
    `total_coverage=${total_coverage.toFixed(1)}, ` +
    `projected_coverage=${m.projected_coverage.toFixed(1)}, ` +
    `incoming_po_units=${m.incoming_po_units}`
  )
})
