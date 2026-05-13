import { useEffect, useState, useMemo } from 'react'
import { Search, Download, RefreshCw, AlertTriangle, ArrowUpDown, ChevronDown, Filter, Layers, Archive, Box, ShoppingCart, Send } from 'lucide-react'
import { api } from '../lib/api'
import type { PlanningResponse } from '../types'
import { MultiSelect } from '../components/shared/MultiSelect'
import { LoadingScreen } from '../components/shared/LoadingScreen'

export default function InventoryPage() {
  const [data, setData] = useState<PlanningResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [sortKey, setSortKey] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [error, setError] = useState<string | null>(null)
  const [selectedCategories, setSelectedCategories] = useState<string[]>([])
  const [selectedSubCategories, setSelectedSubCategories] = useState<string[]>([])
  const [selectedStatus, setSelectedStatus] = useState<string[]>(['active'])

  const fetchData = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await api.getPlanning()
      if ((res as any).error) {
        setError((res as any).error)
      } else {
        setData(res)
      }
    } catch (e: any) {
      setError(e.message || 'Failed to connect to server')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchData() }, [])

  const handleRefresh = async () => {
    setRefreshing(true)
    setError(null)
    try {
      await api.refreshFactTable()
      const res = await api.getPlanning()
      setData(res)
    } catch (e: any) {
      setError('Refresh failed: ' + (e.message || 'Unknown error'))
    } finally {
      setRefreshing(false)
    }
  }

  const handleExport = () => {
    if (!data?.raw_data?.length) return
    const headers = Object.keys(data.raw_data[0]).join(',')
    const rows = data.raw_data.map(row =>
      Object.values(row).map(v => `"${v ?? ''}"`).join(',')
    ).join('\n')
    const blob = new Blob([headers + '\n' + rows], { type: 'text/csv' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `inventory_plan_${new Date().toISOString().split('T')[0]}.csv`
    a.click()
  }

  const columns = useMemo(() => {
    if (!data?.raw_data?.length) return []
    
    // Explicit order as requested by user
    const PREFERRED_ORDER = [
      'sku', 'is_active', 'category', 'sub_category', 'action_flag',
      'fba_units', 'amazon_sv', 'fbn_units', 'noon_sv', 
      'minutes_units', 'minutes_sv', 
      'locad_units', 'locad_boxes', 'units_per_box', 'blended_sv',
      'required_30d', 'stock_in_hand', 'shortfall', 'moq',
      'amazon_coverage', 'noon_coverage', 'total_coverage', 'cogs',
      'suggested_reorder_qty', 'already_ordered', 'pending_qty_to_reorder', 'total_reorder_cost',
      'send_to_fba_units', 'send_to_fbn_units', 'fba_boxes', 'fbn_boxes'
    ]

    const existingKeys = Object.keys(data.raw_data[0])
    const finalKeys = [
      ...PREFERRED_ORDER.filter(k => existingKeys.includes(k)),
      ...existingKeys.filter(k => !PREFERRED_ORDER.includes(k))
    ]

    return finalKeys.map(key => ({
      key,
      label: key === 'required_30d' ? 'REQUIRED STOCK' : key.replace(/_/g, ' ').toUpperCase(),
      width: key === 'sku' ? '240px' : key === 'name' ? '350px' : '160px'
    }))
  }, [data])

  const processedData = useMemo(() => {
    if (!data?.raw_data) return []
    let list = [...data.raw_data]

    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      list = list.filter(item =>
        Object.values(item).some(v => String(v).toLowerCase().includes(q))
      )
    }

    if (selectedStatus.length > 0) {
      list = list.filter(item => {
        if (selectedStatus.includes('active') && selectedStatus.includes('inactive')) return true
        if (selectedStatus.includes('active')) return item.is_active !== false
        if (selectedStatus.includes('inactive')) return item.is_active === false
        return false
      })
    }

    if (selectedCategories.length > 0) {
      list = list.filter(item => selectedCategories.includes((item as any).category || (item as any).abc_class))
    }

    if (selectedSubCategories.length > 0) {
      list = list.filter(item => selectedSubCategories.includes((item as any).sub_category))
    }

    if (sortKey) {
      list.sort((a, b) => {
        const va = (a as any)[sortKey]; const vb = (b as any)[sortKey]
        if (va < vb) return sortDir === 'asc' ? -1 : 1
        if (va > vb) return sortDir === 'asc' ? 1 : -1
        return 0
      })
    }
    return list
  }, [data, searchQuery, sortKey, sortDir, selectedCategories, selectedSubCategories, selectedStatus])

  const totals = useMemo(() => {
    const t: Record<string, number> = {}
    const keysToTotal = [
      'fba_units', 'fbn_units', 'minutes_units', 'locad_units', 'locad_boxes', 'stock_in_hand', 
      'amazon_sv', 'noon_sv', 'minutes_sv', 'blended_sv',
      'shortfall', 'moq', 'suggested_reorder_qty', 'total_reorder_cost',
      'send_to_fba_units', 'send_to_fbn_units', 'fba_boxes', 'fbn_boxes',
      'current_fba_stock_units', 'current_fbn_stock_units', 'stock_in_hand_units',
      'shortfall_units', 'suggested_units', 'total_cost_aed', 'units_to_ship',
      'suggested_units_amazon', 'suggested_units_noon', 'suggested_boxes_amazon', 'suggested_boxes_noon',
      'already_ordered', 'pending_qty_to_reorder'
    ]

    processedData.forEach(row => {
      keysToTotal.forEach(k => {
        const val = (row as any)[k]
        if (typeof val === 'number') {
          t[k] = (t[k] || 0) + val
        }
      })
    })
    return t
  }, [processedData])

  if (loading && !data) return <LoadingScreen message="Synchronizing Master Buffer..." />

  return (
    <div className="flex flex-col gap-6 lg:gap-10 pb-20 px-0 sm:px-4">
      {/* ── TOP CONTROL PANEL ────────────────────────────────────────── */}
      <div className="flex flex-col gap-6 lg:flex-row lg:items-center justify-between bg-white p-6 lg:p-8 rounded-2xl border border-zinc-200 shadow-sm sticky top-0 z-40">
        <div className="flex items-center gap-3 lg:gap-4">
          <div className="w-10 h-10 lg:w-12 lg:h-12 rounded-xl bg-sidebar flex items-center justify-center text-brand-amber shadow-lg shrink-0">
            <Layers className="w-5 h-5 lg:w-6 lg:h-6" />
          </div>
          <div>
            <h1 className="text-lg lg:text-2xl font-black text-sidebar uppercase tracking-tight leading-none">Inventory Matrix</h1>
            <p className="text-[8px] lg:text-[11px] font-bold text-muted uppercase tracking-[0.2em] mt-1 opacity-60">fact_inventory_planning • RAW DATA FEED</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 lg:gap-4 w-full lg:flex-1 lg:justify-end">
          {/* Search */}
          <div className="relative group flex-1 min-w-[140px] lg:max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400 group-focus-within:text-brand-blue transition-colors" />
            <input
              type="text"
              placeholder="SCAN..."
              className="w-full pl-9 pr-4 py-2 bg-zinc-50 border border-zinc-100 rounded-xl text-xs font-semibold uppercase focus:ring-4 focus:ring-brand-blue/10 focus:border-brand-blue outline-none transition-all placeholder:text-zinc-400"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <MultiSelect
              label="Tiers"
              placeholder="TIERS"
              icon={Filter}
              options={[{label: 'TIER A', value: 'A'}, {label: 'TIER B', value: 'B'}, {label: 'TIER C', value: 'C'}]}
              selected={selectedCategories}
              onChange={setSelectedCategories}
            />

            <MultiSelect
              label="Status"
              placeholder="STATUS"
              icon={Filter}
              options={[{ label: 'Active Only', value: 'active' }, { label: 'Inactive Only', value: 'inactive' }]}
              selected={selectedStatus}
              onChange={setSelectedStatus}
            />

            <MultiSelect
              label="SubCategory"
              placeholder="SUB-CAT"
              icon={Layers}
              options={Array.from(new Set((data?.raw_data || []).map((r: any) => r.sub_category).filter(Boolean))).sort().map((c: any) => ({ label: c.toUpperCase(), value: c }))}
              selected={selectedSubCategories}
              onChange={setSelectedSubCategories}
            />
          </div>

          <div className="flex items-center gap-2 ml-auto lg:ml-0">
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="flex items-center gap-2 px-3 py-2 bg-white border border-zinc-200 rounded-xl text-[10px] font-black uppercase text-zinc-900 hover:bg-zinc-50 transition-all disabled:opacity-50 active:scale-95 shadow-sm"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              SYNC
            </button>

            <button
              onClick={handleExport}
              className="flex items-center gap-2 px-4 py-2 bg-sidebar text-brand-amber rounded-xl text-[10px] font-black uppercase hover:bg-sidebar/90 transition-all shadow-md active:scale-95 transition-transform"
            >
              <Download className="h-3.5 w-3.5" />
              EXPORT
            </button>
          </div>
        </div>
      </div>

      {/* ── SUMMARY STATS ────────────────────────────────────────────── */}
      {!error && processedData.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 lg:gap-6">
          <InventoryStatCard 
            title="Channel Stock" 
            icon={Archive}
            accent="text-indigo-600"
            items={[
              { label: 'FBA Units', value: renderCell('fba_units', totals['fba_units'] || totals['current_fba_stock_units']) },
              { label: 'FBN Units', value: renderCell('fbn_units', totals['fbn_units'] || totals['current_fbn_stock_units']) },
              { label: 'Minutes', value: renderCell('minutes_units', totals['minutes_units']) }
            ]}
          />
          <InventoryStatCard 
            title="Warehouse Stock" 
            icon={Box}
            accent="text-emerald-600"
            items={[
              { label: 'Units', value: renderCell('locad_units', totals['locad_units'] || totals['stock_in_hand_units']) },
              { label: 'Boxes', value: renderCell('locad_boxes', totals['locad_boxes'] || totals['boxes_in_hand']) }
            ]}
          />
          <InventoryStatCard 
            title="Sales Velocity" 
            icon={ShoppingCart}
            accent="text-rose-600"
            items={[
              { label: 'Amazon SV', value: renderCell('amazon_sv', totals['amazon_sv']) },
              { label: 'Noon SV', value: renderCell('noon_sv', totals['noon_sv']) },
              { label: 'Minutes SV', value: renderCell('minutes_sv', totals['minutes_sv']) },
              { label: 'Total SV', value: renderCell('blended_sv', totals['blended_sv']) }
            ]}
          />
          <InventoryStatCard 
            title="Reorder" 
            icon={ShoppingCart}
            accent="text-amber-600"
            items={[
              { label: 'Suggested Qty', value: renderCell('suggested_units', totals['suggested_reorder_qty'] || totals['suggested_units']) },
              { label: 'Already Ordered', value: renderCell('already_ordered', totals['already_ordered']) },
              { label: 'Pending Reorder', value: renderCell('pending_qty_to_reorder', totals['pending_qty_to_reorder']) },
              { label: 'Total Cost (AED)', value: renderCell('total_reorder_cost', totals['total_reorder_cost'] || totals['total_cost_aed']) }
            ]}
          />
          <InventoryStatCard 
            title="Send to FBA/N" 
            icon={Send}
            accent="text-brand-blue"
            items={[
              { label: 'FBA Units', value: renderCell('send_to_fba_units', totals['send_to_fba_units'] || totals['suggested_units_amazon']) },
              { label: 'FBN Units', value: renderCell('send_to_fbn_units', totals['send_to_fbn_units'] || totals['suggested_units_noon']) },
              { label: 'FBA Boxes', value: renderCell('fba_boxes', totals['fba_boxes'] || totals['suggested_boxes_amazon']) },
              { label: 'FBN Boxes', value: renderCell('fbn_boxes', totals['fbn_boxes'] || totals['suggested_boxes_noon']) }
            ]}
          />
        </div>
      )}

      {/* ── GRID SYSTEM ────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-zinc-200 shadow-xl overflow-hidden flex flex-col max-h-[calc(100vh-210px)]">
        {error && (
          <div className="m-8 p-6 bg-rose-50 border border-rose-100 rounded-2xl flex items-center gap-6">
            <AlertTriangle className="h-8 w-8 text-rose-500" />
            <p className="text-sm font-medium text-rose-900 uppercase leading-relaxed tracking-wide">{error}</p>
          </div>
        )}

        {!error && processedData.length > 0 && (
          <div className="overflow-auto custom-scrollbar flex-1 relative bg-white">
            <table className="w-fit min-w-full border-collapse">
              <thead className="sticky top-0 z-30 bg-white">
                <tr className="bg-zinc-900">
                  {columns.map((col, i) => (
                    <th
                      key={col.key}
                      style={{ width: col.width, minWidth: col.width }}
                      onClick={() => {
                        if (sortKey === col.key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
                        else { setSortKey(col.key); setSortDir('desc') }
                      }}
                      className={`
                        px-4 py-3 text-left cursor-pointer transition-all hover:bg-zinc-800 group border-b border-zinc-800
                        ${i === 0 ? 'sticky left-0 z-40 bg-zinc-900 border-r border-zinc-800' : ''}
                      `}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-[13px] font-black text-zinc-400 uppercase tracking-[0.1em] group-hover:text-white transition-colors">
                          {col.label}
                        </span>
                        <ArrowUpDown className={`h-4 w-4 transition-all ${sortKey === col.key ? 'text-amber-500 scale-110 opacity-100' : 'text-zinc-600 opacity-0 group-hover:opacity-100'}`} />
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {processedData.map((row: any, idx) => (
                  <tr key={idx} className={`group hover:bg-brand-blue/5 transition-colors ${row.is_active === false ? 'bg-zinc-50/80 opacity-60' : ''}`}>
                    {columns.map((col, i) => (
                      <td
                        key={col.key}
                        style={{ width: col.width, minWidth: col.width }}
                        className={`
                          px-4 py-2 border-zinc-50 h-[48px]
                          ${i === 0 ? 'sticky left-0 z-20 bg-white group-hover:bg-brand-blue/5 border-r border-zinc-100' : ''}
                        `}
                      >
                        <span className={`text-[13px] uppercase truncate block ${col.key === 'sku' ? 'font-black text-brand-blue' :
                            (col.label.includes('SV') || col.label.includes('UNIT') || col.label.includes('COGS')) ? 'font-black text-sidebar' :
                              'font-semibold text-zinc-600'
                          }`}>
                          {renderCell(col.key, row[col.key])}
                        </span>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
              <tfoot className="sticky bottom-0 z-30 bg-zinc-900 border-t-2 border-brand-amber">
                <tr className="h-[48px]">
                  {columns.map((col, i) => (
                    <td
                      key={col.key}
                      style={{ width: col.width, minWidth: col.width }}
                      className={`
                        px-4 py-2 bg-zinc-900 border-zinc-800
                        ${i === 0 ? 'sticky left-0 z-40 border-r border-zinc-800 shadow-[2px_0_10px_rgba(0,0,0,0.3)]' : ''}
                      `}
                    >
                      <span className={`text-[13px] font-black uppercase truncate block ${
                        i === 0 ? 'text-brand-amber' : 'text-white'
                      }`}>
                        {i === 0 ? 'TOTALS' : (totals[col.key] != null ? renderCell(col.key, totals[col.key]) : '')}
                      </span>
                    </td>
                  ))}
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {/* Global Footer Meta */}
        <div className="px-8 py-4 bg-zinc-50 border-t border-zinc-100 flex items-center justify-between shrink-0 z-30">
          <div className="flex items-center gap-6">
            <p className="text-[12px] font-bold uppercase text-zinc-500">RECORDS: {processedData.length}</p>
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-sm" />
              <p className="text-[12px] font-bold uppercase text-emerald-600">ENGINE ACTIVE</p>
            </div>
          </div>
          <p className="text-[12px] font-bold uppercase text-zinc-400 tracking-widest leading-none opacity-60">S2C ENTERPRISE LOGISTICS OS</p>
        </div>
      </div>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 10px;
          height: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: #f8fafc;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #cbd5e1;
          border-radius: 5px;
          border: 2px solid #f8fafc;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #94a3b8;
        }
      `}</style>
    </div>
  )
}

function renderCell(key: string, val: any) {
  if (key === 'is_active') {
    return val === false ? (
      <span className="px-2 py-0.5 bg-zinc-200 text-zinc-500 rounded text-[9px] font-black uppercase">Inactive</span>
    ) : (
      <span className="px-2 py-0.5 bg-emerald-100 text-emerald-600 rounded text-[9px] font-black uppercase">Active</span>
    )
  }
  if (val === null || val === undefined) return '0'
  if (typeof val === 'number') {
    if (val % 1 !== 0) return val.toFixed(2)
    return val.toLocaleString()
  }
  return String(val)
}

function InventoryStatCard({ title, items, icon: Icon, accent }: { title: string, items: { label: string, value: any }[], icon: any, accent: string }) {
  return (
    <div className="bg-white border border-zinc-200 rounded-2xl p-4 lg:p-6 shadow-sm hover:shadow-md transition-all flex flex-col gap-4 lg:gap-5 group min-w-0">
      <div className="flex items-center justify-between border-b border-zinc-100 pb-2 lg:pb-3">
        <h3 className="text-[10px] lg:text-[12px] font-black text-sidebar uppercase tracking-[0.1em] whitespace-nowrap">{title}</h3>
        <Icon className={`w-4 h-4 lg:w-5 lg:h-5 ${accent} opacity-40 group-hover:opacity-100 transition-opacity flex-shrink-0`} />
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-3 lg:gap-x-4 lg:gap-y-5">
        {items.map((item, i) => (
          <div key={i} className="flex flex-col gap-1 min-w-0">
            <span className="text-[9px] lg:text-[10px] font-black text-zinc-400 uppercase tracking-wider truncate">{item.label}</span>
            <span className="text-[16px] lg:text-[20px] font-black text-sidebar tracking-tighter leading-tight break-words">{item.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
