import { useState } from 'react'
import { Upload, Download, Search, TrendingUp, ChevronLeft, ChevronRight, Plus, Trash2, RefreshCw } from 'lucide-react'
import { navigate } from '../lib/router'
import { api } from '../lib/api'
import { STATUS_TABS } from '../components/po/utils'
import { usePOData } from '../hooks/usePOData'
import { POBulkUploadModal } from '../components/po/POBulkUploadModal'
import { POTable } from '../components/po/POTable'
import { ActionDropdown } from '../components/ActionDropdown'

export default function POPage() {
  const [showBulkModal, setShowBulkModal] = useState(false)
  const {
    pos, setPOs,
    loading, setLoading,
    activeTab, setActiveTab,
    search, setSearch,
    expandedId, setExpandedId,
    selectedIds, setSelectedIds,
    currentPage, setCurrentPage,
    sortConfig, setSortConfig,
    allSuppliers, allSkus, skuSuggestions,
    itemsPerPage, filteredPOs, paginatedPOs, totalPages,
    load, requestSort, handleAdvance, handleExport,
    advancingId, setAdvancingId
  } = usePOData(20)

  return (
    <div className="w-full space-y-5">
      {/* HEADER & CONSOLIDATED TOOLBAR */}
      <div className="bg-card border border-white/5 shadow-2xl p-6 lg:p-10 rounded-2xl flex flex-col gap-10">
        {/* Top: Centered Header */}
        <div className="flex flex-col items-center gap-5">
          <div className="w-14 h-14 lg:w-16 lg:h-16 rounded-3xl bg-sidebar flex items-center justify-center text-brand-amber shadow-2xl border border-white/5">
            <TrendingUp className="w-7 h-7 lg:w-8 lg:h-8" />
          </div>
          <div className="text-center">
            <h1 className="text-2xl lg:text-4xl font-black text-white uppercase tracking-tighter leading-none">PO Register</h1>
            <p className="text-[10px] lg:text-[12px] font-black text-zinc-500 uppercase tracking-[0.4em] mt-3 opacity-80 flex items-center justify-center gap-3">
              <span className="w-2 h-2 rounded-full bg-brand-amber animate-pulse shadow-[0_0_10px_rgba(245,158,11,0.5)]" />
              Procurement & Supply Chain • Live Audit
            </p>
          </div>
        </div>

        {/* Bottom: Unified Controls Row */}
        <div className="flex flex-wrap items-center justify-center gap-4 w-full border-t border-white/5 pt-8">
          {/* Status Tabs */}
          <div className="flex items-center gap-1 bg-white/5 p-1 rounded-2xl border border-white/10 shrink-0 overflow-x-auto no-scrollbar">
            {STATUS_TABS.map(tab => (
              <button
                key={tab.value}
                onClick={() => setActiveTab(tab.value)}
                className={`px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === tab.value ? 'bg-brand-amber text-primary shadow-lg shadow-brand-amber/20' : 'text-zinc-500 hover:text-brand-amber hover:bg-zinc-50/5'}`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="h-8 w-px bg-white/10 hidden xl:block mx-1" />

          {/* Search Bar */}
          <div className="relative group w-full lg:max-w-xs xl:max-w-sm">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500 group-focus-within:text-brand-blue transition-colors" />
            <input
              type="text"
              placeholder="SEARCH ORDERS..."
              className="w-full pl-10 pr-4 py-3.5 bg-white/5 border border-white/10 rounded-2xl text-[10px] lg:text-xs text-white focus:outline-none focus:ring-2 focus:ring-brand-blue/50 transition-all placeholder:text-zinc-600 font-black uppercase tracking-widest"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          <div className="h-8 w-px bg-white/10 hidden xl:block mx-1" />

          {/* Actions */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowBulkModal(true)}
              className="flex items-center gap-2 px-5 py-3.5 bg-white/5 border border-white/10 text-white hover:bg-white/10 transition-all rounded-2xl text-[10px] font-black uppercase tracking-widest"
            >
              <Upload className="h-4 w-4" />
              BULK
            </button>
            <button
              onClick={() => load()}
              disabled={loading}
              className={`flex items-center gap-2 px-5 py-3.5 bg-transparent hover:bg-white/5 text-zinc-300 hover:text-white rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all border border-white/10 ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              REFRESH
            </button>
            <button
              onClick={() => handleExport()}
              className="flex items-center gap-2 px-5 py-3.5 bg-transparent hover:bg-white/5 text-zinc-300 hover:text-white rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all border border-white/10"
            >
              <Download className="w-4 h-4" />
              DOWNLOAD ALL
            </button>
            <button
              onClick={() => navigate('/po/new')}
              className="flex items-center gap-2 px-6 py-3.5 bg-brand-amber text-sidebar rounded-2xl text-[10px] font-black uppercase hover:shadow-xl hover:shadow-brand-amber/30 transition-all active:scale-95"
            >
              <Plus className="h-4 w-4" />
              NEW PO
            </button>
          </div>
        </div>
      </div>

      <POTable
        loading={loading}
        paginatedPOs={paginatedPOs}
        selectedIds={selectedIds}
        setSelectedIds={setSelectedIds}
        requestSort={requestSort}
        sortConfig={sortConfig}
        expandedId={expandedId}
        setExpandedId={setExpandedId}
        setPOs={setPOs}
        setAdvancingId={setAdvancingId}
        search={search}
        allSkus={allSkus}
        skuSuggestions={skuSuggestions}
      />

      {/* Pagination Footer */}
      {filteredPOs.length > 0 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 px-6 py-4 bg-white/5 border-t border-white/5">
          {/* Left: Shows range */}
          <div className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">
            Showing <span className="text-white font-semibold">{((currentPage - 1) * itemsPerPage) + 1}</span> to{" "}
            <span className="text-white font-semibold">
              {Math.min(currentPage * itemsPerPage, filteredPOs.length)}
            </span>{" "}
            of <span className="text-white font-semibold">{filteredPOs.length}</span> Orders
          </div>

          {/* Right: Pagination buttons */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
              className="p-2 rounded-xl text-zinc-500 hover:text-white hover:bg-white/5 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-zinc-500 transition-all cursor-pointer"
              title="Previous Page"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            {/* Dynamic Page Buttons */}
            {(() => {
              const pages = []
              const startPage = Math.max(1, currentPage - 2)
              const endPage = Math.min(totalPages, currentPage + 2)

              if (startPage > 1) {
                pages.push(
                  <button
                    key={1}
                    onClick={() => setCurrentPage(1)}
                    className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all cursor-pointer ${currentPage === 1 ? 'bg-brand-amber text-primary' : 'text-zinc-500 hover:text-white hover:bg-white/5'}`}
                  >
                    1
                  </button>
                )
                if (startPage > 2) {
                  pages.push(<span key="dots-start" className="px-1 text-zinc-600 text-xs">...</span>)
                }
              }

              for (let p = startPage; p <= endPage; p++) {
                pages.push(
                  <button
                    key={p}
                    onClick={() => setCurrentPage(p)}
                    className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all cursor-pointer ${currentPage === p ? 'bg-brand-amber text-[#030712]' : 'text-zinc-500 hover:text-white hover:bg-white/5'}`}
                  >
                    {p}
                  </button>
                )
              }

              if (endPage < totalPages) {
                if (endPage < totalPages - 1) {
                  pages.push(<span key="dots-end" className="px-1 text-zinc-600 text-xs">...</span>)
                }
                pages.push(
                  <button
                    key={totalPages}
                    onClick={() => setCurrentPage(totalPages)}
                    className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all cursor-pointer ${currentPage === totalPages ? 'bg-brand-amber text-[#030712]' : 'text-zinc-500 hover:text-white hover:bg-white/5'}`}
                  >
                    {totalPages}
                  </button>
                )
              }

              return pages
            })()}

            <button
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages}
              className="p-2 rounded-xl text-zinc-500 hover:text-white hover:bg-white/5 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-zinc-500 transition-all cursor-pointer"
              title="Next Page"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {showBulkModal && (
        <POBulkUploadModal 
          onClose={() => setShowBulkModal(false)}
          onSuccess={() => {
            setShowBulkModal(false)
            load(activeTab || undefined)
          }}
        />
      )}

      {/* Floating Bulk Action Bar */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-5 px-6 py-4 bg-[#111] border border-white/10 rounded-2xl shadow-2xl shadow-black/80 animate-in fade-in slide-in-from-bottom-4">
          <span className="text-xs font-black text-white uppercase tracking-wider">
            {selectedIds.size} Selected
          </span>
          <div className="h-4 w-px bg-white/10" />

          {/* Bulk Update Status */}
          <div onClick={e => e.stopPropagation()} className="relative">
            <ActionDropdown
              direction="up"
              currentStatus=""
              placeholder="UPDATE STATUS"
              onStatusChange={async (newStatus) => {
                if (confirm(`Are you sure you want to change the status of ${selectedIds.size} PO(s) to ${newStatus}?`)) {
                  setLoading(true)
                  try {
                    const ids = Array.from(selectedIds)
                    await Promise.all(ids.map(id => api.updatePO(id, { status: newStatus as any })))
                    load(activeTab || undefined)
                    setSelectedIds(new Set())
                  } catch (err: any) {
                    alert('Failed to update PO statuses: ' + err.message)
                  } finally {
                    setLoading(false)
                  }
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
          </div>

          <div className="h-4 w-px bg-white/10" />

          {/* Download Selected */}
          <button
            onClick={() => handleExport(selectedIds)}
            className="flex items-center gap-2 px-4 py-2 bg-brand-blue/10 border border-brand-blue/20 text-brand-blue hover:bg-brand-blue hover:text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            Download Selected
          </button>

          <div className="h-4 w-px bg-white/10" />

          {/* Bulk Delete */}
          <button
            onClick={async () => {
              if (confirm(`Are you sure you want to permanently delete the ${selectedIds.size} selected purchase order(s)?`)) {
                setLoading(true)
                try {
                  const ids = Array.from(selectedIds)
                  const results = await Promise.all(ids.map(id => api.deletePO(id)))
                  const errors = results.filter((res: any) => res?.error)
                  if (errors.length > 0) {
                    alert(`Failed to delete some POs: ${errors.map((e: any) => e.error).join(', ')}`)
                  }
                  load(activeTab || undefined)
                  setSelectedIds(new Set())
                } catch (err: any) {
                  alert('Failed to delete POs: ' + err.message)
                } finally {
                  setLoading(false)
                }
              }
            }}
            className="flex items-center gap-2 px-4 py-2 bg-red-600/10 border border-red-500/20 text-red-400 hover:bg-red-600 hover:text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Delete Selected
          </button>

          <div className="h-4 w-px bg-white/10" />

          {/* Clear Selection */}
          <button
            onClick={() => setSelectedIds(new Set())}
            className="px-3 py-2 text-[10px] font-black text-zinc-400 hover:text-white uppercase tracking-widest transition-colors cursor-pointer"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  )
}
