import { useState, useEffect } from 'react'
import { ArrowLeft, Plus, Trash2, Save } from 'lucide-react'
import { api } from '../lib/api'
import { navigate } from '../lib/router'
import { Autocomplete } from '../components/shared/Autocomplete'
import type { CreatePOInput } from '../types'

interface LineItemInput {
  sku: string
  units_ordered: number
  units_received: number
  units_per_box: number
  box_count: number
  dimensions: string
  cogs_per_unit: number
  shipping_cost_per_unit: number
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
      shipping_cost_per_unit: 0 
    }],
  }
}

const inputCls = 'w-full border border-zinc-300 text-zinc-900 bg-white px-3 py-2 text-sm rounded-md focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent'

export default function PONewPage() {
  const [form, setForm] = useState<NewPOForm>(emptyForm())
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [allSuppliers, setAllSuppliers] = useState<string[]>([])
  const [allSkus, setAllSkus] = useState<any[]>([])
  const [skuSuggestions, setSkuSuggestions] = useState<string[]>([])

  useEffect(() => {
    api.getSuppliers().then(res => setAllSuppliers(res.suppliers || []))
    api.getSKUs().then(res => {
      console.log('SKUs fetched for suggestions:', res)
      const data = res.skus ?? []
      setAllSkus(data)
      const suggestions = data.map(s => `${s.sku} - ${s.name || ''}`)
      console.log('Processed suggestions:', suggestions.length)
      setSkuSuggestions(suggestions)
    })
  }, [])

  const handleFormChange = (field: keyof NewPOForm, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  const handleLineItemChange = (i: number, field: keyof LineItemInput, value: string | number) => {
    setForm(prev => {
      const items = [...prev.line_items]
      let val = value
      
      // If it's a SKU selection from suggestions
      if (field === 'sku' && typeof value === 'string' && value.includes(' - ')) {
        const skuCode = value.split(' - ')[0].trim()
        val = skuCode
        
        // Find defaults from our cached allSkus
        const skuData = allSkus.find(s => s.sku === skuCode)
        if (skuData) {
          items[i] = {
            ...items[i],
            sku: skuCode,
            units_per_box: skuData.units_per_box || 0,
            cogs_per_unit: skuData.cogs || 0,
            dimensions: skuData.dimensions || '',
            // You might want to auto-calculate boxes if units_ordered > 0
          }
          return { ...prev, line_items: items }
        }
      }

      items[i] = { ...items[i], [field]: val as any }
      return { ...prev, line_items: items }
    })
  }

  const addLineItem = () => {
    setForm(prev => ({ 
      ...prev, 
      line_items: [
        ...prev.line_items, 
        { sku: '', units_ordered: 0, units_received: 0, units_per_box: 0, box_count: 0, dimensions: '', cogs_per_unit: 0, shipping_cost_per_unit: 0 }
      ] 
    }))
  }

  const removeLineItem = (i: number) => {
    setForm(prev => ({ ...prev, line_items: prev.line_items.filter((_, idx) => idx !== i) }))
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
      line_items: validItems.map(li => ({
        ...li,
        units_received: li.units_received || 0
      })),
    }
    setSubmitting(true)
    const result = await api.createPO(payload)
    setSubmitting(false)
    const resultAny = result as unknown as { error?: string }
    if (resultAny.error) {
      setSubmitError(resultAny.error)
    } else {
      navigate('/po')
    }
  }

  return (
    <div className="w-full space-y-6 px-4 sm:px-6 lg:px-8 max-w-[1920px] mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/po')} className="p-2 hover:bg-zinc-100 rounded-full transition-colors text-zinc-500">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-xl lg:text-2xl font-black text-sidebar uppercase tracking-tight">Create PO</h1>
            <p className="text-xs font-bold text-muted uppercase tracking-wider opacity-60 mt-1">Define supply parameters</p>
          </div>
        </div>
        <div className="flex gap-3">
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-2.5 bg-brand-amber text-sidebar rounded-lg text-xs font-black shadow-lg shadow-brand-amber/20 hover:bg-brand-amber/90 transition-all disabled:opacity-50 uppercase tracking-widest"
          >
            <Save className="h-4 w-4" />
            {submitting ? 'Creating...' : 'Create PO'}
          </button>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6 pb-20">
        <div className="bg-white p-6 rounded-xl border border-zinc-200 shadow-sm space-y-6">
          <h2 className="text-sm font-bold text-zinc-900 border-b border-zinc-100 pb-4 uppercase tracking-wider">General Information</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-zinc-500 uppercase">PO Number <span className="text-red-500">*</span></label>
              <input required value={form.po_number} onChange={e => handleFormChange('po_number', e.target.value)} placeholder="e.g. PO-2024-001" className={inputCls} />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-zinc-500 uppercase">PO Name / Project</label>
              <input value={form.po_name} onChange={e => handleFormChange('po_name', e.target.value)} placeholder="e.g. Q2 Restock" className={inputCls} />
            </div>
            <div className="col-span-2">
              <Autocomplete
                label="Supplier"
                required
                value={form.supplier}
                onChange={val => handleFormChange('supplier', val)}
                suggestions={allSuppliers}
                placeholder="Search or enter supplier name..."
                className={inputCls}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-zinc-500 uppercase">Order Date <span className="text-red-500">*</span></label>
              <input required type="date" value={form.order_date} onChange={e => handleFormChange('order_date', e.target.value)} className={inputCls} />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-zinc-500 uppercase">ETA Date <span className="text-red-500">*</span></label>
              <input required type="date" value={form.eta} onChange={e => handleFormChange('eta', e.target.value)} className={inputCls} />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-zinc-500 uppercase">Tracking Number</label>
              <input value={form.tracking_number} onChange={e => handleFormChange('tracking_number', e.target.value)} placeholder="Carrier tracking info..." className={inputCls} />
            </div>
            <div className="col-span-2 space-y-1.5">
              <label className="text-xs font-bold text-zinc-500 uppercase">Notes</label>
              <textarea rows={2} value={form.notes} onChange={e => handleFormChange('notes', e.target.value)} placeholder="Internal remarks..." className={`${inputCls} resize-none`} />
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-zinc-900 uppercase tracking-wider">Purchase Items</h2>
            <button
              type="button"
              onClick={addLineItem}
              className="flex items-center gap-1.5 text-xs font-bold text-brand-blue hover:text-brand-blue/80 transition-colors uppercase"
            >
              <Plus className="h-3.5 w-3.5" />
              Add More SKUs
            </button>
          </div>

          <div className="space-y-4">
            {form.line_items.map((li, i) => (
              <div key={i} className="bg-white p-6 rounded-xl border border-zinc-200 shadow-sm relative group animate-in fade-in slide-in-from-top-2">
                <button
                  type="button"
                  onClick={() => removeLineItem(i)}
                  disabled={form.line_items.length === 1}
                  className="absolute top-4 right-4 text-zinc-300 hover:text-red-500 disabled:opacity-0 transition-all opacity-0 group-hover:opacity-100"
                >
                  <Trash2 className="h-4 w-4" />
                </button>

                <div className="grid grid-cols-6 gap-6">
                  <div className="col-span-3">
                    <Autocomplete
                      label="Select SKU"
                      required
                      value={li.sku}
                      onChange={val => handleLineItemChange(i, 'sku', val)}
                      suggestions={skuSuggestions}
                      placeholder="Type SKU or Name..."
                      className={inputCls}
                    />
                  </div>
                  <div className="col-span-3 space-y-1.5">
                    <label className="text-xs font-bold text-zinc-500 uppercase">Shipping Dimensions</label>
                    <input
                      value={li.dimensions}
                      onChange={e => handleLineItemChange(i, 'dimensions', e.target.value)}
                      placeholder="L x W x H (cm)"
                      className={inputCls}
                    />
                  </div>
                  <div className="col-span-2 space-y-1.5">
                    <label className="text-xs font-bold text-zinc-500 uppercase">Units Ordered</label>
                    <input
                      type="number"
                      required
                      min={1}
                      value={li.units_ordered || ''}
                      onChange={e => handleLineItemChange(i, 'units_ordered', parseInt(e.target.value) || 0)}
                      className={`${inputCls} font-data text-base`}
                    />
                  </div>
                  <div className="col-span-2 space-y-1.5">
                    <label className="text-xs font-bold text-zinc-500 uppercase">Units per Box</label>
                    <input
                      type="number"
                      value={li.units_per_box || ''}
                      onChange={e => handleLineItemChange(i, 'units_per_box', parseInt(e.target.value) || 0)}
                      className={`${inputCls} font-data`}
                    />
                  </div>
                  <div className="col-span-2 space-y-1.5">
                    <label className="text-xs font-bold text-zinc-500 uppercase">Total Boxes</label>
                    <input
                      type="number"
                      step="0.01"
                      value={li.box_count || ''}
                      onChange={e => handleLineItemChange(i, 'box_count', parseFloat(e.target.value) || 0)}
                      className={`${inputCls} font-data`}
                    />
                  </div>
                  <div className="col-span-3 space-y-1.5">
                    <label className="text-xs font-bold text-zinc-500 uppercase">COGS per Unit (AED)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={li.cogs_per_unit || ''}
                      onChange={e => handleLineItemChange(i, 'cogs_per_unit', parseFloat(e.target.value) || 0)}
                      className={`${inputCls} font-data`}
                    />
                  </div>
                  <div className="col-span-3 space-y-1.5">
                    <label className="text-xs font-bold text-zinc-500 uppercase">Total Shipping Cost (AED)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={li.shipping_cost_per_unit || ''}
                      onChange={e => handleLineItemChange(i, 'shipping_cost_per_unit', parseFloat(e.target.value) || 0)}
                      className={`${inputCls} font-data`}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {submitError && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm font-medium">
            {submitError}
          </div>
        )}
      </form>
    </div>
  )
}
