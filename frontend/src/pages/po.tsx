import { useEffect, useState, useRef } from 'react'
import { X, Upload, Check, Edit2 } from 'lucide-react'
import { api } from '../lib/api'
import type { PO, POStatus, CreatePOInput, UploadPOResponse } from '../types'
import { navigate } from '../lib/router'
import { StatusBadge } from '../components/shared/StatusBadge'
import { Autocomplete } from '../components/shared/Autocomplete'
import { ActionDropdown } from '../components/ActionDropdown'

const PO_STATUS_SEQUENCE: POStatus[] = ['draft', 'ordered', 'shipped', 'arrived', 'closed', 'cancelled']

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
  { label: 'Arrived', value: 'arrived' },
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

function InlineEdit({
  value,
  onSave,
  type = 'text',
  placeholder = '—',
  className = '',
  inputClassName = 'w-16 text-xs'
}: {
  value: string | number | null | undefined
  onSave: (val: string) => Promise<void>
  type?: 'text' | 'number'
  placeholder?: string
  className?: string
  inputClassName?: string
}) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(value?.toString() ?? '')
  const [saving, setSaving] = useState(false)

  const handleSave = async (e?: React.FormEvent) => {
    e?.preventDefault()
    e?.stopPropagation()
    setSaving(true)
    try {
      await onSave(val)
      setEditing(false)
    } finally {
      setSaving(false)
    }
  }

  if (editing) {
    return (
      <form onClick={e => e.stopPropagation()} onSubmit={handleSave} className="flex items-center gap-1">
        <input
          autoFocus
          type={type}
          step={type === 'number' ? 'any' : undefined}
          className={`px-1.5 py-0.5 border border-amber-300 rounded focus:outline-none focus:ring-1 focus:ring-amber-500 bg-amber-50 text-amber-900 ${inputClassName}`}
          value={val}
          onChange={e => setVal(e.target.value)}
          onKeyDown={e => { if (e.key === 'Escape') { setEditing(false); setVal(value?.toString() ?? '') } }}
        />
        <button type="submit" disabled={saving} className="p-0.5 text-emerald-600 hover:bg-emerald-50 rounded shrink-0">
          {saving ? <span className="w-3 h-3 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin block" /> : <Check className="h-3 w-3" />}
        </button>
        <button type="button" onClick={() => { setEditing(false); setVal(value?.toString() ?? '') }} className="p-0.5 text-zinc-400 hover:bg-zinc-100 rounded shrink-0">
          <X className="h-3 w-3" />
        </button>
      </form>
    )
  }

  return (
    <div 
      className={`group/edit cursor-pointer flex items-center gap-1 w-full ${className}`}
      onClick={(e) => { e.stopPropagation(); setEditing(true); setVal(value?.toString() ?? '') }}
    >
      <span>{value !== null && value !== undefined && value !== '' ? value : <span className="text-zinc-300 italic">{placeholder}</span>}</span>
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
  const [advancingId, setAdvancingId] = useState<string | null>(null)
  const slideOverRef = useRef<HTMLDivElement>(null)
  const [showBulkModal, setShowBulkModal] = useState(false)
  const [bulkFile, setBulkFile] = useState<File | null>(null)
  const [bulkUploading, setBulkUploading] = useState(false)
  const [bulkResult, setBulkResult] = useState<UploadPOResponse | null>(null)
  const [bulkError, setBulkError] = useState<string | null>(null)
  const bulkInputRef = useRef<HTMLInputElement>(null)
  const [allSuppliers, setAllSuppliers] = useState<string[]>([])
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
      const skus = (res.skus ?? []).map(s => `${s.sku} - ${s.name || ''}`)
      setSkuSuggestions(skus)
    })
  }, [])

  const filteredPOs = pos.filter(po => {
    const q = search.toLowerCase()
    return (
      po.po_number.toLowerCase().includes(q) ||
      po.supplier.toLowerCase().includes(q) ||
      po.line_items.some(li => li.sku.toLowerCase().includes(q))
    )
  })

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
    const header = 'po_number,supplier,order_date,eta,status,notes,sku,units_ordered,units_received'
    const example = [
      'PO-001,Shenzhen Supplier,2026-03-01,2026-04-01,ordered,,32OZSTRAWLIDBLACK,500,0',
      'PO-001,Shenzhen Supplier,2026-03-01,2026-04-01,ordered,,WB750MLBLACK,300,0',
      'PO-002,Another Supplier,2026-03-10,2026-04-15,draft,First shipment,32OZWBNAVYBLUE,250,',
    ].join('\n')
    const blob = new Blob([header + '\n' + example], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'po_bulk_upload_template.csv'
    a.click()
    URL.revokeObjectURL(url)
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

  return (
    <div className="w-full space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h1 className="text-xl lg:text-2xl font-black text-sidebar uppercase tracking-tight">PO Register</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setShowBulkModal(true); setBulkFile(null); setBulkResult(null); setBulkError(null) }}
            className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3 py-2 text-[10px] lg:text-xs font-black border border-zinc-200 text-muted rounded-lg hover:bg-zinc-50 transition-all uppercase tracking-widest"
          >
            <Upload className="h-3.5 w-3.5" />
            Bulk Upload
          </button>
          <button
            onClick={() => navigate('/po/new')}
            className="flex-1 sm:flex-none px-4 py-2 text-[10px] lg:text-xs font-black bg-brand-amber text-sidebar rounded-lg hover:shadow-lg transition-all uppercase tracking-widest"
          >
            + New PO
          </button>
        </div>
      </div>

      {/* Filter and Search */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex flex-nowrap gap-0 border-b border-zinc-200 overflow-x-auto custom-scrollbar">
          {STATUS_TABS.map(tab => (
            <button
              key={tab.value}
              onClick={() => setActiveTab(tab.value)}
              className={`px-4 py-2.5 text-[10px] lg:text-sm font-black whitespace-nowrap border-b-2 transition-colors -mb-px uppercase tracking-widest ${
                activeTab === tab.value
                  ? 'text-brand-blue border-brand-blue'
                  : 'text-muted border-transparent hover:text-primary'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:max-w-xs">
          <input
            type="text"
            placeholder="Search PO#, Supplier, or SKU..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-3 pr-10 py-2 text-sm border border-zinc-300 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent bg-white text-zinc-900"
          />
          <div className="absolute inset-y-0 right-3 flex items-center pointer-events-none text-zinc-400">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-zinc-200 rounded-xl overflow-x-auto shadow-sm custom-scrollbar">
        <table className="w-full text-sm min-w-[1000px] lg:min-w-0">
          <thead className="bg-zinc-50 border-b border-zinc-200">
            <tr>
              <th className="w-8 px-3 py-2.5" />
              <th className="text-left px-4 py-2.5 text-xs font-medium text-zinc-500 uppercase tracking-wider">PO #</th>
              <th className="text-left px-4 py-2.5 text-xs font-medium text-zinc-500 uppercase tracking-wider">Supplier</th>
              <th className="text-right px-4 py-2.5 text-xs font-medium text-zinc-500 uppercase tracking-wider">SKUs</th>
              <th className="text-left px-4 py-2.5 text-xs font-medium text-zinc-500 uppercase tracking-wider">Order Date</th>
              <th className="text-left px-4 py-2.5 text-xs font-medium text-zinc-500 uppercase tracking-wider">ETA</th>
              <th className="text-left px-4 py-2.5 text-xs font-medium text-zinc-500 uppercase tracking-wider">Status</th>
              <th className="px-4 py-2.5 text-right text-xs font-medium text-zinc-500 uppercase tracking-wider">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {loading ? (
              <><SkeletonRow cols={8} /><SkeletonRow cols={8} /><SkeletonRow cols={8} /></>
            ) : filteredPOs.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-sm text-zinc-400 text-center">
                  {search ? 'No purchase orders match your search' : 'No purchase orders found'}
                </td>
              </tr>
            ) : (
              filteredPOs.map(po => {
                const isExpanded = expandedId === po.id
                const next = nextStatus(po.status)
                return (
                  <>
                    <tr
                      key={po.id}
                      className="hover:bg-zinc-50 transition-colors cursor-pointer"
                      onClick={() => setExpandedId(isExpanded ? null : po.id)}
                    >
                      <td className="px-3 py-2.5 text-center text-zinc-400 text-xs">
                        {isExpanded ? '▼' : '▶'}
                      </td>
                      <td className="px-4 py-2.5 font-data text-xs text-zinc-500">
                        {po.po_number}
                        <InlineEdit 
                          value={po.po_name} 
                          placeholder="+ Add Name"
                          className="text-[10px] text-zinc-400 mt-0.5 font-sans"
                          inputClassName="w-24 text-[10px]"
                          onSave={async (val) => {
                            await api.updatePO(po.id, { po_name: val })
                            setPOs(prev => prev.map(p => p.id === po.id ? { ...p, po_name: val } : p))
                          }}
                        />
                      </td>
                      <td className="px-4 py-2.5 text-sm text-zinc-900">{po.supplier}</td>
                      <td className="px-4 py-2.5 text-right font-data text-sm text-zinc-600">{po.line_items.length}</td>
                      <td className="px-4 py-2.5 font-data text-xs text-zinc-500">{formatDate(po.order_date)}</td>
                      <td className="px-4 py-2.5 font-data text-xs text-zinc-500">{formatDate(po.eta)}</td>
                      <td className="px-4 py-2.5"><StatusBadge status={po.status} /></td>
                      <td className="px-4 py-2.5 text-right" onClick={e => e.stopPropagation()}>
                        <ActionDropdown 
                          currentStatus={po.status}
                          onStatusChange={async (newStatus) => {
                            setAdvancingId(po.id);
                            await api.updatePO(po.id, { status: newStatus as any });
                            setAdvancingId(null);
                            setPOs(prev => prev.map(p => (p.id === po.id ? { ...p, status: newStatus as any } : p)));
                          }}
                          options={['draft', 'ordered', 'shipped', 'arrived', 'closed', 'cancelled']}
                          colors={{
                            draft: 'bg-slate-100 text-slate-500 border-slate-200',
                            ordered: 'bg-blue-50 text-blue-600 border-blue-200',
                            shipped: 'bg-brand-blue/10 text-brand-blue border-brand-blue/20',
                            arrived: 'bg-emerald-50 text-emerald-600 border-emerald-200',
                            closed: 'bg-zinc-100 text-zinc-500 border-zinc-200',
                            cancelled: 'bg-red-50 text-red-600 border-red-200'
                          }}
                        />
                      </td>
                    </tr>

                    {/* Expanded row */}
                    {isExpanded && (
                      <tr key={`${po.id}-expanded`} className="bg-zinc-50">
                        <td colSpan={8} className="px-8 py-4">
                          <div className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-3">Line Items</div>
                          <table className="w-full table-fixed text-sm">
                            <thead>
                              <tr className="border-b border-zinc-200">
                                <th className="w-[20%] text-left pb-2 font-medium text-xs text-zinc-500 pr-4">SKU</th>
                                <th className="w-[8%] text-right pb-2 font-medium text-xs text-zinc-500 pr-4">Ord.</th>
                                <th className="w-[8%] text-right pb-2 font-medium text-xs text-zinc-500 pr-4">Recv.</th>
                                <th className="w-[8%] text-right pb-2 font-medium text-xs text-zinc-500 pr-4">U/Box</th>
                                <th className="w-[8%] text-right pb-2 font-medium text-xs text-zinc-500 pr-4">Boxes</th>
                                <th className="w-[12%] text-left pb-2 font-medium text-xs text-zinc-500 pr-4">Dims</th>
                                <th className="w-[8%] text-right pb-2 font-medium text-xs text-zinc-500 pr-4">COGS</th>
                                <th className="w-[8%] text-right pb-2 font-medium text-xs text-zinc-500 pr-4">Ship</th>
                                <th className="w-[20%] text-left pb-2 font-medium text-xs text-zinc-500">Notes</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-zinc-100">
                              {po.line_items.map((li, i) => (
                                <tr key={i}>
                                  <td className="py-2 pr-4">
                                    <button
                                      onClick={() => navigate('/sku/' + li.sku)}
                                      className="font-data text-xs text-blue-600 hover:text-blue-800 font-medium"
                                    >
                                      {li.sku}
                                    </button>
                                  </td>
                                  <td className="py-2 pr-4 text-right font-data text-sm text-zinc-900">
                                    <InlineEdit 
                                      type="number"
                                      value={li.units_ordered} 
                                      className="justify-end"
                                      onSave={async (val) => {
                                        const num = val ? Number(val) : 0
                                        const newItems = [...po.line_items]
                                        newItems[i] = { ...li, units_ordered: num }
                                        await api.updatePO(po.id, { line_items: newItems })
                                        setPOs(prev => prev.map(p => p.id === po.id ? { ...p, line_items: newItems } : p))
                                      }}
                                    />
                                  </td>
                                  <td className="py-2 pr-4 text-right font-data text-sm text-zinc-500">
                                    <InlineEdit 
                                      type="number"
                                      value={li.units_received} 
                                      className="justify-end"
                                      onSave={async (val) => {
                                        const num = val ? Number(val) : 0
                                        const newItems = [...po.line_items]
                                        newItems[i] = { ...li, units_received: num }
                                        await api.updatePO(po.id, { line_items: newItems })
                                        setPOs(prev => prev.map(p => p.id === po.id ? { ...p, line_items: newItems } : p))
                                      }}
                                    />
                                  </td>
                                  <td className="py-2 pr-4 text-right font-data text-xs text-zinc-500">
                                    <InlineEdit 
                                      type="number"
                                      value={li.units_per_box} 
                                      className="justify-end"
                                      onSave={async (val) => {
                                        const num = val ? Number(val) : 0
                                        const newItems = [...po.line_items]
                                        newItems[i] = { ...li, units_per_box: num }
                                        await api.updatePO(po.id, { line_items: newItems })
                                        setPOs(prev => prev.map(p => p.id === po.id ? { ...p, line_items: newItems } : p))
                                      }}
                                    />
                                  </td>
                                  <td className="py-2 pr-4 text-right font-data text-xs text-zinc-500">
                                    <InlineEdit 
                                      type="number"
                                      value={li.box_count} 
                                      className="justify-end"
                                      onSave={async (val) => {
                                        const num = val ? Number(val) : 0
                                        const newItems = [...po.line_items]
                                        newItems[i] = { ...li, box_count: num }
                                        await api.updatePO(po.id, { line_items: newItems })
                                        setPOs(prev => prev.map(p => p.id === po.id ? { ...p, line_items: newItems } : p))
                                      }}
                                    />
                                  </td>
                                  <td className="py-2 pr-4 text-left font-data text-[10px] text-zinc-400">
                                    <InlineEdit 
                                      value={li.dimensions} 
                                      inputClassName="w-20 text-[10px]"
                                      onSave={async (val) => {
                                        const newItems = [...po.line_items]
                                        newItems[i] = { ...li, dimensions: val }
                                        await api.updatePO(po.id, { line_items: newItems })
                                        setPOs(prev => prev.map(p => p.id === po.id ? { ...p, line_items: newItems } : p))
                                      }}
                                    />
                                  </td>
                                  <td className="py-2 pr-4 text-right font-data text-xs text-zinc-500">
                                    <InlineEdit 
                                      type="number"
                                      value={li.cogs_per_unit} 
                                      className="justify-end"
                                      onSave={async (val) => {
                                        const num = val ? Number(val) : 0
                                        const newItems = [...po.line_items]
                                        newItems[i] = { ...li, cogs_per_unit: num }
                                        await api.updatePO(po.id, { line_items: newItems })
                                        setPOs(prev => prev.map(p => p.id === po.id ? { ...p, line_items: newItems } : p))
                                      }}
                                    />
                                  </td>
                                  <td className="py-2 pr-4 text-right font-data text-xs text-zinc-500">
                                    <InlineEdit 
                                      type="number"
                                      value={li.shipping_cost_per_unit} 
                                      className="justify-end"
                                      onSave={async (val) => {
                                        const num = val ? Number(val) : 0
                                        const newItems = [...po.line_items]
                                        newItems[i] = { ...li, shipping_cost_per_unit: num }
                                        await api.updatePO(po.id, { line_items: newItems })
                                        setPOs(prev => prev.map(p => p.id === po.id ? { ...p, line_items: newItems } : p))
                                      }}
                                    />
                                  </td>
                                  <td className="py-2 text-left font-data text-[10px] text-zinc-400">
                                    <InlineEdit 
                                      value={li.notes} 
                                      inputClassName="w-24 text-[10px]"
                                      onSave={async (val) => {
                                        const newItems = [...po.line_items]
                                        newItems[i] = { ...li, notes: val }
                                        await api.updatePO(po.id, { line_items: newItems })
                                        setPOs(prev => prev.map(p => p.id === po.id ? { ...p, line_items: newItems } : p))
                                      }}
                                    />
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          <div className="flex flex-col gap-2 mt-3 text-xs text-zinc-500">
                            {po.tracking_number && (
                              <div className="flex items-center gap-2"><span className="font-medium text-zinc-600">Tracking: </span>{po.tracking_number}</div>
                            )}
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-zinc-600">Notes: </span>
                              <InlineEdit 
                                value={po.notes} 
                                placeholder="+ Add Note"
                                inputClassName="w-64 text-xs"
                                onSave={async (val) => {
                                  await api.updatePO(po.id, { notes: val })
                                  setPOs(prev => prev.map(p => p.id === po.id ? { ...p, notes: val } : p))
                                }}
                              />
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                )
              })
            )}
          </tbody>
        </table>
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
                <p><span className="font-data text-zinc-500">po_number, supplier, order_date, eta, status, notes, sku, units_ordered, units_received</span></p>
                <ul className="mt-1.5 space-y-0.5 list-disc list-inside text-zinc-500">
                  <li>Repeat <span className="font-data">po_number</span> for each SKU in the same PO</li>
                  <li><span className="font-data">status</span>: draft, ordered, shipped, arrived, closed, cancelled (defaults to draft)</li>
                  <li>Existing PO numbers are skipped (no overwrite)</li>
                  <li>Unknown SKUs within a PO are skipped; rest still imports</li>
                </ul>
              </div>

              <button
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

    </div>
  )
}
