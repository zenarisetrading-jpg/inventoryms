import { useState } from 'react'
import { Package, Search, Download, AlertTriangle, RefreshCw, X, Filter, Layers, Plus, Upload, Trash2 } from 'lucide-react'
import { LoadingScreen } from '../components/shared/LoadingScreen'
import { navigate } from '../lib/router'
import { MultiSelect } from '../components/shared/MultiSelect'
import { useSKUData } from '../hooks/useSKUData'
import { SKUTable } from '../components/skus/SKUTable'
import { SKUBulkUploadModal } from '../components/skus/SKUBulkUploadModal'

export default function SKUCatalog() {
  const {
    data, loading, error,
    searchQuery, setSearchQuery,
    sortConfig, handleSort,
    filters, setFilters, validSubCategories,
    updating, handleUpdateField,
    editingCell, setEditingCell,
    sortedAndFilteredData, columns,
    fetchData, handleExport,
    selectedSkus, setSelectedSkus, handleDeleteSelected
  } = useSKUData()

  const [showBulkModal, setShowBulkModal] = useState(false)
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
              onClick={() => setShowBulkModal(true)}
              className="flex items-center gap-2 px-6 py-3.5 bg-emerald-600 text-white hover:bg-emerald-500 transition-all rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl"
            >
              <Upload className="h-4 w-4" />
              BULK UPLOAD
            </button>

            {selectedSkus.size > 0 && (
              <button
                onClick={handleDeleteSelected}
                className="flex items-center gap-2 px-6 py-3.5 bg-rose-600 text-white hover:bg-rose-500 transition-all rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl shadow-rose-600/20"
              >
                <Trash2 className="h-4 w-4" />
                DELETE ({selectedSkus.size})
              </button>
            )}

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
                onClick={() => setFilters({ categories: [], sub_categories: [], is_active: [], amazon_active: [], noon_active: [], minutes_active: [] })}
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
          <SKUTable
            sortedAndFilteredData={sortedAndFilteredData}
            columns={columns}
            sortConfig={sortConfig}
            handleSort={handleSort}
            updating={updating}
            editingCell={editingCell}
            setEditingCell={setEditingCell}
            handleUpdateField={handleUpdateField}
            selectedSkus={selectedSkus}
            setSelectedSkus={setSelectedSkus}
          />
        )}

        <div className="px-8 py-4 bg-transparent border-t border-white/5 flex items-center justify-between shrink-0 z-30">
          <div className="flex items-center gap-6">
            <p className="text-[12px] font-bold uppercase text-zinc-500">RECORDS: {sortedAndFilteredData.length}</p>
          </div>
        </div>
      </div>

      {/* Bulk Upload Modal */}
      {showBulkModal && (
        <SKUBulkUploadModal 
          onClose={() => setShowBulkModal(false)}
          onSuccess={() => {
            setShowBulkModal(false)
            fetchData()
          }}
        />
      )}

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 10px; height: 10px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: #0B0F1A; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #1f2937; border-radius: 5px; border: 2px solid #0B0F1A; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #374151; }
      `}</style>
    </div>
  )
}
