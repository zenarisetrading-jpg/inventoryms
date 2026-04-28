import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { api } from '../lib/api'
import type { CommandCenterResponse, InventoryNode, ActionFlag } from '../types'
import { navigate } from '../lib/router'
import { StatusBadge } from '../components/shared/StatusBadge'
import { ActionFlagBadge } from '../components/shared/ActionFlagBadge'
import { DrillDownModal } from '../components/DrillDownModal'
import { Search, Download, RefreshCw, PlusCircle, ShieldAlert, AlertCircle, TrendingUp, Activity, Package, MoveRight, ChevronDown, ChevronUp, Clock, Calendar, DownloadCloud, CheckCircle, ArrowRight, LayoutDashboard, AlertTriangle, Receipt } from 'lucide-react'
import { ActionDropdown } from '../components/ActionDropdown'

const NODE_LABEL: Record<InventoryNode, string> = {
  amazon_fba: 'Amazon FBA',
  noon_fbn: 'Noon FBN',
  locad_warehouse: 'Locad WH',
}

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function formatDate(iso: string): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-AE', { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatCovDays(days: any): string {
  const n = Number(days)
  if (days == null || !Number.isFinite(n) || n < 0) return '—'
  if (n === 0) return '0d'
  return `${n.toFixed(1)}d`
}

function coverageColor(days: number | null | undefined): string {
  if (days == null || !isFinite(days) || days <= 0) return 'text-red-600 font-black'
  if (days <= 7) return 'text-red-500 font-black'
  if (days <= 14) return 'text-orange-500 font-black'
  return 'text-primary font-black'
}

function toSafeNumber(value: unknown, fallback = 0): number {
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : fallback
}

function toNullableNumber(value: unknown): number | null {
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : null
}

function getMarketplace(coverageAmazon: number, coverageNoon: number): string {
  const amzRisk = coverageAmazon < 14
  const noonRisk = coverageNoon < 14
  if (amzRisk && noonRisk) return 'Both'
  if (amzRisk) return 'Amazon'
  if (noonRisk) return 'Noon'
  if (coverageAmazon === 0 && coverageNoon === 0) return 'Both'
  if (coverageAmazon === 0) return 'Amazon'
  if (coverageNoon === 0) return 'Noon'
  return 'Amazon'
}

// ─── KPI Tile ─────────────────────────────────────────────────────────────────

function KPITile({
  label,
  value,
  sub,
  urgent,
  accentColor,
  icon: Icon,
  onDoubleClick
}: {
  label: string
  value: number | string
  sub?: string
  urgent?: boolean
  accentColor: string
  icon: any
  onDoubleClick?: () => void
}) {
  return (
    <div 
      onDoubleClick={onDoubleClick}
      className={`bg-card border border-border-color rounded-xl p-4 shadow-sm border-l-[6px] ${accentColor} transition-all hover:shadow-md hover:scale-[1.02] cursor-pointer select-none`}
      title="Double-click to drill down"
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[10px] font-black text-muted uppercase tracking-[0.05em] mb-1">{label}</p>
          <p className={`text-2xl font-black font-data tracking-tight ${urgent && Number(value) > 0 ? 'text-red-600' : 'text-primary'}`}>
            {value}
          </p>
        </div>
        <div className={`p-2 rounded-lg bg-gray-50`}>
          <Icon className={`w-4 h-4 ${urgent && Number(value) > 0 ? 'text-red-500' : 'text-muted'}`} />
        </div>
      </div>
      {sub && <p className="text-[10px] font-medium text-muted/60 mt-2 flex items-center gap-1">
        <span className="w-1 h-1 rounded-full bg-slate-300" />
        {sub}
      </p>}
    </div>
  )
}

// ─── Inventory Health Bar ─────────────────────────────────────────────────────

function InventoryHealthBar({ data }: { data: CommandCenterResponse | null }) {
  if (!data || !data.alerts) return null

  const critical = (data.alerts || []).filter(a => a.action_flag === 'CRITICAL_OOS_RISK').length
  const oosRisk = (data.alerts || []).filter(a => a.action_flag === 'OOS_RISK').length
  const ship = (data.ship_now || []).length
  const reorder = (data.reorder_now || []).length
  const transfer = (data.transfers || []).length
  const excess = (data.excess || []).length

  const segments = [
    { count: critical, color: 'bg-red-500', label: 'Critical' },
    { count: oosRisk, color: 'bg-orange-400', label: 'Risk' },
    { count: ship, color: 'bg-brand-blue', label: 'Ship' },
    { count: reorder, color: 'bg-brand-amber', label: 'PO' },
    { count: transfer, color: 'bg-indigo-500', label: 'Xfer' },
    { count: excess, color: 'bg-slate-300', label: 'Excess' },
  ].filter(s => s.count > 0)

  const total = segments.reduce((s, seg) => s + seg.count, 0)
  if (total === 0) return null

  return (
    <div className="bg-card border border-border-color rounded-xl p-5 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[11px] font-black text-primary uppercase tracking-[0.1em] flex items-center gap-2">
          <Activity className="w-3.5 h-3.5 text-brand-blue" />
          Fleet Health Snapshot
        </h3>
        <span className="text-[10px] font-bold text-muted bg-slate-100 px-2 py-0.5 rounded-full uppercase">
          {total} Active Signals
        </span>
      </div>
      <div className="flex h-3.5 rounded-full overflow-hidden gap-0.5 bg-slate-100 p-0.5 border border-slate-200 shadow-inner">
        {segments.map(seg => (
          <div
            key={seg.label}
            className={`${seg.color} first:rounded-l-full last:rounded-r-full transition-all hover:brightness-110 cursor-help`}
            style={{ flex: seg.count }}
            title={`${seg.label}: ${seg.count}`}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-2 mt-3">
        {segments.map(seg => (
          <div key={seg.label} className="flex items-center gap-2">
            <span className={`w-2.5 h-2.5 rounded-sm ${seg.color} shadow-sm`} />
            <span className="text-[10px] font-bold text-muted uppercase tracking-wider">{seg.label} <span className="text-primary ml-1">{seg.count}</span></span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Section Card ─────────────────────────────────────────────────────────────

function SectionCard({
  title,
  count,
  accentColor,
  subtitle,
  children,
  extra,
  onDoubleClick,
  icon: Icon
}: {
  title: string
  count: number
  accentColor: string
  subtitle?: string
  children: React.ReactNode
  icon: any
  extra?: React.ReactNode
  onDoubleClick?: () => void
}) {
  const scrollRef = useRef<HTMLDivElement>(null)

  const scroll = (dir: 'up' | 'down') => {
    if (scrollRef.current) {
      scrollRef.current.scrollBy({ top: dir === 'up' ? -150 : 150, behavior: 'smooth' })
    }
  }

  return (
    <div 
      onDoubleClick={onDoubleClick}
      className="bg-card border border-border-color rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow cursor-default select-none relative group/card"
    >
      <div className={`px-4 py-2.5 border-b border-border-color border-l-[6px] ${accentColor} bg-slate-50/50 flex items-center justify-between`}>
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg bg-white shadow-sm`}>
            <Icon className={`w-4 h-4 ${accentColor.replace('border-l-', 'text-')}`} />
          </div>
          <div>
            <span className="text-xs font-black text-primary uppercase tracking-widest leading-none block">{title}</span>
            {subtitle && <p className="text-[10px] text-muted font-bold mt-1 uppercase tracking-widest opacity-70">{subtitle}</p>}
          </div>
        </div>
        <div className="flex items-center gap-3">
          {extra}
          <span className="text-[11px] font-black text-primary bg-white border border-border-color px-2.5 py-1 rounded-lg shrink-0 shadow-sm">
            {count}
          </span>
        </div>
      </div>
      
      <div ref={scrollRef} className="overflow-x-auto overflow-y-auto max-h-[400px] custom-scrollbar relative">
        {children}
      </div>

      {/* Floating Scroll Controls */}
      <div className="absolute bottom-4 right-4 flex flex-col gap-1.5 opacity-0 group-hover/card:opacity-100 transition-all translate-y-2 group-hover/card:translate-y-0 z-30">
        <button 
          onClick={(e) => { e.stopPropagation(); scroll('up') }}
          className="p-1.5 bg-white/90 backdrop-blur shadow-lg border border-border-color rounded-full text-muted hover:text-brand-blue hover:scale-110 transition-all active:scale-95"
          title="Scroll Up"
        >
          <ChevronUp className="w-4 h-4" />
        </button>
        <button 
          onClick={(e) => { e.stopPropagation(); scroll('down') }}
          className="p-1.5 bg-white/90 backdrop-blur shadow-lg border border-border-color rounded-full text-muted hover:text-brand-blue hover:scale-110 transition-all active:scale-95"
          title="Scroll Down"
        >
          <ChevronDown className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}

function SkeletonRow({ cols }: { cols: number }) {
  return (
    <tr>
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <div className="animate-pulse h-3 bg-slate-100 rounded-lg w-full" />
        </td>
      ))}
    </tr>
  )
}

function EmptyRow({ cols, message = 'No signals detected' }: { cols: number; message?: string }) {
  return (
    <tr>
      <td colSpan={cols} className="px-4 py-8 text-[11px] font-bold text-muted/40 text-center uppercase tracking-widest bg-slate-50/30">
        <div className="flex flex-col items-center gap-2">
          <ShieldAlert className="w-8 h-8 opacity-10" />
          {message}
        </div>
      </td>
    </tr>
  )
}

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return (
    <th
      className={`px-4 py-3 text-[10px] font-black text-muted uppercase tracking-[0.1em] ${right ? 'text-right' : 'text-left'}`}
    >
      {children}
    </th>
  )
}

function SKULink({ sku }: { sku: string }) {
  return (
    <button
      onClick={() => navigate('/sku/' + sku)}
      className="font-data text-[11px] font-black text-brand-blue hover:text-blue-800 transition-colors bg-blue-50/50 px-2 py-0.5 rounded border border-blue-100/50"
    >
      {sku}
    </button>
  )
}

function ActionTag({ action }: { action: 'SHIP' | 'REORDER' | 'TRANSFER' | 'EXCESS' | 'HOLD' }) {
  const cfg = {
    SHIP: 'bg-brand-blue/10 text-brand-blue border-brand-blue/20',
    REORDER: 'bg-brand-amber/10 text-brand-amber border-brand-amber/20',
    TRANSFER: 'bg-indigo-100 text-indigo-700 border-indigo-200',
    EXCESS: 'bg-orange-100 text-orange-700 border-orange-200',
    HOLD: 'bg-slate-100 text-slate-600 border-slate-200',
  }[action]
  return (
    <span className={`inline-block px-2.5 py-1 rounded-md text-[9px] font-black border uppercase tracking-widest ${cfg}`}>
      {action}
    </span>
  )
}

export default function CommandCenter() {
  const [data, setData] = useState<CommandCenterResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [syncError, setSyncError] = useState<string | null>(null)
  const [approvedPlans, setApprovedPlans] = useState<Set<string>>(new Set())
  const [rowStatuses, setRowStatuses] = useState<Record<string, string>>({})
  const [drillModal, setDrillModal] = useState<{ isOpen: boolean; title: string; type: any; data: any[] }>({
    isOpen: false,
    title: '',
    type: 'alerts',
    data: [],
  })

  const load = useCallback(() => {
    setLoading(true)
    api.getCommandCenter().then(res => {
      const resp = res as any
      if (resp.error) {
        resp.alerts = []
        resp.ship_now = []
        resp.reorder_now = []
        resp.transfers = []
        resp.inbound = []
        resp.excess = []
      }
      setData(resp as CommandCenterResponse)
      setLoading(false)
    })
  }, [])

  useEffect(() => {
    load()
    const interval = setInterval(load, 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [load])

  const handleSyncAll = async () => {
    setSyncing(true)
    setSyncError(null)
    const res = await api.triggerSync('all')
    setSyncing(false)
    const resAny = res as unknown as { error?: string }
    if (resAny.error) setSyncError(resAny.error)
    else load()
  }

  const handleRefreshFact = async () => {
    setRefreshing(true)
    setSyncError(null)
    const res = await api.refreshFactTable()
    setRefreshing(false)
    if ((res as any).error) setSyncError((res as any).error)
    else {
      // Maybe show a success toast? For now just reload
      load()
    }
  }

  const exportToCSV = (data: any[], fileName: string) => {
    if (!data || data.length === 0) return
    const headers = Object.keys(data[0]).join(',')
    const rows = data.map(obj => 
      Object.values(obj).map(v => `"${v}"`).join(',')
    )
    const csvContent = [headers, ...rows].join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    const url = URL.createObjectURL(blob)
    link.setAttribute('href', url)
    link.setAttribute('download', `${fileName}.csv`)
    link.style.visibility = 'hidden'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const handleApprove = (planKey: string) => {
    setApprovedPlans(prev => new Set([...prev, planKey]))
  }

  const shipNowRows = useMemo(() => {
    const rawRows = (data?.ship_now ?? []) as unknown as Record<string, unknown>[]
    const grouped = new Map<string, Record<string, unknown>>()

    for (const row of rawRows) {
      const sku = String(row.sku ?? '')
      if (!sku) continue
      const existing = grouped.get(sku)

      const incomingAmazon = toSafeNumber(
        row.suggested_boxes_amazon ?? (row.node === 'amazon_fba' ? row.boxes_to_ship : 0),
        0
      )
      const incomingNoon = toSafeNumber(
        row.suggested_boxes_noon ?? (row.node === 'noon_fbn' ? row.boxes_to_ship : 0),
        0
      )
      const incomingUnits = toSafeNumber(row.total_units_to_ship ?? row.units_to_ship, 0)

      if (!existing) {
        grouped.set(sku, {
          sku,
          name: row.name ?? sku,
          plan_date: row.plan_date ?? null,
          allocation_logic: row.allocation_logic ?? null,
          blended_sv: row.blended_sv ?? null,
          current_fba_stock_units: row.current_fba_stock_units ?? null,
          current_fbn_stock_units: row.current_fbn_stock_units ?? null,
          boxes_in_hand: row.boxes_in_hand ?? null,
          boxes_required_30d_amz: row.boxes_required_30d_amz ?? null,
          boxes_required_30d_noon: row.boxes_required_30d_noon ?? null,
          suggested_boxes_amazon: incomingAmazon,
          suggested_boxes_noon: incomingNoon,
          total_units_to_ship: incomingUnits,
        })
        continue
      }

      existing.suggested_boxes_amazon = toSafeNumber(existing.suggested_boxes_amazon, 0) + incomingAmazon
      existing.suggested_boxes_noon = toSafeNumber(existing.suggested_boxes_noon, 0) + incomingNoon
      existing.total_units_to_ship = toSafeNumber(existing.total_units_to_ship, 0) + incomingUnits

      if (!existing.allocation_logic && row.allocation_logic) existing.allocation_logic = row.allocation_logic
      if (existing.blended_sv == null && row.blended_sv != null) existing.blended_sv = row.blended_sv
      if (existing.current_fba_stock_units == null && row.current_fba_stock_units != null) {
        existing.current_fba_stock_units = row.current_fba_stock_units
      }
      if (existing.current_fbn_stock_units == null && row.current_fbn_stock_units != null) {
        existing.current_fbn_stock_units = row.current_fbn_stock_units
      }
      if (existing.boxes_in_hand == null && row.boxes_in_hand != null) existing.boxes_in_hand = row.boxes_in_hand
      if (existing.boxes_required_30d_amz == null && row.boxes_required_30d_amz != null) {
        existing.boxes_required_30d_amz = row.boxes_required_30d_amz
      }
      if (existing.boxes_required_30d_noon == null && row.boxes_required_30d_noon != null) {
        existing.boxes_required_30d_noon = row.boxes_required_30d_noon
      }
    }

    return Array.from(grouped.values()) as Array<Record<string, unknown>>
  }, [data?.ship_now])

  const totalShipUnits = shipNowRows.reduce((s, item) => s + toSafeNumber(item.total_units_to_ship, 0), 0)
  const totalShipBoxesAmazon = shipNowRows.reduce((s, item) => s + toSafeNumber(item.suggested_boxes_amazon, 0), 0)
  const totalShipBoxesNoon = shipNowRows.reduce((s, item) => s + toSafeNumber(item.suggested_boxes_noon, 0), 0)
  const totalReorderUnits = (data?.reorder_now ?? []).reduce((s, i) => s + (i.suggested_units ?? 0), 0)
  const criticalCount = (data?.alerts ?? []).filter(a => a.action_flag === 'CRITICAL_OOS_RISK').length
  const oosRiskCount = (data?.alerts ?? []).filter(a => a.action_flag === 'OOS_RISK').length

  return (
    <div className="space-y-6 w-full mx-auto">
      {/* Premium Dashboard Header */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between border-b border-sidebar/10 pb-6 mb-2 gap-4">
        <div className="flex flex-col">
          <h1 className="text-2xl lg:text-3xl font-black text-sidebar tracking-tighter uppercase">Command Center</h1>
          <div className="flex items-center gap-2 mt-2">
            <LayoutDashboard className="w-3.5 h-3.5 text-brand-blue" />
            <span className="text-[9px] lg:text-[10px] font-black text-muted uppercase tracking-[0.2em]">Regional Logistics Controller</span>
            {data?.last_synced && (
              <span className="text-[9px] lg:text-[10px] font-bold text-muted/60 flex items-center gap-1 before:content-['·'] before:mr-1 uppercase">
                Systems Sync: {formatRelativeTime(data.last_synced)}
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex flex-col items-start lg:items-end mr-2">
            <span className="text-[9px] font-black text-muted uppercase tracking-widest">Global Status</span>
            <div className="flex items-center gap-1.5 mt-1">
              <span className="w-2 h-2 rounded-full bg-green-500 shadow-sm shadow-green-200 animate-pulse" />
              <span className="text-[10px] font-black text-sidebar uppercase">Amazon API Live</span>
            </div>
          </div>
          <button
            onClick={handleRefreshFact}
            disabled={refreshing || syncing}
            className="flex-1 sm:flex-none px-4 lg:px-6 py-2.5 text-[10px] lg:text-[11px] font-black border border-slate-200 bg-white text-primary rounded-xl hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all uppercase tracking-widest flex items-center justify-center gap-2"
          >
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </button>
          <button
            onClick={handleSyncAll}
            disabled={syncing || refreshing}
            className="flex-1 sm:flex-none px-4 lg:px-6 py-2.5 text-[10px] lg:text-[11px] font-black border border-brand-blue bg-brand-blue text-white rounded-xl hover:shadow-lg hover:shadow-brand-blue/30 disabled:opacity-50 disabled:cursor-not-allowed transition-all uppercase tracking-widest flex items-center justify-center gap-2"
          >
            {syncing ? 'Syncing...' : 'Full Sync'}
          </button>
        </div>
      </div>

      {syncError && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-[11px] font-black px-5 py-3 rounded-xl flex items-center gap-3 uppercase tracking-wider">
          <AlertTriangle className="w-4 h-4" />
          Protocol Error: {syncError}
        </div>
      )}

      {data && 'error' in data && (
        <div className="p-6 bg-red-50 text-red-600 rounded-xl border border-red-100 flex items-start gap-4 shadow-sm">
          <AlertCircle className="w-6 h-6 text-red-500 shrink-0 mt-1" />
          <div className="flex-1">
            <h3 className="text-sm font-black text-red-700 uppercase tracking-wider">Channel Integration Error</h3>
            <p className="text-[11px] mt-1 text-red-600/80 font-medium leading-relaxed">System failed to establish handshake with Supabase Edge Functions. {(data as any).error}</p>
            <div className="flex gap-4 mt-4">
              <button onClick={load} className="px-4 py-2 bg-red-600 text-white rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-red-700 transition-colors">
                Reconnect
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── KPI TILES ─────────────────────────────────────────────────────── */}
      {!loading && data && (
        <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-4">
            <KPITile
              label="Critical Stocks"
              value={criticalCount}
              sub="Both FBA and FBN OOS"
              urgent={criticalCount > 0}
              accentColor="border-l-red-500"
              icon={ShieldAlert}
              onDoubleClick={() => setDrillModal({
                isOpen: true,
                title: 'Critical Stocks (OOS)',
                type: 'alerts',
                data: (data?.alerts ?? []).filter(a => a.action_flag === 'CRITICAL_OOS_RISK')
              })}
            />
            <KPITile
              label="Risk of OOS"
              value={oosRiskCount}
              sub="<14 days coverage"
              urgent={oosRiskCount > 0}
              accentColor="border-l-orange-400"
              icon={AlertCircle}
              onDoubleClick={() => setDrillModal({
                isOpen: true,
                title: 'Short-term Stock Risk',
                type: 'alerts',
                data: (data?.alerts ?? []).filter(a => a.action_flag === 'OOS_RISK')
              })}
            />
            <KPITile
              label="Ship Pending"
              value={data.ship_now.length}
              sub={`${totalShipUnits} Units staged - Send to FBA and FBN`}
              accentColor="border-l-brand-blue"
              icon={MoveRight}
              onDoubleClick={() => setDrillModal({
                isOpen: true,
                title: 'Replenishment Staging',
                type: 'ship_now',
                data: shipNowRows
              })}
            />
            <KPITile
              label="Procurement"
              value={data.reorder_now.length}
              sub="Suggested Reorders"
              accentColor="border-l-brand-amber"
              icon={PlusCircle}
              onDoubleClick={() => setDrillModal({
                isOpen: true,
                title: 'Procurement Requirements',
                type: 'reorder_now',
                data: data?.reorder_now ?? []
              })}
            />
            <KPITile
              label="AMZ OOS Rate"
              value={`${(data.oos_pct_amazon ?? 0).toFixed(1)}%`}
              sub={`${data.oos_count_amazon ?? 0} SKUs OOS`}
              accentColor="border-l-indigo-400"
              icon={TrendingUp}
              onDoubleClick={() => setDrillModal({
                isOpen: true,
                title: 'Amazon OOS Catalog',
                type: 'oos_amazon',
                data: data?.oos_skus_amazon ?? []
              })}
            />
            <KPITile
              label="Noon OOS Rate"
              value={`${(data.oos_pct_noon ?? 0).toFixed(1)}%`}
              sub={`${data.oos_count_noon ?? 0} SKUs OOS`}
              accentColor="border-l-purple-400"
              icon={TrendingUp}
              onDoubleClick={() => setDrillModal({
                isOpen: true,
                title: 'Noon OOS Catalog',
                type: 'oos_noon',
                data: data?.oos_skus_noon ?? []
              })}
            />
            <KPITile
              label="Fleet Health"
              value={`${(100 - (data.oos_pct_total ?? 0)).toFixed(1)}%`}
              sub="Global Availability"
              accentColor="border-l-emerald-400"
              icon={Activity}
              onDoubleClick={() => setDrillModal({
                isOpen: true,
                title: 'Global OOS Catalog',
                type: 'oos_total',
                data: [
                  ...(data?.oos_skus_amazon ?? []),
                  ...(data?.oos_skus_noon ?? [])
                ].reduce((acc, current) => {
                  if (!acc.find(i => i.sku === current.sku)) acc.push(current)
                  return acc
                }, [] as any[])
              })}
            />
          </div>
          <div className="flex items-center gap-4 text-[9px] font-black text-muted/60 uppercase tracking-[0.2em] px-1">
            <span>Snapshot Engine:</span>
            <div className="flex gap-4">
              <span className="flex items-center gap-1.5"><Package className="w-3 h-3" /> Amazon {data.latest_snapshot_amazon ?? '—'}</span>
              <span className="flex items-center gap-1.5"><TrendingUp className="w-3 h-3" /> Noon {data.latest_snapshot_noon ?? '—'}</span>
              <span className="flex items-center gap-1.5"><ShieldAlert className="w-3 h-3" /> Locad {data.latest_snapshot_locad ?? '—'}</span>
            </div>
          </div>
        </div>
      )}

      {/* KPI skeleton */}
      {loading && (
        <div className="grid grid-cols-2 lg:grid-cols-7 gap-4">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="bg-card border border-border-color rounded-xl p-5 border-l-[6px] border-l-slate-200 animate-pulse">
              <div className="h-2.5 bg-slate-100 rounded w-2/3 mb-3" />
              <div className="h-8 bg-slate-100 rounded w-1/2" />
            </div>
          ))}
        </div>
      )}
      {/* ── HEALTH BAR ────────────────────────────────────────────────────── */}
      {!loading && <InventoryHealthBar data={data} />}

      {/* ── GRID SYSTEM ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 pb-20">
        
        {/* CRITICAL ALERTS */}
        <SectionCard
          title="High Priority Stockouts"
          count={data?.alerts.length ?? 0}
          accentColor="border-l-red-500"
          icon={ShieldAlert}
          subtitle="Immediate replenishment required to prevent revenue loss"
          onDoubleClick={() => setDrillModal({
            isOpen: true,
            title: 'Critical Stockout Alerts',
            type: 'alerts',
            data: data?.alerts ?? []
          })}
          extra={(
            <button 
              onClick={() => exportToCSV(data?.alerts || [], 'high_priority_stockouts')}
              className="px-3 py-1 text-[9px] font-black uppercase text-muted hover:text-primary transition-colors flex items-center gap-1 border border-slate-100 rounded-md hover:border-slate-200"
            >
              <Download className="w-3 h-3" /> Download ALL
            </button>
          )}
        >
          <>
            <table className="w-full text-sm">
              <thead className="bg-slate-50/80 sticky top-0 z-10 backdrop-blur-md">
                <tr>
                  <Th>SKU</Th>
                  <Th>Coverage</Th>
                  <Th right>AMZ</Th>
                  <Th right>Noon</Th>
                  <Th>Risk State</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-color/50 bg-white">
                {loading ? <SkeletonRow cols={5} /> : (data?.alerts.length ?? 0) === 0 ? <EmptyRow cols={5} /> : (
                  data?.alerts.map(a => (
                    <tr key={a.sku} className="hover:bg-slate-50/50 transition-colors group">
                      <td className="px-4 py-2.5">
                        <div className="flex flex-col">
                          <SKULink sku={a.sku} />
                          <span className="text-[10px] font-medium text-muted mt-0.5 truncate max-w-[180px]">{a.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="text-[10px] font-black text-muted uppercase">
                          {getMarketplace(a.coverage_amazon ?? 99, a.coverage_noon ?? 99)}
                        </span>
                      </td>
                      <td className={`px-4 py-2.5 text-right font-data text-[11px] ${coverageColor(a.coverage_amazon)}`}>
                        {formatCovDays(a.coverage_amazon)}
                      </td>
                      <td className={`px-4 py-2.5 text-right font-data text-[11px] ${coverageColor(a.coverage_noon)}`}>
                        {formatCovDays(a.coverage_noon)}
                      </td>
                      <td className="px-4 py-2.5">
                        <ActionFlagBadge flag={a.action_flag as ActionFlag} />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </>
        </SectionCard>

        {/* SHIP NOW */}
        <SectionCard
          title="Staged Replenishment"
          count={data?.ship_now.length ?? 0}
          accentColor="border-l-brand-blue"
          icon={MoveRight}
          subtitle={`${totalShipUnits} units prepared for channel distribution`}
          onDoubleClick={() => setDrillModal({
            isOpen: true,
            title: 'Full Replenishment Staging',
            type: 'ship_now',
            data: shipNowRows
          })}
          extra={(
            <button 
              onClick={() => exportToCSV(data?.ship_now || [], 'staged_replenishment')}
              className="px-3 py-1 text-[9px] font-black uppercase text-muted hover:text-primary transition-colors flex items-center gap-1 border border-slate-100 rounded-md hover:border-slate-200"
            >
              <Download className="w-3 h-3" /> Download ALL
            </button>
          )}
        >
          <>
            <table className="w-full text-xs">
              <thead className="bg-slate-50/80 sticky top-0 z-10 backdrop-blur-md">
                <tr>
                  <Th>SKU</Th>
                  <Th right>SV</Th>
                  <Th right>Staged</Th>
                  <Th right>Boxes</Th>
                  <Th>Protocol</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-color/50 bg-white">
                {loading ? <SkeletonRow cols={5} /> : shipNowRows.length === 0 ? <EmptyRow cols={5} /> : (
                  shipNowRows.map((row, idx) => {
                    const sku = String(row.sku ?? '')
                    const sugAmz = toSafeNumber(row.suggested_boxes_amazon, 0)
                    const sugNoon = toSafeNumber(row.suggested_boxes_noon, 0)
                    return (
                      <tr key={`${sku}-${idx}`} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-4 py-2.5">
                          <div className="flex flex-col">
                            <SKULink sku={sku} />
                            <span className="text-[10px] font-medium text-muted mt-0.5 truncate max-w-[150px]">{String(row.name)}</span>
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-right font-data text-[11px] font-bold text-primary">
                          {toSafeNumber(row.blended_sv).toFixed(1)}
                        </td>
                        <td className="px-4 py-2.5 text-right font-data text-[11px] font-black text-brand-blue">
                          {toSafeNumber(row.total_units_to_ship)}
                        </td>
                        <td className="px-4 py-2.5 text-right font-data text-[11px] text-muted">
                          {sugAmz + sugNoon}
                        </td>
                        <td className="px-4 py-2.5">
                          <ActionDropdown 
                            currentStatus={rowStatuses[`${sku}-${idx}`] || 'shipped'} 
                            onStatusChange={(newStatus) => setRowStatuses(prev => ({ ...prev, [`${sku}-${idx}`]: newStatus }))}
                          />
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </>
        </SectionCard>

        {/* REORDER NOW */}
        <SectionCard
          title="Procurement Orders"
          count={data?.reorder_now.length ?? 0}
          accentColor="border-l-brand-amber"
          icon={PlusCircle}
          subtitle="New supply required to satisfy forecasted demand"
          onDoubleClick={() => setDrillModal({
            isOpen: true,
            title: 'Full Procurement Requirements',
            type: 'reorder_now',
            data: data?.reorder_now ?? []
          })}
          extra={(
            <button 
              onClick={() => exportToCSV(data?.reorder_now || [], 'procurement_orders')}
              className="px-3 py-1 text-[9px] font-black uppercase text-muted hover:text-primary transition-colors flex items-center gap-1 border border-slate-100 rounded-md hover:border-slate-200"
            >
              <Download className="w-3 h-3" /> Download ALL
            </button>
          )}
        >
          <>
            <table className="w-full text-sm">
              <thead className="bg-slate-50/50">
                <tr>
                  <Th>SKU</Th>
                  <Th right>Req. Units</Th>
                  <Th right>Cost</Th>
                  <Th right>Coverage</Th>
                  <Th>Action</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-color/50 bg-white">
                {loading ? <SkeletonRow cols={4} /> : (data?.reorder_now.length ?? 0) === 0 ? <EmptyRow cols={4} /> : (
                  data?.reorder_now.map(r => (
                    <tr key={r.sku} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-2.5"><SKULink sku={r.sku} /></td>
                      <td className="px-4 py-2.5 text-right font-data text-[11px] font-black text-primary">{r.suggested_units}</td>
                      <td className="px-4 py-2.5 text-right font-data text-[11px] font-black text-emerald-600">
                        {Number(r.total_cost_aed || (r.suggested_units * (r.cogs || 0))).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </td>
                      <td className={`px-4 py-2.5 text-right font-data text-[11px] ${coverageColor(r.projected_coverage)}`}>{formatCovDays(r.projected_coverage)}</td>
                      <td className="px-4 py-2.5">
                        <button onClick={() => navigate('/po')} className="text-[9px] font-black uppercase text-brand-blue hover:underline">Draft PO</button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </>
        </SectionCard>

        {/* INCOMING SUPPLY */}
        <SectionCard
          title="Supply in Transit"
          count={data?.inbound?.length ?? 0}
          accentColor="border-l-emerald-500"
          icon={Receipt}
          subtitle="Purchase orders currently being processed or in transit"
          onDoubleClick={() => setDrillModal({
            isOpen: true,
            title: 'Full Inbound Supply Chain',
            type: 'inbound',
            data: data?.inbound ?? []
          })}
          extra={(
            <button 
              onClick={() => exportToCSV(data?.inbound || [], 'supply_in_transit')}
              className="px-3 py-1 text-[9px] font-black uppercase text-muted hover:text-primary transition-colors flex items-center gap-1 border border-slate-100 rounded-md hover:border-slate-200"
            >
              <Download className="w-3 h-3" /> Download ALL
            </button>
          )}
        >
          <>
            <table className="w-full text-sm">
              <thead className="bg-slate-50/50">
                <tr>
                  <Th>PO #</Th>
                  <Th>SKU</Th>
                  <Th right>Units</Th>
                  <Th>ETA</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-color/50 bg-white">
                {loading ? <SkeletonRow cols={4} /> : (data?.inbound?.length ?? 0) === 0 ? <EmptyRow cols={4} /> : (
                  data?.inbound?.flatMap((b: any) => (b.line_items ?? []).map((li: any) => ({
                    po: b.po_number,
                    sku: li.sku,
                    units: li.units_ordered,
                    eta: b.eta
                  }))).map((row: any) => (
                    <tr key={`${row.po}-${row.sku}`} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-2.5 font-data text-[10px] font-bold text-muted">{row.po}</td>
                      <td className="px-4 py-2.5"><SKULink sku={row.sku} /></td>
                      <td className="px-4 py-2.5 text-right font-data text-[11px] text-primary">{row.units}</td>
                      <td className="px-4 py-2.5 text-[10px] font-bold text-muted">{formatDate(row.eta)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </>
        </SectionCard>
      </div>

      <DrillDownModal 
        isOpen={drillModal.isOpen}
        title={drillModal.title}
        type={drillModal.type}
        data={drillModal.data}
        onClose={() => setDrillModal(prev => ({ ...prev, isOpen: false }))}
      />
    </div>
  )
}
