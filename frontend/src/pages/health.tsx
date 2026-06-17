import { useEffect, useState } from 'react'
import { CheckCircle2, AlertTriangle, XCircle, RefreshCw } from 'lucide-react'
import { api } from '../lib/api'
import type { SyncStatus } from '../types'
import { navigate } from '../lib/router'

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

function StatusIndicator({ status }: { status: 'fresh' | 'stale' | 'old' | 'missing' | 'ok' | 'error' | 'warning' }) {
  if (status === 'fresh' || status === 'ok') {
    return <CheckCircle2 className="h-4 w-4 text-green-500" />
  }
  if (status === 'stale' || status === 'warning') {
    return <AlertTriangle className="h-4 w-4 text-amber-500" />
  }
  return <XCircle className="h-4 w-4 text-red-500" />
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
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium border ${cfg.cls}`}>
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
  action: { label: string; path: string }
}

function buildHealthRows(syncStatus: SyncStatus): HealthRow[] {
  const rows: HealthRow[] = []

  // Amazon (auto via Saddl)
  const amzStatus = syncStatus.amazon?.status === 'connected'
    ? staleness(syncStatus.amazon.last_synced) === 'missing'
      ? 'warning'
      : staleness(syncStatus.amazon.last_synced) === 'fresh'
        ? 'ok'
        : 'stale'
    : 'error'

  rows.push({
    source: 'Amazon',
    type: 'Auto (Saddl)',
    lastUpdated: syncStatus.amazon?.last_synced ?? null,
    status: amzStatus,
    detail: syncStatus.amazon?.status === 'error' ? 'Connection error' : undefined,
    action: { label: 'Sync', path: '/' },
  })

  // Locad Warehouse freshness should reflect API inventory pulls first.
  // XLSX timestamp is only a fallback/manual path.
  const locadTs = syncStatus.locad_api?.last_synced ?? syncStatus.locad_xlsx?.last_uploaded ?? null
  const locadStatus = staleness(locadTs)
  rows.push({
    source: 'Warehouse (Locad)',
    type: syncStatus.locad_api?.last_synced ? 'API (Locad)' : 'Manual XLSX',
    lastUpdated: locadTs,
    status: locadStatus,
    detail: syncStatus.locad_api?.last_synced
      ? 'Live inventory sync enabled'
      : (syncStatus.locad_xlsx?.rows_unmatched ?? 0) > 0
      ? `${syncStatus.locad_xlsx!.rows_unmatched} unmatched SKUs`
      : syncStatus.locad_xlsx?.rows_matched
        ? `${syncStatus.locad_xlsx.rows_matched} SKUs matched`
        : undefined,
    action: { label: 'Upload', path: '/upload' },
  })

  // Noon Sales (manual CSV)
  const noonTs = syncStatus.noon_csv?.last_uploaded ?? null
  const noonStatus = staleness(noonTs)
  rows.push({
    source: 'Noon Sales',
    type: 'Manual CSV',
    lastUpdated: noonTs,
    status: noonStatus,
    action: { label: 'Upload', path: '/upload' },
  })

  // Noon Inventory (manual CSV)
  const noonInvTs = syncStatus.noon_inventory?.last_uploaded ?? null
  const noonInvStatus = staleness(noonInvTs)
  rows.push({
    source: 'Noon Inventory',
    type: 'Manual CSV',
    lastUpdated: noonInvTs,
    status: noonInvStatus,
    action: { label: 'Upload', path: '/upload' },
  })

  return rows
}

function SummaryCard({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div className="bg-card border border-white/5 rounded-xl px-5 py-4">
      <div className="text-xs font-black text-zinc-400 uppercase tracking-[0.1em] mb-2">{label}</div>
      <div className={`text-2xl font-black font-data ${color} tracking-tight`}>{value}</div>
    </div>
  )
}

export default function HealthPage() {
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [syncError, setSyncError] = useState<string | null>(null)

  const load = () => {
    setLoading(true)
    api.getSyncStatus().then(res => {
      const resAny = res as unknown as { error?: string }
      if (!resAny.error) setSyncStatus(res as unknown as SyncStatus)
      setLoading(false)
    })
  }

  useEffect(() => { load() }, [])

  const handleSync = async () => {
    setSyncing(true)
    setSyncError(null)
    const res = await api.triggerSync('amazon')
    setSyncing(false)
    const resAny = res as unknown as { error?: string }
    if (resAny.error) setSyncError(resAny.error)
    else load()
  }

  const rows = syncStatus ? buildHealthRows(syncStatus) : []
  const freshCount = rows.filter(r => r.status === 'fresh' || r.status === 'ok').length
  const staleCount = rows.filter(r => r.status === 'stale' || r.status === 'warning').length
  const missingCount = rows.filter(r => r.status === 'old' || r.status === 'missing' || r.status === 'error').length

  return (
    <div className="w-full max-w-[1920px] mx-auto space-y-6 px-4 sm:px-6 lg:px-8 py-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl lg:text-2xl font-black text-white uppercase tracking-tight">System Data Health</h1>
          <p className="text-xs font-bold text-zinc-400 uppercase tracking-wider opacity-60 mt-1">Monitor data freshness and synchronization status across all connectors</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={load}
            disabled={loading}
            className="p-2 text-zinc-400 hover:bg-white/5 rounded-lg transition-colors border border-white/10"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={handleSync}
            disabled={syncing}
            className="flex items-center gap-2 px-4 py-2 text-sm font-bold bg-brand-blue text-white rounded-lg shadow-lg shadow-brand-blue/20 hover:bg-brand-blue/90 disabled:opacity-50 transition-all uppercase tracking-wider"
          >
            {syncing ? 'Syncing...' : 'Force Sync Amazon'}
          </button>
        </div>
      </div>

      {syncError && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl flex items-center gap-3">
          <XCircle className="h-5 w-5" />
          <span className="font-medium">Sync failed: {syncError}</span>
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <SummaryCard label="Healthy Sources" value={freshCount} color="text-green-600" />
        <SummaryCard label="Stale Trackers" value={staleCount} color="text-amber-600" />
        <SummaryCard label="Critical/Missing" value={missingCount} color="text-red-600" />
      </div>

      {/* Health table */}
      <div className="bg-card border border-white/5 rounded-xl overflow-hidden shadow-2xl">
        <div className="px-5 py-4 border-b border-white/5 bg-white/5 flex justify-between items-center">
          <h2 className="text-xs font-black text-zinc-400 uppercase tracking-[0.2em]">Source Connectivity Matrix</h2>
          <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Auto-refreshing every 5m</div>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/5 group">
              <th className="text-left px-5 py-3 text-[10px] font-black text-zinc-500 uppercase tracking-widest">Source Entity</th>
              <th className="text-left px-5 py-3 text-[10px] font-black text-zinc-500 uppercase tracking-widest">Integration</th>
              <th className="text-left px-5 py-3 text-[10px] font-black text-zinc-500 uppercase tracking-widest">Last Payload</th>
              <th className="text-left px-5 py-3 text-[10px] font-black text-zinc-500 uppercase tracking-widest">Freshness</th>
              <th className="text-left px-5 py-3 text-[10px] font-black text-zinc-500 uppercase tracking-widest">Diagnostic Detail</th>
              <th className="px-5 py-3 text-right text-[10px] font-black text-zinc-500 uppercase tracking-widest">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {loading ? (
              [...Array(4)].map((_, i) => (
                <tr className="group hover:bg-white/10 transition-colors" key={i}>
                  {[...Array(6)].map((_, j) => (
                    <td key={j} className="px-5 py-4"><div className="animate-pulse h-3 bg-zinc-50 rounded w-full" /></td>
                  ))}
                </tr>
              ))
            ) : rows.length === 0 ? (
              <tr className="group hover:bg-white/10 transition-colors">
                <td colSpan={6} className="px-5 py-10 text-sm text-zinc-400 text-center font-medium"><span className="inline-block transition-transform duration-300 group-hover:scale-[1.15] origin-center">Initializing health monitors...</span></td>
              </tr>
            ) : (
              rows.map(row => (
                <tr className="group hover:bg-white/10 transition-colors hover:bg-white/5" key={row.source}>
                  <td className="px-5 py-4"><div className="flex items-center gap-3">
                      <div className={`w-2 h-2 rounded-full ${
                        row.status === 'ok' || row.status === 'fresh' ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.4)]' :
                        row.status === 'warning' || row.status === 'stale' ? 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.4)]' :
                        'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.4)]'
                      }`} />
                      <span className="font-black text-white uppercase tracking-tight">{row.source}</span>
                    </div></td>
                  <td className="px-5 py-4"><span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest bg-white/5 px-2 py-1 rounded inline-block transition-transform duration-300 group-hover:scale-[1.15] origin-center">
                      {row.type}
                    </span></td>
                  <td className="px-5 py-4 font-data text-xs text-zinc-400"><span className="inline-block transition-transform duration-300 group-hover:scale-[1.15] origin-center">{row.lastUpdated ? formatRelativeTime(row.lastUpdated) : (
                      <span className="text-zinc-600 italic">No data</span>
                    )}</span></td>
                  <td className="px-5 py-4"><StatusLabel status={row.status} /></td>
                  <td className="px-5 py-4 text-xs text-zinc-500 font-medium"><span className="inline-block transition-transform duration-300 group-hover:scale-[1.15] origin-center">{row.detail ?? '—'}</span></td>
                  <td className="px-5 py-4 text-right"><button
                      onClick={() => navigate(row.action.path)}
                      className="text-[10px] font-black uppercase tracking-widest text-brand-blue hover:text-brand-blue/80 opacity-0 group-hover:opacity-100 transition-all underline underline-offset-4"
                    >
                      {row.action.label}
                    </button></td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Guidance */}
      <div className="bg-zinc-900 border border-white/10 rounded-xl px-6 py-5 flex items-center justify-between text-white shadow-xl shadow-zinc-900/10">
        <div>
          <h3 className="text-sm font-bold tracking-tight mb-1">Data Freshness Protocols</h3>
          <p className="text-xs text-white/50">Standards for automated and manual data injections</p>
        </div>
        <div className="flex gap-8">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
            <div className="text-[10px] font-bold uppercase tracking-wider text-white/70">Fresh: &lt;6h</div>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-amber-500" />
            <div className="text-[10px] font-bold uppercase tracking-wider text-white/70">Stale: &lt;48h</div>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-red-500" />
            <div className="text-[10px] font-bold uppercase tracking-wider text-white/70">Critical: &gt;48h</div>
          </div>
        </div>
      </div>
    </div>
  )
}
