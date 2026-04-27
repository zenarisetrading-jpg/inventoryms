import { X, Download } from 'lucide-react'
import type { ActionFlag, InventoryNode } from '../types'
import { navigate } from '../lib/router'

interface DrillDownProps {
  title: string
  isOpen: boolean
  onClose: () => void
  data: any[]
  type: 'alerts' | 'ship_now' | 'reorder_now' | 'inbound' | 'excess' | 'oos_amazon' | 'oos_noon' | 'oos_total' | 'oos_fleet_risk'
}

export function DrillDownModal({ title, isOpen, onClose, data, type }: DrillDownProps) {
  if (!isOpen) return null

  // Ensure data is an array
  const safeData = Array.isArray(data) ? data : []

  const handleExport = () => {
    try {
      if (!safeData.length) {
        console.warn('DrillDown: No data to export')
        return
      }
      
      const firstItem = safeData[0]
      const headers = Object.keys(firstItem).filter(k => 
        typeof firstItem[k] !== 'object' && 
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-sidebar/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[85vh] flex flex-col overflow-hidden border border-white/20 scale-in-center transition-transform">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div>
            <h3 className="text-sm font-black text-sidebar uppercase tracking-widest">{title}</h3>
            <p className="text-[10px] text-muted font-bold mt-0.5 uppercase tracking-tighter opacity-70">
              Listing {safeData.length} affected product lines
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleExport}
              className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-muted hover:text-primary rounded-lg text-[10px] font-black uppercase tracking-widest transition-all border border-slate-200"
              title="Export to CSV"
            >
              <Download className="w-3.5 h-3.5" />
              Download CSV
            </button>
            <button 
              onClick={onClose}
              className="p-2 hover:bg-slate-200/50 rounded-xl transition-colors text-muted hover:text-primary"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto custom-scrollbar p-6">
          <table className="w-full text-sm border-separate border-spacing-0">
            <thead className="bg-white sticky top-0 z-20">
              <tr>
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
                    <HeaderCell right>Velocity</HeaderCell>
                    <HeaderCell right>Staged Units</HeaderCell>
                    <HeaderCell right>Total Boxes</HeaderCell>
                    <HeaderCell right>AMZ Boxes</HeaderCell>
                    <HeaderCell right>Noon Boxes</HeaderCell>
                    <HeaderCell>Logic</HeaderCell>
                  </>
                )}
                {type === 'reorder_now' && (
                  <>
                    <HeaderCell right>Velocity</HeaderCell>
                    <HeaderCell right>Order Units</HeaderCell>
                    <HeaderCell right>Reorder Cost</HeaderCell>
                    <HeaderCell right>MOQ</HeaderCell>
                    <HeaderCell>Lead Time</HeaderCell>
                  </>
                )}
                {type === 'inbound' && (
                  <>
                    <HeaderCell>PO # / Supplier</HeaderCell>
                    <HeaderCell>Status</HeaderCell>
                    <HeaderCell right>Total Units</HeaderCell>
                    <HeaderCell>ETA</HeaderCell>
                  </>
                )}
                {(type === 'oos_amazon' || type === 'oos_noon' || type === 'oos_total') && (
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
            <tbody className="divide-y divide-slate-50">
              {safeData.map((item, i) => (
                <tr key={i} className="group hover:bg-slate-50/80 transition-all duration-150">
                  <td className="py-3 px-2">
                    <button
                      onClick={() => {
                        navigate('/sku/' + item.sku)
                        onClose()
                      }}
                      className="font-data text-[11px] font-black text-brand-blue hover:underline bg-blue-50/50 px-2 py-1 rounded border border-blue-100/50 whitespace-nowrap"
                    >
                      {item.sku}
                    </button>
                  </td>
                  <td className="py-3 px-2">
                    <p className="text-[11px] font-semibold text-primary truncate max-w-[280px]">
                      {item.name}
                    </p>
                  </td>

                  {type === 'alerts' && (
                    <>
                      <td className={`py-3 px-2 text-right font-data text-[11px] ${coverageColor(item.coverage_amazon)}`}>
                        {formatCov(item.coverage_amazon)}
                      </td>
                      <td className={`py-3 px-2 text-right font-data text-[11px] ${coverageColor(item.coverage_noon)}`}>
                        {formatCov(item.coverage_noon)}
                      </td>
                      <td className="py-3 px-2">
                         <span className={`inline-block px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-tighter ${
                           item.action_flag === 'CRITICAL_OOS_RISK' ? 'bg-red-100 text-red-600' : 'bg-orange-100 text-orange-600'
                         }`}>
                           {item.action_flag?.replace(/_/g, ' ')}
                         </span>
                      </td>
                    </>
                  )}

                   {type === 'ship_now' && (
                    <>
                      <td className="py-3 px-2 text-right font-data text-[11px] text-muted">
                        {Number(item.blended_sv || 0).toFixed(2)}
                      </td>
                      <td className="py-3 px-2 text-right font-data text-[11px] font-black text-brand-blue">
                        {item.total_units_to_ship || item.units_to_ship}
                      </td>
                      <td className="py-3 px-2 text-right font-data text-[11px] font-bold text-primary">
                        {item.total_boxes_to_ship || (item.suggested_boxes_amazon + item.suggested_boxes_noon)}
                      </td>
                      <td className="py-3 px-2 text-right font-data text-[11px] font-black text-brand-blue">
                        {item.suggested_boxes_amazon ?? 0}
                      </td>
                      <td className="py-3 px-2 text-right font-data text-[11px] font-black text-brand-amber">
                        {item.suggested_boxes_noon ?? 0}
                      </td>
                      <td className="py-3 px-2 text-[10px] text-muted font-bold uppercase">
                        {item.allocation_logic}
                      </td>
                    </>
                  )}

                  {type === 'reorder_now' && (
                    <>
                      <td className="py-3 px-2 text-right font-data text-[11px] text-muted">
                        {Number(item.blended_sv || 0).toFixed(2)}
                      </td>
                      <td className="py-3 px-2 text-right font-data text-[11px] font-black text-brand-amber">
                        {item.suggested_units}
                      </td>
                      <td className="py-3 px-2 text-right font-data text-[11px] font-black text-emerald-600">
                        {Number(item.total_cost_aed || (item.suggested_units * (item.cogs || 0))).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                      <td className="py-3 px-2 text-right font-data text-[11px] text-muted">
                        {item.moq || '—'}
                      </td>
                      <td className="py-3 px-2 text-[10px] text-muted font-bold uppercase">
                        {item.lead_time_days || 0}d
                      </td>
                    </>
                  )}
                  
                  {type === 'inbound' && (
                    <>
                      <td className="py-3 px-2">
                         <div className="flex flex-col">
                            <span className="text-[10px] font-black text-primary uppercase">{item.po_number}</span>
                            <span className="text-[9px] text-muted font-bold">{item.supplier}</span>
                         </div>
                      </td>
                      <td className="py-3 px-2">
                         <span className="inline-block px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 text-[9px] font-black uppercase tracking-tighter">
                            {item.status}
                         </span>
                      </td>
                      <td className="py-3 px-2 text-right font-data text-[11px] font-black text-primary">
                        {item.total_units}
                      </td>
                      <td className="py-3 px-2 text-[10px] text-muted font-bold">
                        {item.eta ? new Date(item.eta).toLocaleDateString() : '—'}
                      </td>
                    </>
                  )}

                  {(type === 'oos_amazon' || type === 'oos_noon' || type === 'oos_total') && (
                    <>
                      <td className="py-3 px-2 text-right font-data text-[11px] text-muted">
                        {Number(item.blended_sv || 0).toFixed(2)}
                      </td>
                      <td className="py-3 px-2 text-right font-data text-[11px] font-black text-red-600">
                         0
                      </td>
                      <td className={`py-3 px-2 text-right font-data text-[11px] ${coverageColor(item.coverage_amazon)}`}>
                        {formatCov(item.coverage_amazon)}
                      </td>
                      <td className={`py-3 px-2 text-right font-data text-[11px] ${coverageColor(item.coverage_noon)}`}>
                        {formatCov(item.coverage_noon)}
                      </td>
                      <td className="py-3 px-2">
                         <span className="inline-block px-2 py-0.5 rounded bg-red-100 text-red-600 text-[9px] font-black uppercase tracking-tighter">
                           OUT OF STOCK
                         </span>
                      </td>
                    </>
                  )}

                  {type === 'oos_fleet_risk' && (
                    <>
                      <td className="py-3 px-2">
                        <span className={`text-[10px] font-black uppercase px-1.5 py-0.5 rounded border ${
                          item.category === 'A' ? 'bg-amber-50 text-amber-700 border-amber-200' : 
                          item.category === 'B' ? 'bg-blue-50 text-blue-700 border-blue-200' : 
                          'bg-zinc-50 text-zinc-600 border-zinc-200'
                        }`}>
                          Tier {item.category || 'C'}
                        </span>
                      </td>
                      <td className="py-3 px-2 text-[10px] font-bold text-muted uppercase truncate max-w-[100px]">
                        {item.product_category || '—'}
                      </td>
                      <td className="py-3 px-2 text-[10px] font-bold text-muted uppercase truncate max-w-[100px]">
                        {item.sub_category || '—'}
                      </td>
                      <td className="py-3 px-2 text-right font-data text-[11px] text-primary">
                        {Number(item.blended_sv || 0).toFixed(2)}
                      </td>
                      <td className="py-3 px-2 text-right font-data text-[11px] font-black text-brand-amber">
                        {item.suggested_units?.toLocaleString() || 0}
                      </td>
                      <td className="py-3 px-2 text-right font-data text-[11px] font-black text-emerald-600">
                        {Number(item.total_cost_aed || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 text-[10px] text-muted font-black uppercase tracking-widest flex justify-between">
          <span>S2C Dynamics - Inventory OS</span>
          <span>Security Protocol Active</span>
        </div>
      </div>
    </div>
  )
}

function HeaderCell({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return (
    <th className={`px-2 py-3 border-b border-slate-100 text-[10px] font-black text-muted uppercase tracking-[0.1em] ${right ? 'text-right' : 'text-left'}`}>
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
  if (days == null || !Number.isFinite(days) || days <= 0) return 'text-red-600 font-black'
  if (days <= 7) return 'text-red-500 font-bold'
  if (days <= 14) return 'text-orange-500'
  return 'text-primary'
}
