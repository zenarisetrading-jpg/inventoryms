import React from 'react'
import { RefreshCw } from 'lucide-react'

interface OperationsHeaderProps {
  freshCount: number
  staleCount: number
  criticalCount: number
  triggerLoading: boolean
  masterStep: 'amazon-saddl' | 'amazon-fdw' | 'fact-tables' | null
  handleMasterRefresh: () => void
  handleAmazonSync?: () => void
  amazonSyncing?: boolean
}

export function OperationsHeader({
  freshCount, staleCount, criticalCount,
  triggerLoading, masterStep, handleMasterRefresh,
  handleAmazonSync, amazonSyncing
}: OperationsHeaderProps) {
  return (
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

        {handleAmazonSync && (
          <button
            type="button"
            onClick={handleAmazonSync}
            disabled={amazonSyncing || triggerLoading}
            className="flex items-center gap-2.5 px-5 py-3.5 bg-amber-500 text-black font-black rounded-2xl text-[10px] uppercase tracking-widest hover:bg-amber-400 shadow-xl shadow-amber-500/10 transition-all active:scale-95 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${amazonSyncing ? 'animate-spin' : ''}`} />
            {amazonSyncing ? 'Syncing Amazon...' : 'Amazon API Sync'}
          </button>
        )}
        
        <button
          onClick={handleMasterRefresh}
          disabled={triggerLoading || amazonSyncing}
          className="flex items-center gap-3 px-6 py-3.5 bg-gradient-to-r from-brand-blue to-indigo-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:from-brand-blue/90 hover:to-indigo-600/90 shadow-xl shadow-brand-blue/20 transition-all active:scale-95 disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${triggerLoading ? 'animate-spin' : ''}`} />
          {triggerLoading ? (
            masterStep === 'amazon-saddl' ? 'Step 1/3: Syncing Saddl...' :
            masterStep === 'amazon-fdw' ? 'Step 2/3: Refreshing FDW...' :
            'Step 3/3: Recomputing Facts...'
          ) : 'Master Ecosystem Refresh'}
        </button>
      </div>
    </div>
  )
}
