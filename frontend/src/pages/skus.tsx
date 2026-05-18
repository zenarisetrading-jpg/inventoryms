import { useEffect, useState, useMemo, useRef } from 'react'
import { api } from '../lib/api'
import { Package, Search, Download, AlertTriangle, RefreshCw, CheckCircle2, XCircle, Edit2, Check, X, ArrowUpDown, ArrowUp, ArrowDown, Filter, ChevronDown, Layers, Plus } from 'lucide-react'
import { LoadingScreen } from '../components/shared/LoadingScreen'
import { navigate } from '../lib/router'
import { MultiSelect } from '../components/shared/MultiSelect'


export default function SKUCatalog() {
  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Search, Sort & Filter State
  const [searchQuery, setSearchQuery] = useState('')
  const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' } | null>(null)

  // Arrays represent selected values. Empty array means ALL.
  const [filters, setFilters] = useState({
    categories: [] as string[],
    sub_categories: [] as string[],
    is_active: [] as string[],
    amazon_active: [] as string[],
    noon_active: [] as string[]
  })

  const [updating, setUpdating] = useState<string | null>(null)
  const [editingCell, setEditingCell] = useState<{ sku: string, field: string, value: string } | null>(null)

  const fetchData = async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await api.getSKUs()
      if ((response as any).error) {
        throw new Error((response as any).error)
      }

      setData((response as any).skus || [])
    } catch (e: any) {
      setError(e.message || 'Failed to fetch SKUs')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  const handleUpdateField = async (sku: string, field: string, value: any) => {
    setUpdating(`${sku}-${field}`)
    try {
      const res = await api.updateSKU(sku, { [field]: value })
      if ((res as any).error) throw new Error((res as any).error)

      // Optimistically update local state
      setData(prev => prev.map(row => row.sku === sku ? { ...row, [field]: value } : row))

      setEditingCell(null)
    } catch (e: any) {
      alert(`Failed to update ${field}: ${e.message}`)
    } finally {
      setUpdating(null)
    }
  }

  const handleSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc'
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc'
    }
    setSortConfig({ key, direction })
  }

  // Dynamically calculate valid sub-categories based on selected categories
  const validSubCategories = useMemo(() => {
    let pool = data
    if (filters.categories.length > 0) {
      pool = data.filter(r => filters.categories.includes(r.category))
    }
    const subs = new Set(pool.map(r => r.sub_category).filter(Boolean))
    return Array.from(subs).sort() as string[]
  }, [data, filters.categories])

  const sortedAndFilteredData = useMemo(() => {
    let result = data.filter(row => {
      // 1. Dropdown Filters
      if (filters.categories.length > 0 && !filters.categories.includes(row.category)) return false
      if (filters.sub_categories.length > 0 && !filters.sub_categories.includes(row.sub_category)) return false

      if (filters.is_active.length > 0) {
        const rowStatus = row.is_active === true ? 'TRUE' : 'FALSE'
        if (!filters.is_active.includes(rowStatus)) return false
      }
      if (filters.amazon_active.length > 0) {
        const rowStatus = row.amazon_active === true ? 'TRUE' : 'FALSE'
        if (!filters.amazon_active.includes(rowStatus)) return false
      }
      if (filters.noon_active.length > 0) {
        const rowStatus = row.noon_active === true ? 'TRUE' : 'FALSE'
        if (!filters.noon_active.includes(rowStatus)) return false
      }

      // 2. Search Query
      if (searchQuery) {
        const q = searchQuery.toLowerCase()
        const matchesSearch = Object.values(row).some(val =>
          String(val).toLowerCase().includes(q)
        )
        if (!matchesSearch) return false
      }

      return true
    })

    // 3. Sorting
    if (sortConfig !== null) {
      result.sort((a, b) => {
        const aVal = a[sortConfig.key]
        const bVal = b[sortConfig.key]

        if (aVal === null || aVal === undefined) return sortConfig.direction === 'asc' ? 1 : -1
        if (bVal === null || bVal === undefined) return sortConfig.direction === 'asc' ? -1 : 1

        if (typeof aVal === 'string' && typeof bVal === 'string') {
          return sortConfig.direction === 'asc'
            ? aVal.localeCompare(bVal)
            : bVal.localeCompare(aVal)
        }

        if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1
        if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1
        return 0
      })
    }

    return result
  }, [data, searchQuery, filters, sortConfig])

  // Fixed column order including physical properties and flags
  const columns = [
    'sku', 'asin', 'fnsku', 'name', 'category', 'sub_category', 'moq', 'lead_time_days',
    'cogs', 'units_per_box', 'dimensions', 'weight_kg', 'cbm',
    'is_active', 'amazon_active', 'noon_active'
  ]

  const handleExport = () => {
    if (!sortedAndFilteredData.length) return
    const headers = columns.join(',')
    const rows = sortedAndFilteredData.map(row =>
      columns.map(key => `"${row[key] ?? ''}"`).join(',')
    ).join('\n')
    const blob = new Blob([headers + '\n' + rows], { type: 'text/csv' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `sku_master_${new Date().toISOString().split('T')[0]}.csv`
    a.click()
  }

  const renderStatusToggle = (row: any, field: string) => {
    const isActive = row[field] === true
    const isUpdating = updating === `${row.sku}-${field}`

    return (
      <button
        onClick={() => handleUpdateField(row.sku, field, !isActive)}
        disabled={isUpdating}
        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-brand-blue/20 focus:ring-offset-1 disabled:opacity-50 ${isActive ? 'bg-emerald-500' : 'bg-zinc-300'
          }`}
      >
        <span
          className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${isActive ? 'translate-x-4.5' : 'translate-x-1'
            }`}
          style={{ transform: isActive ? 'translateX(18px)' : 'translateX(4px)' }}
        />
      </button>
    )
  }

  const isAnyFilterActive = Object.values(filters).some(arr => arr.length > 0)

  return (
    <div className="flex flex-col gap-4 sm:gap-6 -mt-4 lg:-mt-8 px-0 sm:px-4">
      {/* HEADER & CONSOLIDATED TOOLBAR */}
      <div className="relative z-50 bg-card border-white/5 shadow-2xl p-6 lg:p-10 rounded-2xl flex flex-col gap-10">
        {/* Top: Centered Header */}
        <div className="flex flex-col items-center gap-5">
          <div className="w-14 h-14 lg:w-16 lg:h-16 rounded-3xl bg-sidebar flex items-center justify-center text-brand-amber shadow-2xl border border-white/5">
            <Package className="w-7 h-7 lg:w-8 lg:h-8" />
          </div>
          <div className="text-center">
            <h1 className="text-2xl lg:text-4xl font-black text-white uppercase tracking-tighter leading-none">SKU Master</h1>
            <p className="text-[10px] lg:text-[12px] font-black text-zinc-500 uppercase tracking-[0.4em] mt-3 opacity-80 flex items-center justify-center gap-3">
              <span className="w-2 h-2 rounded-full bg-brand-amber animate-pulse shadow-[0_0_10px_rgba(245,158,11,0.5)]" />
              Inventory Source of Truth • Live Data Feed
            </p>
          </div>
        </div>

        {/* Bottom: Unified Controls Row */}
        <div className="flex flex-wrap items-center justify-center gap-4 w-full border-t border-white/5 pt-8">
          {/* Search Bar */}
          <div className="relative group w-full lg:max-w-xs xl:max-w-sm">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400 group-focus-within:text-brand-blue transition-colors" />
            <input
              type="text"
              placeholder="SEARCH SKUS..."
              className="w-full pl-10 pr-4 py-3.5 bg-white/5 border border-white/10 rounded-2xl text-[10px] lg:text-xs text-white focus:outline-none focus:ring-2 focus:ring-brand-blue/50 transition-all placeholder:text-zinc-600 font-black uppercase tracking-widest"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="flex flex-wrap items-center justify-center gap-3">
            <MultiSelect 
              label="Class"
              placeholder="ALL CLASSS"
              icon={Filter}
              options={[{ label: 'CATEGORY A', value: 'A' }, { label: 'CATEGORY B', value: 'B' }, { label: 'CATEGORY C', value: 'C' }]}
              selected={filters.categories}
              onChange={(val) => {
                setFilters(prev => {
                  const next = { ...prev, categories: val }
                  if (val.length > 0) {
                    const validSubs = new Set(data.filter(r => val.includes(r.category)).map(r => r.sub_category))
                    next.sub_categories = prev.sub_categories.filter(s => validSubs.has(s))
                  }
                  return next
                })
              }}
            />

            <MultiSelect 
              label="Sub-Category"
              placeholder="ALL SUB-CATEGORYS"
              icon={Layers}
              options={validSubCategories.map(sub => ({ label: sub.toUpperCase(), value: sub }))}
              selected={filters.sub_categories}
              onChange={(val) => setFilters(prev => ({ ...prev, sub_categories: val }))}
            />

            <MultiSelect 
              label="Status"
              placeholder="ALL STATUSS"
              icon={Filter}
              options={[{ label: 'ACTIVE ONLY', value: 'TRUE' }, { label: 'INACTIVE ONLY', value: 'FALSE' }]}
              selected={filters.is_active}
              onChange={(val) => setFilters(prev => ({ ...prev, is_active: val }))}
            />
          </div>

          <div className="h-8 w-px bg-white/10 hidden lg:block mx-1" />

          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/skus/new')}
              className="flex items-center gap-2 px-6 py-3.5 bg-brand-blue text-white hover:bg-brand-blue/90 transition-all rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl shadow-brand-blue/20"
            >
              <Plus className="h-4 w-4" />
              NEW SKU
            </button>

            <button
              onClick={fetchData}
              disabled={loading}
              className="flex items-center gap-2 px-6 py-3.5 bg-white/5 border border-white/10 text-white hover:bg-white/10 transition-all rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              RELOAD
            </button>
            
            <button
              onClick={handleExport}
              className="flex items-center gap-2 px-3 py-1.5 bg-transparent hover:bg-white/5 text-zinc-400 hover:text-white rounded-md text-[10px] font-black uppercase tracking-widest transition-all border border-white/10"
            >
              <Download className="w-3.5 h-3.5" />
              DOWNLOAD ALL
            </button>

            {isAnyFilterActive && (
              <button
                onClick={() => setFilters({ categories: [], sub_categories: [], is_active: [], amazon_active: [], noon_active: [] })}
                className="p-3 bg-rose-500/10 text-rose-500 rounded-2xl hover:bg-rose-500/20 transition-all"
                title="Clear Filters"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* TABLE */}
      <div className="relative z-10 bg-card border-white/5 shadow-2xl overflow-hidden flex flex-col max-h-[calc(100vh-200px)]">
        {error && (
          <div className="m-8 p-6 bg-rose-50 border border-rose-100 rounded-2xl flex items-center gap-6">
            <AlertTriangle className="h-8 w-8 text-rose-500" />
            <p className="text-sm font-medium text-rose-900 uppercase leading-relaxed tracking-wide">{error}</p>
          </div>
        )}

        {loading && !data.length && <LoadingScreen message="Unlocking SKU Master..." />}

        {!error && !loading && sortedAndFilteredData.length === 0 && (
          <div className="p-8 text-center text-zinc-500 font-semibold uppercase">
            No SKUs found matching your filters.
          </div>
        )}

        {!error && data.length > 0 && (
          <div className="overflow-auto custom-scrollbar flex-1 relative bg-transparent">
            <table className="w-fit min-w-full border-collapse">
              <thead className="sticky top-0 z-30 bg-card">
                <tr className="bg-white/5">
                  {columns.map((col, i) => (
                    <th
                      key={col}
                      onClick={() => handleSort(col)}
                      className={`
                        px-4 py-3 text-left border-b border-white/10 whitespace-nowrap cursor-pointer transition-colors group/header select-none
                        ${i === 0 ? 'sticky left-0 z-40 bg-[#0B0F1A] hover:bg-[#171B25] border-r border-white/10' : 'hover:bg-white/10'}
                      `}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-[13px] font-black text-zinc-400 uppercase tracking-[0.1em]">
                          {col.replace(/_/g, ' ')}
                        </span>
                        <div className={`text-zinc-600 transition-colors ${sortConfig?.key === col ? 'text-brand-blue' : 'group-hover/header:text-zinc-400'}`}>
                          {sortConfig?.key === col ? (
                            sortConfig.direction === 'asc' ? <ArrowUp className="w-3.5 h-3.5" /> : <ArrowDown className="w-3.5 h-3.5" />
                          ) : (
                            <ArrowUpDown className="w-3.5 h-3.5 opacity-50" />
                          )}
                        </div>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 bg-transparent">
                {sortedAndFilteredData.map((row, idx) => (
                  <tr
                    key={idx}
                    onDoubleClick={() => navigate(`/sku/${row.sku}`)}
                    className="group hover:bg-white/5 transition-colors cursor-pointer select-none"
                    title="Double-click to view details"
                  >
                    {columns.map((col, i) => (
                      <td
                        key={col}
                        className={`
                          px-4 py-2 border-white/5 h-[48px] whitespace-nowrap
                          ${i === 0 ? 'sticky left-0 z-20 bg-[#0B0F1A] group-hover:bg-[#171B25] border-r border-white/10' : ''}
                        `}
                      >
                        {col === 'is_active' || col === 'amazon_active' || col === 'noon_active' ? (
                          <div className="flex items-center gap-2">
                            {renderStatusToggle(row, col)}
                            <span className={`text-[10px] font-black uppercase ${row[col] ? 'text-emerald-600' : 'text-zinc-400'}`}>
                              {row[col] ? 'ON' : 'OFF'}
                            </span>
                          </div>
                        ) : col === 'category' ? (
                          <select
                            value={row.category || 'C'}
                            onChange={(e) => handleUpdateField(row.sku, 'category', e.target.value)}
                            disabled={updating === `${row.sku}-category`}
                            className="bg-[#111827] border border-white/10 text-white text-xs rounded focus:ring-brand-blue focus:border-brand-blue block w-16 p-1 font-bold uppercase disabled:opacity-50 cursor-pointer"
                          >
                            <option value="A">A</option>
                            <option value="B">B</option>
                            <option value="C">C</option>
                          </select>
                        ) : (col === 'cogs' || col === 'asin' || col === 'fnsku') ? (
                          <div className="flex items-center gap-2 min-w-[80px]">
                            {editingCell && editingCell.sku === row.sku && editingCell.field === col ? (
                              <div className="flex items-center gap-1">
                                <input
                                  type={col === 'cogs' ? "number" : "text"}
                                  step={col === 'cogs' ? "0.01" : undefined}
                                  className="w-24 p-1 text-[11px] border border-brand-blue rounded bg-white text-zinc-900 font-bold focus:outline-none uppercase"
                                  value={editingCell.value}
                                  onChange={e => setEditingCell({ ...editingCell, value: e.target.value })}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleUpdateField(row.sku, col, col === 'cogs' ? parseFloat(editingCell.value) : editingCell.value)
                                    if (e.key === 'Escape') setEditingCell(null)
                                  }}
                                  autoFocus
                                />
                                <button
                                  onClick={() => handleUpdateField(row.sku, col, col === 'cogs' ? parseFloat(editingCell.value) : editingCell.value)}
                                  disabled={updating === `${row.sku}-${col}`}
                                  className="p-1 text-emerald-600 hover:bg-emerald-50 rounded transition-colors"
                                >
                                  <Check className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => setEditingCell(null)}
                                  className="p-1 text-rose-500 hover:bg-rose-50 rounded transition-colors"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ) : (
                              <div 
                                className="flex items-center gap-2 group/cell cursor-pointer"
                                onClick={() => setEditingCell({ sku: row.sku, field: col, value: String(row[col] || '') })}
                              >
                                <span className={`text-[13px] font-semibold ${col === 'cogs' ? 'text-zinc-400' : 'text-zinc-300'}`}>
                                  {row[col] === null || row[col] === undefined || row[col] === '' ? '-' : (col === 'cogs' ? Number(row[col]).toFixed(2) : String(row[col]))}
                                </span>
                                <Edit2 className="w-3 h-3 text-zinc-600 opacity-0 group-hover/cell:opacity-100 transition-all" />
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className={`text-[13px] uppercase ${i === 0 ? 'font-black text-brand-blue' : 'font-semibold text-zinc-300'}`}>
                            {row[col] === null || row[col] === undefined ? '-' : String(row[col])}
                          </span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="px-8 py-4 bg-transparent border-t border-white/5 flex items-center justify-between shrink-0 z-30">
          <div className="flex items-center gap-6">
            <p className="text-[12px] font-bold uppercase text-zinc-500">RECORDS: {sortedAndFilteredData.length}</p>
          </div>
        </div>
      </div>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 10px; height: 10px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: #0B0F1A; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #1f2937; border-radius: 5px; border: 2px solid #0B0F1A; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #374151; }
      `}</style>
    </div>
  )
}
