import React from 'react'
import { LineChart as LineIcon, Filter, Layers, RefreshCw, Search } from 'lucide-react'
import { MultiSelect } from '../shared/MultiSelect'

interface PerformanceHeaderProps {
  days: 7 | 30 | 90
  setDays: (v: 7 | 30 | 90) => void
  search: string
  setSearch: (v: string) => void
  selCategories: string[]
  setSelCategories: (v: string[]) => void
  selProductCategories: string[]
  setSelProductCategories: (v: string[]) => void
  selSubCategories: string[]
  setSelSubCategories: (v: string[]) => void
  detailedSales: any[]
  refreshingConsolidated: boolean
  consolidatedStep: 'idle' | 'amazon' | 'facts'
  handleConsolidatedRefresh: () => void
}

export function PerformanceHeader({
  days, setDays, search, setSearch,
  selCategories, setSelCategories,
  selProductCategories, setSelProductCategories,
  selSubCategories, setSelSubCategories,
  detailedSales,
  refreshingConsolidated, consolidatedStep, handleConsolidatedRefresh
}: PerformanceHeaderProps) {
  return (
    <div className="relative z-50 bg-card border-white/5 shadow-2xl p-6 lg:p-10 rounded-2xl flex flex-col gap-10">
      <div className="flex w-full items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <div className="w-14 h-14 lg:w-16 lg:h-16 rounded-3xl bg-sidebar flex items-center justify-center text-brand-blue shadow-2xl border border-white/5 shrink-0">
              <LineIcon className="w-7 h-7 lg:w-8 lg:h-8" />
            </div>
            <div className="text-center">
              <h1 className="text-2xl lg:text-4xl font-black text-white uppercase tracking-tighter leading-none">Performance Analytics</h1>
              <p className="text-[10px] lg:text-[12px] font-black text-zinc-500 uppercase tracking-[0.4em] mt-3 opacity-80 flex items-center justify-center gap-3">
                <span className="w-2 h-2 rounded-full bg-brand-blue animate-pulse shadow-[0_0_10px_rgba(59,130,246,0.5)]" />
                Commercial Intelligence Engine • Live Stream
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-4 w-full border-t border-white/5 pt-8">
        <div className="flex items-center gap-1 bg-white/5 p-1 rounded-2xl border border-white/10 shrink-0">
          {([7, 30, 90] as const).map(v => (
            <button
              key={v}
              onClick={() => setDays(v)}
              className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer ${days === v ? 'bg-brand-blue text-white shadow-lg shadow-brand-blue/20' : 'text-white hover:text-brand-blue hover:bg-zinc-50/5'}`}
            >
              {v}D
            </button>
          ))}
        </div>

        <div className="relative group w-full lg:max-w-xs xl:max-w-sm">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-white group-focus-within:text-brand-blue transition-colors" />
          <input
            type="text"
            placeholder="SEARCH CATALOG..."
            className="w-full pl-10 pr-4 py-3.5 bg-white/5 border border-white/10 rounded-2xl text-[10px] lg:text-xs text-white focus:outline-none focus:ring-2 focus:ring-brand-blue/50 transition-all placeholder:text-white/40 font-black uppercase tracking-widest"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        <div className="flex flex-wrap items-center justify-center gap-3">
          <MultiSelect
            label="Class"
            placeholder="ALL CLASS"
            icon={Filter}
            options={['A', 'B', 'C'].map(v => ({ label: `CATEGORY ${v}`, value: v }))}
            selected={selCategories}
            onChange={setSelCategories}
          />
          <MultiSelect
            label="Category"
            placeholder="ALL CATEGORYS"
            icon={Filter}
            options={Array.from(new Set(detailedSales.map(r => r.product_category))).filter(Boolean).sort().map(v => ({ label: String(v).toUpperCase(), value: String(v) }))}
            selected={selProductCategories}
            onChange={setSelProductCategories}
          />
          <MultiSelect
            label="Sub Category"
            placeholder="ALL SUB-CATEGORYS"
            icon={Layers}
            options={Array.from(new Set(detailedSales.map(r => r.sub_category))).filter(Boolean).sort().map(v => ({ label: String(v).toUpperCase(), value: String(v) }))}
            selected={selSubCategories}
            onChange={setSelSubCategories}
          />
          <button
            onClick={handleConsolidatedRefresh}
            disabled={refreshingConsolidated}
            className="flex items-center gap-2.5 px-5 py-3.5 bg-gradient-to-r from-brand-blue to-indigo-600 hover:from-brand-blue/90 hover:to-indigo-600/90 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 shadow-xl shadow-brand-blue/20 cursor-pointer whitespace-nowrap"
            title="Sync Amazon Remote Data & Recompute Facts Pipeline sequentially"
          >
            <RefreshCw className={`h-4 w-4 ${refreshingConsolidated ? 'animate-spin' : ''}`} />
            {refreshingConsolidated ? (
              consolidatedStep === 'amazon' ? 'Step 1/2: Syncing...' : 'Step 2/2: Recalculating...'
            ) : 'Sync Amazon & Sales Facts'}
          </button>
        </div>
      </div>
    </div>
  )
}
