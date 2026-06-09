import { useEffect, useState, useRef, Fragment } from 'react'
import { X, Upload, Check, Edit2, Plus, Trash2, Download, Search, TrendingUp, ChevronLeft, ChevronRight } from 'lucide-react'
import { api } from '../lib/api'
import type { PO, POStatus, CreatePOInput, UploadPOResponse } from '../types'
import { navigate } from '../lib/router'
import { StatusBadge } from '../components/shared/StatusBadge'
import { Autocomplete } from '../components/shared/Autocomplete'
import { ActionDropdown } from '../components/ActionDropdown'

const PO_STATUS_SEQUENCE: POStatus[] = ['draft', 'ordered', 'shipped', 'closed', 'cancelled']

function nextStatus(current: POStatus): POStatus | null {
  const idx = PO_STATUS_SEQUENCE.indexOf(current)
  if (idx === -1 || idx === PO_STATUS_SEQUENCE.length - 1) return null
  return PO_STATUS_SEQUENCE[idx + 1]
}

function formatDate(iso: string): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-AE', { month: 'short', day: 'numeric', year: 'numeric' })
}

const STATUS_TABS: { label: string; value: string }[] = [
  { label: 'All', value: '' },
  { label: 'Draft', value: 'draft' },
  { label: 'Ordered', value: 'ordered' },
  { label: 'Shipped', value: 'shipped' },
  { label: 'Closed', value: 'closed' },
  { label: 'Cancelled', value: 'cancelled' },
]

interface LineItemInput {
  sku: string
  units_ordered: number
  units_received: number
  units_per_box: number
  box_count: number
  dimensions: string
  cogs_per_unit: number
  shipping_cost_per_unit: number
  notes: string
}

interface NewPOForm {
  po_number: string
  po_name: string
  supplier: string
  order_date: string
  eta: string
  tracking_number: string
  notes: string
  line_items: LineItemInput[]
}

function emptyForm(): NewPOForm {
  return {
    po_number: '',
    po_name: '',
    supplier: '',
    order_date: new Date().toISOString().slice(0, 10),
    eta: '',
    tracking_number: '',
    notes: '',
    line_items: [{ 
      sku: '', 
      units_ordered: 0, 
      units_received: 0,
      units_per_box: 0, 
      box_count: 0, 
      dimensions: '', 
      cogs_per_unit: 0, 
      shipping_cost_per_unit: 0,
      notes: ''
    }],
  }
}

function SkeletonRow({ cols }: { cols: number }) {
  return (
    <tr>
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-4 py-2.5">
          <div className="animate-pulse h-3 bg-zinc-100 rounded w-full" />
        </td>
      ))}
    </tr>
  )
}

interface InlineEditProps {
  value: string | number | null | undefined
  onSave: (val: string) => Promise<void>
  type?: 'text' | 'number' | 'date'
  placeholder?: string
  className?: string
  inputClassName?: string
  displayValue?: string
  suggestions?: string[]
  autoEdit?: boolean
}

function InlineEdit({
  value,
  onSave,
  type = 'text',
  placeholder = '—',
  className = '',
  inputClassName = 'w-16 text-xs',
  suggestions = [],
  autoEdit = false,
  displayValue
}: InlineEditProps) {
  const [editing, setEditing] = useState(autoEdit)
  let initialVal = ''
  if (type === 'date' && value) {
    try {
      const d = new Date(value.toString())
      if (!isNaN(d.getTime())) {
        initialVal = d.toISOString().split('T')[0]
      }
    } catch {
      initialVal = ''
    }
  } else {
    initialVal = value?.toString() ?? ''
  }
  const [val, setVal] = useState(initialVal)
  const [saving, setSaving] = useState(false)

  const handleSave = async (e?: React.FormEvent) => {
    e?.preventDefault()
    e?.stopPropagation()
    setSaving(true)
    try {
      let finalVal = val
      // If selecting from suggestions, extract the SKU part
      if (suggestions.length > 0 && finalVal.includes(' - ')) {
        finalVal = finalVal.split(' - ')[0].trim()
      }
      await onSave(finalVal)
      setEditing(false)
    } finally {
      setSaving(false)
    }
  }

  if (editing) {
    return (
      <form onClick={e => e.stopPropagation()} onSubmit={handleSave} className="flex items-center gap-1 relative z-10 bg-card rounded-md shadow-lg ring-1 ring-black/5 -ml-1 p-1">
        {suggestions.length > 0 ? (
          <div className={inputClassName}>
            <Autocomplete
              value={val}
              onChange={setVal}
              suggestions={suggestions}
              placeholder={placeholder}
              className={`px-1.5 py-0.5 border border-zinc-700 rounded focus:outline-none focus:ring-1 focus:ring-amber-500 bg-zinc-800 text-white ${inputClassName}`}
            />
          </div>
        ) : (
          <input
            autoFocus
            type={type}
            step={type === 'number' ? 'any' : undefined}
            className={`px-1.5 py-0.5 border border-zinc-700 rounded focus:outline-none focus:ring-1 focus:ring-amber-500 bg-zinc-800 text-white ${inputClassName}`}
            value={val}
            onChange={e => setVal(e.target.value)}
            onKeyDown={e => { if (e.key === 'Escape') { setEditing(false); setVal(value?.toString() ?? '') } }}
          />
        )}
        <button type="submit" disabled={saving} className="p-0.5 text-emerald-400 hover:bg-emerald-500/20 rounded shrink-0 transition-colors">
          {saving ? <span className="w-3 h-3 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin block" /> : <Check className="h-3 w-3" />}
        </button>
        <button type="button" onClick={() => { setEditing(false); setVal(value?.toString() ?? '') }} className="p-0.5 text-zinc-400 hover:bg-white/5 hover:text-zinc-200 rounded shrink-0 transition-colors">
          <X className="h-3 w-3" />
        </button>
      </form>
    )
  }

  return (
    <div 
      className={`group/edit cursor-pointer flex items-center gap-1 w-full ${className}`}
      onClick={(e) => {
        e.stopPropagation()
        setEditing(true)
        let clickVal = ''
        if (type === 'date' && value) {
          try {
            const d = new Date(value.toString())
            if (!isNaN(d.getTime())) {
              clickVal = d.toISOString().split('T')[0]
            }
          } catch {
            clickVal = ''
          }
        } else {
          clickVal = value?.toString() ?? ''
        }
        setVal(clickVal)
      }}
    >
      <span className="text-white">{displayValue || (value !== null && value !== undefined && value !== '' ? value : <span className="text-white/80 italic font-semibold">{placeholder}</span>)}</span>
      <Edit2 className="h-2.5 w-2.5 text-zinc-300 opacity-0 group-hover/edit:opacity-100 transition-opacity hover:text-amber-500 shrink-0" />
    </div>
  )
}

const inputCls = 'w-full border border-zinc-300 text-zinc-900 bg-white px-3 py-2 text-sm rounded-md focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent'

export default function POPage() {
  const [pos, setPOs] = useState<PO[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [showSlideOver, setShowSlideOver] = useState(false)
  const [form, setForm] = useState<NewPOForm>(emptyForm())
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 20

  useEffect(() => {
    setSelectedIds(new Set())
    setCurrentPage(1)
  }, [activeTab, search])

  const [advancingId, setAdvancingId] = useState<string | null>(null)
  const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' } | null>({ key: 'po_number', direction: 'desc' })
  const slideOverRef = useRef<HTMLDivElement>(null)
  const [showBulkModal, setShowBulkModal] = useState(false)
  const [bulkFile, setBulkFile] = useState<File | null>(null)
  const [bulkUploading, setBulkUploading] = useState(false)
  const [bulkResult, setBulkResult] = useState<UploadPOResponse | null>(null)
  const [bulkError, setBulkError] = useState<string | null>(null)
  const bulkInputRef = useRef<HTMLInputElement>(null)
  const [allSuppliers, setAllSuppliers] = useState<string[]>([])
  const [allSkus, setAllSkus] = useState<any[]>([])
  const [skuSuggestions, setSkuSuggestions] = useState<string[]>([])

  const load = (status?: string) => {
    setLoading(true)
    api.getPOs(status ? { status } : {}).then(res => {
      const resAny = res as unknown as { error?: string; pos?: PO[] }
      if (resAny.error) setPOs([])
      else {
        const normalized = ((resAny.pos ?? []) as Array<PO & { po_line_items?: PO['line_items'] }>).map((po) => ({
          ...po,
          line_items: po.line_items ?? po.po_line_items ?? [],
        }))
        setPOs(normalized)
      }
      setLoading(false)
    })
  }

  useEffect(() => {
    load(activeTab || undefined)
  }, [activeTab])

  useEffect(() => {
    api.getSuppliers().then(res => setAllSuppliers(res.suppliers || []))
    api.getSKUs().then(res => {
      const skus = res.skus ?? []
      setAllSkus(skus)
      setSkuSuggestions(skus.map(s => s.sku))
    })
  }, [])

  const filteredPOs = pos.filter(po => {
    const q = search.toLowerCase()
    const poNum = po.po_number || ''
    const supplier = po.supplier || ''
    return (
      poNum.toLowerCase().includes(q) ||
      supplier.toLowerCase().includes(q) ||
      po.line_items.some(li => li.sku && li.sku.toLowerCase().includes(q))
    )
  }).sort((a, b) => {
    if (!sortConfig) return 0
    const { key, direction } = sortConfig
    
    let aVal: any = a[key as keyof PO]
    let bVal: any = b[key as keyof PO]
    
    // Custom logic for computed columns
    if (key === 'units') {
      aVal = a.line_items.reduce((s, li) => s + (li.units_ordered || 0), 0)
      bVal = b.line_items.reduce((s, li) => s + (li.units_ordered || 0), 0)
    } else if (key === 'skus') {
      aVal = a.line_items.length
      bVal = b.line_items.length
    }
    
    if (aVal === bVal) return 0
    if (aVal === null || aVal === undefined) return 1
    if (bVal === null || bVal === undefined) return -1
    
    const res = aVal < bVal ? -1 : 1
    return direction === 'asc' ? res : -res
  })

  const totalPages = Math.max(1, Math.ceil(filteredPOs.length / itemsPerPage))
  const paginatedPOs = filteredPOs.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)

  const requestSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc'
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc'
    }
    setSortConfig({ key, direction })
  }

  const handleAdvance = async (po: PO) => {
    const next = nextStatus(po.status)
    if (!next) return
    setAdvancingId(po.id)
    const updated = await api.updatePO(po.id, { status: next })
    setAdvancingId(null)
    const updatedAny = updated as unknown as { error?: string }
    if (!updatedAny.error) setPOs(prev => prev.map(p => (p.id === po.id ? { ...p, status: next } : p)))
  }

  const handleFormChange = (field: keyof NewPOForm, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  const handleLineItemChange = (i: number, field: keyof LineItemInput, value: string | number) => {
    setForm(prev => {
      const items = [...prev.line_items]
      let val = value
      // If selecting a SKU suggestion, extract the SKU part
      if (field === 'sku' && typeof value === 'string' && value.includes(' - ')) {
        val = value.split(' - ')[0].trim()
      }
      items[i] = { ...items[i], [field]: val }
      return { ...prev, line_items: items }
    })
  }

  const addLineItem = () => {
    setForm(prev => ({ 
      ...prev, 
      line_items: [
        ...prev.line_items, 
        { sku: '', units_ordered: 0, units_received: 0, units_per_box: 0, box_count: 0, dimensions: '', cogs_per_unit: 0, shipping_cost_per_unit: 0, notes: '' }
      ] 
    }))
  }

  const removeLineItem = (i: number) => {
    setForm(prev => ({ ...prev, line_items: prev.line_items.filter((_, idx) => idx !== i) }))
  }

  const downloadTemplate = () => {
    const header = 'po_number,po_name,supplier,order_date,eta,status,po_notes,notes,sku,units_ordered,units_received'
    const example = [
      'PO-001,Spring Batch,Shenzhen Supplier,2026-03-01,2026-04-01,ordered,Main summer batch notes,Item notes for straw lid,32OZSTRAWLIDBLACK,500,0',
      'PO-001,Spring Batch,Shenzhen Supplier,2026-03-01,2026-04-01,ordered,Main summer batch notes,Item notes for water bottle,WB750MLBLACK,300,0',
      'PO-002,Summer Refresh,Another Supplier,2026-03-10,2026-04-15,draft,Urgent shipment,Specific notes for navy blue,32OZWBNAVYBLUE,250,',
    ].join('\n')
    const blob = new Blob([header + '\n' + example], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'po_bulk_upload_template.csv'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    setTimeout(() => {
      URL.revokeObjectURL(url)
    }, 100)
  }

  const handleBulkUpload = async () => {
    if (!bulkFile) return
    setBulkUploading(true)
    setBulkResult(null)
    setBulkError(null)
    const result = await api.uploadPOCSV(bulkFile)
    const resultAny = result as unknown as { error?: string }
    if (resultAny.error) {
      setBulkError(resultAny.error)
      setBulkUploading(false)
      return
    }
    setBulkResult(result)
    setBulkUploading(false)
    if (result.pos_created > 0) {
      load(activeTab || undefined)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitError(null)
    const validItems = form.line_items.filter(li => li.sku.trim() !== '' && li.units_ordered > 0)
    if (validItems.length === 0) {
      setSubmitError('Add at least one valid line item.')
      return
    }
    const payload: CreatePOInput = {
      po_number: form.po_number,
      po_name: form.po_name,
      supplier: form.supplier,
      order_date: form.order_date,
      eta: form.eta,
      tracking_number: form.tracking_number,
      notes: form.notes || undefined,
      line_items: validItems,
    }
    setSubmitting(true)
    const result = await api.createPO(payload)
    setSubmitting(false)
    const resultAny = result as unknown as { error?: string }
    if (resultAny.error) {
      setSubmitError(resultAny.error)
    } else {
      setShowSlideOver(false)
      setForm(emptyForm())
      load(activeTab || undefined)
    }
  }

  const handleExport = async () => {
    setLoading(true)
    try {
      const res = await api.getPOs({})
      const resAny = res as unknown as { error?: string; pos?: PO[] }
      if (resAny.error) throw new Error(resAny.error)
      
      const allPOs = ((resAny.pos ?? []) as Array<PO & { po_line_items?: PO['line_items'] }>).map((po) => ({
        ...po,
        line_items: po.line_items ?? po.po_line_items ?? [],
      }))
      
      if (!allPOs.length) return

      const headers = [
        'PO Number', 'PO Name', 'Supplier', 'Order Date', 'ETA', 'Tracking', 'Status', 'PO Notes',
        'SKU', 'Units Ordered', 'Units Received', 'Units Per Box', 'Box Count', 'Dimensions', 'COGS', 'Shipping Cost', 'Item Notes'
      ].join(',')

      const rows = allPOs.flatMap(po => {
        if (!po.line_items || po.line_items.length === 0) {
          return [[
            `"${po.po_number}"`,
            `"${po.po_name || ''}"`,
            `"${po.supplier}"`,
            `"${po.order_date}"`,
            `"${po.eta || ''}"`,
            `"${po.tracking_number || ''}"`,
            `"${po.status}"`,
            `"${(po.notes || '').replace(/"/g, '""')}"`,
            '""', 0, 0, 0, 0, '""', 0, 0, '""'
          ].join(',')]
        }
        return po.line_items.map(li => [
          `"${po.po_number}"`,
          `"${po.po_name || ''}"`,
          `"${po.supplier}"`,
          `"${po.order_date}"`,
          `"${po.eta || ''}"`,
          `"${po.tracking_number || ''}"`,
          `"${po.status}"`,
          `"${(po.notes || '').replace(/"/g, '""')}"`,
          `"${li.sku}"`,
          li.units_ordered || 0,
          li.units_received || 0,
          li.units_per_box || 0,
          li.box_count || 0,
          `"${li.dimensions || ''}"`,
          li.cogs_per_unit || 0,
          li.shipping_cost_per_unit || 0,
          `"${(li.notes || '').replace(/"/g, '""')}"`
        ].join(','))
      }).join('\n')

      const blob = new Blob([headers + '\n' + rows], { type: 'text/csv' })
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `po_register_${new Date().toISOString().split('T')[0]}.csv`
      a.click()
      window.URL.revokeObjectURL(url)
    } catch (err) {
      console.error('Failed to export POs:', err)
      alert('Failed to export POs')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="w-full space-y-5">
      {/* HEADER & CONSOLIDATED TOOLBAR */}
      <div className="bg-card border-white/5 shadow-2xl p-6 lg:p-10 rounded-2xl flex flex-col gap-10">
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
              onClick={() => { setShowBulkModal(true); setBulkFile(null); setBulkResult(null); setBulkError(null) }}
              className="flex items-center gap-2 px-5 py-3.5 bg-white/5 border border-white/10 text-white hover:bg-white/10 transition-all rounded-2xl text-[10px] font-black uppercase tracking-widest"
            >
              <Upload className="h-4 w-4" />
              BULK
            </button>
            <button
              onClick={handleExport}
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

      {/* Table */}
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
              <><SkeletonRow cols={10} /><SkeletonRow cols={10} /><SkeletonRow cols={10} /></>
            ) : paginatedPOs.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-4 py-8 text-sm text-white text-center">
                  {search ? 'No purchase orders match your search' : 'No purchase orders found'}
                </td>
              </tr>
            ) : (
              paginatedPOs.map(po => {
                const isExpanded = expandedId === po.id
                const next = nextStatus(po.status)
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
                                  // Update local state immediately for responsiveness
                                  setPOs(prev => prev.map(p => p.id === po.id ? { ...p, line_items: newItems } : p))
                                  
                                  try {
                                    // Only save to DB items that have a SKU
                                    const toSave = newItems.filter(it => it.sku && it.sku.trim() !== '')
                                    const res = await api.updatePO(po.id, { line_items: toSave }, po.po_number)
                                    const resAny = res as any
                                    if (resAny.error) throw new Error(resAny.error)
                                    
                                    // Update local state with the FRESH data from server (including new IDs)
                                    setPOs(prev => prev.map(p => p.po_number === po.po_number ? res : p))
                                  } catch (err: any) {
                                    alert('Failed to save changes: ' + err.message)
                                    // Revert local state on failure
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
                                                newItems[i] = { ...li, box_count: num }
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
                                    <tr className="border-t border-zinc-100">
                                      <td colSpan={9} className="py-3">
                                        <button
                                          onClick={() => {
                                            const newItem = { sku: '', units_ordered: 1, units_received: 0, units_per_box: 0, box_count: 0, dimensions: '', cogs_per_unit: 0, shipping_cost_per_unit: 0, notes: '' }
                                            const newItems = [...po.line_items, newItem]
                                            // Only update local state, don't save to DB until they enter a SKU
                                            setPOs(prev => prev.map(p => p.id === po.id ? { ...p, line_items: newItems } : p))
                                          }}
                                          className="flex items-center gap-1.5 px-2 py-1 bg-blue-50 text-blue-600 rounded border border-blue-100 hover:bg-blue-100 text-[10px] font-black uppercase tracking-widest transition-colors"
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
                          <div className="flex flex-col gap-2 mt-4 text-xs text-white border-t border-zinc-100 pt-3">
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
    </div>

      {/* Bulk Upload Modal */}
      {showBulkModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/30" onClick={() => setShowBulkModal(false)} />
          <div className="relative bg-white rounded-lg shadow-xl w-full max-w-lg border border-zinc-200">
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-200">
              <h2 className="text-base font-semibold text-zinc-900">Bulk PO Upload</h2>
              <button onClick={() => setShowBulkModal(false)} className="text-zinc-400 hover:text-zinc-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="px-5 py-5 space-y-4">
              {/* Instructions */}
              <div className="bg-zinc-50 border border-zinc-200 rounded-md p-3 text-xs text-zinc-600 space-y-1">
                <p className="font-medium text-zinc-800">CSV/XLSX Format — one row per line item:</p>
                <p><span className="font-data text-zinc-500">po_number, po_name, supplier, order_date, eta, status, po_notes, notes, sku, units_ordered, units_received</span></p>
                <ul className="mt-1.5 space-y-0.5 list-disc list-inside text-zinc-500">
                  <li>Repeat <span className="font-data">po_number</span>, <span className="font-data">po_name</span> and <span className="font-data">po_notes</span> for each SKU in the same PO</li>
                  <li><span className="font-data">po_notes</span>: General PO-level notes (applies to whole PO)</li>
                  <li><span className="font-data">notes</span>: SKU/item-level notes (specific to this line item)</li>
                  <li><span className="font-data">status</span>: draft, ordered, shipped, arrived, closed, cancelled (defaults to draft)</li>
                  <li>Existing PO numbers are skipped (no overwrite)</li>
                  <li>Unknown SKUs within a PO are skipped; rest still imports</li>
                </ul>
              </div>

              <button
                type="button"
                onClick={downloadTemplate}
                className="text-sm text-blue-600 hover:text-blue-800 font-medium underline underline-offset-2"
              >
                Download template CSV
              </button>

              {/* File picker */}
              <div
                onClick={() => bulkInputRef.current?.click()}
                className="border-2 border-dashed border-zinc-300 hover:border-amber-400 rounded-md px-4 py-6 text-center cursor-pointer transition-colors"
              >
                <input
                  ref={bulkInputRef}
                  type="file"
                  accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                  className="hidden"
                  onChange={e => { setBulkFile(e.target.files?.[0] ?? null); setBulkResult(null) }}
                />
                {bulkFile ? (
                  <p className="text-sm text-zinc-700 font-medium">{bulkFile.name}</p>
                ) : (
                  <p className="text-sm text-zinc-400">Click to select a CSV or XLSX file</p>
                )}
              </div>

              {/* Result */}
              {bulkError && (
                <div className="rounded-md px-3 py-3 text-sm bg-red-50 border border-red-200 text-red-700">
                  {bulkError}
                </div>
              )}

              {bulkResult && (
                <div className={`rounded-md px-3 py-3 text-sm space-y-1 ${bulkResult.pos_created > 0 ? 'bg-green-50 border border-green-200' : 'bg-amber-50 border border-amber-200'}`}>
                  <div className="flex gap-4 font-medium text-zinc-800">
                    <span>Created: <span className="text-green-700">{bulkResult.pos_created}</span></span>
                    {!!bulkResult.pos_merged && <span>Merged: <span className="text-blue-700">{bulkResult.pos_merged}</span></span>}
                    <span>Skipped: <span className="text-amber-700">{bulkResult.pos_skipped}</span></span>
                    {bulkResult.pos_failed > 0 && <span>Failed: <span className="text-red-700">{bulkResult.pos_failed}</span></span>}
                    <span className="text-zinc-500">({bulkResult.rows_processed} rows)</span>
                  </div>
                  {bulkResult.merged_pos && bulkResult.merged_pos.length > 0 && (
                    <p className="text-xs text-blue-700">Merged into existing POs: {bulkResult.merged_pos.join(', ')}</p>
                  )}
                  {bulkResult.skipped_pos.length > 0 && (
                    <p className="text-xs text-amber-700">Already exist: {bulkResult.skipped_pos.join(', ')}</p>
                  )}
                  {bulkResult.failed_pos?.length > 0 && bulkResult.failed_pos.map((f, i) => (
                    <p key={i} className="text-xs text-red-700">{f.po_number}: {f.reason}</p>
                  ))}
                  {bulkResult.errors.filter(e => e.row === -1).map((e, i) => (
                    <p key={i} className="text-xs text-zinc-500">{e.message}</p>
                  ))}
                </div>
              )}

              <button
                onClick={handleBulkUpload}
                disabled={!bulkFile || bulkUploading}
                className="w-full py-2.5 text-sm font-semibold bg-amber-500 text-white rounded-md hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {bulkUploading ? 'Uploading…' : 'Upload File'}
              </button>
            </div>
          </div>
        </div>
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
