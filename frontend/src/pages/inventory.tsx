import { useEffect, useState, useMemo } from 'react'
import { Search, Download, RefreshCw, AlertTriangle, ArrowUpDown, ChevronDown, Filter, Layers, Archive, Box, ShoppingCart, Send } from 'lucide-react'
import { api } from '../lib/api'
import type { PlanningResponse } from '../types'

export default function InventoryPage() {
  const [data, setData] = useState<PlanningResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [sortKey, setSortKey] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [error, setError] = useState<string | null>(null)
  const [category, setCategory] = useState<string>('')
  const [subCategory, setSubCategory] = useState<string>('')

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
    return Object.keys(data.raw_data[0]).map(key => ({
      key,
      label: key.replace(/_/g, ' ').toUpperCase(),
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

    if (category) {
      list = list.filter(item => (item as any).category === category || (item as any).abc_class === category)
    }

    if (subCategory) {
      list = list.filter(item => (item as any).sub_category === subCategory)
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
  }, [data, searchQuery, sortKey, sortDir, category, subCategory])

  const totals = useMemo(() => {
    const t: Record<string, number> = {}
    const keysToTotal = [
      'fba_units', 'fbn_units', 'locad_units', 'locad_boxes', 'stock_in_hand', 
      'shortfall', 'moq', 'suggested_reorder_qty', 'total_reorder_cost',
      'send_to_fba_units', 'send_to_fbn_units', 'fba_boxes', 'fbn_boxes',
      'current_fba_stock_units', 'current_fbn_stock_units', 'stock_in_hand_units',
      'shortfall_units', 'suggested_units', 'total_cost_aed', 'units_to_ship',
      'suggested_units_amazon', 'suggested_units_noon', 'suggested_boxes_amazon', 'suggested_boxes_noon'
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

  if (loading && !data) return (
    <div className="flex flex-col items-center justify-center min-h-[400px]">
      <div className="w-12 h-12 border-4 border-amber-500 border-t-transparent rounded-full animate-spin mb-4" />
      <p className="text-zinc-500 font-medium uppercase tracking-widest text-sm">Synchronizing Master Buffer...</p>
    </div>
  )

  return (
    <div className="flex flex-col gap-8 -mt-4 lg:-mt-8">
      {/* ── TOP CONTROL PANEL ────────────────────────────────────────── */}
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 bg-white p-6 rounded-2xl border border-zinc-200 shadow-sm sticky top-0 z-40 lg:top-[-32px]">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 lg:w-12 lg:h-12 rounded-xl bg-sidebar flex items-center justify-center text-brand-amber shadow-lg text-lg font-black shrink-0">
            <Layers className="w-5 h-5 lg:w-6 lg:h-6" />
          </div>
          <div>
            <h1 className="text-xl lg:text-2xl font-black text-sidebar uppercase tracking-tight leading-none">Inventory Matrix</h1>
            <p className="text-[9px] lg:text-[11px] font-bold text-muted uppercase tracking-[0.2em] mt-1 lg:mt-2 opacity-60">fact_inventory_planning • RAW DATA FEED</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4 w-full lg:w-auto">
          {/* Search */}
          <div className="relative group min-w-[280px] flex-1 lg:flex-none">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400 group-focus-within:text-brand-blue transition-colors" />
            <input
              type="text"
              placeholder="SCAN RECORDS..."
              className="w-full pl-10 pr-4 py-3 bg-zinc-50 border border-transparent rounded-xl text-sm font-semibold uppercase focus:ring-4 focus:ring-brand-blue/10 focus:border-brand-blue outline-none transition-all placeholder:text-zinc-400"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>

          {/* ABC Filter */}
          <div className="flex items-center gap-3 px-4 py-2 bg-zinc-50 rounded-xl border border-zinc-100 shadow-inner">
            <Filter className="w-4 h-4 text-zinc-400" />
            <select
              value={category}
              onChange={e => setCategory(e.target.value)}
              className="py-1 bg-transparent text-sm font-bold uppercase text-zinc-900 outline-none cursor-pointer appearance-none min-w-[100px]"
            >
              <option value="">ALL TIERS</option>
              <option value="A">TIER A</option>
              <option value="B">TIER B</option>
              <option value="C">TIER C</option>
            </select>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3">
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="flex items-center gap-2 px-5 py-3 bg-white border border-zinc-200 rounded-xl text-xs font-black uppercase text-zinc-900 hover:bg-zinc-50 transition-all disabled:opacity-50 active:scale-95 shadow-sm"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
              SYNC
            </button>

            <button
              onClick={handleExport}
              className="flex items-center gap-2 px-6 py-3 bg-sidebar text-brand-amber rounded-xl text-xs font-black uppercase hover:bg-sidebar/90 transition-all shadow-md active:scale-95 transition-transform"
            >
              <Download className="h-4 w-4" />
              EXPORT
            </button>
          </div>
        </div>
      </div>

      {/* ── SUMMARY STATS ────────────────────────────────────────────── */}
      {!error && processedData.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-5 gap-4">
          <InventoryStatCard 
            title="Channel Stock" 
            icon={Archive}
            accent="text-indigo-600"
            items={[
              { label: 'FBA Units', value: renderCell('fba_units', totals['fba_units'] || totals['current_fba_stock_units']) },
              { label: 'FBN Units', value: renderCell('fbn_units', totals['fbn_units'] || totals['current_fbn_stock_units']) }
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
            title="Reorder" 
            icon={ShoppingCart}
            accent="text-amber-600"
            items={[
              { label: 'Suggested Qty', value: renderCell('suggested_units', totals['suggested_reorder_qty'] || totals['suggested_units']) },
              { label: 'Total Cost (AED)', value: renderCell('total_reorder_cost', totals['total_reorder_cost'] || totals['total_cost_aed']) }
            ]}
          />
          <InventoryStatCard 
            title="Send to FBA" 
            icon={Send}
            accent="text-brand-blue"
            items={[
              { label: 'Send Units', value: renderCell('send_to_fba_units', totals['send_to_fba_units'] || totals['suggested_units_amazon']) },
              { label: 'Boxes', value: renderCell('fba_boxes', totals['fba_boxes'] || totals['suggested_boxes_amazon']) }
            ]}
          />
          <InventoryStatCard 
            title="Send to FBN" 
            icon={Send}
            accent="text-brand-amber"
            items={[
              { label: 'Send Units', value: renderCell('send_to_fbn_units', totals['send_to_fbn_units'] || totals['suggested_units_noon']) },
              { label: 'Boxes', value: renderCell('fbn_boxes', totals['fbn_boxes'] || totals['suggested_boxes_noon']) }
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
                {processedData.map((row, idx) => (
                  <tr key={idx} className="group hover:bg-brand-blue/5 transition-colors">
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
  if (val === null || val === undefined) return '0'
  if (typeof val === 'number') {
    if (val % 1 !== 0) return val.toFixed(2)
    return val.toLocaleString()
  }
  return String(val)
}

function InventoryStatCard({ title, items, icon: Icon, accent }: { title: string, items: { label: string, value: any }[], icon: any, accent: string }) {
  return (
    <div className="bg-white border border-zinc-200 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all flex flex-col gap-4 group min-w-0">
      <div className="flex items-center justify-between border-b border-zinc-100 pb-2">
        <h3 className="text-[11px] font-black text-sidebar uppercase tracking-[0.1em] whitespace-nowrap">{title}</h3>
        <Icon className={`w-4 h-4 ${accent} opacity-60 group-hover:opacity-100 transition-opacity flex-shrink-0`} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        {items.map((item, i) => (
          <div key={i} className="flex flex-col gap-1 min-w-0">
            <span className="text-[9px] font-black text-zinc-500 uppercase tracking-wider truncate">{item.label}</span>
            <span className="text-[19px] font-black text-sidebar tracking-tighter leading-tight break-words">{item.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
