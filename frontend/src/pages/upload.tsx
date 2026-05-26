import { useEffect, useRef, useState } from 'react'
import { X, Upload, CheckCircle2, AlertCircle, Package, Download, Activity, RefreshCw, AlertTriangle, XCircle, Layers, ShieldCheck, Database, History, Zap } from 'lucide-react'
import { api } from '../lib/api'
import type { SyncStatus, UploadLocadResponse, UploadNoonResponse, UploadNoonInventoryResponse } from '../types'
import { LoadingScreen } from '../components/shared/LoadingScreen'
import { navigate } from '../lib/router'

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function formatRelativeTime(iso: string | null | undefined): string {
  if (!iso) return 'Never'
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

function staleness(iso: string | null | undefined): 'fresh' | 'stale' | 'old' | 'missing' {
  if (!iso) return 'missing'
  const diffHrs = (Date.now() - new Date(iso).getTime()) / 3600000
  if (diffHrs < 6) return 'fresh'
  if (diffHrs < 48) return 'stale'
  return 'old'
}

function StatusLabel({ status }: { status: 'fresh' | 'stale' | 'old' | 'missing' | 'ok' | 'error' | 'warning' }) {
  const cfg = {
    fresh: { cls: 'bg-green-500/10 text-green-400 border-green-500/20', label: 'Fresh' },
    ok: { cls: 'bg-green-500/10 text-green-400 border-green-500/20', label: 'OK' },
    stale: { cls: 'bg-amber-500/10 text-amber-400 border-amber-500/20', label: 'Stale' },
    warning: { cls: 'bg-amber-500/10 text-amber-400 border-amber-500/20', label: 'Warning' },
    old: { cls: 'bg-red-500/10 text-red-400 border-red-500/20', label: 'Old' },
    missing: { cls: 'bg-red-500/10 text-red-400 border-red-500/20', label: 'Missing' },
    error: { cls: 'bg-red-500/10 text-red-400 border-red-500/20', label: 'Error' },
  }[status]

  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-[9px] font-black uppercase border tracking-widest ${cfg.cls}`}>
      {cfg.label}
    </span>
  )
}

interface HealthRow {
  source: string
  type: string
  lastUpdated: string | null
  status: 'fresh' | 'stale' | 'old' | 'missing' | 'ok' | 'error' | 'warning'
  detail?: string
}

function buildHealthRows(syncStatus: SyncStatus): HealthRow[] {
  const rows: HealthRow[] = []

  // Amazon
  const amzStatus = syncStatus.amazon?.status === 'connected'
    ? staleness(syncStatus.amazon.last_synced) === 'missing' ? 'warning' : staleness(syncStatus.amazon.last_synced) === 'fresh' ? 'ok' : 'stale'
    : 'error'
  rows.push({ source: 'Amazon', type: 'Auto (Saddl)', lastUpdated: syncStatus.amazon?.last_synced ?? null, status: amzStatus })

  // Locad
  const locadTs = syncStatus.locad_api?.last_synced ?? syncStatus.locad_xlsx?.last_uploaded ?? null
  rows.push({ source: 'Locad', type: syncStatus.locad_api?.last_synced ? 'API' : 'Manual', lastUpdated: locadTs, status: staleness(locadTs) })

  // Noon Sales
  const noonTs = syncStatus.noon_csv?.last_uploaded ?? null
  rows.push({ source: 'Noon Sales', type: 'Manual CSV', lastUpdated: noonTs, status: staleness(noonTs) })

  // Noon Inventory
  const noonInvTs = syncStatus.noon_inventory?.last_uploaded ?? null
  rows.push({ source: 'Noon Inventory', type: 'Manual CSV', lastUpdated: noonInvTs, status: staleness(noonInvTs) })

  return rows
}

// ─── COMPONENTS ───────────────────────────────────────────────────────────────

function DropZone({ accept, label, hint, onFile, disabled }: { accept: string, label: string, hint?: string, onFile: (f: File) => void, disabled?: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const handleDrop = (e: React.DragEvent) => { e.preventDefault(); setDragging(false); const file = e.dataTransfer.files[0]; if (file) onFile(file) }
  return (
    <div
      className={`border-2 border-dashed rounded-2xl px-4 py-6 text-center cursor-pointer transition-all ${
        disabled ? 'border-white/5 bg-white/5 cursor-not-allowed opacity-50' :
        dragging ? 'border-brand-amber bg-brand-amber/10' : 'border-white/10 bg-white/5 hover:border-brand-amber/50 hover:bg-white/10'
      }`}
      onDragOver={e => { e.preventDefault(); if (!disabled) setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={disabled ? undefined : handleDrop}
      onClick={() => { if (!disabled) inputRef.current?.click() }}
    >
      <input ref={inputRef} type="file" accept={accept} className="hidden" disabled={disabled} onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = '' }} />
      <Upload className={`mx-auto h-6 w-6 mb-2 ${disabled ? 'text-zinc-600' : dragging ? 'text-brand-amber' : 'text-zinc-500'}`} />
      <div className={`text-[11px] font-black uppercase tracking-tight mb-1 ${disabled ? 'text-zinc-500' : 'text-zinc-300'}`}>{label}</div>
      <div className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest">{disabled ? 'Not available' : hint ?? 'Drag/Drop or Click'}</div>
    </div>
  )
}

function UploadingState({ label = "Processing Payload..." }: { label?: string }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-4 bg-white/5 rounded-2xl border-2 border-dashed border-white/10 min-h-[140px]">
      <RefreshCw className="h-8 w-8 text-brand-blue animate-spin" />
      <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">{label}</span>
    </div>
  )
}

function SectionTile({ icon: Icon, title, subtitle, accent, children }: { icon: any, title: string, subtitle: string, accent: string, children: React.ReactNode }) {
  return (
    <div className={`bg-card border border-white/5 rounded-2xl shadow-2xl overflow-hidden flex flex-col border-t-4 ${accent}`}>
      <div className="px-6 py-5 border-b border-white/5 bg-white/5 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="p-2.5 bg-white/5 rounded-2xl shadow-inner text-zinc-300"><Icon className="h-5 w-5" /></div>
          <div>
            <h2 className="text-sm font-black text-white uppercase tracking-tight leading-none">{title}</h2>
            <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest opacity-60 mt-1.5">{subtitle}</p>
          </div>
        </div>
      </div>
      <div className="flex-1 p-6 flex flex-col">
        {children}
      </div>
    </div>
  )
}

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────

export default function OperationsHub() {
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [showMappingModal, setShowMappingModal] = useState(false)
  const [triggerLoading, setTriggerLoading] = useState(false)
  const [showGuide, setShowGuide] = useState(true)
  const [masterStep, setMasterStep] = useState<'amazon-saddl' | 'amazon-fdw' | 'fact-tables' | null>(null)

  // Upload States
  const [locadState, setLocadState] = useState<{loading: boolean, error: string|null, result: UploadLocadResponse|null}>({loading: false, error: null, result: null})
  const [noonSalesState, setNoonSalesState] = useState<{loading: boolean, error: string|null, result: UploadNoonResponse|null}>({loading: false, error: null, result: null})
  const [noonInvState, setNoonInvState] = useState<{loading: boolean, error: string|null, result: UploadNoonInventoryResponse|null}>({loading: false, error: null, result: null})
  const [minutesState, setMinutesState] = useState<{loading: boolean, error: string|null, result: UploadNoonResponse|null}>({loading: false, error: null, result: null})

  const loadData = () => {
    setLoading(true)
    api.getSyncStatus().then(res => {
      const resAny = res as any
      if (!resAny.error) setSyncStatus(res as SyncStatus)
      setLoading(false)
    })
  }

  useEffect(() => { loadData() }, [])

  const handleUpload = async (type: 'locad'|'noon-sales'|'noon-inv'|'minutes', file: File) => {
    if (type === 'locad') {
      setLocadState({loading: true, error: null, result: null})
      const res = await api.uploadLocadXLSX(file) as any
      setLocadState({loading: false, error: res.error || null, result: res.error ? null : res})
      if (!res.error) loadData()
    } else if (type === 'noon-sales') {
      setNoonSalesState({loading: true, error: null, result: null})
      const res = await api.uploadNoonCSV(file) as any
      setNoonSalesState({loading: false, error: res.error || null, result: res.error ? null : res})
      if (!res.error) loadData()
    } else if (type === 'noon-inv') {
      setNoonInvState({loading: true, error: null, result: null})
      const res = await api.uploadNoonInventory(file) as any
      setNoonInvState({loading: false, error: res.error || null, result: res.error ? null : res})
      if (!res.error) loadData()
    } else if (type === 'minutes') {
      setMinutesState({loading: true, error: null, result: null})
      const res = await api.uploadNoonMinutesSales(file) as any
      setMinutesState({loading: false, error: res.error || null, result: res.error ? null : res})
      if (!res.error) loadData()
    }
  }

  const handleForceSync = async () => {
    setTriggerLoading(true)
    await api.triggerSync('amazon')
    setTriggerLoading(false)
    loadData()
  }

  const handleMasterRefresh = async () => {
    setTriggerLoading(true)
    setMasterStep('amazon-saddl')
    try {
      // Step 1: Sync Amazon Sales & Inventory (Saddl) -> refreshes amazon_sales
      await api.triggerSync('amazon')
      
      // Step 2: Refresh Remote Amazon (FDW)
      setMasterStep('amazon-fdw')
      await api.triggerAmazonFDW()
      
      // Step 3: Refresh Fact Tables (fact_sales, fact_inventory_planning, etc.)
      setMasterStep('fact-tables')
      await api.refreshFactTable()
      
      setMasterStep(null)
      loadData()
    } catch (err) {
      console.error('Master refresh error:', err)
      setMasterStep(null)
    } finally {
      setTriggerLoading(false)
    }
  }

  if (loading && !syncStatus) return <LoadingScreen message="Initializing Operations Hub..." />

  const healthRows = syncStatus ? buildHealthRows(syncStatus) : []
  const freshCount = healthRows.filter(r => r.status === 'fresh' || r.status === 'ok').length
  const staleCount = healthRows.filter(r => r.status === 'stale' || r.status === 'warning').length
  const criticalCount = healthRows.filter(r => r.status === 'old' || r.status === 'missing' || r.status === 'error').length

  return (
    <div className="w-full max-w-[1920px] mx-auto space-y-6 px-4 sm:px-6 lg:px-8 py-6">
      {/* HEADER SECTION */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 pb-2">
        <div>
          <h1 className="text-xl lg:text-3xl font-black text-white uppercase tracking-tight">Operations Hub</h1>
          <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em] mt-1.5 opacity-80">System Health • Data Inbound • Ecosystem Sync</p>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-6 bg-white/5 border border-white/10 rounded-2xl px-6 py-3.5">
            <div className="flex flex-col">
              <span className="text-[9px] font-black text-zinc-500 uppercase tracking-widest mb-1">Healthy</span>
              <span className="text-lg font-black text-green-400 leading-none">{freshCount}</span>
            </div>
            <div className="w-px h-8 bg-white/10" />
            <div className="flex flex-col">
              <span className="text-[9px] font-black text-zinc-500 uppercase tracking-widest mb-1">Stale</span>
              <span className="text-lg font-black text-amber-400 leading-none">{staleCount}</span>
            </div>
            <div className="w-px h-8 bg-white/10" />
            <div className="flex flex-col">
              <span className="text-[9px] font-black text-zinc-500 uppercase tracking-widest mb-1">Critical</span>
              <span className="text-lg font-black text-red-400 leading-none">{criticalCount}</span>
            </div>
          </div>
          
          <button
            onClick={handleMasterRefresh}
            disabled={triggerLoading}
            className="flex items-center gap-3 px-6 py-3.5 bg-gradient-to-r from-brand-blue to-indigo-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:from-brand-blue/90 hover:to-indigo-600/90 shadow-xl shadow-brand-blue/20 transition-all active:scale-95 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${triggerLoading ? 'animate-spin' : ''}`} />
            {triggerLoading ? (
              masterStep === 'amazon-saddl' ? 'Step 1/3: Syncing Saddl...' :
              masterStep === 'amazon-fdw' ? 'Step 2/3: Refreshing FDW...' :
              'Step 3/3: Recomputing Facts...'
            ) : 'Master Ecosystem Refresh'}
          </button>

          <button
            onClick={() => setShowGuide(!showGuide)}
            className="flex items-center justify-center p-3 bg-white/5 hover:bg-white/10 text-white rounded-2xl border border-white/10 transition-all active:scale-95"
            title="Toggle Guide"
          >
            <Activity className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* ECOSYSTEM SYNC OPERATIONS GUIDE */}
      {showGuide && (
        <div className="bg-slate-900/60 border border-white/10 rounded-2xl p-6 relative overflow-hidden animate-in fade-in slide-in-from-top-2 duration-300">
          <button 
            onClick={() => setShowGuide(false)} 
            className="absolute top-4 right-4 text-zinc-500 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
          <h3 className="text-xs font-black text-white uppercase tracking-widest mb-4 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-brand-blue" />
            Ecosystem Sync Operations Guide
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-brand-blue" />
                <span className="text-[10px] font-black text-white uppercase tracking-widest">Step 1: Amazon API Sync</span>
              </div>
              <p className="text-[10px] text-zinc-400 font-bold uppercase leading-relaxed tracking-wide">
                Pulls live FBA inventory and the last 90 days of FBA sales from the **Saddl API**, writing directly to the `amazon_sales`, `inventory_snapshot`, and `sales_snapshot` tables.
              </p>
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                <span className="text-[10px] font-black text-white uppercase tracking-widest">Step 2: Remote Amazon Sync</span>
              </div>
              <p className="text-[10px] text-zinc-400 font-bold uppercase leading-relaxed tracking-wide">
                Executes the `refresh_amazon_sales_data` procedure to pull/sync the latest Amazon sales data from remote external connections (such as Foreign Data Wrappers) if configured.
              </p>
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                <span className="text-[10px] font-black text-white uppercase tracking-widest">Step 3: Fact Pipeline Run</span>
              </div>
              <p className="text-[10px] text-zinc-400 font-bold uppercase leading-relaxed tracking-wide">
                Triggers `refresh_fact_sales_data()` (incremental SCD Type 2) and `refresh_fact_inventory_planning()`. Recomputes all dashboard performance cards, trends, and inventory plans.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 2x2 GRID SYSTEM */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
        
        {/* TILE 1: SYSTEM CONNECTIVITY & HEALTH */}
        <SectionTile 
          icon={ShieldCheck} 
          title="Connectivity Status" 
          subtitle="Real-time integration health monitoring"
          accent="border-t-emerald-500"
        >
          <div className="flex-1 overflow-hidden">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-white/5">
                  <th className="pb-3 text-[10px] font-black text-zinc-500 uppercase tracking-widest">Entity</th>
                  <th className="pb-3 text-[10px] font-black text-zinc-500 uppercase tracking-widest">Type</th>
                  <th className="pb-3 text-[10px] font-black text-zinc-500 uppercase tracking-widest">Last Payload</th>
                  <th className="pb-3 text-right text-[10px] font-black text-zinc-500 uppercase tracking-widest">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {healthRows.map(row => (
                  <tr key={row.source} className="group">
                    <td className="py-4 font-black text-white text-[11px] uppercase tracking-tight">{row.source}</td>
                    <td className="py-4 text-[10px] font-bold text-zinc-500 uppercase tracking-widest">{row.type}</td>
                    <td className="py-4 font-data text-xs text-zinc-400">{formatRelativeTime(row.lastUpdated)}</td>
                    <td className="py-4 text-right"><StatusLabel status={row.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
            
            <div className="mt-8 pt-8 border-t border-white/5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Database className="h-4 w-4 text-zinc-500" />
                <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Local Buffer: <span className="text-green-400">OPTIMIZED</span></span>
              </div>
              <button onClick={loadData} className="text-[10px] font-black text-white uppercase tracking-widest hover:text-brand-blue transition-colors flex items-center gap-2.5 bg-white/5 border border-white/10 px-4 py-2 rounded-2xl shadow-xl">
                <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh Connectivity Diagnostics
              </button>
            </div>
          </div>
        </SectionTile>

        {/* TILE 2: LOCAD ECOSYSTEM */}
        <SectionTile 
          icon={Package} 
          title="Locad Logistics Sync" 
          subtitle="Inventory reports & warehouse matching"
          accent="border-t-brand-blue"
        >
          <div className="flex flex-col h-full space-y-6">
            <div className="flex-1">
              <p className="text-[10px] text-zinc-500 uppercase font-bold leading-relaxed mb-4 tracking-wider">
                Reports → Inventory Report → Export (.xlsx)
              </p>
              {locadState.loading ? (
                <div className="h-32 flex flex-col items-center justify-center gap-4 bg-white/5 rounded-2xl border-2 border-dashed border-white/10">
                  <RefreshCw className="h-8 w-8 text-brand-blue animate-spin" />
                  <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Processing Payload...</span>
                </div>
              ) : (
                <DropZone 
                  accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  label="Drop Locad XLSX"
                  onFile={(f) => handleUpload('locad', f)}
                />
              )}
            </div>

            <div className="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/5">
              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Unmapped SKUs</span>
                <span className={`text-xl font-black ${(syncStatus?.locad_xlsx?.rows_unmatched ?? 0) > 0 ? 'text-amber-400' : 'text-green-400'}`}>
                  {syncStatus?.locad_xlsx?.rows_unmatched ?? 0}
                </span>
              </div>
              <button 
                onClick={() => setShowMappingModal(true)}
                disabled={(syncStatus?.locad_xlsx?.rows_unmatched ?? 0) === 0}
                className="px-6 py-2.5 bg-white/5 border border-white/10 rounded-2xl text-[10px] font-black uppercase tracking-widest text-white hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
              >
                Mapping Manager
              </button>
            </div>
            
            {locadState.result && (
              <div className="flex items-center gap-2 text-green-400 text-[10px] font-black uppercase tracking-widest bg-green-500/10 px-3 py-2 rounded-lg">
                <CheckCircle2 className="h-3 w-3" /> {locadState.result.rows_matched} SKUs Synchronized
              </div>
            )}
            {locadState.error && <div className="text-red-400 text-[10px] font-black uppercase tracking-widest">{locadState.error}</div>}
          </div>
        </SectionTile>

        {/* TILE 3: NOON CORE SYNC */}
        <SectionTile 
          icon={Layers} 
          title="Noon Marketplace Sync" 
          subtitle="Sales velocity & FBN inventory payloads"
          accent="border-t-amber-500"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 h-full">
            <div className="flex flex-col h-full">
              <div className="flex items-center gap-2 mb-3">
                <History className="h-3.5 w-3.5 text-amber-500" />
                <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Sales Data</span>
              </div>
              {noonSalesState.loading ? <UploadingState /> : (
                <DropZone 
                  accept=".csv,text/csv"
                  label="Sales CSV"
                  hint="Account Health → Sales"
                  onFile={(f) => handleUpload('noon-sales', f)}
                />
              )}
              {noonSalesState.result && (
                <div className="mt-2 flex flex-col gap-1 bg-green-500/10 px-2 py-1.5 rounded-lg border border-green-500/10">
                  <div className="text-green-400 text-[9px] font-black uppercase flex items-center gap-1.5">
                    <CheckCircle2 className="h-2.5 w-2.5" /> {noonSalesState.result.rows_processed} Orders
                  </div>
                  {(noonSalesState.result as any).message ? (
                    <div className="text-yellow-400/80 text-[8px] font-bold uppercase flex items-center gap-1.5">
                      <Database className="h-2.5 w-2.5" /> {(noonSalesState.result as any).message}
                    </div>
                  ) : (noonSalesState.result as any).raw_rows_inserted !== undefined && (
                    <div className="text-green-400/60 text-[8px] font-bold uppercase flex items-center gap-1.5">
                      <Database className="h-2.5 w-2.5" /> {(noonSalesState.result as any).raw_rows_inserted} Raw Saved
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="flex flex-col h-full">
              <div className="flex items-center gap-2 mb-3">
                <Database className="h-3.5 w-3.5 text-green-500" />
                <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">FBN Inventory</span>
              </div>
              {noonInvState.loading ? <UploadingState label="Syncing Inventory..." /> : (
                <DropZone 
                  accept=".csv,text/csv"
                  label="Inventory CSV"
                  hint="FBN → My Inventory"
                  onFile={(f) => handleUpload('noon-inv', f)}
                />
              )}
              {noonInvState.result && <div className="mt-2 text-green-400 text-[9px] font-black uppercase">{noonInvState.result.rows_matched} SKUs</div>}
            </div>
          </div>
          {noonSalesState.result?.errors && noonSalesState.result.errors.length > 0 && (
            <div className="mt-4 p-4 bg-red-500/10 border border-red-500/20 rounded-2xl">
              <div className="text-red-400 text-[10px] font-black uppercase mb-2">Upload Errors ({noonSalesState.result.errors.length})</div>
              <ul className="text-red-300 text-[9px] font-bold list-disc pl-4 space-y-1 max-h-32 overflow-y-auto custom-scrollbar">
                {noonSalesState.result.errors.map((e, i) => (
                  <li key={i}>Row {e.row}: {e.message}</li>
                ))}
              </ul>
            </div>
          )}
          {noonSalesState.error && <div className="mt-4 text-red-400 text-[10px] font-black uppercase">{noonSalesState.error}</div>}
          {noonInvState.error && <div className="mt-4 text-red-400 text-[10px] font-black uppercase">{noonInvState.error}</div>}
        </SectionTile>

        {/* TILE 4: SPECIAL CHANNELS */}
        <SectionTile 
          icon={Activity} 
          title="Minutes & Micro-Sales" 
          subtitle="Quick-commerce & secondary payloads"
          accent="border-t-purple-500"
        >
          <div className="flex flex-col h-full space-y-6">
            <div className="flex-1">
              <p className="text-[10px] text-zinc-500 uppercase font-bold leading-relaxed mb-4 tracking-wider">
                Minutes Sales Export → CSV Feed
              </p>
              {minutesState.loading ? <UploadingState label="Injecting Minutes Data..." /> : (
                <DropZone 
                  accept=".csv,text/csv"
                  label="Drop Minutes CSV"
                  onFile={(f) => handleUpload('minutes', f)}
                />
              )}
            </div>
            
            <div className="p-4 bg-white/5 rounded-2xl border border-white/5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-purple-500 animate-pulse" />
                <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Channel Resolution</span>
              </div>
              <span className="text-[10px] font-black text-white uppercase tracking-widest">High Precision</span>
            </div>

            {minutesState.result && (
              <div className="flex flex-col gap-2 bg-green-500/10 px-3 py-2 rounded-lg">
                <div className="flex items-center gap-2 text-green-400 text-[10px] font-black uppercase tracking-widest">
                  <CheckCircle2 className="h-3 w-3" /> {minutesState.result.rows_processed} Orders Injected
                </div>
                {(minutesState.result as any).message ? (
                  <div className="flex items-center gap-2 text-yellow-400/80 text-[9px] font-bold uppercase tracking-widest">
                    <Database className="h-3 w-3" /> {(minutesState.result as any).message}
                  </div>
                ) : (minutesState.result as any).raw_rows_inserted !== undefined && (
                  <div className="flex items-center gap-2 text-green-400/70 text-[9px] font-bold uppercase tracking-widest">
                    <Database className="h-3 w-3" /> {(minutesState.result as any).raw_rows_inserted} Raw Rows Saved
                  </div>
                )}
              </div>
            )}
            {minutesState.result?.errors && minutesState.result.errors.length > 0 && (
              <div className="mt-4 p-4 bg-red-500/10 border border-red-500/20 rounded-2xl">
                <div className="text-red-400 text-[10px] font-black uppercase mb-2">Upload Errors ({minutesState.result.errors.length})</div>
                <ul className="text-red-300 text-[9px] font-bold list-disc pl-4 space-y-1 max-h-32 overflow-y-auto custom-scrollbar">
                  {minutesState.result.errors.map((e, i) => (
                    <li key={i}>Row {e.row}: {e.message}</li>
                  ))}
                </ul>
              </div>
            )}
            {minutesState.error && <div className="text-red-400 text-[10px] font-black uppercase tracking-widest">{minutesState.error}</div>}
          </div>
        </SectionTile>

      </div>

      {/* MAPPING MODAL */}
      {showMappingModal && (
        <MappingModal
          onClose={() => setShowMappingModal(false)}
          onSaved={loadData}
          internalSKUs={[]}
        />
      )}
    </div>
  )
}

// ─── MODALS ──────────────────────────────────────────────────────────────────

interface UnmatchedEntry { locad_sku: string; product_name: string }

function MappingModal({ onClose, onSaved, internalSKUs }: { onClose: () => void, onSaved: () => void, internalSKUs: string[] }) {
  const [unmatched, setUnmatched] = useState<UnmatchedEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [mappings, setMappings] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.getLocadUnmatched().then(res => {
      const resAny = res as any
      if (resAny.error) setError(resAny.error)
      else setUnmatched(resAny.unmatched ?? [])
      setLoading(false)
    })
  }, [])

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    const entries = Object.entries(mappings).filter(([, v]) => v !== '')
    for (const [locad_sku, internal_sku] of entries) {
      const result = await api.mapLocadSKU(locad_sku, internal_sku) as any
      if (result.error) { setError(`Failed to map ${locad_sku}: ${result.error}`); setSaving(false); return }
    }
    setSaving(false)
    onSaved(); onClose()
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-2xl max-h-[80vh] flex flex-col bg-slate-900 border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
        <div className="px-6 py-5 border-b border-white/5 flex items-center justify-between bg-white/5">
          <div>
            <h2 className="text-base font-black text-white uppercase tracking-tight">Locad SKU Mapper</h2>
            <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mt-1">Resolution of unknown identifiers</p>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-white transition-colors"><X className="h-6 w-6" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {error && <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-bold uppercase rounded-2xl">{error}</div>}
          {loading ? <LoadingScreen message="Resolving SKUs..." /> : unmatched.length === 0 ? (
            <div className="py-12 text-center flex flex-col items-center gap-4">
              <CheckCircle2 className="h-12 w-12 text-green-500" />
              <p className="text-sm font-black text-white uppercase tracking-widest">Database Synchronized</p>
              <p className="text-xs text-zinc-500 uppercase font-bold">All Locad identifiers are currently matched.</p>
            </div>
          ) : unmatched.map(u => (
            <div key={u.locad_sku} className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-center bg-white/5 border border-white/5 rounded-2xl p-4">
              <div className="flex flex-col">
                <span className="text-[9px] font-black text-zinc-500 uppercase tracking-widest mb-1">Locad SKU</span>
                <span className="font-data text-xs text-white truncate">{u.locad_sku}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-[9px] font-black text-zinc-500 uppercase tracking-widest mb-1">Entity Name</span>
                <span className="text-[11px] font-bold text-zinc-400 truncate uppercase">{u.product_name}</span>
              </div>
              <input
                value={mappings[u.locad_sku] ?? ''}
                onChange={e => setMappings(prev => ({ ...prev, [u.locad_sku]: e.target.value }))}
                placeholder="Match SKU..."
                className="bg-slate-950 border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:ring-2 focus:ring-brand-blue font-data uppercase"
              />
            </div>
          ))}
        </div>

        <div className="px-6 py-5 border-t border-white/5 flex justify-end gap-3 bg-white/5">
          <button onClick={onClose} className="px-6 py-2.5 text-[10px] font-black text-zinc-500 hover:text-white uppercase tracking-widest">Cancel</button>
          <button
            onClick={handleSave}
            disabled={saving || Object.values(mappings).every(v => !v)}
            className="px-6 py-2.5 bg-brand-blue text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-brand-blue/90 disabled:opacity-30 transition-all"
          >
            {saving ? 'Saving...' : 'Commit Mappings'}
          </button>
        </div>
      </div>
    </div>
  )
}
