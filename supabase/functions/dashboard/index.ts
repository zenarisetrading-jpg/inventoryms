import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { corsHeaders } from '../_shared/cors.ts'
import { getSupabaseClient } from '../_shared/supabase.ts'
import type { InventoryNode, SKU } from '../_shared/types.ts'
import { INCOMING_PO_STATUSES } from '../_shared/types.ts'
import { computeTransfers } from '../_shared/transfer.ts'
import { computeReorderPlan } from '../_shared/reorder.ts'
import { computeAllocationBoxDecision } from '../_shared/allocation.ts'

// ---------------------------------------------------------------------------
// Types for the command-center response
// ---------------------------------------------------------------------------

interface AlertItem {
  sku: string
  name: string
  action_flag: string
  total_coverage: number
  coverage_amazon: number
  coverage_noon: number
  coverage_warehouse: number
  blended_sv: number
}

interface ShipNowItem {
  sku: string
  name: string
  allocation_logic: string
  blended_sv: number
  amazon_sv: number
  noon_sv: number
  minutes_sv: number
  current_fba_stock_units: number
  current_fbn_stock_units: number
  current_minutes_stock_units: number
  boxes_in_hand: number
  boxes_required_30d_amz: number
  boxes_required_30d_noon: number
  boxes_required_30d_minutes: number
  suggested_boxes_amazon: number
  suggested_boxes_noon: number
  suggested_boxes_minutes: number
  total_boxes_to_ship: number
  total_units_to_ship: number
  send_to_fba_units: number
  send_to_fbn_units: number
  send_to_minutes_units: number
  units_per_box: number
  plan_date: string
}

interface ReorderItem {
  sku: string
  name: string
  category: string
  should_reorder: boolean
  suggested_units: number
  projected_coverage: number
  blended_sv: number
  lead_time_days: number
  moq: number | null
  cogs: number | null
}

interface TransferItem {
  sku: string
  name: string
  from: InventoryNode
  to: InventoryNode
  units: number
  boxes: number
}

interface InboundPO {
  id: string
  po_number: string
  supplier: string
  eta: string
  status: string
  total_units: number
  line_items: { sku: string; units_ordered: number; units_received: number }[]
}

interface ExcessItem {
  sku: string
  name: string
  total_coverage: number
  total_available: number
  blended_sv: number
}

interface CommandCenterResponse {
  alerts: AlertItem[]
  ship_now: ShipNowItem[]
  reorder_now: ReorderItem[]
  transfers: TransferItem[]
  inbound: InboundPO[]
  excess: ExcessItem[]
  live_selling_skus: number
  live_skus_amazon: number
  live_skus_noon: number
  live_skus_minutes: number
  oos_pct_amazon: number
  oos_pct_noon: number
  oos_pct_minutes: number
  oos_pct_total: number
  oos_count_amazon: number
  oos_count_noon: number
  oos_count_minutes: number
  oos_count_total: number
  oos_skus_amazon: any[]
  oos_skus_noon: any[]
  oos_skus_minutes: any[]
  oos_skus_total_risk: any[]
  last_synced: string | null
  latest_snapshot_amazon: string | null
  latest_snapshot_noon: string | null
  latest_snapshot_minutes: string | null
  latest_snapshot_locad: string | null
  generated_at: string
}

function pct(num: number, den: number): number {
  return den > 0 ? Math.round((num / den) * 1000) / 10 : 0
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleDateString('en-AE', { month: 'short', day: 'numeric' })
  } catch {
    return '—'
  }
}

// ---------------------------------------------------------------------------
// Response headers — prevent browser/CDN caching of live inventory data
// ---------------------------------------------------------------------------
const noCacheHeaders = {
  ...corsHeaders,
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
  'Pragma': 'no-cache',
  'Expires': '0',
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------
serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  try {
    const supabase = getSupabaseClient(req)
    const url = new URL(req.url)
    const country = url.searchParams.get('country') || 'UAE'
    const accountId = url.searchParams.get('account_id') || null

    const { data, error } = await supabase.rpc('get_dashboard_data', {
      p_country: country,
      p_account_id: accountId
    })

    if (error) {
      throw error
    }

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: noCacheHeaders,
    })
  } catch (err) {
    console.error('dashboard: unhandled error', err)
    const errorDetail = err instanceof Error ? err.message : 
                       (typeof err === 'object' ? JSON.stringify(err) : String(err))
    return new Response(
      JSON.stringify({ error: 'Internal server error', detail: errorDetail }),
      {
        status: 500,
        headers: noCacheHeaders,
      }
    )
  }
})
