import React, { useState, useMemo } from 'react'
import { X, Plus, Edit2, Trash2, Check, Search, Layers, Package, AlertCircle } from 'lucide-react'

interface CategoryManagerModalProps {
  isOpen: boolean
  onClose: () => void
  productCategories: string[]
  subCategories: string[]
  data: any[]
  onAddProductCategory: (name: string) => void
  onRenameProductCategory: (oldName: string, newName: string) => Promise<void>
  onDeleteProductCategory: (name: string) => Promise<void>
  onAddSubCategory: (name: string) => void
  onRenameSubCategory: (oldName: string, newName: string) => Promise<void>
  onDeleteSubCategory: (name: string) => Promise<void>
}

export function CategoryManagerModal({
  isOpen,
  onClose,
  productCategories,
  subCategories,
  data,
  onAddProductCategory,
  onRenameProductCategory,
  onDeleteProductCategory,
  onAddSubCategory,
  onRenameSubCategory,
  onDeleteSubCategory,
}: CategoryManagerModalProps) {
  const [activeTab, setActiveTab] = useState<'product' | 'sub'>('product')
  const [newCategoryName, setNewCategoryName] = useState('')
  const [searchFilter, setSearchFilter] = useState('')
  const [editingItem, setEditingItem] = useState<{ name: string; value: string } | null>(null)
  const [loadingAction, setLoadingAction] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  // SKU counts by product category
  const productCategoryCounts = useMemo(() => {
    const map = new Map<string, number>()
    if (!data) return map
    data.forEach((r: any) => {
      if (r.product_category) {
        const key = r.product_category.toLowerCase()
        map.set(key, (map.get(key) || 0) + 1)
      }
    })
    return map
  }, [data])

  // SKU counts by sub category
  const subCategoryCounts = useMemo(() => {
    const map = new Map<string, number>()
    if (!data) return map
    data.forEach((r: any) => {
      if (r.sub_category) {
        const key = r.sub_category.toLowerCase()
        map.set(key, (map.get(key) || 0) + 1)
      }
    })
    return map
  }, [data])

  const currentList = activeTab === 'product' ? productCategories : subCategories
  const currentCounts = activeTab === 'product' ? productCategoryCounts : subCategoryCounts

  const filteredList = useMemo(() => {
    if (!searchFilter.trim()) return currentList
    const q = searchFilter.toLowerCase()
    return currentList.filter(item => item.toLowerCase().includes(q))
  }, [currentList, searchFilter])

  const handleAdd = () => {
    const trimmed = newCategoryName.trim()
    if (!trimmed) return
    setErrorMsg(null)

    const exists = currentList.some(item => item.toLowerCase() === trimmed.toLowerCase())
    if (exists) {
      setErrorMsg(`"${trimmed}" already exists in ${activeTab === 'product' ? 'Product Categories' : 'Sub-Categories'}.`)
      return
    }

    if (activeTab === 'product') {
      onAddProductCategory(trimmed)
    } else {
      onAddSubCategory(trimmed)
    }

    setNewCategoryName('')
    setSuccessMsg(`Added new ${activeTab === 'product' ? 'product category' : 'sub-category'}: "${trimmed}"`)
    setTimeout(() => setSuccessMsg(null), 3500)
  }

  const handleSaveRename = async () => {
    if (!editingItem) return
    const trimmed = editingItem.value.trim()
    if (!trimmed || trimmed === editingItem.name) {
      setEditingItem(null)
      return
    }

    setErrorMsg(null)
    setLoadingAction(`rename-${editingItem.name}`)

    try {
      if (activeTab === 'product') {
        await onRenameProductCategory(editingItem.name, trimmed)
      } else {
        await onRenameSubCategory(editingItem.name, trimmed)
      }
      setSuccessMsg(`Renamed "${editingItem.name}" to "${trimmed}" across all associated SKUs.`)
      setEditingItem(null)
      setTimeout(() => setSuccessMsg(null), 3500)
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to rename category')
    } finally {
      setLoadingAction(null)
    }
  }

  const handleDelete = async (name: string) => {
    const count = currentCounts.get(name.toLowerCase()) || 0
    const confirmText = count > 0
      ? `Are you sure you want to delete "${name}"? It is assigned to ${count} SKU(s). Their ${activeTab === 'product' ? 'product category' : 'sub-category'} will be cleared.`
      : `Are you sure you want to delete "${name}"?`

    if (!window.confirm(confirmText)) return

    setErrorMsg(null)
    setLoadingAction(`delete-${name}`)

    try {
      if (activeTab === 'product') {
        await onDeleteProductCategory(name)
      } else {
        await onDeleteSubCategory(name)
      }
      setSuccessMsg(`Deleted category "${name}".`)
      setTimeout(() => setSuccessMsg(null), 3500)
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to delete category')
    } finally {
      setLoadingAction(null)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div 
        className="w-full max-w-2xl bg-[#0B0F1A] border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-200"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-white/10 bg-slate-950/80">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-brand-blue/10 border border-brand-blue/30 flex items-center justify-center text-brand-blue">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-black text-white uppercase tracking-tight">Category Manager</h2>
              <p className="text-[11px] font-bold text-zinc-400">Add, rename, or delete product categories & sub-categories</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-zinc-400 hover:text-white hover:bg-white/10 rounded-xl transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center gap-2 px-6 pt-4 border-b border-white/10 bg-[#0E1322]">
          <button
            onClick={() => {
              setActiveTab('product')
              setEditingItem(null)
              setErrorMsg(null)
              setSearchFilter('')
            }}
            className={`flex items-center gap-2 pb-3 px-3 text-xs font-black uppercase tracking-wider border-b-2 transition-all ${
              activeTab === 'product'
                ? 'border-brand-blue text-brand-blue'
                : 'border-transparent text-zinc-400 hover:text-white'
            }`}
          >
            <Package className="w-4 h-4" />
            <span>Product Categories ({productCategories.length})</span>
          </button>

          <button
            onClick={() => {
              setActiveTab('sub')
              setEditingItem(null)
              setErrorMsg(null)
              setSearchFilter('')
            }}
            className={`flex items-center gap-2 pb-3 px-3 text-xs font-black uppercase tracking-wider border-b-2 transition-all ${
              activeTab === 'sub'
                ? 'border-brand-amber text-brand-amber'
                : 'border-transparent text-zinc-400 hover:text-white'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>Sub-Categories ({subCategories.length})</span>
          </button>
        </div>

        {/* Feedback Alerts */}
        {errorMsg && (
          <div className="mx-6 mt-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-center gap-3 text-rose-400 text-xs font-bold">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {successMsg && (
          <div className="mx-6 mt-4 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center gap-3 text-emerald-400 text-xs font-bold">
            <Check className="w-4 h-4 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Controls Row: Add New + Search Filter */}
        <div className="p-6 space-y-4">
          {/* Add New Input */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <input
                type="text"
                value={newCategoryName}
                onChange={e => setNewCategoryName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleAdd() }}
                placeholder={`ENTER NEW ${activeTab === 'product' ? 'PRODUCT CATEGORY' : 'SUB-CATEGORY'} NAME...`}
                className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-xs text-white placeholder:text-zinc-600 font-bold uppercase focus:outline-none focus:ring-2 focus:ring-brand-blue/50"
              />
            </div>
            <button
              onClick={handleAdd}
              disabled={!newCategoryName.trim()}
              className="flex items-center gap-1.5 px-4 py-2.5 bg-brand-blue hover:bg-brand-blue/90 disabled:opacity-50 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-colors shadow-lg shadow-brand-blue/20"
            >
              <Plus className="w-4 h-4" />
              <span>Add</span>
            </button>
          </div>

          {/* Search Filter */}
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
            <input
              type="text"
              value={searchFilter}
              onChange={e => setSearchFilter(e.target.value)}
              placeholder={`FILTER ${filteredList.length} CATEGORIES...`}
              className="w-full pl-9 pr-4 py-2 bg-white/5 border border-white/10 rounded-xl text-[11px] text-white placeholder:text-zinc-600 font-bold uppercase focus:outline-none focus:border-white/20"
            />
          </div>
        </div>

        {/* Category List */}
        <div className="flex-1 overflow-y-auto custom-scrollbar px-6 pb-6 space-y-2 max-h-[350px]">
          {filteredList.length === 0 ? (
            <div className="p-8 text-center text-zinc-500 text-xs font-bold uppercase">
              No categories found.
            </div>
          ) : (
            filteredList.map(name => {
              const count = currentCounts.get(name.toLowerCase()) || 0
              const isEditing = editingItem && editingItem.name === name
              const isLoading = loadingAction === `rename-${name}` || loadingAction === `delete-${name}`

              return (
                <div
                  key={name}
                  className="flex items-center justify-between px-4 py-2.5 bg-white/[0.03] hover:bg-white/[0.06] border border-white/5 rounded-xl transition-colors group"
                >
                  {isEditing ? (
                    <div className="flex items-center gap-2 flex-1 mr-2">
                      <input
                        type="text"
                        value={editingItem.value}
                        onChange={e => setEditingItem({ ...editingItem, value: e.target.value })}
                        onKeyDown={e => {
                          if (e.key === 'Enter') handleSaveRename()
                          if (e.key === 'Escape') setEditingItem(null)
                        }}
                        autoFocus
                        className="flex-1 px-3 py-1.5 text-xs bg-white text-zinc-900 border border-brand-blue rounded-lg font-bold uppercase focus:outline-none"
                      />
                      <button
                        onClick={handleSaveRename}
                        disabled={isLoading}
                        className="p-1.5 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition-colors"
                        title="Save Changes"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setEditingItem(null)}
                        className="p-1.5 bg-zinc-700 text-zinc-300 rounded-lg hover:bg-zinc-600 transition-colors"
                        title="Cancel"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-black text-white uppercase tracking-tight">
                          {name}
                        </span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                          count > 0 
                            ? 'bg-blue-500/10 text-blue-400 border-blue-500/30'
                            : 'bg-zinc-800 text-zinc-400 border-zinc-700'
                        }`}>
                          {count} {count === 1 ? 'SKU' : 'SKUs'}
                        </span>
                      </div>

                      <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => setEditingItem({ name, value: name })}
                          disabled={isLoading}
                          className="p-1.5 text-zinc-400 hover:text-brand-blue hover:bg-brand-blue/10 rounded-lg transition-colors"
                          title="Rename Category"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDelete(name)}
                          disabled={isLoading}
                          className="p-1.5 text-zinc-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors"
                          title="Delete Category"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )
            })
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-white/10 bg-slate-950/80">
          <span className="text-[11px] font-bold text-zinc-500 uppercase">
            Total {activeTab === 'product' ? 'Product Categories' : 'Sub-Categories'}: {currentList.length}
          </span>
          <button
            onClick={onClose}
            className="px-5 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
