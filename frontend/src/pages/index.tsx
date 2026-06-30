import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { api } from '../lib/api'
import type { CommandCenterResponse, InventoryNode, ActionFlag } from '../types'
import { navigate } from '../lib/router'
import { StatusBadge } from '../components/shared/StatusBadge'
import { ActionFlagBadge } from '../components/shared/ActionFlagBadge'
import { DrillDownModal } from '../components/shared/DrillDownModal'
import { Search, Download, RefreshCw, PlusCircle, ShieldAlert, AlertCircle, TrendingUp, Activity, Package, MoveRight, ChevronDown, ChevronUp, Clock, Calendar, DownloadCloud, CheckCircle, ArrowRight, LayoutDashboard, AlertTriangle, Receipt, X } from 'lucide-react'
import { ActionDropdown } from '../components/shared/ActionDropdown'
import { LoadingScreen } from '../components/shared/LoadingScreen'
import { useRegion } from '../lib/RegionContext'

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
  return 'text-white font-bold'
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
      className={`bg-white/5 border border-white/10 rounded-2xl p-3 sm:p-4 shadow-sm border-l-[4px] lg:border-l-[6px] ${accentColor} transition-all hover:scale-[1.02] cursor-pointer select-none`}
      title="Double-click to drill down"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[12px] lg:text-[12px] font-black text-white uppercase tracking-[0.05em] mb-1 truncate">{label}</p>
          <p className="text-xl lg:text-2xl font-black font-data text-white tracking-tight leading-none">
            {value}
          </p>
        </div>
        <div className="bg-white/5 border border-white/10 rounded-lg p-2 shadow-sm transition-all shrink-0">
          <Icon className="w-3.5 h-3.5 lg:w-4 lg:h-4 text-white" />
        </div>
      </div>
      {sub && <p className="text-[12px] lg:text-[12px] font-bold text-white mt-1.5 lg:mt-2 flex items-center gap-1 leading-tight">
        <span className="w-1 h-1 rounded-full bg-white shrink-0" />
        <span className="truncate">{sub}</span>
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
    { count: oosRisk, color: 'bg-amber-500', label: 'Risk' },
    { count: ship, color: 'bg-blue-500', label: 'Ship' },
    { count: reorder, color: 'bg-amber-400', label: 'PO' },
    { count: transfer, color: 'bg-blue-400', label: 'Xfer' },
    { count: excess, color: 'bg-orange-400', label: 'Excess' },
  ].filter(s => s.count > 0)

  const total = segments.reduce((s, seg) => s + seg.count, 0)
  if (total === 0) return null

  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-4 sm:p-5 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[13px] font-black text-zinc-500 uppercase tracking-[0.1em] flex items-center gap-2">
          <Activity className="w-3.5 h-3.5 text-zinc-400" />
          Fleet Health Snapshot
        </h3>
        <span className="text-[12px] font-black text-white bg-white/5 px-3 py-1 rounded-full uppercase tracking-widest border border-white/10 shadow-sm">
          {total} Active Signals
        </span>
      </div>
      <div className="flex h-2.5 rounded-full overflow-hidden gap-0.5 bg-white/5 border border-white/5">
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
            <span className="text-[12px] font-bold text-muted uppercase tracking-wider">{seg.label} <span className="text-primary ml-1">{seg.count}</span></span>
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
      className="bg-card border-white/5 shadow-sm overflow-hidden flex flex-col max-h-[calc(100vh-210px)] rounded-2xl border"
    >
      <div className={`px-3 sm:px-4 py-2 sm:py-2.5 border-b border-white/5 border-l-[4px] lg:border-l-[6px] ${accentColor} bg-white/5 flex items-center justify-between`}>
        <div className="flex items-center gap-3">
          <div className={`bg-white/10 border-white/10 rounded-lg p-2 shadow-inner group-hover:bg-white/20 transition-all`}>
            <Icon className={`w-4 h-4 ${accentColor.replace('border-l-', 'text-')}`} />
          </div>
          <div>
            <span className="text-xs font-black text-primary uppercase tracking-widest leading-none block">{title}</span>
            {subtitle && <p className="text-[12px] text-muted font-bold mt-1 uppercase tracking-widest opacity-70">{subtitle}</p>}
          </div>
        </div>
        <div className="flex items-center gap-3">
          {extra}
          <span className="text-[13px] font-black text-white bg-white/5 border border-white/10 px-2.5 py-1 rounded-lg shrink-0 shadow-sm">
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
    <tr className="group hover:bg-white/10 transition-colors">
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-4 py-3"><div className="animate-pulse h-3 bg-slate-100 rounded-lg w-full" /></td>
      ))}
    </tr>
  )
}

function EmptyRow({ cols, message = 'No signals detected' }: { cols: number; message?: string }) {
  return (
    <tr className="group hover:bg-white/10 transition-colors">
      <td colSpan={cols} className="px-4 py-8 text-[13px] font-bold text-zinc-500 text-center uppercase tracking-widest bg-white/5"><div className="flex flex-col items-center gap-2">
          <ShieldAlert className="w-8 h-8 opacity-20" />
          {message}
        </div></td>
    </tr>
  )
}

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return (
    <th
      className="px-4 py-3 text-[12px] font-black text-white uppercase tracking-[0.1em] text-center"
    >
      {children}
    </th>
  )
}

function SKULink({ sku }: { sku: string }) {
  return (
    <button
      onClick={() => navigate('/sku/' + sku)}
      className="bg-brand-blue/10 border-brand-blue/20 text-brand-blue hover:text-white transition-colors px-2 py-0.5 rounded border group-hover:text-white group-hover:bg-brand-blue/30"
    >
      {sku}
    </button>
  )
}

function ActionTag({ action }: { action: 'SHIP' | 'REORDER' | 'TRANSFER' | 'EXCESS' | 'HOLD' }) {
  const cfg = {
    SHIP: 'bg-blue-50 text-blue-600 border-blue-200',
    REORDER: 'bg-amber-50 text-amber-600 border-amber-200',
    TRANSFER: 'bg-blue-50 text-blue-600 border-blue-200',
    EXCESS: 'bg-amber-50 text-amber-600 border-amber-200',
    HOLD: 'bg-emerald-50 text-emerald-600 border-emerald-200',
  }[action]
  return (
    <span className={`inline-block px-2.5 py-1 rounded-md text-[12px] font-black border uppercase tracking-widest ${cfg}`}>
      {action}
    </span>
  )
}

export default function CommandCenter() {
  const [data, setData] = useState<CommandCenterResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [syncStep, setSyncStep] = useState<string | null>(null)
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

  const { region } = useRegion()

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
  }, [region])

  useEffect(() => {
    load()
    const interval = setInterval(load, 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [load])

  const handleSyncAll = async () => {
    setSyncing(true)
    setSyncError(null)
    
    try {
      setSyncStep('1/3: Amazon & Locad APIs...')
      const resSync = await api.triggerSync('all') as any
      if (resSync.error) throw new Error(`API Sync: ${resSync.error}`)

      setSyncStep('2/3: Remote FDW Sync...')
      const resFDW = await api.triggerAmazonFDW() as any
      if (resFDW.error) console.warn('FDW Sync warning:', resFDW.error)

      setSyncStep('3/3: Rebuilding Fact Tables...')
      const resFact = await api.refreshFactTable() as any
      if (resFact.error) throw new Error(`Fact Refresh: ${resFact.error}`)

    } catch (err: any) {
      setSyncError(err.message)
    } finally {
      setSyncStep(null)
      setSyncing(false)
      load()
    }
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

      const incomingAmazonBoxes = toSafeNumber(
        row.suggested_boxes_amazon ?? (row.node === 'amazon_fba' ? row.boxes_to_ship : 0),
        0
      )
      const incomingNoonBoxes = toSafeNumber(
        row.suggested_boxes_noon ?? (row.node === 'noon_fbn' ? row.boxes_to_ship : 0),
        0
      )
      const incomingMinutesBoxes = toSafeNumber(
        row.suggested_boxes_minutes,
        0
      )
      const totalBoxes = incomingAmazonBoxes + incomingNoonBoxes + incomingMinutesBoxes
      const incomingUnits = toSafeNumber(row.total_units_to_ship ?? row.units_to_ship, 0)
      
      // Super Fallback: If units_per_box is missing or 1, try to infer it from Total Units / Total Boxes
      let upb = toSafeNumber(row.units_per_box, 0)
      if (upb <= 1 && totalBoxes > 0) {
        upb = Math.round(incomingUnits / totalBoxes)
      }
      if (upb === 0) upb = 1 // absolute fallback

      // Fallback calculation: if the server didn't provide send_to_fba_units, try to calculate it from boxes
      const incomingFbaUnits = toSafeNumber(
        row.send_to_fba_units ?? 
        (incomingAmazonBoxes > 0 ? incomingAmazonBoxes * upb : (row.node === 'amazon_fba' ? incomingUnits : 0)), 
        0
      )
      const incomingFbnUnits = toSafeNumber(
        row.send_to_fbn_units ?? 
        (incomingNoonBoxes > 0 ? incomingNoonBoxes * upb : (row.node === 'noon_fbn' ? incomingUnits : 0)), 
        0
      )
      const incomingMinutesUnits = toSafeNumber(
        row.send_to_minutes_units ?? 
        (incomingMinutesBoxes > 0 ? incomingMinutesBoxes * upb : 0), 
        0
      )

      if (!existing) {
        grouped.set(sku, {
          sku,
          name: row.name ?? sku,
          plan_date: row.plan_date ?? null,
          allocation_logic: row.allocation_logic ?? null,
          blended_sv: row.blended_sv ?? null,
          amazon_sv: row.amazon_sv ?? null,
          noon_sv: row.noon_sv ?? null,
          minutes_sv: row.minutes_sv ?? null,
          current_fba_stock_units: row.current_fba_stock_units ?? null,
          current_fbn_stock_units: row.current_fbn_stock_units ?? null,
          current_minutes_stock_units: row.current_minutes_stock_units ?? null,
          boxes_in_hand: row.boxes_in_hand ?? null,
          boxes_required_30d_amz: row.boxes_required_30d_amz ?? null,
          boxes_required_30d_noon: row.boxes_required_30d_noon ?? null,
          boxes_required_30d_minutes: row.boxes_required_30d_minutes ?? null,
          suggested_boxes_amazon: incomingAmazonBoxes,
          suggested_boxes_noon: incomingNoonBoxes,
          suggested_boxes_minutes: incomingMinutesBoxes,
          total_units_to_ship: incomingUnits,
          send_to_fba_units: incomingFbaUnits,
          send_to_fbn_units: incomingFbnUnits,
          send_to_minutes_units: incomingMinutesUnits,
        })
        continue
      }

      existing.suggested_boxes_amazon = toSafeNumber(existing.suggested_boxes_amazon, 0) + incomingAmazonBoxes
      existing.suggested_boxes_noon = toSafeNumber(existing.suggested_boxes_noon, 0) + incomingNoonBoxes
      existing.suggested_boxes_minutes = toSafeNumber(existing.suggested_boxes_minutes, 0) + incomingMinutesBoxes
      existing.total_units_to_ship = toSafeNumber(existing.total_units_to_ship, 0) + incomingUnits
      existing.send_to_fba_units = toSafeNumber(existing.send_to_fba_units, 0) + incomingFbaUnits
      existing.send_to_fbn_units = toSafeNumber(existing.send_to_fbn_units, 0) + incomingFbnUnits
      existing.send_to_minutes_units = toSafeNumber(existing.send_to_minutes_units, 0) + incomingMinutesUnits

      if (!existing.allocation_logic && row.allocation_logic) existing.allocation_logic = row.allocation_logic
      if (existing.blended_sv == null && row.blended_sv != null) existing.blended_sv = row.blended_sv
      if (existing.current_fba_stock_units == null && row.current_fba_stock_units != null) {
        existing.current_fba_stock_units = row.current_fba_stock_units
      }
      if (existing.current_fbn_stock_units == null && row.current_fbn_stock_units != null) {
        existing.current_fbn_stock_units = row.current_fbn_stock_units
      }
      if (existing.current_minutes_stock_units == null && row.current_minutes_stock_units != null) {
        existing.current_minutes_stock_units = row.current_minutes_stock_units
      }
      if (existing.boxes_in_hand == null && row.boxes_in_hand != null) existing.boxes_in_hand = row.boxes_in_hand
      if (existing.boxes_required_30d_amz == null && row.boxes_required_30d_amz != null) {
        existing.boxes_required_30d_amz = row.boxes_required_30d_amz
      }
      if (existing.boxes_required_30d_noon == null && row.boxes_required_30d_noon != null) {
        existing.boxes_required_30d_noon = row.boxes_required_30d_noon
      }
      if (existing.boxes_required_30d_minutes == null && row.boxes_required_30d_minutes != null) {
        existing.boxes_required_30d_minutes = row.boxes_required_30d_minutes
      }
    }

    return Array.from(grouped.values()) as Array<Record<string, unknown>>
  }, [data?.ship_now])

  const totalShipUnits = shipNowRows.reduce((s, item) => s + toSafeNumber(item.total_units_to_ship, 0), 0)
  const totalShipBoxesAmazon = shipNowRows.reduce((s, item) => s + toSafeNumber(item.suggested_boxes_amazon, 0), 0)
  const totalShipBoxesNoon = shipNowRows.reduce((s, item) => s + toSafeNumber(item.suggested_boxes_noon, 0), 0)
  const totalShipBoxesMinutes = shipNowRows.reduce((s, item) => s + toSafeNumber(item.suggested_boxes_minutes, 0), 0)
  const totalShipBoxes = totalShipBoxesAmazon + totalShipBoxesNoon + totalShipBoxesMinutes
  const totalReorderUnits = (data?.reorder_now ?? []).reduce((s, i) => s + (i.suggested_units ?? 0), 0)
  const criticalCount = (data?.alerts ?? []).filter(a => a.action_flag === 'CRITICAL_OOS_RISK').length
  const oosRiskCount = (data?.alerts ?? []).filter(a => a.action_flag === 'OOS_RISK').length

  if (loading && !data) return <LoadingScreen message="Initializing Command Center..." />

  return (
    <div className="space-y-4 sm:space-y-6 w-full mx-auto px-0">
      {/* Premium Dashboard Header */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between border-b border-sidebar/10 pb-6 mb-2 gap-4">
        <div className="flex flex-col">
          <h1 className="text-xl lg:text-3xl font-black text-primary tracking-tighter uppercase leading-none">
            Command Center
          </h1>
          <div className="flex items-center gap-2 mt-2">
            <LayoutDashboard className="w-3.5 h-3.5 text-brand-blue" />
            <span className="text-[12px] lg:text-[12px] font-black text-white uppercase tracking-[0.2em]">Regional Logistics Controller</span>
            {data?.last_synced && (
              <span className="text-[12px] lg:text-[12px] font-bold text-white flex items-center gap-1 before:content-['·'] before:mr-1 uppercase">
                Systems Sync: {formatRelativeTime(data.last_synced)}
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex flex-col items-start lg:items-end mr-2">
            <span className="text-[12px] font-black text-white uppercase tracking-widest">Global Status</span>
            <div className="flex items-center gap-1.5 mt-1">
              <span className="w-2 h-2 rounded-full bg-green-500 shadow-sm shadow-green-200 animate-pulse" />
              <span className="text-[12px] font-black text-primary uppercase">Amazon API Live</span>
            </div>
          </div>
          <button
            onClick={handleSyncAll}
            disabled={syncing || refreshing}
            className="flex-1 sm:flex-none px-6 py-3 text-[12px] lg:text-[13px] font-black border border-brand-blue/30 bg-brand-blue text-white rounded-2xl hover:shadow-xl hover:shadow-brand-blue/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all uppercase tracking-widest flex items-center justify-center gap-2"
          >
            {syncing ? (syncStep || 'Syncing...') : 'Global Master Sync'}
          </button>
        </div>
      </div>

      {syncError && (
        <div className="relative group animate-in fade-in slide-in-from-top-4 duration-500">
          <div className="absolute -inset-0.5 bg-gradient-to-r from-red-500/20 to-rose-600/20 rounded-2xl blur opacity-75 group-hover:opacity-100 transition duration-1000 group-hover:duration-200" />
          <div className="relative bg-[#0f172a]/80 backdrop-blur-xl border border-red-500/20 p-4 lg:p-5 rounded-2xl flex items-center justify-between gap-6 shadow-2xl overflow-hidden">
            <div className="absolute top-0 left-0 w-1.5 h-full bg-gradient-to-b from-red-500 to-rose-600" />
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center border border-red-500/20">
                <AlertTriangle className="w-5 h-5 text-red-500 animate-pulse" />
              </div>
              <div>
                <h3 className="text-[12px] font-black text-red-500 uppercase tracking-[0.2em] mb-1">Protocol Sync Error</h3>
                <p className="text-[13px] lg:text-[12px] font-black text-white uppercase tracking-wider opacity-90 leading-tight">
                  {syncError}
                </p>
              </div>
            </div>
            <button 
              onClick={() => setSyncError(null)}
              className="p-2 hover:bg-white/5 rounded-lg transition-colors text-zinc-500 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}


      {data && 'error' in data && (
        <div className="p-6 bg-red-50 text-red-600 rounded-2xl border border-red-100 flex items-start gap-4 shadow-sm">
          <AlertCircle className="w-6 h-6 text-red-500 shrink-0 mt-1" />
          <div className="flex-1">
            <h3 className="text-sm font-black text-red-700 uppercase tracking-wider">Channel Integration Error</h3>
            <p className="text-[13px] mt-1 text-red-600/80 font-medium leading-relaxed">System failed to establish handshake with Supabase Edge Functions. {(data as any).error} {(data as any).detail ? `- ${(data as any).detail}` : ''}</p>
            <div className="flex gap-4 mt-4">
              <button onClick={load} className="px-4 py-2 bg-red-600 text-white rounded-lg text-[12px] font-black uppercase tracking-widest hover:bg-red-700 transition-colors">
                Reconnect
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── KPI TILES ─────────────────────────────────────────────────────── */}
      {!loading && data && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6">
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
              accentColor="border-l-amber-500"
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
              sub={`${totalShipUnits} Units (${totalShipBoxes} Boxes) staged - Send to Channels`}
              accentColor="border-l-blue-500"
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
              accentColor="border-l-amber-400"
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
              sub={`${data.oos_count_amazon ?? 0} OOS / ${data.live_skus_amazon ?? 0} Active SKUs`}
              accentColor="border-l-slate-400"
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
              sub={`${data.oos_count_noon ?? 0} OOS / ${data.live_skus_noon ?? 0} Active SKUs`}
              accentColor="border-l-slate-400"
              icon={TrendingUp}
              onDoubleClick={() => setDrillModal({
                isOpen: true,
                title: 'Noon OOS Catalog',
                type: 'oos_noon',
                data: data?.oos_skus_noon ?? []
              })}
            />
            <KPITile
              label="Minutes OOS Rate"
              value={`${(data.oos_pct_minutes ?? 0).toFixed(1)}%`}
              sub={`${data.oos_count_minutes ?? 0} OOS / ${data.live_skus_minutes ?? 0} Active SKUs`}
              accentColor="border-l-slate-400"
              icon={TrendingUp}
              onDoubleClick={() => setDrillModal({
                isOpen: true,
                title: 'Minutes OOS Catalog',
                type: 'oos_minutes',
                data: data?.oos_skus_minutes ?? []
              })}
            />
            <KPITile
              label="Fleet Health"
              value={`${(100 - (data.oos_pct_total ?? 0)).toFixed(1)}%`}
              sub="Global Availability"
              accentColor="border-l-emerald-500"
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
          <div className="flex items-center gap-4 text-[12px] font-black text-white uppercase tracking-[0.2em] px-1">
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
            <div key={i} className="bg-card border border-border-color rounded-2xl p-5 border-l-[6px] border-l-slate-200 animate-pulse">
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
              className="flex items-center gap-2 px-3 py-1.5 bg-transparent hover:bg-white/5 text-zinc-400 hover:text-white rounded-md text-[12px] font-black uppercase tracking-widest transition-all border border-white/10"
            >
              <Download className="w-3.5 h-3.5" /> DOWNLOAD ALL
            </button>
          )}
        >
          <>
            <table className="w-full text-sm">
              <thead className="bg-white/5 border-b border-white/10 sticky top-0 z-10 backdrop-blur-md">
                <tr className="group hover:bg-white/10 transition-colors">
                  <Th>SKU</Th>
                  <Th>Coverage</Th>
                  <Th right>AMZ</Th>
                  <Th right>Noon</Th>
                  <Th>Risk State</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 bg-transparent">
                {loading ? <SkeletonRow cols={5} /> : (data?.alerts.length ?? 0) === 0 ? <EmptyRow cols={5} /> : (
                  data?.alerts.map(a => (
                    <tr className="group hover:bg-white/10 transition-colors transition-all duration-300 hover:scale-[1.02] hover:z-10 relative hover:shadow-xl" key={a.sku}>
                      <td className="px-4 py-2.5"><div className="flex flex-col items-center justify-center">
                          <SKULink sku={a.sku} />
                          <span className="text-[12px] font-medium text-white mt-0.5 truncate max-w-[180px] group-hover:text-white text-center transition-all duration-200">{a.name}</span>
                        </div></td>
                      <td className="px-4 py-2.5 text-center"><span className="text-[12px] font-black text-white uppercase group-hover:text-white transition-all duration-200 inline-block transition-transform duration-300 group-hover:scale-[1.15] origin-center">
                          {getMarketplace(a.coverage_amazon ?? 99, a.coverage_noon ?? 99)}
                        </span></td>
                      <td className={`px-4 py-2.5 text-center font-data text-[13px] ${coverageColor(a.coverage_amazon)} transition-all duration-200`}><span className="inline-block transition-transform duration-300 group-hover:scale-[1.15] origin-center">{formatCovDays(a.coverage_amazon)}</span></td>
                      <td className={`px-4 py-2.5 text-center font-data text-[13px] ${coverageColor(a.coverage_noon)} transition-all duration-200`}><span className="inline-block transition-transform duration-300 group-hover:scale-[1.15] origin-center">{formatCovDays(a.coverage_noon)}</span></td>
                      <td className="px-4 py-2.5 text-center"><div className="flex justify-center">
                          <ActionFlagBadge flag={a.action_flag as ActionFlag} />
                        </div></td>
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
              className="flex items-center gap-2 px-3 py-1.5 bg-transparent hover:bg-white/5 text-zinc-400 hover:text-white rounded-md text-[12px] font-black uppercase tracking-widest transition-all border border-white/10"
            >
              <Download className="w-3.5 h-3.5" /> DOWNLOAD ALL
            </button>
          )}
        >
          <>
            <table className="w-full text-sm">
              <thead className="bg-white/5 border-b border-white/10 sticky top-0 z-10 backdrop-blur-md">
                <tr className="group hover:bg-white/10 transition-colors">
                  <Th>SKU</Th>
                  <Th right>SV</Th>
                  <Th right>Staged</Th>
                  <Th right>Boxes</Th>
                  <Th>Protocol</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 bg-transparent">
                {loading ? <SkeletonRow cols={5} /> : shipNowRows.length === 0 ? <EmptyRow cols={5} /> : (
                  shipNowRows.map((row, idx) => {
                    const sku = String(row.sku ?? '')
                    const sugAmz = toSafeNumber(row.suggested_boxes_amazon, 0)
                    const sugNoon = toSafeNumber(row.suggested_boxes_noon, 0)
                    return (
                      <tr 
                        className="group hover:bg-white/10 transition-colors transition-all duration-300 hover:scale-[1.02] hover:z-[60] relative hover:shadow-xl" 
                        key={`${sku}-${idx}`}
                        style={{ zIndex: shipNowRows.length - idx }}
                      >
                        <td className="px-4 py-2.5"><div className="flex flex-col items-center justify-center">
                            <SKULink sku={sku} />
                            <span className="text-[12px] font-medium text-white mt-0.5 truncate max-w-[150px] group-hover:text-white text-center transition-all duration-200">{String(row.name)}</span>
                          </div></td>
                        <td className="px-4 py-2.5 text-center font-data text-[13px] font-bold text-white transition-all duration-200"><span className="inline-block transition-transform duration-300 group-hover:scale-[1.15] origin-center">{toSafeNumber(row.blended_sv).toFixed(1)}</span></td>
                        <td className="px-4 py-2.5 text-center font-data text-[13px] font-bold text-white transition-all duration-200"><span className="inline-block transition-transform duration-300 group-hover:scale-[1.15] origin-center">{toSafeNumber(row.total_units_to_ship)}</span></td>
                        <td className="px-4 py-2.5 text-center font-data text-[13px] font-bold text-white transition-all duration-200"><span className="inline-block transition-transform duration-300 group-hover:scale-[1.15] origin-center">{sugAmz + sugNoon + toSafeNumber(row.suggested_boxes_minutes, 0)}</span></td>
                        <td className="px-4 py-2.5"><div className="flex justify-center">
                            <ActionDropdown 
                              currentStatus={rowStatuses[`${sku}-${idx}`] || 'Shipment planning'} 
                              onStatusChange={(newStatus) => setRowStatuses(prev => ({ ...prev, [`${sku}-${idx}`]: newStatus }))}
                              isMulti={true}
                            />
                          </div></td>
                      </tr>
                    )
                  })
                )}
              </tbody>
              {shipNowRows.length > 0 && (
                <tfoot className="bg-white/5 border-t border-white/10 sticky bottom-0 z-10 backdrop-blur-md">
                  <tr className="font-bold text-white group">
                    <td className="px-4 py-2.5 text-[12px] uppercase tracking-widest text-primary text-center"><span className="inline-block transition-transform duration-300 group-hover:scale-[1.15] origin-center">Totals</span></td>
                    <td className="px-4 py-2.5 text-center font-data text-[13px]"><span className="inline-block transition-transform duration-300 group-hover:scale-[1.15] origin-center">{shipNowRows.reduce((sum, item) => sum + toSafeNumber(item.blended_sv), 0).toFixed(1)}</span></td>
                    <td className="px-4 py-2.5 text-center font-data text-[13px]"><span className="inline-block transition-transform duration-300 group-hover:scale-[1.15] origin-center">{totalShipUnits.toLocaleString()}</span></td>
                    <td className="px-4 py-2.5 text-center font-data text-[13px]"><span className="inline-block transition-transform duration-300 group-hover:scale-[1.15] origin-center">{totalShipBoxes.toLocaleString()}</span></td>
                    <td className="px-4 py-2.5"></td>
                  </tr>
                </tfoot>
              )}
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
              className="flex items-center gap-2 px-3 py-1.5 bg-transparent hover:bg-white/5 text-zinc-400 hover:text-white rounded-md text-[12px] font-black uppercase tracking-widest transition-all border border-white/10"
            >
              <Download className="w-3.5 h-3.5" /> DOWNLOAD ALL
            </button>
          )}
        >
          <>
            <table className="w-full text-sm">
              <thead className="bg-white/5 border-b border-white/10 sticky top-0 z-10 backdrop-blur-md">
                <tr className="group hover:bg-white/10 transition-colors">
                  <Th>SKU</Th>
                  <Th right>Req. Units</Th>
                  <Th right>Cost</Th>
                  <Th right>Coverage</Th>
                  <Th>Action</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 bg-transparent">
                {loading ? <SkeletonRow cols={4} /> : (data?.reorder_now.length ?? 0) === 0 ? <EmptyRow cols={4} /> : (
                  data?.reorder_now.map(r => (
                    <tr className="group hover:bg-white/10 transition-colors transition-all duration-300 hover:scale-[1.02] hover:z-10 relative hover:shadow-xl" key={r.sku}>
                      <td className="px-4 py-2.5 text-center"><div className="flex justify-center"><SKULink sku={r.sku} /></div></td>
                      <td className="px-4 py-2.5 text-center font-data text-[13px] font-bold text-white transition-all duration-200"><span className="inline-block transition-transform duration-300 group-hover:scale-[1.15] origin-center">{r.suggested_units}</span></td>
                      <td className="px-4 py-2.5 text-center font-data text-[13px] font-bold text-white transition-all duration-200"><span className="inline-block transition-transform duration-300 group-hover:scale-[1.15] origin-center">{Number(r.total_cost_aed || (r.suggested_units * (r.cogs || 0))).toLocaleString(undefined, { maximumFractionDigits: 0 })}</span></td>
                      <td className={`px-4 py-2.5 text-center font-data text-[13px] ${coverageColor(r.projected_coverage)} transition-all duration-200`}><span className="inline-block transition-transform duration-300 group-hover:scale-[1.15] origin-center">{formatCovDays(r.projected_coverage)}</span></td>
                      <td className="px-4 py-2.5 text-center"><button onClick={() => navigate('/po')} className="text-[12px] font-black uppercase text-brand-blue hover:underline group-hover:text-white transition-all duration-200">Draft PO</button></td>
                    </tr>
                  ))
                )}
              </tbody>
              {(data?.reorder_now.length ?? 0) > 0 && (
                <tfoot className="bg-white/5 border-t border-white/10 sticky bottom-0 z-10 backdrop-blur-md">
                  <tr className="font-bold text-white group">
                    <td className="px-4 py-2.5 text-[12px] uppercase tracking-widest text-primary"><span className="inline-block transition-transform duration-300 group-hover:scale-[1.15] origin-center">Totals</span></td>
                    <td className="px-4 py-2.5 text-right font-data text-[13px]"><span className="inline-block transition-transform duration-300 group-hover:scale-[1.15] origin-center">{(data?.reorder_now ?? []).reduce((sum, r) => sum + (r.suggested_units || 0), 0).toLocaleString()}</span></td>
                    <td className="px-4 py-2.5 text-right font-data text-[13px]"><span className="inline-block transition-transform duration-300 group-hover:scale-[1.15] origin-center">{(data?.reorder_now ?? []).reduce((sum, r) => sum + (Number(r.total_cost_aed || (r.suggested_units * (r.cogs || 0))) || 0), 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}</span></td>
                    <td className="px-4 py-2.5 text-right font-data text-[13px]"><span className="inline-block transition-transform duration-300 group-hover:scale-[1.15] origin-center">{((data?.reorder_now ?? []).reduce((sum, r) => sum + (r.projected_coverage || 0), 0) / (data?.reorder_now.length || 1)).toFixed(1)}d</span></td>
                    <td className="px-4 py-2.5"></td>
                  </tr>
                </tfoot>
              )}
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
              className="flex items-center gap-2 px-3 py-1.5 bg-transparent hover:bg-white/5 text-zinc-400 hover:text-white rounded-md text-[12px] font-black uppercase tracking-widest transition-all border border-white/10"
            >
              <Download className="w-3.5 h-3.5" /> DOWNLOAD ALL
            </button>
          )}
        >
          <>
            <table className="w-full text-sm">
              <thead className="bg-white/5 border-b border-white/10 sticky top-0 z-10 backdrop-blur-md">
                <tr className="group hover:bg-white/10 transition-colors">
                  <Th>PO #</Th>
                  <Th>SKU</Th>
                  <Th right>Units</Th>
                  <Th>ETA</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 bg-transparent">
                {loading ? <SkeletonRow cols={4} /> : (data?.inbound?.length ?? 0) === 0 ? <EmptyRow cols={4} /> : (
                  data?.inbound?.flatMap((b: any) => (b.line_items ?? []).map((li: any) => ({
                    po: b.po_number,
                    sku: li.sku,
                    name: li.name,
                    units: li.units_ordered,
                    eta: b.eta
                  }))).map((row: any) => (
                    <tr className="group hover:bg-white/10 transition-colors transition-all duration-300 hover:scale-[1.02] hover:z-10 relative hover:shadow-xl" key={`${row.po}-${row.sku}`}>
                      <td className="px-4 py-2.5 text-center font-data text-[12px] font-bold text-white transition-all duration-200"><span className="inline-block transition-transform duration-300 group-hover:scale-[1.15] origin-center">{row.po}</span></td>
                      <td className="px-4 py-2.5"><div className="flex flex-col items-center justify-center">
                          <SKULink sku={row.sku} />
                          <span className="text-[12px] font-medium text-white mt-0.5 truncate max-w-[180px] group-hover:text-white text-center transition-all duration-200">{row.name}</span>
                        </div></td>
                      <td className="px-4 py-2.5 text-center font-data text-[13px] font-bold text-white transition-all duration-200"><span className="inline-block transition-transform duration-300 group-hover:scale-[1.15] origin-center">{row.units}</span></td>
                      <td className="px-4 py-2.5 text-center text-[12px] font-bold text-white transition-all duration-200"><span className="inline-block transition-transform duration-300 group-hover:scale-[1.15] origin-center">{formatDate(row.eta)}</span></td>
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
