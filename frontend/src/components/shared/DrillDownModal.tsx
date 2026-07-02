import { X, Download, ChevronDown } from 'lucide-react'
import { useState } from 'react'
import { createPortal } from 'react-dom'
import { ActionDropdown } from './ActionDropdown'
import type { ActionFlag, InventoryNode } from '../../types'
import { navigate } from '../../lib/router'

interface DrillDownProps {
  title: string
  isOpen: boolean
  onClose: () => void
  data: any[]
  type: 'alerts' | 'ship_now' | 'reorder_now' | 'inbound' | 'excess' | 'oos_amazon' | 'oos_noon' | 'oos_minutes' | 'oos_total' | 'oos_fleet_risk'
}

export function DrillDownModal({ title, isOpen, onClose, data, type }: DrillDownProps) {
  const [rowStatuses, setRowStatuses] = useState<Record<string, string>>({})
  if (!isOpen) return null

  // Flatten data for specific types if needed
  const displayData = (type === 'inbound') 
    ? (Array.isArray(data) ? data : []).flatMap((po: any) => 
        (po.line_items || []).map((li: any) => ({
          ...li,
          po_number: po.po_number,
          supplier: po.supplier,
          status: po.status,
          eta: po.eta,
          total_units: li.units_ordered
        }))
      )
    : (Array.isArray(data) ? data : [])

  const safeData = displayData

  const handleExport = () => {
    try {
      if (!safeData.length) {
        console.warn('DrillDown: No data to export')
        return
      }
      
      const firstItem = safeData[0]
      const headers = Object.keys(firstItem).filter(k => 
        (firstItem[k] === null || typeof firstItem[k] !== 'object') && 
        k !== 'sku_master' // Explicitly ignore nested objects
      )
      
      const csvRows = [
        headers.join(','),
        ...safeData.map(row => 
          headers.map(h => {
            const val = row[h] ?? ''
            return `"${String(val).replace(/"/g, '""')}"`
          }).join(',')
        )
      ]

      const csvString = csvRows.join('\r\n')
      const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      
      link.href = url
      link.download = `${title.toLowerCase().replace(/[^a-z0-9]+/g, '_')}_${new Date().toISOString().split('T')[0]}.csv`
      document.body.appendChild(link)
      link.click()
      
      setTimeout(() => {
        document.body.removeChild(link)
        URL.revokeObjectURL(url)
      }, 100)
    } catch (err) {
      console.error('DrillDown: Export failed', err)
      alert('Export failed: ' + String(err))
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-[#111827] rounded-2xl shadow-2xl w-full max-w-[98vw] 2xl:max-w-[90vw] max-h-[90vh] flex flex-col overflow-hidden border border-white/10 scale-in-center transition-transform">
        {/* Header */}
        <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between bg-white/5">
          <div>
            <h3 className="text-sm font-black text-white uppercase tracking-widest">{title}</h3>
            <p className="text-[10px] text-zinc-400 font-bold mt-0.5 uppercase tracking-tighter opacity-70">
              Listing {safeData.length} affected product lines
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleExport}
              className="flex items-center gap-2 px-3 py-1.5 bg-transparent hover:bg-white/5 text-zinc-400 hover:text-white rounded-md text-[10px] font-black uppercase tracking-widest transition-all border border-white/10"
              title="Export to CSV"
            >
              <Download className="w-3.5 h-3.5" />
              DOWNLOAD ALL
            </button>
            <button 
              onClick={onClose}
              className="p-2 hover:bg-white/10 rounded-xl transition-colors text-zinc-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto custom-scrollbar">
          <table className="w-fit min-w-full text-sm border-separate border-spacing-0">
            <thead className="bg-[#111827] sticky top-0 z-30 shadow-[0_2px_10px_-3px_rgba(0,0,0,0.5)]">
              <tr className="group hover:bg-white/10 transition-colors">
                <HeaderCell>SKU</HeaderCell>
                <HeaderCell>Product Name</HeaderCell>
                {type === 'alerts' && (
                  <>
                    <HeaderCell right>AMZ Cov</HeaderCell>
                    <HeaderCell right>Noon Cov</HeaderCell>
                    <HeaderCell>Flag</HeaderCell>
                  </>
                )}
                {type === 'ship_now' && (
                  <>
                    <HeaderCell right>AMZ SV</HeaderCell>
                    <HeaderCell right>NOON SV</HeaderCell>
                    <HeaderCell right>MIN SV</HeaderCell>
                    <HeaderCell right>Staged Units</HeaderCell>
                    <HeaderCell right>AMZ UNITS</HeaderCell>
                    <HeaderCell right>NOON UNITS</HeaderCell>
                    <HeaderCell right>MIN UNITS</HeaderCell>
                    <HeaderCell right>Total Boxes</HeaderCell>
                    <HeaderCell right>AMZ Boxes</HeaderCell>
                    <HeaderCell right>Noon Boxes</HeaderCell>
                    <HeaderCell right>MIN Boxes</HeaderCell>
                    <HeaderCell>Logic</HeaderCell>
                    <HeaderCell>Action</HeaderCell>
                  </>
                )}
                {type === 'reorder_now' && (
                  <>
                    <HeaderCell right>Velocity</HeaderCell>
                    <HeaderCell right>Order Units</HeaderCell>
                    <HeaderCell right>Reorder Cost</HeaderCell>
                    <HeaderCell right>MOQ</HeaderCell>
                  </>
                )}
                {type === 'inbound' && (
                  <>
                    <HeaderCell>PO # / Supplier</HeaderCell>
                    <HeaderCell>Status</HeaderCell>
                    <HeaderCell>Action</HeaderCell>
                    <HeaderCell right>Total Units</HeaderCell>
                    <HeaderCell>ETA</HeaderCell>
                  </>
                )}
                {(type === 'oos_amazon' || type === 'oos_noon' || type === 'oos_minutes' || type === 'oos_total') && (
                  <>
                    <HeaderCell right>Velocity</HeaderCell>
                    <HeaderCell right>Current Stock</HeaderCell>
                    <HeaderCell right>AMZ Cov</HeaderCell>
                    <HeaderCell right>Noon Cov</HeaderCell>
                    <HeaderCell>Flag</HeaderCell>
                  </>
                )}
                {type === 'oos_fleet_risk' && (
                  <>
                    <HeaderCell>Tier</HeaderCell>
                    <HeaderCell>Category</HeaderCell>
                    <HeaderCell>Sub-Cat</HeaderCell>
                    <HeaderCell right>Blended SV</HeaderCell>
                    <HeaderCell right>Order Qty</HeaderCell>
                    <HeaderCell right>Order Cost</HeaderCell>
                  </>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {safeData.map((item, i) => (
                <tr 
                  className="group hover:bg-white/10 transition-colors hover:bg-white/5 transition-all duration-150 relative hover:z-[60]" 
                  key={i}
                  style={{ zIndex: safeData.length - i }}
                >
                  <td className="py-3 px-2"><button
                      onClick={() => {
                        navigate('/sku/' + item.sku)
                        onClose()
                      }}
                      className="bg-brand-blue/10 border-brand-blue/20 text-brand-blue hover:text-white transition-colors px-2 py-1 rounded border whitespace-nowrap font-data text-[11px] font-black"
                    >
                      {item.sku}
                    </button></td>
                  <td className="py-3 px-2"><p className="text-[11px] font-semibold text-white truncate max-w-[280px]">
                      {item.name}
                    </p></td>

                  {type === 'alerts' && (
                    <>
                      <td className="py-3 px-2 text-right font-data text-[11px] text-white font-bold"><span className="inline-block transition-transform duration-300 group-hover:scale-[1.15] origin-center">{formatCov(item.coverage_amazon)}</span></td>
                      <td className="py-3 px-2 text-right font-data text-[11px] text-white font-bold"><span className="inline-block transition-transform duration-300 group-hover:scale-[1.15] origin-center">{formatCov(item.coverage_noon)}</span></td>
                      <td className="py-3 px-2"><span className={`inline-block px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-tighter ${
                           item.action_flag === 'CRITICAL_OOS_RISK' ? 'bg-red-100 text-red-600' : 'bg-orange-100 text-orange-600'
                         }`}>
                           {item.action_flag?.replace(/_/g, ' ')}
                         </span></td>
                    </>
                  )}

                  {type === 'ship_now' && (
                    <>
                      <td className="py-3 px-2 text-right font-data text-[11px] text-white font-bold"><span className="inline-block transition-transform duration-300 group-hover:scale-[1.15] origin-center">{Number(item.amazon_sv || 0).toFixed(2)}</span></td>
                      <td className="py-3 px-2 text-right font-data text-[11px] text-white font-bold"><span className="inline-block transition-transform duration-300 group-hover:scale-[1.15] origin-center">{Number(item.noon_sv || 0).toFixed(2)}</span></td>
                      <td className="py-3 px-2 text-right font-data text-[11px] text-white font-bold"><span className="inline-block transition-transform duration-300 group-hover:scale-[1.15] origin-center">{Number(item.minutes_sv || 0).toFixed(2)}</span></td>
                      <td className="py-3 px-2 text-right font-data text-[11px] text-white font-bold"><span className="inline-block transition-transform duration-300 group-hover:scale-[1.15] origin-center">{item.total_units_to_ship || item.units_to_ship}</span></td>
                      <td className="py-3 px-2 text-right font-data text-[11px] text-white font-bold"><span className="inline-block transition-transform duration-300 group-hover:scale-[1.15] origin-center">{item.send_to_fba_units ?? 0}</span></td>
                      <td className="py-3 px-2 text-right font-data text-[11px] text-white font-bold"><span className="inline-block transition-transform duration-300 group-hover:scale-[1.15] origin-center">{item.send_to_fbn_units ?? 0}</span></td>
                      <td className="py-3 px-2 text-right font-data text-[11px] text-white font-bold"><span className="inline-block transition-transform duration-300 group-hover:scale-[1.15] origin-center">{item.send_to_minutes_units ?? 0}</span></td>
                      <td className="py-3 px-2 text-right font-data text-[11px] text-white font-bold"><span className="inline-block transition-transform duration-300 group-hover:scale-[1.15] origin-center">{item.total_boxes_to_ship || ((item.suggested_boxes_amazon || 0) + (item.suggested_boxes_noon || 0) + (item.suggested_boxes_minutes || 0))}</span></td>
                      <td className="py-3 px-2 text-right font-data text-[11px] text-white font-bold"><span className="inline-block transition-transform duration-300 group-hover:scale-[1.15] origin-center">{item.suggested_boxes_amazon ?? 0}</span></td>
                      <td className="py-3 px-2 text-right font-data text-[11px] text-white font-bold"><span className="inline-block transition-transform duration-300 group-hover:scale-[1.15] origin-center">{item.suggested_boxes_noon ?? 0}</span></td>
                      <td className="py-3 px-2 text-right font-data text-[11px] text-white font-bold"><span className="inline-block transition-transform duration-300 group-hover:scale-[1.15] origin-center">{item.suggested_boxes_minutes ?? 0}</span></td>
                      <td className="py-3 px-2 text-[10px] text-muted font-bold uppercase"><span className="inline-block transition-transform duration-300 group-hover:scale-[1.15] origin-center">{item.allocation_logic}</span></td>
                      <td className="py-3 px-2"><ActionDropdown 
                          currentStatus={rowStatuses[`${item.sku}-${i}`] || 'Shipment planning'} 
                          onStatusChange={(status) => setRowStatuses(prev => ({ ...prev, [`${item.sku}-${i}`]: status }))}
                          isMulti={true}
                        /></td>
                    </>
                  )}

                  {type === 'reorder_now' && (
                    <>
                      <td className="py-3 px-2 text-right font-data text-[11px] text-white font-bold"><span className="inline-block transition-transform duration-300 group-hover:scale-[1.15] origin-center">{Number(item.blended_sv || 0).toFixed(2)}</span></td>
                      <td className="py-3 px-2 text-right font-data text-[11px] text-white font-bold"><span className="inline-block transition-transform duration-300 group-hover:scale-[1.15] origin-center">{item.suggested_units}</span></td>
                      <td className="py-3 px-2 text-right font-data text-[11px] text-white font-bold"><span className="inline-block transition-transform duration-300 group-hover:scale-[1.15] origin-center">{Number(item.total_cost_aed || (item.suggested_units * (item.cogs || 0))).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></td>
                      <td className="py-3 px-2 text-right font-data text-[11px] text-white font-bold"><span className="inline-block transition-transform duration-300 group-hover:scale-[1.15] origin-center">{item.moq || '—'}</span></td>
                    </>
                  )}
                  
                  {type === 'inbound' && (
                    <>
                      <td className="py-3 px-2"><div className="flex flex-col">
                            <span className="text-[10px] font-black text-primary uppercase">{item.po_number}</span>
                            <span className="text-[9px] text-muted font-bold">{item.supplier}</span>
                         </div></td>
                      <td className="py-3 px-2"><span className="inline-block px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 text-[9px] font-black uppercase tracking-tighter inline-block transition-transform duration-300 group-hover:scale-[1.15] origin-center">
                            {item.status}
                         </span></td>
                      <td className="py-3 px-2"><ActionDropdown 
                          currentStatus={rowStatuses[`${item.sku}-${i}`] || item.status || 'shipped'} 
                          onStatusChange={(status) => setRowStatuses(prev => ({ ...prev, [`${item.sku}-${i}`]: status }))}
                        /></td>
                      <td className="py-3 px-2 text-right font-data text-[11px] text-white font-bold"><span className="inline-block transition-transform duration-300 group-hover:scale-[1.15] origin-center">{item.total_units}</span></td>
                      <td className="py-3 px-2 text-[10px] text-white font-bold"><span className="inline-block transition-transform duration-300 group-hover:scale-[1.15] origin-center">{item.eta ? new Date(item.eta).toLocaleDateString() : '—'}</span></td>
                    </>
                  )}

                  {(type === 'oos_amazon' || type === 'oos_noon' || type === 'oos_minutes' || type === 'oos_total') && (
                    <>
                      <td className="py-3 px-2 text-right font-data text-[11px] text-white font-bold"><span className="inline-block transition-transform duration-300 group-hover:scale-[1.15] origin-center">{Number(item.blended_sv || 0).toFixed(2)}</span></td>
                      <td className="py-3 px-2 text-right font-data text-[11px] text-white font-bold"><span className="inline-block transition-transform duration-300 group-hover:scale-[1.15] origin-center">{type === 'oos_amazon' ? (item.fba_units || 0) : 
                         type === 'oos_noon' ? (item.fbn_units || 0) : 
                         type === 'oos_minutes' ? (item.minutes_units || 0) : 
                         ((item.fba_units || 0) + (item.fbn_units || 0) + (item.minutes_units || 0))}</span></td>
                      <td className="py-3 px-2 text-right font-data text-[11px] text-white font-bold"><span className="inline-block transition-transform duration-300 group-hover:scale-[1.15] origin-center">{formatCov(item.coverage_amazon)}</span></td>
                      <td className="py-3 px-2 text-right font-data text-[11px] text-white font-bold"><span className="inline-block transition-transform duration-300 group-hover:scale-[1.15] origin-center">{formatCov(item.coverage_noon)}</span></td>
                      <td className="py-3 px-2"><span className="inline-block px-2 py-0.5 rounded bg-red-100 text-red-600 text-[9px] font-black uppercase tracking-tighter inline-block transition-transform duration-300 group-hover:scale-[1.15] origin-center">
                           OUT OF STOCK
                         </span></td>
                    </>
                  )}

                  {type === 'oos_fleet_risk' && (
                    <>
                      <td className="py-3 px-2"><span className={`text-[10px] font-black uppercase px-1.5 py-0.5 rounded border ${
                          item.category === 'A' ? 'bg-amber-50 text-amber-700 border-amber-200' : 
                          item.category === 'B' ? 'bg-blue-50 text-blue-700 border-blue-200' : 
                          'bg-zinc-50 text-zinc-600 border-zinc-200'
                        }`}>
                          Tier {item.category || 'C'}
                        </span></td>
                      <td className="py-3 px-2 text-[10px] font-bold text-muted uppercase truncate max-w-[100px]"><span className="inline-block transition-transform duration-300 group-hover:scale-[1.15] origin-center">{item.product_category || '—'}</span></td>
                      <td className="py-3 px-2 text-[10px] font-bold text-muted uppercase truncate max-w-[100px]"><span className="inline-block transition-transform duration-300 group-hover:scale-[1.15] origin-center">{item.sub_category || '—'}</span></td>
                      <td className="py-3 px-2 text-right font-data text-[11px] text-white font-bold"><span className="inline-block transition-transform duration-300 group-hover:scale-[1.15] origin-center">{Number(item.blended_sv || 0).toFixed(2)}</span></td>
                      <td className="py-3 px-2 text-right font-data text-[11px] text-white font-bold"><span className="inline-block transition-transform duration-300 group-hover:scale-[1.15] origin-center">{item.suggested_units?.toLocaleString() || 0}</span></td>
                      <td className="py-3 px-2 text-right font-data text-[11px] text-white font-bold"><span className="inline-block transition-transform duration-300 group-hover:scale-[1.15] origin-center">{Number(item.total_cost_aed || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
            {type === 'ship_now' && (
              <tfoot className="bg-slate-50 sticky bottom-0 z-30 shadow-[0_-2px_10px_-3px_rgba(0,0,0,0.07)] border-t-2 border-slate-200">
                <tr className="font-bold text-white bg-[#111827] group">
                  <td className="py-3 px-2 text-[11px] uppercase tracking-widest text-primary" colSpan={2}><span className="inline-block transition-transform duration-300 group-hover:scale-[1.15] origin-center">Totals</span></td>
                  <td className="py-3 px-2 text-right font-data text-[11px]"><span className="inline-block transition-transform duration-300 group-hover:scale-[1.15] origin-center">{safeData.reduce((sum, item) => sum + (Number(item.amazon_sv) || 0), 0).toFixed(2)}</span></td>
                  <td className="py-3 px-2 text-right font-data text-[11px]"><span className="inline-block transition-transform duration-300 group-hover:scale-[1.15] origin-center">{safeData.reduce((sum, item) => sum + (Number(item.noon_sv) || 0), 0).toFixed(2)}</span></td>
                  <td className="py-3 px-2 text-right font-data text-[11px]"><span className="inline-block transition-transform duration-300 group-hover:scale-[1.15] origin-center">{safeData.reduce((sum, item) => sum + (Number(item.minutes_sv) || 0), 0).toFixed(2)}</span></td>
                  <td className="py-3 px-2 text-right font-data text-[11px]"><span className="inline-block transition-transform duration-300 group-hover:scale-[1.15] origin-center">{safeData.reduce((sum, item) => sum + (Number(item.total_units_to_ship || item.units_to_ship) || 0), 0).toLocaleString()}</span></td>
                  <td className="py-3 px-2 text-right font-data text-[11px]"><span className="inline-block transition-transform duration-300 group-hover:scale-[1.15] origin-center">{safeData.reduce((sum, item) => sum + (Number(item.send_to_fba_units) || 0), 0).toLocaleString()}</span></td>
                  <td className="py-3 px-2 text-right font-data text-[11px]"><span className="inline-block transition-transform duration-300 group-hover:scale-[1.15] origin-center">{safeData.reduce((sum, item) => sum + (Number(item.send_to_fbn_units) || 0), 0).toLocaleString()}</span></td>
                  <td className="py-3 px-2 text-right font-data text-[11px]"><span className="inline-block transition-transform duration-300 group-hover:scale-[1.15] origin-center">{safeData.reduce((sum, item) => sum + (Number(item.current_minutes_stock_units) || 0), 0).toLocaleString()}</span></td>
                  <td className="py-3 px-2 text-right font-data text-[11px]"><span className="inline-block transition-transform duration-300 group-hover:scale-[1.15] origin-center">{safeData.reduce((sum, item) => sum + (Number(item.total_boxes_to_ship || ((item.suggested_boxes_amazon || 0) + (item.suggested_boxes_noon || 0) + (item.suggested_boxes_minutes || 0))) || 0), 0).toLocaleString()}</span></td>
                  <td className="py-3 px-2 text-right font-data text-[11px]"><span className="inline-block transition-transform duration-300 group-hover:scale-[1.15] origin-center">{safeData.reduce((sum, item) => sum + (Number(item.suggested_boxes_amazon) || 0), 0).toLocaleString()}</span></td>
                  <td className="py-3 px-2 text-right font-data text-[11px]"><span className="inline-block transition-transform duration-300 group-hover:scale-[1.15] origin-center">{safeData.reduce((sum, item) => sum + (Number(item.suggested_boxes_noon) || 0), 0).toLocaleString()}</span></td>
                  <td className="py-3 px-2 text-right font-data text-[11px]"><span className="inline-block transition-transform duration-300 group-hover:scale-[1.15] origin-center">{safeData.reduce((sum, item) => sum + (Number(item.suggested_boxes_minutes) || 0), 0).toLocaleString()}</span></td>
                  <td colSpan={2}></td>
                </tr>
              </tfoot>
            )}
            {type === 'reorder_now' && (
              <tfoot className="bg-slate-50 sticky bottom-0 z-20 border-t-2 border-slate-200">
                <tr className="font-bold text-white bg-[#111827] group">
                  <td className="py-3 px-2 text-[11px] uppercase tracking-widest text-primary" colSpan={2}><span className="inline-block transition-transform duration-300 group-hover:scale-[1.15] origin-center">Totals</span></td>
                  <td className="py-3 px-2 text-right font-data text-[11px]"><span className="inline-block transition-transform duration-300 group-hover:scale-[1.15] origin-center">{safeData.reduce((sum, item) => sum + (Number(item.blended_sv) || 0), 0).toFixed(2)}</span></td>
                  <td className="py-3 px-2 text-right font-data text-[11px]"><span className="inline-block transition-transform duration-300 group-hover:scale-[1.15] origin-center">{safeData.reduce((sum, item) => sum + (Number(item.suggested_units) || 0), 0).toLocaleString()}</span></td>
                  <td className="py-3 px-2 text-right font-data text-[11px]"><span className="inline-block transition-transform duration-300 group-hover:scale-[1.15] origin-center">{safeData.reduce((sum, item) => sum + (Number(item.total_cost_aed || (item.suggested_units * (item.cogs || 0))) || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></td>
                  <td colSpan={1}></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-white/5 border-t border-white/5 text-[10px] text-zinc-500 font-black uppercase tracking-widest flex justify-between">
          <span>Saddl Inventory</span>
          <span>Security Protocol Active</span>
        </div>
      </div>
    </div>,
    document.body
  )
}

function HeaderCell({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return (
    <th className={`px-6 py-3 border-b border-white/5 text-[10px] font-black text-zinc-400 uppercase tracking-[0.1em] ${right ? 'text-right' : 'text-left'}`}>
      {children}
    </th>
  )
}

function formatCov(days: any) {
  const n = Number(days)
  if (days == null || !Number.isFinite(n) || n < 0) return '—'
  return `${n.toFixed(1)}d`
}

function coverageColor(days: number | null | undefined): string {
  return 'text-white font-bold'
}
