import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { Search, Info, ChevronDown, ChevronUp, ArrowUpDown, ArrowUp, ArrowDown, Edit2, Check, X, Package, Plus, Filter, Globe, Layers } from 'lucide-react'
import { api } from '../lib/api'
import type { SKUListItem } from '../types'
import { navigate } from '../lib/router'
import { Toggle } from '../components/shared/Toggle'
import { MultiSelect } from '../components/shared/MultiSelect'

type SortKey = 'sku' | 'name' | 'asin' | 'fnsku' | 'product_category' | 'sub_category' | 'category' | 'units_per_box' | 'moq' | 'lead_time_days' | 'cogs' | 'blended_sv' | 'is_live' | 'is_active' | 'action_flag'
type SortDir = 'asc' | 'desc'

const FLAG_ORDER: Record<string, number> = {
  CRITICAL_OOS_RISK: 0, OOS_RISK: 1, SHIP_NOW: 2, REORDER: 3, TRANSFER: 4, EXCESS: 5, OK: 6,
}

function SortIcon({ col, sortKey, sortDir }: { col: SortKey; sortKey: SortKey; sortDir: SortDir }) {
  if (col !== sortKey) return <ArrowUpDown className="inline h-3 w-3 ml-1 text-zinc-300" />
  return sortDir === 'asc'
    ? <ArrowUp className="inline h-3 w-3 ml-1 text-brand-blue" />
    : <ArrowDown className="inline h-3 w-3 ml-1 text-brand-blue" />
}

const ABC_GUIDE = [
  {
    cat: 'A',
    label: 'Top movers',
    color: 'text-amber-700 bg-amber-50 border-amber-200',
    dotColor: 'bg-amber-500',
    desc: 'High-velocity, high-revenue SKUs',
    reorder: 45,
    min: 60,
  },
  {
    cat: 'B',
    label: 'Mid-tier',
    color: 'text-blue-700 bg-blue-50 border-blue-200',
    dotColor: 'bg-blue-500',
    desc: 'Steady sellers, moderate revenue',
    reorder: 30,
    min: 45,
  },
  {
    cat: 'C',
    label: 'Long tail',
    color: 'text-zinc-600 bg-zinc-50 border-zinc-200',
    dotColor: 'bg-zinc-400',
    desc: 'Slow movers, low revenue share',
    reorder: 20,
    min: 20,
  },
]

// ─── Inline Category Editor ───────────────────────────────────────────────────

function CategoryEdit({
  sku,
  current,
  onSaved,
}: {
  sku: string
  current: string | null
  onSaved: (cat: string | null) => void
}) {
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const handleSet = async (e: React.MouseEvent, cat: string | null) => {
    e.stopPropagation()
    setSaving(true)
    await api.updateSKU(sku, { category: cat })
    setSaving(false)
    setOpen(false)
    onSaved(cat)
  }

  return (
    <div ref={ref} className="relative" onClick={e => e.stopPropagation()}>
      <button
        onClick={e => { e.stopPropagation(); setOpen(o => !o) }}
        disabled={saving}
        className="flex items-center gap-1 group"
        title="Click to set ABC category"
      >
        {current ? (
          <span className="text-[11px] font-black text-zinc-700 bg-zinc-100 border border-zinc-200 px-2 py-0.5 rounded group-hover:border-brand-amber group-hover:bg-amber-50 transition-colors">
            {current}
          </span>
        ) : (
          <span className="text-[11px] text-zinc-300 border border-dashed border-zinc-200 px-2 py-0.5 rounded group-hover:border-brand-amber transition-colors">
            —
          </span>
        )}
        {saving ? (
          <span className="w-3 h-3 border-2 border-brand-amber border-t-transparent rounded-full animate-spin" />
        ) : (
          <ChevronDown className="h-3 w-3 text-zinc-300 group-hover:text-brand-amber transition-colors" />
        )}
      </button>

      {open && (
        <div className="absolute z-20 top-full left-0 mt-1 bg-white border border-zinc-200 rounded-xl shadow-xl p-2 flex gap-1.5 min-w-max animate-in fade-in zoom-in-95 duration-100">
          {ABC_GUIDE.map(g => (
            <button
              key={g.cat}
              onClick={e => handleSet(e, g.cat)}
              className={`px-3 py-1.5 text-[10px] font-black rounded-lg border transition-all ${g.color} hover:scale-105 active:scale-95`}
            >
              {g.cat}
            </button>
          ))}
          {current && (
            <button
              onClick={e => handleSet(e, null)}
              className="px-2 py-1 text-xs text-zinc-400 border border-dashed border-zinc-200 rounded-lg hover:text-rose-500 hover:border-rose-200 transition-colors"
            >
              ×
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function CogsEdit({
  sku,
  current,
  onSaved,
}: {
  sku: string
  current: number | null
  onSaved: (cogs: number | null) => void
}) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(current?.toString() ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(false)

  const handleSave = async (e?: React.FormEvent) => {
    e?.preventDefault()
    e?.stopPropagation()
    const num = parseFloat(value)
    if (isNaN(num)) { setError(true); return }
    
    setSaving(true)
    try {
      await api.updateSKU(sku, { cogs: num })
      onSaved(num)
      setEditing(false)
    } catch (err) {
      setError(true)
    } finally {
      setSaving(false)
    }
  }

  if (editing) {
    return (
      <form 
        onClick={e => e.stopPropagation()} 
        onSubmit={handleSave}
        className="flex items-center gap-1.5 min-w-[120px]"
      >
        <input
          autoFocus
          type="number"
          step="0.01"
          className={`w-full px-2 py-1 text-xs font-black border rounded-lg outline-none transition-all ${error ? 'border-rose-500 bg-rose-50 text-rose-700' : 'border-brand-blue/30 focus:ring-4 focus:ring-brand-blue/10 focus:border-brand-blue'}`}
          value={value}
          onChange={e => { setValue(e.target.value); setError(false) }}
          onKeyDown={e => { if (e.key === 'Escape') setEditing(false) }}
        />
        <button type="submit" disabled={saving} className="p-1 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors">
          {saving ? <span className="w-3.5 h-3.5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin block" /> : <Check className="h-4 w-4" />}
        </button>
        <button type="button" onClick={() => setEditing(false)} className="p-1 text-zinc-400 hover:bg-zinc-100 rounded-lg transition-colors">
          <X className="h-4 w-4" />
        </button>
      </form>
    )
  }

  return (
    <div 
      className="flex items-center justify-end gap-2 group/cogs cursor-pointer"
      onClick={e => { e.stopPropagation(); setEditing(true); setValue(current?.toString() ?? '') }}
    >
      <span className="font-black text-[13px] text-sidebar">
        {current != null ? Number(current).toFixed(2) : '—'}
      </span>
      <Edit2 className="h-3 w-3 text-zinc-300 group-hover/cogs:text-brand-blue opacity-0 group-hover/cogs:opacity-100 transition-all" />
    </div>
  )
}

// ─── Main SKU Catalog Page ───────────────────────────────────────────────────

export default function SKUCatalog() {
  const [skus, setSkus] = useState<SKUListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selectedTiers, setSelectedTiers] = useState<string[]>([])
  const [sortKey, setSortKey] = useState<SortKey>('sku')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [showInactive, setShowInactive] = useState<string>('active')
  const [selectedCategories, setSelectedCategories] = useState<string[]>([])
  const [selectedSubCategories, setSelectedSubCategories] = useState<string[]>([])
  const [selectedMarketplaces, setSelectedMarketplaces] = useState<string[]>([])

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }

  const sortedSkus = useMemo(() => {
    return [...skus].sort((a, b) => {
      let cmp = 0
      if (sortKey === 'blended_sv') {
        cmp = (a.demand?.blended_sv ?? -1) - (b.demand?.blended_sv ?? -1)
      } else if (sortKey === 'action_flag') {
        cmp = (FLAG_ORDER[a.action_flag ?? ''] ?? 99) - (FLAG_ORDER[b.action_flag ?? ''] ?? 99)
      } else if (sortKey === 'is_live') {
        cmp = (b.is_live ? 1 : 0) - (a.is_live ? 1 : 0)
      } else if (sortKey === 'is_active') {
        cmp = (b.is_active ? 1 : 0) - (a.is_active ? 1 : 0)
      } else if (typeof a[sortKey] === 'number' && typeof b[sortKey] === 'number') {
        cmp = (a[sortKey] as number) - (b[sortKey] as number)
      } else {
        const av = (a[sortKey] ?? '') as string
        const bv = (b[sortKey] ?? '') as string
        cmp = av.localeCompare(bv)
      }
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [skus, sortKey, sortDir])

  const load = useCallback(() => {
    setLoading(true)
    api.getSKUs({
      search: search || undefined,
    }).then(res => {
      const resAny = res as unknown as { error?: string; skus?: SKUListItem[] }
      let fetched = resAny.skus ?? []
      
      // Local filtering for multi-select
      if (showInactive === 'active') fetched = fetched.filter(s => s.is_active)
      else if (showInactive === 'inactive') fetched = fetched.filter(s => !s.is_active)
      
      if (selectedTiers.length > 0) {
        fetched = fetched.filter(s => s.category && selectedTiers.includes(s.category))
      }

      if (selectedCategories.length > 0) {
        fetched = fetched.filter(s => s.product_category && selectedCategories.includes(s.product_category))
      }

      if (selectedSubCategories.length > 0) {
        fetched = fetched.filter(s => s.sub_category && selectedSubCategories.includes(s.sub_category))
      }
      
      if (selectedMarketplaces.length > 0) {
        // filter logic if markers available
      }
      
      setSkus(fetched)
      setLoading(false)
    })
  }, [search, selectedTiers, showInactive, selectedCategories, selectedSubCategories, selectedMarketplaces])

  useEffect(() => {
    const timeout = setTimeout(load, 300)
    return () => clearTimeout(timeout)
  }, [load])

  const handleCategoryUpdate = (sku: string, next: string | null) => {
    setSkus(prev => prev.map(s => s.sku === sku ? { ...s, category: next as any } : s))
  }

  const handleActiveToggle = async (sku: string, next: boolean) => {
    setSkus(prev => prev.map(s => s.sku === sku ? { ...s, is_active: next } : s))
    await api.updateSKU(sku, { is_active: next })
  }

  const handleCogsUpdate = (sku: string, newCogs: number | null) => {
    setSkus(prev => prev.map(s => s.sku === sku ? { ...s, cogs: newCogs } : s))
  }

  const columns: { key: SortKey; label: string; align: 'left' | 'right'; note?: string; width: string }[] = [
    { key: 'sku', label: 'SKU', align: 'left', width: '220px' },
    { key: 'name', label: 'NAME', align: 'left', width: '300px' },
    { key: 'asin', label: 'ASIN', align: 'left', width: '130px' },
    { key: 'fnsku', label: 'FNSKU', align: 'left', width: '130px' },
    { key: 'category', label: 'ABC', align: 'left', note: 'click to edit', width: '100px' },
    { key: 'product_category', label: 'CATEGORY', align: 'left', width: '150px' },
    { key: 'sub_category', label: 'SUB-CATEGORY', align: 'left', width: '150px' },
    { key: 'cogs', label: 'AED COGS', align: 'right', note: 'click to edit', width: '120px' },
    { key: 'is_active', label: 'ACTIVE', align: 'left', width: '100px' },
    { key: 'is_live', label: 'LIVE', align: 'left', width: '100px' },
  ]

  const categoryOptions = useMemo(() => {
     return Array.from(new Set(skus.map(s => s.product_category).filter(Boolean))).sort().map(c => ({ label: c!.toUpperCase(), value: c! }))
  }, [skus])

  const subCategoryOptions = useMemo(() => {
    return Array.from(new Set(skus.map(s => s.sub_category).filter(Boolean))).sort().map(c => ({ label: c!.toUpperCase(), value: c! }))
  }, [skus])

  return (
    <div className="flex flex-col gap-8 -mt-4 lg:-mt-8 pb-12">
      {/* ── HEADER ─────────────────────────────────────────────────────── */}
      <div className="flex flex-col xl:flex-row items-start xl:items-center justify-between gap-6 bg-white p-6 rounded-2xl border border-zinc-200 shadow-sm sticky top-0 z-40 lg:top-[-32px]">
        <div className="flex items-center gap-4">
           <div className="w-10 h-10 lg:w-12 lg:h-12 rounded-xl bg-sidebar flex items-center justify-center text-brand-blue shadow-lg shrink-0">
              <Package className="w-5 h-5 lg:w-6 lg:h-6" />
           </div>
           <div>
              <h1 className="text-xl lg:text-2xl font-black text-sidebar uppercase tracking-tight leading-none">SKU Catalog</h1>
              <p className="text-[9px] lg:text-[11px] font-bold text-muted uppercase tracking-[0.2em] mt-1 lg:mt-2 opacity-60">Global Master Control Center</p>
           </div>
        </div>

        <div className="flex items-center gap-3">
          <button 
             onClick={() => navigate('/skus/new')}
             className="flex items-center gap-1.5 lg:gap-2 px-4 py-2 lg:px-6 lg:py-3 bg-brand-amber text-sidebar rounded-xl text-[10px] lg:text-xs font-black uppercase hover:opacity-90 transition-all shadow-md active:scale-95 whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            New Entry
          </button>
        </div>
      </div>

      {/* ── FILTERS & TOC ────────────────────────────────────────────────── */}
      <div className="bg-white p-4 rounded-2xl border border-zinc-200 shadow-sm flex flex-col xl:flex-row items-center gap-4">
          <div className="relative group flex-1 w-full">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400 group-focus-within:text-brand-blue transition-colors" />
            <input
              type="text"
              placeholder="QUICK SCAN SKU OR NAME..."
              className="w-full pl-11 pr-4 py-3 bg-zinc-50 border-transparent rounded-xl text-[13px] font-bold uppercase focus:ring-0 outline-none transition-all placeholder:text-zinc-300"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <MultiSelect
              label="Markets"
              placeholder="ALL MARKETS"
              icon={Globe}
              options={[{label: 'AMAZON', value: 'amazon'}, {label: 'NOON', value: 'noon'}]}
              selected={selectedMarketplaces}
              onChange={setSelectedMarketplaces}
            />
            
            <MultiSelect
              label="Category"
              placeholder="ALL CATEGORIES"
              icon={Filter}
              options={categoryOptions}
              selected={selectedCategories}
              onChange={setSelectedCategories}
            />

            <MultiSelect
              label="SubCategory"
              placeholder="ALL SUB-CAT"
              icon={Layers}
              options={subCategoryOptions}
              selected={selectedSubCategories}
              onChange={setSelectedSubCategories}
            />

            <MultiSelect
              label="Tiers"
              placeholder="ALL TIERS"
              icon={ArrowUpDown}
              options={[{label: 'TIER A', value: 'A'}, {label: 'TIER B', value: 'B'}, {label: 'TIER C', value: 'C'}]}
              selected={selectedTiers}
              onChange={setSelectedTiers}
            />

             <select
                value={showInactive}
                onChange={e => setShowInactive(e.target.value)}
                className="px-4 py-2 bg-zinc-50 border border-zinc-100 rounded-xl text-[11px] font-black uppercase text-zinc-700 outline-none cursor-pointer appearance-none min-w-[140px]"
              >
                <option value="active">ACTIVE ONLY</option>
                <option value="inactive">INACTIVE ONLY</option>
                <option value="all">ALL STATUS</option>
              </select>
          </div>
      </div>

      {/* ── DATA GRID ──────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-zinc-200 shadow-xl overflow-hidden flex flex-col max-h-[calc(100vh-220px)]">
        <div className="overflow-auto custom-scrollbar flex-1 relative">
          <table className="w-fit min-w-full border-collapse">
            <thead className="sticky top-0 z-30 bg-zinc-900 shadow-xl">
              <tr>
                {columns.map((col, i) => (
                  <th
                    key={col.key}
                    style={{ width: col.width, minWidth: col.width }}
                    onClick={() => handleSort(col.key)}
                    className={`
                      px-4 py-3 text-left cursor-pointer transition-all hover:bg-zinc-800 group border-b border-zinc-800
                      ${i === 0 ? 'sticky left-0 z-40 bg-zinc-900 border-r border-zinc-800' : ''}
                      ${col.align === 'right' ? 'text-right' : 'text-left'}
                    `}
                  >
                    <div className={`flex items-center gap-2 ${col.align === 'right' ? 'justify-end' : ''}`}>
                      <span className="text-[12px] font-black text-zinc-400 uppercase tracking-widest group-hover:text-white transition-colors">
                        {col.label}
                      </span>
                      {col.note && <span className="text-[9px] font-bold text-zinc-600 normal-case italic">{col.note}</span>}
                      <SortIcon col={col.key} sortKey={sortKey} sortDir={sortDir} />
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {loading ? (
                [...Array(10)].map((_, i) => <SkeletonRow key={i} colCount={columns.length} />)
              ) : sortedSkus.length === 0 ? (
                <tr>
                  <td colSpan={columns.length} className="px-12 py-24 text-center">
                    <p className="text-[13px] font-black text-zinc-400 uppercase tracking-widest leading-loose">
                       SCAN COMPLETE: 0 MATCHES FOUND.
                    </p>
                  </td>
                </tr>
              ) : (
                sortedSkus.map((sku, idx) => (
                  <tr
                    key={sku.sku}
                    className="group hover:bg-brand-blue/5 transition-colors"
                  >
                    {columns.map((col, i) => (
                      <td
                        key={col.key}
                        style={{ width: col.width, minWidth: col.width }}
                        onClick={() => i < 4 && navigate('/sku/' + sku.sku)}
                        className={`
                          px-4 py-2 h-[48px] border-zinc-50
                          ${i === 0 ? 'sticky left-0 z-20 bg-white group-hover:bg-brand-blue/5 border-r border-zinc-100' : ''}
                          ${col.align === 'right' ? 'text-right' : 'text-left'}
                          ${i < 4 ? 'cursor-pointer' : ''}
                        `}
                      >
                        {renderValue(col.key, sku, handleCategoryUpdate, handleActiveToggle, handleCogsUpdate)}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Footer Stats */}
        <div className="px-8 py-4 bg-zinc-50 border-t border-zinc-100 flex items-center justify-between z-30 shrink-0">
           <div className="flex items-center gap-6">
              <p className="text-[12px] font-black uppercase text-sidebar">Items Logged: {skus.length}</p>
              <div className="flex items-center gap-2">
                 <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-sm" />
                 <p className="text-[12px] font-black uppercase text-emerald-600">LIVE FEED ACTIVE</p>
              </div>
           </div>
           <p className="text-[11px] font-bold uppercase text-zinc-400 tracking-widest opacity-60">
             Logistics Engine v2.4 • Buffer: {sortedSkus.length} Items
           </p>
        </div>
      </div>
      
      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 8px;
          height: 8px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: #f8fafc;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #cbd5e1;
          border-radius: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #94a3b8;
        }
      `}</style>
    </div>
  )
}

function renderValue(key: SortKey, sku: SKUListItem, onCategorySaved: any, onActiveToggle: any, onCogsSaved: any) {
  if (key === 'sku') return <span className="font-black text-brand-blue text-[13px] hover:underline underline-offset-4">{sku.sku}</span>
  if (key === 'name') return <span className="text-[13px] font-bold text-sidebar line-clamp-1">{sku.name}</span>
  if (key === 'asin') return <span className="text-[11px] font-bold text-zinc-400 font-data">{sku.asin || '—'}</span>
  if (key === 'fnsku') return <span className="text-[11px] font-bold text-zinc-400 font-data">{sku.fnsku || '—'}</span>
  if (key === 'category') return (
    <CategoryEdit
      sku={sku.sku}
      current={sku.category ?? null}
      onSaved={cat => onCategorySaved(sku.sku, cat)}
    />
  )
  if (key === 'product_category') return <span className="text-[11px] font-bold text-zinc-500 uppercase">{sku.product_category || '—'}</span>
  if (key === 'sub_category') return <span className="text-[11px] font-bold text-zinc-500 uppercase">{sku.sub_category || '—'}</span>
  if (key === 'cogs') return (
    <CogsEdit
      sku={sku.sku}
      current={sku.cogs ?? null}
      onSaved={newCogs => onCogsSaved(sku.sku, newCogs)}
    />
  )
  if (key === 'is_active') return (
    <Toggle 
      checked={sku.is_active} 
      onChange={(next) => onActiveToggle(sku.sku, next)}
      label={sku.is_active ? 'Active' : 'Inactive'}
    />
  )
  if (key === 'is_live') return sku.is_live ? (
    <span className="inline-flex items-center gap-1.5 text-[10px] font-black text-emerald-600 bg-emerald-50 border border-emerald-100 px-2.5 py-1 rounded-full uppercase">
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-sm" />
      Live
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 text-[10px] font-black text-zinc-400 bg-zinc-50 border border-zinc-100 px-2.5 py-1 rounded-full uppercase opacity-50">
      Closed
    </span>
  )
  
  return <span className="text-[11px] font-bold text-zinc-600">{String((sku as any)[key] ?? '—')}</span>
}

function SkeletonRow({ colCount }: { colCount: number }) {
  return (
    <tr className="animate-pulse">
      {[...Array(colCount)].map((_, i) => (
        <td key={i} className="px-6 py-4">
          <div className="h-4 bg-zinc-100 rounded-lg w-full" />
        </td>
      ))}
    </tr>
  )
}
