import React from 'react'
import { ArrowUpDown, ArrowUp, ArrowDown, Edit2, Check, X } from 'lucide-react'
import { navigate } from '../../lib/router'

interface SKUTableProps {
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
  sortedAndFilteredData, columns, sortConfig, handleSort,
  updating, editingCell, setEditingCell, handleUpdateField,
  selectedSkus, setSelectedSkus
}: SKUTableProps) {

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
        <thead className="sticky top-0 z-30 bg-card">
          <tr className="bg-white/5 group">
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
                  ) : (col === 'cogs' || col === 'asin' || col === 'fnsku') ? (
                    <div className="flex items-center gap-2 min-w-[80px]" onClick={e => e.stopPropagation()}>
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
