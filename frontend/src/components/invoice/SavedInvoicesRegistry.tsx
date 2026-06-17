import React from 'react'
import { List, RefreshCw, FileText, Trash2 } from 'lucide-react'

interface SavedInvoicesRegistryProps {
  invoicesList: any[]
  isLoadingList: boolean
  currentInvoiceId: string | null
  fetchInvoices: () => void
  handleLoadInvoice: (inv: any) => void
  handleDeleteInvoice: (id: string, e: React.MouseEvent) => void
}

export function SavedInvoicesRegistry({
  invoicesList,
  isLoadingList,
  currentInvoiceId,
  fetchInvoices,
  handleLoadInvoice,
  handleDeleteInvoice
}: SavedInvoicesRegistryProps) {
  return (
    <div className="bg-[#0f1322] border border-white/10 rounded-xl overflow-hidden shadow-2xl p-6 print:hidden">
      <div className="flex items-center justify-between border-b border-white/10 pb-4 mb-4">
        <div className="flex items-center gap-2">
          <List className="w-5 h-5 text-brand-blue" />
          <h2 className="text-sm font-black text-white uppercase tracking-wider">Saved Invoices Registry</h2>
          <span className="bg-[#1e293b] text-zinc-400 text-[10px] font-black uppercase px-2 py-0.5 rounded-full">
            {invoicesList.length} total
          </span>
        </div>
        <button
          onClick={fetchInvoices}
          disabled={isLoadingList}
          className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-zinc-400 border border-white/10 hover:bg-white/5 rounded-lg transition-all active:scale-95 disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoadingList ? 'animate-spin' : ''}`} />
          Refresh List
        </button>
      </div>

      {isLoadingList ? (
        <div className="flex flex-col items-center justify-center py-10 space-y-3">
          <RefreshCw className="w-8 h-8 text-brand-blue animate-spin" />
          <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Loading Invoices...</p>
        </div>
      ) : invoicesList.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 border border-dashed border-white/10 rounded-lg bg-zinc-950/20">
          <FileText className="w-10 h-10 text-zinc-600 mb-2.5" />
          <p className="text-sm font-black text-zinc-400 uppercase tracking-wider">No Saved Invoices Found</p>
          <p className="text-xs text-zinc-500 mt-1">Create an invoice and click the Save button to persist it in the database.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-white/10 text-zinc-400 font-bold uppercase tracking-wider text-[10px] group">
                <th className="py-3 px-4 font-black">Invoice No</th>
                <th className="py-3 px-4 font-black">Date</th>
                <th className="py-3 px-4 font-black">Client (Bill To)</th>
                <th className="py-3 px-4 font-black text-right">Total Amount</th>
                <th className="py-3 px-4 font-black text-center w-[200px]">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {invoicesList.map((inv) => {
                const isCurrent = currentInvoiceId === inv.id
                return (
                  <tr
                    key={inv.id}
                    onClick={() => handleLoadInvoice(inv)}
                    className={`group hover:bg-white/[0.02] cursor-pointer transition-all duration-150 ${
                      isCurrent ? 'bg-blue-500/[0.03] border-l-2 border-l-brand-blue' : ''
                    }`}
                  >
                    <td className="py-3.5 px-4 font-mono font-bold text-white group-hover:text-brand-blue transition-colors flex items-center gap-2"><span className="inline-block transition-transform duration-300 group-hover:scale-[1.15] origin-center">{isCurrent && <div className="w-1.5 h-1.5 rounded-full bg-brand-blue animate-pulse shrink-0" />}
                      {inv.invoice_no || '-'}</span></td>
                    <td className="py-3.5 px-4 text-zinc-300 font-medium font-mono"><span className="inline-block transition-transform duration-300 group-hover:scale-[1.15] origin-center">{inv.invoice_date || '-'}</span></td>
                    <td className="py-3.5 px-4 text-zinc-300"><div className="font-semibold truncate max-w-[280px]">{inv.buyer_name || '-'}</div>
                      <div className="text-[10px] text-zinc-500 font-mono truncate max-w-[280px]">{inv.buyer_email || '-'}</div></td>
                    <td className="py-3.5 px-4 text-right font-mono font-bold text-white"><span className="inline-block transition-transform duration-300 group-hover:scale-[1.15] origin-center">{(inv.total || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} AED</span></td>
                    <td className="py-3.5 px-4 text-center" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => handleLoadInvoice(inv)}
                          className="flex items-center justify-center gap-1 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-brand-blue hover:text-white border border-brand-blue/30 hover:bg-brand-blue rounded transition-all"
                        >
                          Load
                        </button>
                        <button
                          onClick={(e) => handleDeleteInvoice(inv.id, e)}
                          className="flex items-center justify-center p-1 text-red-400/70 hover:text-red-400 hover:bg-red-500/10 rounded transition-all"
                          title="Delete permanently from database"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
