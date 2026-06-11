import React, { Fragment } from 'react'
import { Trash2 } from 'lucide-react'
import { PO } from '../../types'
import { InlineEdit } from './InlineEdit'
import { StatusBadge } from '../shared/StatusBadge'
import { ActionDropdown } from '../ActionDropdown'
import { formatDate, nextStatus } from './utils'
import { api } from '../../lib/api'
import { Plus } from 'lucide-react'

interface POTableProps {
  loading: boolean
  paginatedPOs: PO[]
  selectedIds: Set<string>
  setSelectedIds: React.Dispatch<React.SetStateAction<Set<string>>>
  requestSort: (key: string) => void
  sortConfig: { key: string, direction: 'asc' | 'desc' } | null
  expandedId: string | null
  setExpandedId: (id: string | null) => void
  setPOs: React.Dispatch<React.SetStateAction<PO[]>>
  setAdvancingId: (id: string | null) => void
  search: string
  allSkus: any[]
  skuSuggestions: string[]
}

function SkeletonRow({ cols }: { cols: number }) {
  return (
    <tr>
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-4 py-2.5">
          <div className="animate-pulse h-3 bg-zinc-100/10 rounded w-full" />
        </td>
      ))}
    </tr>
  )
}

export function POTable({
  loading, paginatedPOs, selectedIds, setSelectedIds, requestSort, sortConfig,
  expandedId, setExpandedId, setPOs, setAdvancingId, search, allSkus, skuSuggestions
}: POTableProps) {

  return (
    <div className="bg-card border border-white/5 shadow-2xl rounded-2xl overflow-hidden">
      <div className="max-h-[600px] overflow-y-auto overflow-x-auto w-full custom-scrollbar">
        <table className="w-full table-fixed text-sm min-w-[1000px]">
          <thead className="bg-[#111827] sticky top-0 z-10 border-b border-white/10">
            <tr className="bg-[#111827]">
              <th className="sticky top-0 bg-[#111827] z-10 w-[3%] text-center px-4 py-3 border-b border-white/10">
                <input
                  type="checkbox"
                  className="rounded border-white/20 bg-white/5 text-brand-amber focus:ring-brand-amber focus:ring-offset-0 focus:outline-none cursor-pointer w-3.5 h-3.5"
                  checked={paginatedPOs.length > 0 && paginatedPOs.every(po => selectedIds.has(po.id))}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setSelectedIds(new Set([...selectedIds, ...paginatedPOs.map(po => po.id)]))
                    } else {
                      const next = new Set(selectedIds)
                      paginatedPOs.forEach(po => next.delete(po.id))
                      setSelectedIds(next)
                    }
                  }}
                  onClick={e => e.stopPropagation()}
                />
              </th>
              <th className="sticky top-0 bg-[#111827] z-10 w-[3%] text-center px-4 py-3 border-b border-white/10" />
              <th 
                className="sticky top-0 bg-[#111827] z-10 w-[11%] text-left px-4 py-3 text-[10px] font-black text-white uppercase tracking-widest cursor-pointer hover:bg-white/5 border-b border-white/10 transition-colors"
                onClick={() => requestSort('po_number')}
              >
                PO ID {sortConfig?.key === 'po_number' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
              </th>
              <th 
                className="sticky top-0 bg-[#111827] z-10 w-[15%] text-left px-4 py-3 text-[10px] font-black text-white uppercase tracking-widest cursor-pointer hover:bg-white/5 border-b border-white/10 transition-colors"
                onClick={() => requestSort('supplier')}
              >
                Supplier {sortConfig?.key === 'supplier' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
              </th>
              <th 
                className="sticky top-0 bg-[#111827] z-10 w-[8%] text-left px-4 py-3 text-[10px] font-black text-white uppercase tracking-widest cursor-pointer hover:bg-white/5 border-b border-white/10 transition-colors"
                onClick={() => requestSort('country')}
              >
                Country {sortConfig?.key === 'country' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
              </th>
              <th 
                className="sticky top-0 bg-[#111827] z-10 w-[6%] text-right px-4 py-3 text-[10px] font-black text-white uppercase tracking-widest cursor-pointer hover:bg-white/5 border-b border-white/10 transition-colors"
                onClick={() => requestSort('skus')}
              >
                SKUs {sortConfig?.key === 'skus' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
              </th>
              <th 
                className="sticky top-0 bg-[#111827] z-10 w-[7%] text-right px-4 py-3 text-[10px] font-black text-white uppercase tracking-widest cursor-pointer hover:bg-white/5 border-b border-white/10 transition-colors"
                onClick={() => requestSort('units')}
              >
                Units {sortConfig?.key === 'units' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
              </th>
              <th 
                className="sticky top-0 bg-[#111827] z-10 w-[13%] text-left px-4 py-3 text-[10px] font-black text-white uppercase tracking-widest cursor-pointer hover:bg-white/5 border-b border-white/10 transition-colors"
                onClick={() => requestSort('order_date')}
              >
                Order Date {sortConfig?.key === 'order_date' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
              </th>
              <th 
                className="sticky top-0 bg-[#111827] z-10 w-[13%] text-left px-4 py-3 text-[10px] font-black text-white uppercase tracking-widest cursor-pointer hover:bg-white/5 border-b border-white/10 transition-colors"
                onClick={() => requestSort('eta')}
              >
                ETA {sortConfig?.key === 'eta' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
              </th>
              <th 
                className="sticky top-0 bg-[#111827] z-10 w-[11%] text-left px-4 py-3 text-[10px] font-black text-white uppercase tracking-widest cursor-pointer hover:bg-white/5 border-b border-white/10 transition-colors"
                onClick={() => requestSort('status')}
              >
                Status {sortConfig?.key === 'status' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
              </th>
              <th className="sticky top-0 bg-[#111827] z-10 w-[18%] pl-4 pr-8 py-3 text-right text-[10px] font-black text-white uppercase tracking-widest border-b border-white/10">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5 bg-transparent">
            {loading ? (
              <><SkeletonRow cols={11} /><SkeletonRow cols={11} /><SkeletonRow cols={11} /></>
            ) : paginatedPOs.length === 0 ? (
              <tr>
                <td colSpan={11} className="px-4 py-8 text-sm text-white text-center">
                  {search ? 'No purchase orders match your search' : 'No purchase orders found'}
                </td>
              </tr>
            ) : (
              paginatedPOs.map(po => {
                const isExpanded = expandedId === po.id
                const totalUnits = po.line_items.reduce((sum, li) => sum + (li.units_ordered || 0), 0)
                
                return (
                  <Fragment key={po.id}>
                    <tr
                      className="hover:bg-white/5 transition-colors cursor-pointer border-b border-white/5"
                      onClick={() => setExpandedId(isExpanded ? null : po.id)}
                    >
                      <td className="px-4 py-4 text-center" onClick={e => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          className="rounded border-white/20 bg-white/5 text-brand-amber focus:ring-brand-amber focus:ring-offset-0 focus:outline-none cursor-pointer w-3.5 h-3.5"
                          checked={selectedIds.has(po.id)}
                          onChange={() => {
                            setSelectedIds(prev => {
                              const next = new Set(prev)
                              if (next.has(po.id)) {
                                next.delete(po.id)
                              } else {
                                next.add(po.id)
                              }
                              return next
                            })
                          }}
                        />
                      </td>
                      <td className="px-3 py-2.5 text-center text-zinc-500 text-xs">
                        {isExpanded ? '▼' : '▶'}
                      </td>
                      <td className="px-4 py-4 font-data text-sm font-semibold text-white">
                        {po.po_number}
                        <InlineEdit 
                          value={po.po_name} 
                          placeholder="+ Add po_name"
                          className="text-sm font-semibold text-white mt-0.5 font-sans"
                          inputClassName="w-40 text-sm font-semibold text-white"
                          onSave={async (val) => {
                            await api.updatePO(po.id, { po_name: val }, po.po_number)
                            setPOs(prev => prev.map(p => p.id === po.id ? { ...p, po_name: val } : p))
                          }}
                        />
                      </td>
                      <td className="px-4 py-4 text-sm text-white">{po.supplier}</td>
                      <td className="px-4 py-4 text-left font-data text-xs font-black text-white/70 uppercase tracking-widest">
                        <InlineEdit 
                          value={po.country || 'UAE'} 
                          placeholder="UAE"
                          inputClassName="w-16 text-xs uppercase"
                          onSave={async (val) => {
                            const newCountry = val.trim().toUpperCase() || 'UAE'
                            await api.updatePO(po.id, { country: newCountry }, po.po_number)
                            setPOs(prev => prev.map(p => p.id === po.id ? { ...p, country: newCountry } : p))
                          }}
                        />
                      </td>
                      <td className="px-4 py-4 text-right font-data text-sm text-white">{po.line_items.length}</td>
                      <td className="px-4 py-4 text-right font-data text-sm font-semibold text-white">
                        {totalUnits.toLocaleString()}
                      </td>
                      <td className="px-4 py-4 font-data text-xs text-white">
                        <InlineEdit 
                          type="date"
                          value={po.order_date} 
                          displayValue={formatDate(po.order_date)}
                          placeholder="+ Add Date"
                          inputClassName="w-[115px] text-xs"
                          onSave={async (val) => {
                            await api.updatePO(po.id, { order_date: val }, po.po_number)
                            setPOs(prev => prev.map(p => p.id === po.id ? { ...p, order_date: val } : p))
                          }}
                        />
                      </td>
                      <td className="px-4 py-4 font-data text-xs text-white">
                        <InlineEdit 
                          type="date"
                          value={po.eta} 
                          displayValue={formatDate(po.eta)}
                          placeholder="+ Add ETA"
                          inputClassName="w-[115px] text-xs"
                          onSave={async (val) => {
                            await api.updatePO(po.id, { eta: val }, po.po_number)
                            setPOs(prev => prev.map(p => p.id === po.id ? { ...p, eta: val } : p))
                          }}
                        />
                      </td>
                      <td className="px-4 py-4"><StatusBadge status={po.status} /></td>
                      <td className="pl-4 pr-8 py-4 text-right" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-2">
                          <ActionDropdown 
                            currentStatus={po.status}
                            onStatusChange={async (newStatus) => {
                              setAdvancingId(po.id);
                              const res = await api.updatePO(po.id, { status: newStatus as any });
                              setAdvancingId(null);
                              const resAny = res as any;
                              if (resAny.error) {
                                alert('Failed to update PO status: ' + resAny.error);
                              } else {
                                setPOs(prev => prev.map(p => (p.id === po.id ? { ...p, status: newStatus as any } : p)));
                              }
                            }}
                            options={['draft', 'ordered', 'shipped', 'closed', 'cancelled']}
                            colors={{
                              draft: 'bg-slate-100 text-slate-500 border-slate-200',
                              ordered: 'bg-blue-50 text-blue-600 border-blue-200',
                              shipped: 'bg-brand-blue/10 text-brand-blue border-brand-blue/20',
                              closed: 'bg-zinc-100 text-zinc-500 border-zinc-200',
                              cancelled: 'bg-red-50 text-red-600 border-red-200'
                            }}
                          />
                          <button
                            onClick={async () => {
                              if (confirm(`Are you sure you want to permanently delete PO ${po.po_number}?`)) {
                                const res = await api.deletePO(po.id);
                                const resAny = res as any;
                                if (resAny.error) {
                                  alert('Failed to delete PO: ' + resAny.error);
                                } else {
                                  setPOs(prev => prev.filter(p => p.po_number !== po.po_number));
                                }
                              }
                            }}
                            className="p-1.5 text-zinc-400 hover:text-red-500 hover:bg-white/5 rounded-lg border border-transparent hover:border-white/10 transition-all shrink-0"
                            title="Delete Purchase Order"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>

                    {/* Expanded row */}
                    {isExpanded && (
                      <tr key={`${po.id}-expanded`} className="bg-white/5 border-b border-white/5">
                        <td colSpan={2} />
                        <td colSpan={8} className="px-8 py-6">
                          <div className="text-[10px] font-black text-white uppercase tracking-widest mb-4">Line Items Breakdown</div>
                          <table className="w-full text-left border-collapse">
                            <thead>
                              <tr className="border-b border-white/5">
                                <th className="py-3 pr-4 text-[10px] font-black text-white uppercase tracking-widest w-[20%]">SKU</th>
                                <th className="py-3 pr-4 text-right text-[10px] font-black text-white uppercase tracking-widest">Ordered</th>
                                <th className="py-3 pr-4 text-right text-[10px] font-black text-white uppercase tracking-widest">Received</th>
                                <th className="py-3 pr-4 text-right text-[10px] font-black text-white uppercase tracking-widest">U/Box</th>
                                <th className="py-3 pr-4 text-right text-[10px] font-black text-white uppercase tracking-widest">Boxes</th>
                                <th className="py-3 pr-4 text-left text-[10px] font-black text-white uppercase tracking-widest w-24">Dims</th>
                                <th className="py-3 pr-4 text-right text-[10px] font-black text-white uppercase tracking-widest">COGS</th>
                                <th className="py-3 pr-4 text-right text-[10px] font-black text-white uppercase tracking-widest">Ship</th>
                                <th className="py-3 text-left text-[10px] font-black text-white uppercase tracking-widest">Notes</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5 bg-transparent">
                              {(() => {
                                const saveItems = async (newItems: any[]) => {
                                  const oldItems = po.line_items
                                  setPOs(prev => prev.map(p => p.id === po.id ? { ...p, line_items: newItems } : p))
                                  
                                  try {
                                    const toSave = newItems.filter(it => it.sku && it.sku.trim() !== '')
                                    const res = await api.updatePO(po.id, { line_items: toSave }, po.po_number)
                                    const resAny = res as any
                                    if (resAny.error) throw new Error(resAny.error)
                                    setPOs(prev => prev.map(p => p.po_number === po.po_number ? res : p))
                                  } catch (err: any) {
                                    alert('Failed to save changes: ' + err.message)
                                    setPOs(prev => prev.map(p => p.id === po.id ? { ...p, line_items: oldItems } : p))
                                  }
                                }

                                return (
                                  <>
                                    {po.line_items.map((li, i) => {
                                      const skuData = allSkus.find(s => s.sku && li.sku && s.sku.toLowerCase() === li.sku.toLowerCase())
                                      const upb = li.units_per_box || skuData?.units_per_box || 0
                                      const cogs = li.cogs_per_unit || skuData?.cogs || 0
                                      const dims = li.dimensions || skuData?.dimensions || ''
                                      const bc = li.box_count || (upb > 0 && li.units_ordered > 0 ? Math.ceil(li.units_ordered / upb) : 0)

                                      return (
                                        <tr key={i} className="group/item">
                                          <td className="py-2 pr-4 text-sm text-white">
                                            <InlineEdit 
                                              value={li.sku} 
                                              suggestions={skuSuggestions}
                                              inputClassName="w-full text-sm text-white"
                                              autoEdit={li.sku === '' && i === po.line_items.length - 1}
                                              onSave={async (val) => {
                                                const newItems = [...po.line_items]
                                                const skuCode = val.trim()
                                                const skuData = allSkus.find(s => s.sku && s.sku.toLowerCase() === skuCode.toLowerCase())
                                                if (skuData) {
                                                  const uo = li.units_ordered || 0
                                                  const upb = skuData.units_per_box || 0
                                                  const bc = upb > 0 && uo > 0 ? Math.ceil(uo / upb) : 0
                                                  newItems[i] = {
                                                    ...li,
                                                    sku: skuData.sku,
                                                    units_per_box: upb,
                                                    cogs_per_unit: skuData.cogs || 0,
                                                    dimensions: skuData.dimensions || '',
                                                    box_count: bc
                                                  }
                                                } else {
                                                  newItems[i] = { ...li, sku: val }
                                                }
                                                await saveItems(newItems)
                                              }}
                                            />
                                          </td>
                                          <td className="py-2 pr-4 text-right font-data text-sm text-white">
                                            <InlineEdit 
                                              type="number"
                                              value={li.units_ordered} 
                                              className="justify-end"
                                              inputClassName="w-16 text-right text-sm text-white"
                                              onSave={async (val) => {
                                                const num = val ? Number(val) : 0
                                                const newItems = [...po.line_items]
                                                let upb = li.units_per_box || 0
                                                let cogs = li.cogs_per_unit || 0
                                                let dims = li.dimensions || ''
                                                
                                                if (li.sku) {
                                                  const skuData = allSkus.find(s => s.sku && li.sku && s.sku.toLowerCase() === li.sku.toLowerCase())
                                                  if (skuData) {
                                                    if (!upb && skuData.units_per_box) upb = skuData.units_per_box
                                                    if (!cogs && skuData.cogs) cogs = skuData.cogs
                                                    if (!dims && skuData.dimensions) dims = skuData.dimensions
                                                  }
                                                }
                                                
                                                const bc = upb > 0 && num > 0 ? Math.ceil(num / upb) : 0
                                                newItems[i] = { 
                                                  ...li, 
                                                  units_ordered: num, 
                                                  units_per_box: upb, 
                                                  cogs_per_unit: cogs, 
                                                  dimensions: dims, 
                                                  box_count: bc 
                                                }
                                                await saveItems(newItems)
                                              }}
                                            />
                                          </td>
                                          <td className="py-2 pr-4 text-right font-data text-sm text-white">
                                            <InlineEdit 
                                              type="number"
                                              value={li.units_received} 
                                              className="justify-end"
                                              inputClassName="w-16 text-right text-sm text-white"
                                              onSave={async (val) => {
                                                const num = val ? Number(val) : 0
                                                const newItems = [...po.line_items]
                                                newItems[i] = { ...li, units_received: num }
                                                await saveItems(newItems)
                                              }}
                                            />
                                          </td>
                                          <td className="py-2 pr-4 text-right font-data text-sm text-white">
                                            <InlineEdit 
                                              type="number"
                                              value={upb || ''} 
                                              className="justify-end"
                                              inputClassName="w-16 text-right text-sm text-white"
                                              onSave={async (val) => {
                                                let num = val ? Number(val) : 0
                                                let cogs = li.cogs_per_unit || 0
                                                let dims = li.dimensions || ''
                                                
                                                if (li.sku) {
                                                  const skuData = allSkus.find(s => s.sku && li.sku && s.sku.toLowerCase() === li.sku.toLowerCase())
                                                  if (skuData) {
                                                    if (!num && skuData.units_per_box) num = skuData.units_per_box
                                                    if (!cogs && skuData.cogs) cogs = skuData.cogs
                                                    if (!dims && skuData.dimensions) dims = skuData.dimensions
                                                  }
                                                }
                                                
                                                const newItems = [...po.line_items]
                                                const uo = li.units_ordered || 0
                                                const bc = num > 0 && uo > 0 ? Math.ceil(uo / num) : 0
                                                newItems[i] = { 
                                                  ...li, 
                                                  units_per_box: num, 
                                                  cogs_per_unit: cogs, 
                                                  dimensions: dims, 
                                                  box_count: bc 
                                                }
                                                await saveItems(newItems)
                                              }}
                                            />
                                          </td>
                                          <td className="py-2 pr-4 text-right font-data text-sm text-white">
                                            <InlineEdit 
                                              type="number"
                                              value={bc || ''} 
                                              className="justify-end"
                                              inputClassName="w-16 text-right text-sm text-white"
                                              onSave={async (val) => {
                                                const num = val ? Number(val) : 0
                                                const newItems = [...po.line_items]
                                                let uo = li.units_ordered || 0
                                                if (upb > 0 && num > 0) {
                                                  uo = num * upb
                                                } else if (num <= 0) {
                                                  uo = 0
                                                }
                                                newItems[i] = { ...li, box_count: num, units_ordered: uo }
                                                await saveItems(newItems)
                                              }}
                                            />
                                          </td>
                                          <td className="py-2 pr-4 text-left font-data text-sm text-white">
                                            <InlineEdit 
                                              value={dims || ''} 
                                              inputClassName="w-32 text-sm text-white"
                                              onSave={async (val) => {
                                                const newItems = [...po.line_items]
                                                newItems[i] = { ...li, dimensions: val }
                                                await saveItems(newItems)
                                              }}
                                            />
                                          </td>
                                          <td className="py-2 pr-4 text-right font-data text-sm text-white">
                                            <InlineEdit 
                                              type="number"
                                              value={cogs || ''} 
                                              className="justify-end"
                                              inputClassName="w-16 text-right text-sm text-white"
                                              onSave={async (val) => {
                                                const num = val ? Number(val) : 0
                                                const newItems = [...po.line_items]
                                                newItems[i] = { ...li, cogs_per_unit: num }
                                                await saveItems(newItems)
                                              }}
                                            />
                                          </td>
                                          <td className="py-2 pr-4 text-right font-data text-sm text-white">
                                            <InlineEdit 
                                              type="number"
                                              value={li.shipping_cost_per_unit} 
                                              className="justify-end"
                                              inputClassName="w-16 text-right text-sm text-white"
                                              onSave={async (val) => {
                                                const num = val ? Number(val) : 0
                                                const newItems = [...po.line_items]
                                                newItems[i] = { ...li, shipping_cost_per_unit: num }
                                                await saveItems(newItems)
                                              }}
                                            />
                                          </td>
                                          <td className="py-2 text-left font-data text-sm text-white relative">
                                            <InlineEdit 
                                              value={li.notes} 
                                              inputClassName="w-48 text-sm text-white"
                                              onSave={async (val) => {
                                                const newItems = [...po.line_items]
                                                newItems[i] = { ...li, notes: val }
                                                await saveItems(newItems)
                                              }}
                                            />
                                            <button
                                              onClick={async () => {
                                                if (confirm('Remove this item from the PO?')) {
                                                  const newItems = po.line_items.filter((_, idx) => idx !== i)
                                                  await saveItems(newItems)
                                                }
                                              }}
                                              className="absolute right-0 top-1/2 -translate-y-1/2 p-1 text-zinc-400 hover:text-red-500 hover:bg-white/5 rounded transition-colors"
                                            >
                                              <Trash2 className="h-3 w-3" />
                                            </button>
                                          </td>
                                        </tr>
                                      )
                                    })}
                                    <tr className="border-t border-zinc-100/10">
                                      <td colSpan={9} className="py-3">
                                        <button
                                          onClick={() => {
                                            const newItem = { sku: '', units_ordered: 1, units_received: 0, units_per_box: 0, box_count: 0, dimensions: '', cogs_per_unit: 0, shipping_cost_per_unit: 0, notes: '' }
                                            const newItems = [...po.line_items, newItem]
                                            setPOs(prev => prev.map(p => p.id === po.id ? { ...p, line_items: newItems } : p))
                                          }}
                                          className="flex items-center gap-1.5 px-2 py-1 bg-white/5 hover:bg-white/10 text-white rounded border border-white/10 text-[10px] font-black uppercase tracking-widest transition-colors"
                                        >
                                          <Plus className="h-3 w-3" />
                                          Add New Item
                                        </button>
                                      </td>
                                    </tr>
                                  </>
                                )
                              })()}
                            </tbody>
                          </table>
                          <div className="flex flex-col gap-2 mt-4 text-xs text-white border-t border-zinc-100/10 pt-3">
                            {po.tracking_number && (
                              <div className="flex items-center gap-2"><span className="font-medium text-white/80">Tracking: </span>{po.tracking_number}</div>
                            )}
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-white/80">Notes: </span>
                              <InlineEdit 
                                value={po.po_notes || po.notes || ''} 
                                placeholder="+ Add Note"
                                inputClassName="w-64 text-xs"
                                onSave={async (val) => {
                                  await api.updatePO(po.id, { notes: val }, po.po_number)
                                  setPOs(prev => prev.map(p => p.id === po.id ? { ...p, po_notes: val, notes: val } : p))
                                }}
                              />
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
