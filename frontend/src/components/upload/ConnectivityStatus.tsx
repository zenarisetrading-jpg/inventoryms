import React from 'react'
import { ShieldCheck, Database, RefreshCw, CheckCircle2, AlertTriangle } from 'lucide-react'
import { SectionTile, HealthRow, formatRelativeTime, StatusLabel } from './shared'

interface ConnectivityStatusProps {
  healthRows: HealthRow[]
  loading: boolean
  loadData: () => void
  onAmazonSync?: () => void
  amazonSyncing?: boolean
  amazonSyncSuccess?: string | null
  amazonSyncError?: string | null
}

export function ConnectivityStatus({
  healthRows, loading, loadData,
  onAmazonSync, amazonSyncing, amazonSyncSuccess, amazonSyncError
}: ConnectivityStatusProps) {
  return (
    <SectionTile 
      icon={ShieldCheck} 
      title="Connectivity Status" 
      subtitle="Real-time integration health monitoring"
      accent="border-t-emerald-500"
      headerAction={
        onAmazonSync && (
          <button
            type="button"
            onClick={onAmazonSync}
            disabled={amazonSyncing || loading}
            className="flex items-center gap-2 px-3 py-1.5 bg-amber-500 text-black font-black rounded-xl text-[10px] uppercase tracking-widest hover:bg-amber-400 disabled:opacity-50 transition-all shadow-md shadow-amber-500/10"
          >
            <RefreshCw className={`h-3 w-3 ${amazonSyncing ? 'animate-spin' : ''}`} />
            {amazonSyncing ? 'Syncing...' : 'Amazon API Sync'}
          </button>
        )
      }
    >
      <div className="flex-1 overflow-hidden">
        {amazonSyncSuccess && (
          <div className="mb-4 text-[9px] font-bold text-green-400 bg-green-500/10 border border-green-500/20 px-3 py-2 rounded-xl flex items-center gap-2">
            <CheckCircle2 className="h-3 w-3 shrink-0" />
            <span>{amazonSyncSuccess}</span>
          </div>
        )}
        {amazonSyncError && (
          <div className="mb-4 text-[9px] font-bold text-red-400 bg-red-500/10 border border-red-500/20 px-3 py-2 rounded-xl flex items-center gap-2">
            <AlertTriangle className="h-3 w-3 shrink-0" />
            <span>{amazonSyncError}</span>
          </div>
        )}

        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-white/5 group">
              <th className="pb-3 text-[10px] font-black text-zinc-500 uppercase tracking-widest">Entity</th>
              <th className="pb-3 text-[10px] font-black text-zinc-500 uppercase tracking-widest">Type</th>
              <th className="pb-3 text-[10px] font-black text-zinc-500 uppercase tracking-widest">Last Payload</th>
              <th className="pb-3 text-right text-[10px] font-black text-zinc-500 uppercase tracking-widest">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {healthRows.map(row => (
              <tr className="group hover:bg-white/10 transition-colors" key={row.source}>
                <td className="py-4 font-black text-white text-[11px] uppercase tracking-tight flex items-center gap-2">
                  <span className="inline-block transition-transform duration-300 group-hover:scale-[1.15] origin-center">{row.source}</span>
                  {row.source === 'Amazon' && onAmazonSync && (
                    <button
                      type="button"
                      onClick={onAmazonSync}
                      disabled={amazonSyncing || loading}
                      className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-400 text-[8px] font-black uppercase tracking-wider disabled:opacity-50 transition-all"
                      title="Sync Amazon API directly"
                    >
                      <RefreshCw className={`h-2.5 w-2.5 ${amazonSyncing ? 'animate-spin' : ''}`} />
                      Sync API
                    </button>
                  )}
                </td>
                <td className="py-4 text-[10px] font-bold text-zinc-500 uppercase tracking-widest"><span className="inline-block transition-transform duration-300 group-hover:scale-[1.15] origin-center">{row.type}</span></td>
                <td className="py-4 font-data text-xs text-zinc-400"><span className="inline-block transition-transform duration-300 group-hover:scale-[1.15] origin-center">{formatRelativeTime(row.lastUpdated)}</span></td>
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
  )
}
