import React from 'react'
import { Activity, RefreshCw, ShieldCheck, X } from 'lucide-react'

interface OperationsHeaderProps {
  freshCount: number
  staleCount: number
  criticalCount: number
  triggerLoading: boolean
  masterStep: 'amazon-saddl' | 'amazon-fdw' | 'fact-tables' | null
  handleMasterRefresh: () => void
  showGuide: boolean
  setShowGuide: (v: boolean) => void
}

export function OperationsHeader({
  freshCount, staleCount, criticalCount,
  triggerLoading, masterStep, handleMasterRefresh,
  showGuide, setShowGuide
}: OperationsHeaderProps) {
  return (
    <>
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
    </>
  )
}
