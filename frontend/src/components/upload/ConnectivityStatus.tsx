import React from 'react'
import { ShieldCheck, Database, RefreshCw } from 'lucide-react'
import { SectionTile, HealthRow, formatRelativeTime, StatusLabel } from './shared'

interface ConnectivityStatusProps {
  healthRows: HealthRow[]
  loading: boolean
  loadData: () => void
}

export function ConnectivityStatus({ healthRows, loading, loadData }: ConnectivityStatusProps) {
  return (
    <SectionTile 
      icon={ShieldCheck} 
      title="Connectivity Status" 
      subtitle="Real-time integration health monitoring"
      accent="border-t-emerald-500"
    >
      <div className="flex-1 overflow-hidden">
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
                <td className="py-4 font-black text-white text-[11px] uppercase tracking-tight"><span className="inline-block transition-transform duration-300 group-hover:scale-[1.15] origin-center">{row.source}</span></td>
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
