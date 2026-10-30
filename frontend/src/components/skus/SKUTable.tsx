import React, { useState, useMemo, useCallback, useEffect } from 'react'
import { ArrowUpDown, ArrowUp, ArrowDown, Edit2, Check, X, Plus, List } from 'lucide-react'
import { navigate } from '../../lib/router'
import { api } from '../../lib/api'

interface SKUTableProps {
  allData?: any[]
  sortedAndFilteredData: any[]
  columns: string[]
  sortConfig: { key: string, direction: 'asc' | 'desc' } | null
  handleSort: (key: string) => void
  updating: string | null
  editingCell: { sku: string, field: string, value: string } | null
  setEditingCell: (val: { sku: string, field: string, value: string } | null) => void
  handleUpdateField: (sku: string, field: string, value: any) => Promise<void>
  selectedSkus: Set<string>
  setSelectedSkus: React.Dispatch<React.SetStateAction<Set<string>>>
}

export function SKUTable({
  allData,
  sortedAndFilteredData, columns, sortConfig, handleSort,
  updating, editingCell, setEditingCell, handleUpdateField,
  selectedSkus, setSelectedSkus
}: SKUTableProps) {
  const [isCustomMode, setIsCustomMode] = useState<boolean>(false)
  const [apiCategories, setApiCategories] = useState<string[]>([])

  useEffect(() => {
    api.getProductCategories().then(cats => {
      if (cats && cats.length > 0) {
        setApiCategories(cats)
      }
    }).catch(() => {})
  }, [])

  const defaultProductCategories = useMemo(() => [
    'Art Supplies',
    'Baby and Toddlers',
    'Health',
    'Home and Kitchen',
    'Lunch Box',
    'Pet Supplies',
    'Tumblr',
    'Wander',
    'Water Bottles'
  ], [])

  const existingProductCategories = useMemo(() => {
    const pool = (allData && allData.length > 0) ? allData : sortedAndFilteredData
    const fromData = pool.map((r: any) => r.product_category).filter(Boolean)
    const set = new Set([...defaultProductCategories, ...apiCategories, ...fromData])
    return Array.from(set).sort((a: string, b: string) => a.localeCompare(b))
  }, [allData, sortedAndFilteredData, apiCategories, defaultProductCategories])

  const getExistingSubCategories = useCallback((currentProductCategory?: string) => {
    const pool = (allData && allData.length > 0) ? allData : sortedAndFilteredData
    const matchingSubs = currentProductCategory
      ? pool.filter((r: any) => r.product_category && r.product_category.toLowerCase() === currentProductCategory.toLowerCase()).map((r: any) => r.sub_category).filter(Boolean)
      : []
    const allSubs = pool.map((r: any) => r.sub_category).filter(Boolean)
    const set = new Set(matchingSubs.length > 0 ? [...matchingSubs, ...allSubs] : allSubs)
    return Array.from(set).sort((a: string, b: string) => a.localeCompare(b))
  }, [allData, sortedAndFilteredData])

  const renderStatusToggle = (row: any, field: string) => {
    const isActive = row[field] === true
    const isUpdating = updating === `${row.sku}-${field}`

    return (
      <button
        onClick={e => {
          e.stopPropagation()
          handleUpdateField(row.sku, field, !isActive)
        }}
        disabled={isUpdating}
        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-brand-blue/20 focus:ring-offset-1 disabled:opacity-50 ${isActive ? 'bg-emerald-500' : 'bg-zinc-300'}`}
      >
        <span
          className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${isActive ? 'translate-x-4.5' : 'translate-x-1'}`}
          style={{ transform: isActive ? 'translateX(18px)' : 'translateX(4px)' }}
        />
      </button>
    )
  }

  return (
    <div className="overflow-auto custom-scrollbar flex-1 relative bg-transparent">
      <table className="w-fit min-w-full border-collapse">
        <thead className="sticky top-0 z-30 bg-[#0B0F1A]">
          <tr className="group border-b border-white/10">
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
                  {i === 0 && (
                    <input
                      type="checkbox"
                      className="rounded border-white/20 bg-white/5 text-brand-amber focus:ring-brand-amber focus:ring-offset-0 focus:outline-none cursor-pointer w-3.5 h-3.5 mr-2"
                      checked={sortedAndFilteredData.length > 0 && sortedAndFilteredData.every(row => selectedSkus.has(row.sku))}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedSkus(new Set([...selectedSkus, ...sortedAndFilteredData.map(row => row.sku)]))
                        } else {
                          const next = new Set(selectedSkus)
                          sortedAndFilteredData.forEach(row => next.delete(row.sku))
                          setSelectedSkus(next)
                        }
                      }}
                      onClick={e => e.stopPropagation()}
                    />
                  )}
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
                ><span className="inline-block">{col === 'is_active' || col === 'amazon_active' || col === 'noon_active' || col === 'minutes_active' ? (
                    <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                      {renderStatusToggle(row, col)}
                      <span className={`text-[10px] font-black uppercase ${row[col] ? 'text-emerald-600' : 'text-zinc-400'}`}>
                        {row[col] ? 'ON' : 'OFF'}
                      </span>
                    </div>
                  ) : col === 'category' ? (
                    <select
                      value={row.category || 'C'}
                      onClick={e => e.stopPropagation()}
                      onChange={(e) => handleUpdateField(row.sku, 'category', e.target.value)}
                      disabled={updating === `${row.sku}-category`}
                      className="bg-[#111827] border border-white/10 text-white text-xs rounded focus:ring-brand-blue focus:border-brand-blue block w-16 p-1 font-bold uppercase disabled:opacity-50 cursor-pointer"
                    >
                      <option value="A">A</option>
                      <option value="B">B</option>
                      <option value="C">C</option>
                    </select>
                  ) : col === 'product_category' || col === 'sub_category' ? (
                    <div className="flex items-center gap-2 min-w-[120px]" onClick={e => e.stopPropagation()}>
                      {editingCell && editingCell.sku === row.sku && editingCell.field === col ? (
                        (() => {
                          const options = col === 'product_category'
                            ? existingProductCategories
                            : getExistingSubCategories(row.product_category)

                          return !isCustomMode ? (
                            <div className="flex items-center gap-1.5">
                              <select
                                value={options.find(opt => opt.toLowerCase() === (editingCell.value || '').trim().toLowerCase()) || ''}
                                onChange={(e) => {
                                  if (e.target.value === '__NEW__') {
                                    setIsCustomMode(true)
                                    setEditingCell({ ...editingCell, value: '' })
                                  } else {
                                    setEditingCell({ ...editingCell, value: e.target.value })
                                  }
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    const val = editingCell.value ? editingCell.value.trim() : null
                                    handleUpdateField(row.sku, col, val)
                                  }
                                  if (e.key === 'Escape') {
                                    setEditingCell(null)
                                    setIsCustomMode(false)
                                  }
                                }}
                                autoFocus
                                className="w-40 sm:w-48 p-1 text-[11px] border border-brand-blue rounded bg-[#111827] text-white font-bold focus:outline-none uppercase cursor-pointer"
                              >
                                <option value="" style={{ backgroundColor: '#18181b', color: '#9ca3af' }}>
                                  -- SELECT {col === 'product_category' ? 'CATEGORY' : 'SUB-CAT'} --
                                </option>
                                {options.map(opt => (
                                  <option key={opt} value={opt} style={{ backgroundColor: '#18181b', color: 'white' }}>
                                    {opt.toUpperCase()}
                                  </option>
                                ))}
                                <option value="__NEW__" style={{ backgroundColor: '#18181b', color: '#60a5fa', fontWeight: 'bold' }}>
                                  + ENTER NEW {col === 'product_category' ? 'CATEGORY' : 'SUB-CAT'}...
                                </option>
                              </select>

                              <button
                                type="button"
                                onClick={() => {
                                  setIsCustomMode(true)
                                  setEditingCell({ ...editingCell, value: '' })
                                }}
                                title={`Enter new ${col === 'product_category' ? 'category' : 'sub-category'}`}
                                className="p-1 text-brand-blue hover:text-white hover:bg-brand-blue/30 rounded border border-brand-blue/40 transition-colors shrink-0"
                              >
                                <Plus className="w-3.5 h-3.5" />
                              </button>

                              <button
                                type="button"
                                onClick={() => {
                                  const val = editingCell.value ? editingCell.value.trim() : null
                                  handleUpdateField(row.sku, col, val)
                                }}
                                disabled={updating === `${row.sku}-${col}`}
                                className="p-1 text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/20 rounded transition-colors shrink-0"
                                title="Save"
                              >
                                <Check className="w-3.5 h-3.5" />
                              </button>

                              <button
                                type="button"
                                onClick={() => {
                                  setEditingCell(null)
                                  setIsCustomMode(false)
                                }}
                                className="p-1 text-rose-400 hover:text-rose-300 hover:bg-rose-500/20 rounded transition-colors shrink-0"
                                title="Cancel"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5">
                              <input
                                type="text"
                                className="w-36 sm:w-44 p-1 text-[11px] border border-brand-blue rounded bg-white text-zinc-900 font-bold focus:outline-none uppercase"
                                placeholder={`NEW ${col === 'product_category' ? 'CATEGORY' : 'SUB-CAT'}...`}
                                value={editingCell.value}
                                onChange={e => setEditingCell({ ...editingCell, value: e.target.value })}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    const val = editingCell.value ? editingCell.value.trim() : null
                                    handleUpdateField(row.sku, col, val)
                                  }
                                  if (e.key === 'Escape') {
                                    setEditingCell(null)
                                    setIsCustomMode(false)
                                  }
                                }}
                                autoFocus
                              />

                              <button
                                type="button"
                                onClick={() => setIsCustomMode(false)}
                                title="Choose from existing list"
                                className="p-1 text-zinc-400 hover:text-white hover:bg-white/10 rounded border border-white/20 transition-colors shrink-0"
                              >
                                <List className="w-3.5 h-3.5" />
                              </button>

                              <button
                                type="button"
                                onClick={() => {
                                  const val = editingCell.value ? editingCell.value.trim() : null
                                  handleUpdateField(row.sku, col, val)
                                }}
                                disabled={updating === `${row.sku}-${col}`}
                                className="p-1 text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/20 rounded transition-colors shrink-0"
                                title="Save"
                              >
                                <Check className="w-3.5 h-3.5" />
                              </button>

                              <button
                                type="button"
                                onClick={() => {
                                  setEditingCell(null)
                                  setIsCustomMode(false)
                                }}
                                className="p-1 text-rose-400 hover:text-rose-300 hover:bg-rose-500/20 rounded transition-colors shrink-0"
                                title="Cancel"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )
                        })()
                      ) : (
                        <div 
                          className="flex items-center gap-2 group/cell cursor-pointer"
                          onClick={() => {
                            const currentVal = String(row[col] ?? '')
                            setEditingCell({ sku: row.sku, field: col, value: currentVal })
                            const options = col === 'product_category' 
                              ? existingProductCategories 
                              : getExistingSubCategories(row.product_category)
                            const exists = options.some(opt => (opt ? String(opt).toLowerCase() : '') === currentVal.trim().toLowerCase())
                            setIsCustomMode(!exists && currentVal.trim() !== '')
                          }}
                        >
                          <span className="text-[13px] font-semibold text-zinc-300">
                            {row[col] === null || row[col] === undefined || row[col] === '' ? '-' : String(row[col])}
                          </span>
                          <Edit2 className="w-3 h-3 text-zinc-600 opacity-0 group-hover/cell:opacity-100 transition-all" />
                        </div>
                      )}
                    </div>
                  ) : ['cogs', 'shipping_cost', 'asin', 'fnsku', 'name', 'moq', 'lead_time_days', 'units_per_box', 'dimensions', 'weight_kg', 'cbm'].includes(col) ? (
                    <div className="flex items-center gap-2 min-w-[80px]" onClick={e => e.stopPropagation()}>
                      {editingCell && editingCell.sku === row.sku && editingCell.field === col ? (
                        <div className="flex items-center gap-1">
                          <input
                            type={['cogs', 'shipping_cost', 'moq', 'lead_time_days', 'units_per_box', 'weight_kg', 'cbm'].includes(col) ? "number" : "text"}
                            step={['cogs', 'shipping_cost', 'weight_kg', 'cbm'].includes(col) ? "0.01" : undefined}
                            className="w-32 p-1 text-[11px] border border-brand-blue rounded bg-white text-zinc-900 font-bold focus:outline-none uppercase"
                            value={editingCell.value}
                            onChange={e => setEditingCell({ ...editingCell, value: e.target.value })}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                const numericFields = ['cogs', 'shipping_cost', 'moq', 'lead_time_days', 'units_per_box', 'weight_kg', 'cbm']
                                const val = numericFields.includes(col) ? (editingCell.value === '' ? null : parseFloat(editingCell.value)) : editingCell.value
                                handleUpdateField(row.sku, col, val)
                              }
                              if (e.key === 'Escape') setEditingCell(null)
                            }}
                            autoFocus
                          />
                          <button
                            onClick={() => {
                              const numericFields = ['cogs', 'shipping_cost', 'moq', 'lead_time_days', 'units_per_box', 'weight_kg', 'cbm']
                              const val = numericFields.includes(col) ? (editingCell.value === '' ? null : parseFloat(editingCell.value)) : editingCell.value
                              handleUpdateField(row.sku, col, val)
                            }}
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
                          onClick={() => setEditingCell({ sku: row.sku, field: col, value: String(row[col] ?? '') })}
                        >
                          <span className={`text-[13px] font-semibold ${['cogs', 'shipping_cost'].includes(col) ? 'text-zinc-400' : 'text-zinc-300'}`}>
                            {row[col] === null || row[col] === undefined || row[col] === '' ? '-' : (['cogs', 'shipping_cost'].includes(col) ? Number(row[col]).toFixed(2) : String(row[col]))}
                          </span>
                          <Edit2 className="w-3 h-3 text-zinc-600 opacity-0 group-hover/cell:opacity-100 transition-all" />
                        </div>
                      )}
                    </div>
                  ) : col === 'landing_cost' ? (
                    <div className="flex items-center min-w-[80px]">
                      <span className="text-[13px] font-bold text-emerald-400 font-data">
                        {((Number(row.cogs) || 0) + (Number(row.shipping_cost) || 0)).toFixed(2)}
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-center">
                      {i === 0 && (
                        <input
                          type="checkbox"
                          className="rounded border-white/20 bg-white/5 text-brand-amber focus:ring-brand-amber focus:ring-offset-0 focus:outline-none cursor-pointer w-3.5 h-3.5 mr-3"
                          checked={selectedSkus.has(row.sku)}
                          onChange={() => {
                            setSelectedSkus(prev => {
                              const next = new Set(prev)
                              if (next.has(row.sku)) {
                                next.delete(row.sku)
                              } else {
                                next.add(row.sku)
                              }
                              return next
                            })
                          }}
                          onClick={e => e.stopPropagation()}
                        />
                      )}
                      <span className={`text-[13px] uppercase ${i === 0 ? 'font-black text-brand-blue' : 'font-semibold text-zinc-300'}`}>
                        {row[col] === null || row[col] === undefined ? '-' : String(row[col])}
                      </span>
                    </div>
                  )}</span></td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
