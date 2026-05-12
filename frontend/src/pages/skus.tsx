import { useEffect, useState, useMemo, useRef } from 'react'
import { api } from '../lib/api'
import { Package, Search, Download, AlertTriangle, RefreshCw, CheckCircle2, XCircle, Edit2, Check, X, ArrowUpDown, ArrowUp, ArrowDown, Filter, ChevronDown } from 'lucide-react'

// Custom MultiSelect Component
function MultiSelect({ 
  options, 
  value, 
  onChange, 
  label 
}: { 
  options: { label: string, value: string }[], 
  value: string[], 
  onChange: (val: string[]) => void, 
  label: string 
}) {
  const [isOpen, setIsOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const toggleOption = (optValue: string) => {
    if (value.includes(optValue)) {
      onChange(value.filter(v => v !== optValue))
    } else {
      onChange([...value, optValue])
    }
  }

  const displayText = value.length === 0 
    ? `ALL ${label}S` 
    : value.length === 1 
      ? options.find(o => o.value === value[0])?.label || label
      : `${value.length} ${label}S`

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-2 bg-zinc-50 border text-[11px] font-bold uppercase rounded-lg px-3 py-1.5 transition-colors ${
          value.length > 0 
            ? 'border-brand-blue/50 text-brand-blue bg-brand-blue/5' 
            : 'border-zinc-200 text-zinc-700 hover:border-zinc-300'
        }`}
      >
        <span className="truncate max-w-[120px]">{displayText}</span>
        <ChevronDown className="w-3.5 h-3.5 opacity-50" />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-1 w-48 bg-white border border-zinc-200 rounded-xl shadow-xl z-50 overflow-hidden flex flex-col max-h-[300px]">
          <div className="p-2 border-b border-zinc-100 flex items-center justify-between bg-zinc-50/50">
            <span className="text-[10px] font-black uppercase tracking-widest text-zinc-500">{label}</span>
            {value.length > 0 && (
              <button 
                onClick={(e) => { e.stopPropagation(); onChange([]); }}
                className="text-[9px] font-bold text-rose-500 hover:text-rose-600 uppercase"
              >
                Clear
              </button>
            )}
          </div>
          <div className="overflow-y-auto p-1 custom-scrollbar">
            {options.map(opt => (
              <label 
                key={opt.value} 
                onClick={(e) => {
                  e.preventDefault()
                  toggleOption(opt.value)
                }}
                className="flex items-center gap-2.5 px-3 py-2 hover:bg-zinc-50 rounded-lg cursor-pointer transition-colors group"
              >
                <div className={`w-3.5 h-3.5 rounded-[3px] border flex items-center justify-center transition-colors ${
                  value.includes(opt.value) 
                    ? 'bg-brand-blue border-brand-blue text-white' 
                    : 'border-zinc-300 group-hover:border-brand-blue'
                }`}>
                  {value.includes(opt.value) && <Check className="w-2.5 h-2.5" />}
                </div>
                <span className="text-xs font-semibold text-zinc-700 uppercase">{opt.label}</span>
              </label>
            ))}
            {options.length === 0 && (
              <div className="px-3 py-4 text-center text-xs font-medium text-zinc-400">No options</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}


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
  const [editingCogs, setEditingCogs] = useState<{sku: string, value: string} | null>(null)

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
      
      if (field === 'cogs') {
        setEditingCogs(null)
      }
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
    'sku', 'name', 'category', 'sub_category', 'moq', 'lead_time_days', 
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
        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-brand-blue/20 focus:ring-offset-1 disabled:opacity-50 ${
          isActive ? 'bg-emerald-500' : 'bg-zinc-300'
        }`}
      >
        <span
          className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
            isActive ? 'translate-x-4.5' : 'translate-x-1'
          }`}
          style={{ transform: isActive ? 'translateX(18px)' : 'translateX(4px)' }}
        />
      </button>
    )
  }

  const isAnyFilterActive = Object.values(filters).some(arr => arr.length > 0)

  return (
    <div className="flex flex-col gap-6 -mt-4 lg:-mt-8">
      {/* HEADER & MAIN TOOLBAR */}
      <div className="flex flex-col gap-4 bg-white p-6 rounded-2xl border border-zinc-200 shadow-sm sticky top-0 z-40 lg:top-[-32px]">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 lg:w-12 lg:h-12 rounded-xl bg-sidebar flex items-center justify-center text-brand-amber shadow-lg text-lg font-black shrink-0">
              <Package className="w-5 h-5 lg:w-6 lg:h-6" />
            </div>
            <div>
              <h1 className="text-xl lg:text-2xl font-black text-sidebar uppercase tracking-tight leading-none">SKU Master</h1>
              <p className="text-[9px] lg:text-[11px] font-bold text-muted uppercase tracking-[0.2em] mt-1 lg:mt-2 opacity-60">RAW DATA FEED</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4 w-full lg:w-auto">
            <div className="relative group min-w-[280px] flex-1 lg:flex-none">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400 group-focus-within:text-brand-blue transition-colors" />
              <input
                type="text"
                placeholder="SEARCH SKUS..."
                className="w-full pl-10 pr-4 py-2.5 bg-zinc-50 border border-transparent rounded-xl text-sm font-semibold uppercase focus:ring-4 focus:ring-brand-blue/10 focus:border-brand-blue outline-none transition-all placeholder:text-zinc-400"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={fetchData}
                disabled={loading}
                className="flex items-center gap-2 px-5 py-2.5 bg-white border border-zinc-200 rounded-xl text-xs font-black uppercase text-zinc-900 hover:bg-zinc-50 transition-all disabled:opacity-50 active:scale-95 shadow-sm"
              >
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                RELOAD
              </button>
              <button
                onClick={handleExport}
                className="flex items-center gap-2 px-6 py-2.5 bg-sidebar text-brand-amber rounded-xl text-xs font-black uppercase hover:bg-sidebar/90 transition-all shadow-md active:scale-95 transition-transform"
              >
                <Download className="h-4 w-4" />
                EXPORT
              </button>
            </div>
          </div>
        </div>

        {/* SECONDARY TOOLBAR: FILTERS */}
        <div className="flex flex-wrap items-center gap-3 pt-4 border-t border-zinc-100">
          <div className="flex items-center gap-2 text-zinc-400 mr-2">
            <Filter className="w-4 h-4" />
            <span className="text-[10px] font-black uppercase tracking-widest">FILTERS</span>
          </div>
          
          <MultiSelect 
            label="Category"
            options={[
              { label: 'Category A', value: 'A' },
              { label: 'Category B', value: 'B' },
              { label: 'Category C', value: 'C' },
            ]}
            value={filters.categories}
            onChange={(val) => {
              setFilters(prev => {
                const next = { ...prev, categories: val }
                // if we are restricting categories, prune invalid sub_categories
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
            options={validSubCategories.map(sub => ({ label: sub, value: sub }))}
            value={filters.sub_categories}
            onChange={(val) => setFilters(prev => ({ ...prev, sub_categories: val }))}
          />

          <MultiSelect 
            label="System Status"
            options={[
              { label: 'Active', value: 'TRUE' },
              { label: 'Inactive', value: 'FALSE' },
            ]}
            value={filters.is_active}
            onChange={(val) => setFilters(prev => ({ ...prev, is_active: val }))}
          />

          <MultiSelect 
            label="Amazon"
            options={[
              { label: 'Active', value: 'TRUE' },
              { label: 'Inactive', value: 'FALSE' },
            ]}
            value={filters.amazon_active}
            onChange={(val) => setFilters(prev => ({ ...prev, amazon_active: val }))}
          />

          <MultiSelect 
            label="Noon"
            options={[
              { label: 'Active', value: 'TRUE' },
              { label: 'Inactive', value: 'FALSE' },
            ]}
            value={filters.noon_active}
            onChange={(val) => setFilters(prev => ({ ...prev, noon_active: val }))}
          />

          {isAnyFilterActive && (
            <button
              onClick={() => setFilters({ categories: [], sub_categories: [], is_active: [], amazon_active: [], noon_active: [] })}
              className="text-[10px] font-bold text-rose-500 uppercase hover:text-rose-600 transition-colors ml-auto flex items-center gap-1"
            >
              <X className="w-3 h-3" />
              Clear Filters
            </button>
          )}
        </div>
      </div>

      {/* TABLE */}
      <div className="bg-white rounded-2xl border border-zinc-200 shadow-xl overflow-hidden flex flex-col max-h-[calc(100vh-200px)]">
        {error && (
          <div className="m-8 p-6 bg-rose-50 border border-rose-100 rounded-2xl flex items-center gap-6">
            <AlertTriangle className="h-8 w-8 text-rose-500" />
            <p className="text-sm font-medium text-rose-900 uppercase leading-relaxed tracking-wide">{error}</p>
          </div>
        )}

        {loading && !data.length && (
          <div className="flex flex-col items-center justify-center min-h-[400px]">
            <div className="w-12 h-12 border-4 border-amber-500 border-t-transparent rounded-full animate-spin mb-4" />
            <p className="text-zinc-500 font-medium uppercase tracking-widest text-sm">LOADING SKU MASTER...</p>
          </div>
        )}

        {!error && !loading && sortedAndFilteredData.length === 0 && (
          <div className="p-8 text-center text-zinc-500 font-semibold uppercase">
            No SKUs found matching your filters.
          </div>
        )}

        {!error && data.length > 0 && (
          <div className="overflow-auto custom-scrollbar flex-1 relative bg-white">
            <table className="w-fit min-w-full border-collapse">
              <thead className="sticky top-0 z-30 bg-white">
                <tr className="bg-zinc-900">
                  {columns.map((col, i) => (
                    <th
                      key={col}
                      onClick={() => handleSort(col)}
                      className={`
                        px-4 py-3 text-left border-b border-zinc-800 whitespace-nowrap cursor-pointer hover:bg-zinc-800 transition-colors group/header select-none
                        ${i === 0 ? 'sticky left-0 z-40 bg-zinc-900 group-hover/header:bg-zinc-800 border-r border-zinc-800' : ''}
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
              <tbody className="divide-y divide-zinc-100">
                {sortedAndFilteredData.map((row, idx) => (
                  <tr key={idx} className="group hover:bg-brand-blue/5 transition-colors">
                    {columns.map((col, i) => (
                      <td
                        key={col}
                        className={`
                          px-4 py-2 border-zinc-50 h-[48px] whitespace-nowrap
                          ${i === 0 ? 'sticky left-0 z-20 bg-white group-hover:bg-brand-blue/5 border-r border-zinc-100' : ''}
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
                            className="bg-zinc-50 border border-zinc-200 text-zinc-800 text-xs rounded focus:ring-brand-blue focus:border-brand-blue block w-16 p-1 font-bold uppercase disabled:opacity-50 cursor-pointer"
                          >
                            <option value="A">A</option>
                            <option value="B">B</option>
                            <option value="C">C</option>
                          </select>
                        ) : col === 'cogs' ? (
                          <div className="flex items-center gap-2 min-w-[100px]">
                            {editingCogs && editingCogs.sku === row.sku ? (
                              <div className="flex items-center gap-1">
                                <input
                                  type="number"
                                  step="0.01"
                                  className="w-16 p-1 text-xs border border-brand-blue rounded bg-white text-zinc-900 font-semibold focus:outline-none"
                                  value={editingCogs.value}
                                  onChange={e => setEditingCogs({ sku: editingCogs.sku, value: e.target.value })}
                                  autoFocus
                                />
                                <button
                                  onClick={() => handleUpdateField(row.sku, 'cogs', parseFloat(editingCogs.value))}
                                  disabled={updating === `${row.sku}-cogs`}
                                  className="p-1 text-emerald-600 hover:bg-emerald-50 rounded transition-colors"
                                >
                                  <Check className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => setEditingCogs(null)}
                                  className="p-1 text-rose-500 hover:bg-rose-50 rounded transition-colors"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ) : (
                              <>
                                <span className="text-[13px] font-semibold text-zinc-600">
                                  {row[col] === null || row[col] === undefined ? '-' : Number(row[col]).toFixed(2)}
                                </span>
                                <button
                                  onClick={() => setEditingCogs({ sku: row.sku, value: String(row.cogs || 0) })}
                                  className="p-1 text-zinc-400 hover:text-brand-blue hover:bg-brand-blue/10 rounded transition-colors"
                                >
                                  <Edit2 className="w-3 h-3" />
                                </button>
                              </>
                            )}
                          </div>
                        ) : (
                          <span className={`text-[13px] uppercase ${i === 0 ? 'font-black text-brand-blue' : 'font-semibold text-zinc-600'}`}>
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

        <div className="px-8 py-4 bg-zinc-50 border-t border-zinc-100 flex items-center justify-between shrink-0 z-30">
          <div className="flex items-center gap-6">
            <p className="text-[12px] font-bold uppercase text-zinc-500">RECORDS: {sortedAndFilteredData.length}</p>
          </div>
        </div>
      </div>
      
      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 10px; height: 10px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: #f8fafc; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 5px; border: 2px solid #f8fafc; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
      `}</style>
    </div>
  )
}
