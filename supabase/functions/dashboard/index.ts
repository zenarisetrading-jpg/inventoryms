import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { corsHeaders } from '../_shared/cors.ts'
import { getSupabaseAdmin } from '../_shared/supabase.ts'
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
  current_fba_stock_units: number
  current_fbn_stock_units: number
  boxes_in_hand: number
  boxes_required_30d_amz: number
  boxes_required_30d_noon: number
  suggested_boxes_amazon: number
  suggested_boxes_noon: number
  total_boxes_to_ship: number
  total_units_to_ship: number
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
  oos_pct_amazon: number
  oos_pct_noon: number
  oos_pct_total: number
  oos_count_amazon: number
  oos_count_noon: number
  oos_count_total: number
  oos_skus_amazon: { sku: string; name: string; blended_sv: number; coverage_amazon: number; coverage_noon: number }[]
  oos_skus_noon: { sku: string; name: string; blended_sv: number; coverage_amazon: number; coverage_noon: number }[]
  latest_snapshot_amazon: string | null
  latest_snapshot_noon: string | null
  latest_snapshot_locad: string | null
  last_synced: string | null
  total_oos_risk: {
    sku: string
    name: string
    category: string
    product_category: string
    sub_category: string
    blended_sv: number
    suggested_units: number
    total_cost_aed: number
  }[]
  generated_at: string
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
    const supabase = getSupabaseAdmin()

    // 1. Fetch data from fact_inventory_planning and sku_master separately to avoid relationship issues
    const [factRes, masterRes] = await Promise.all([
      supabase.from('fact_inventory_planning').select('*'),
      supabase.from('sku_master').select('sku, name, category, lead_time_days, cogs, is_active')
    ])

    if (factRes.error) throw factRes.error
    if (masterRes.error) throw masterRes.error

    const factRows = factRes.data || []
    interface SKUInfo { sku: string; name: string; category: string; lead_time_days: number; cogs: number; is_active: boolean }
    const masterMap = new Map<string, SKUInfo>(
      (masterRes.data as SKUInfo[] || []).filter(m => m.is_active).map(m => [m.sku.trim().toUpperCase(), m])
    )

    // 2. Fetch Inbound POs (still needed from separate table)
    const { data: inboundRows } = await supabase
      .from('po_register')
      .select('id, po_number, supplier, eta, status, po_line_items(sku, units_ordered, units_received)')
      .in('status', INCOMING_PO_STATUSES)
      .order('eta', { ascending: true })

    // 3. Last synced & snapshot dates (still from snapshots)
    const [latestSnapshot, snapDates] = await Promise.all([
      supabase.from('inventory_snapshot').select('synced_at').order('synced_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('inventory_snapshot').select('node, snapshot_date').order('snapshot_date', { ascending: false })
    ])

    const latestDateByNode: Record<string, string> = {}
    if (snapDates.data) {
      for (const r of snapDates.data) {
        if (!latestDateByNode[r.node]) latestDateByNode[r.node] = r.snapshot_date
      }
    }

    // --- PROCESS FACT DATA ---
    const alerts: AlertItem[] = []
    const ship_now: ShipNowItem[] = []
    const reorder_now: ReorderItem[] = []
    
    // Summary counters for KPI Cards
    let amzLiveCount = 0; let amzOOSCount = 0
    let noonLiveCount = 0; let noonOOSCount = 0
    let totalLiveCount = 0; let totalOOSCount = 0
    const oos_skus_amazon: any[] = []
    const oos_skus_noon: any[] = []
    const oos_skus_total_risk: any[] = []

    for (const r of factRows || []) {
      const skuMeta = masterMap.get(r.sku.trim().toUpperCase())
      if (!skuMeta) continue // skip inactive or unknown skus

      const blended_sv = Number(r.blended_sv || 0)
      const amazon_sv = Number(r.amazon_sv || 0)
      const noon_sv = Number(r.noon_sv || 0)
      const fba_units = Number(r.fba_units || 0)
      const fbn_units = Number(r.fbn_units || 0)
      const amz_cov = Number(r.amazon_coverage || 0)
      const noon_cov = Number(r.noon_coverage || 0)
      const fba_boxes = Number(r.fba_boxes || 0)
      const fbn_boxes = Number(r.fbn_boxes || 0)
      const reorder_qty = Number(r.suggested_reorder_qty || 0)

      // 1. Map Alerts & Counters
      const isCritical = amz_cov === 0 && noon_cov === 0 && (amazon_sv > 0 || noon_sv > 0)
      const isStockRisk = (amz_cov > 0 && amz_cov < 14) || (noon_cov > 0 && noon_cov < 14)

      if (isCritical || isStockRisk) {
        alerts.push({
          sku: r.sku,
          name: skuMeta.name,
          action_flag: isCritical ? 'CRITICAL_OOS_RISK' : 'OOS_RISK',
          total_coverage: Number(r.total_coverage || 0),
          coverage_amazon: amz_cov,
          coverage_noon: noon_cov,
          coverage_warehouse: Number(r.locad_units / (blended_sv || 1)),
          blended_sv
        })
      }

      // 2. Ship Now (either fba boxes or fbn boxes > 0)
      if (fba_boxes > 0 || fbn_boxes > 0) {
        ship_now.push({
          sku: r.sku,
          name: skuMeta.name,
          allocation_logic: isCritical ? 'CRITICAL PRIORITIZED' : 'STANDARD REPLENISHMENT',
          blended_sv,
          current_fba_stock_units: fba_units,
          current_fbn_stock_units: fbn_units,
          boxes_in_hand: Number(r.locad_boxes || 0),
          boxes_required_30d_amz: Math.ceil(Number(r.amazon_sv * 30) / Math.max(1, r.units_per_box)),
          boxes_required_30d_noon: Math.ceil(Number(r.noon_sv * 30) / Math.max(1, r.units_per_box)),
          suggested_boxes_amazon: fba_boxes,
          suggested_boxes_noon: fbn_boxes,
          total_boxes_to_ship: fba_boxes + fbn_boxes,
          total_units_to_ship: Number(r.send_to_fba_units || 0) + Number(r.send_to_fbn_units || 0),
          plan_date: new Date().toISOString()
        })
      }

      // 3. Reorder Now (suggested_reorder_qty > 0)
      if (reorder_qty > 0) {
        reorder_now.push({
          sku: r.sku,
          name: skuMeta.name,
          category: r.category,
          should_reorder: true,
          suggested_units: reorder_qty,
          projected_coverage: Number(r.total_coverage || 0),
          blended_sv,
          lead_time_days: skuMeta.lead_time_days || 30,
          moq: Number(r.moq || 0),
          cogs: Number(skuMeta.cogs || 0)
        })
      }

      // 4. OOS Metrics (Simplified to show all possible SKUs)
      amzLiveCount++
      if (fba_units <= 0) {
        amzOOSCount++
        oos_skus_amazon.push({
          sku: r.sku,
          name: skuMeta.name,
          blended_sv,
          coverage_amazon: 0,
          coverage_noon: noon_cov
        })
      }

      noonLiveCount++
      if (fbn_units <= 0) {
        noonOOSCount++
        oos_skus_noon.push({
          sku: r.sku,
          name: skuMeta.name,
          blended_sv,
          coverage_amazon: amz_cov,
          coverage_noon: 0
        })
      }

      totalLiveCount++
      if ((fba_units + fbn_units) <= 0) {
        totalOOSCount++
      }

      // 5. Total Fleet Risk (Both OOS + Total Coverage < 14)
      const total_cov = Number(r.total_coverage || 0)
      if (fba_units <= 0 && fbn_units <= 0 && total_cov < 14) {
        oos_skus_total_risk.push({
          sku: r.sku,
          name: skuMeta.name,
          category: r.category,
          product_category: r.product_category,
          sub_category: r.sub_category,
          blended_sv,
          suggested_units: reorder_qty,
          total_cost_aed: reorder_qty * (skuMeta.cogs || 0)
        })
      }
    }


    const pct = (num: number, den: number) => (den > 0 ? Math.round((num / den) * 1000) / 10 : 0)

    const response: CommandCenterResponse = {
      alerts: alerts.sort((a,b) => a.total_coverage - b.total_coverage),
      ship_now: ship_now.sort((a,b) => b.total_units_to_ship - a.total_units_to_ship),
      reorder_now: reorder_now.sort((a,b) => a.projected_coverage - b.projected_coverage),
      transfers: [], // Transfers are now implicitly covered by ship_now in this MVP version
      inbound: (inboundRows || []).map((po: any) => ({
        id: po.id,
        po_number: po.po_number,
        supplier: po.supplier,
        eta: po.eta,
        status: po.status,
        total_units: (po.po_line_items || []).reduce((s: number, li: any) => s + (li.units_ordered - (li.units_received || 0)), 0),
        line_items: po.po_line_items || []
      })),
      excess: [], // Fact table doesn't explicitly flag excess yet in this version
      live_selling_skus: totalLiveCount,
      live_skus_amazon: amzLiveCount,
      live_skus_noon: noonLiveCount,
      oos_pct_amazon: pct(amzOOSCount, amzLiveCount),
      oos_pct_noon: pct(noonOOSCount, noonLiveCount),
      oos_pct_total: pct(totalOOSCount, totalLiveCount),
      oos_count_amazon: amzOOSCount,
      oos_count_noon: noonOOSCount,
      oos_count_total: totalOOSCount,
      oos_skus_amazon: oos_skus_amazon.sort((a,b) => b.blended_sv - a.blended_sv),
      oos_skus_noon: oos_skus_noon.sort((a,b) => b.blended_sv - a.blended_sv),
      latest_snapshot_amazon: latestDateByNode['amazon_fba'] || null,
      latest_snapshot_noon: latestDateByNode['noon_fbn'] || null,
      latest_snapshot_locad: latestDateByNode['locad_warehouse'] || null,
      last_synced: latestSnapshot.data?.synced_at || null,
      total_oos_risk: oos_skus_total_risk.sort((a,b) => b.blended_sv - a.blended_sv),
      generated_at: new Date().toISOString(),
    }

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('dashboard: unhandled error', err)
    return new Response(
      JSON.stringify({ error: 'Internal server error', detail: String(err) }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }
})
