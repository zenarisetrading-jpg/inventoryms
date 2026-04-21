import { useState } from 'react'
import { ArrowLeft, Save } from 'lucide-react'
import { api } from '../lib/api'
import { navigate } from '../lib/router'
import type { SKUCategory } from '../types'

interface NewSKUForm {
  sku: string
  name: string
  asin: string
  fnsku: string
  category: SKUCategory
  sub_category: string
  units_per_box: number
  moq: number
  lead_time_days: number
  cogs: number
  dimensions: string
}

function emptyForm(): NewSKUForm {
  return {
    sku: '',
    name: '',
    asin: '',
    fnsku: '',
    category: 'C',
    sub_category: '',
    units_per_box: 1,
    moq: 0,
    lead_time_days: 0,
    cogs: 0,
    dimensions: '',
  }
}

const inputCls = 'w-full border border-zinc-300 text-zinc-900 bg-white px-3 py-2 text-sm rounded-md focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent'

export default function SKUNewPage() {
  const [form, setForm] = useState<NewSKUForm>(emptyForm())
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const handleFormChange = (field: keyof NewSKUForm, value: string | number) => {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitError(null)
    if (!form.sku || !form.name) {
      setSubmitError('SKU code and name are required.')
      return
    }
    setSubmitting(true)
    // Note: We need a createSKU endpoint. For now we use the general api pattern.
    // If it doesn't exist, I'll need to add it to the backend.
    try {
      const result = await api.createSKU(form)
      setSubmitting(false)
      const resAny = result as any
      if (resAny.ok) {
        navigate('/skus')
      } else {
        setSubmitError(resAny.error || 'Failed to create SKU. It might already exist.')
      }
    } catch (err: any) {
      setSubmitError(err.message)
      setSubmitting(false)
    }
  }

  return (
    <div className="w-full space-y-6 px-4 sm:px-6 lg:px-8 max-w-[1920px] mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/skus')} className="p-2 hover:bg-zinc-100 rounded-full transition-colors text-zinc-500">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-xl lg:text-2xl font-black text-sidebar uppercase tracking-tight">New SKU</h1>
            <p className="text-xs font-bold text-muted uppercase tracking-wider opacity-60 mt-1">Catalog registration</p>
          </div>
        </div>
        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="flex items-center justify-center gap-2 px-6 py-2.5 bg-brand-amber text-sidebar rounded-lg text-xs font-black shadow-lg shadow-brand-amber/20 hover:bg-brand-amber/90 transition-all disabled:opacity-50 uppercase tracking-widest"
        >
          <Save className="h-4 w-4" />
          {submitting ? 'Saving...' : 'Save Product'}
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6 pb-20">
        <div className="bg-white p-6 rounded-xl border border-zinc-200 shadow-sm space-y-6">
          <h2 className="text-sm font-bold text-zinc-900 border-b border-zinc-100 pb-4 uppercase tracking-wider">Product Identifiers</h2>
          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-1.5 shadow-sm">
              <label className="text-xs font-bold text-zinc-500 uppercase">SKU Code <span className="text-red-500">*</span></label>
              <input required value={form.sku} onChange={e => handleFormChange('sku', e.target.value)} placeholder="e.g. S2C-PRO-001" className={inputCls} />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-zinc-500 uppercase">Product Name <span className="text-red-500">*</span></label>
              <input required value={form.name} onChange={e => handleFormChange('name', e.target.value)} placeholder="e.g. Premium Water Bottle 1L" className={inputCls} />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-zinc-500 uppercase">ASIN</label>
              <input value={form.asin} onChange={e => handleFormChange('asin', e.target.value)} placeholder="e.g. B0CM9..." className={inputCls} />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-zinc-500 uppercase">FNSKU</label>
              <input value={form.fnsku} onChange={e => handleFormChange('fnsku', e.target.value)} placeholder="e.g. X002..." className={inputCls} />
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl border border-zinc-200 shadow-sm space-y-6">
          <h2 className="text-sm font-bold text-zinc-900 border-b border-zinc-100 pb-4 uppercase tracking-wider">Logistics & Params</h2>
          <div className="grid grid-cols-3 gap-6">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-zinc-500 uppercase">Classification</label>
              <select value={form.category} onChange={e => handleFormChange('category', e.target.value as SKUCategory)} className={inputCls}>
                <option value="A">Class A (High Volume)</option>
                <option value="B">Class B (Medium Volume)</option>
                <option value="C">Class C (Low Volume)</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-zinc-500 uppercase">Sub-category</label>
              <input value={form.sub_category} onChange={e => handleFormChange('sub_category', e.target.value)} placeholder="e.g. Kitchenware" className={inputCls} />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-zinc-500 uppercase">Units per Box</label>
              <input type="number" min={1} value={form.units_per_box} onChange={e => handleFormChange('units_per_box', parseInt(e.target.value) || 1)} className={inputCls} />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-zinc-500 uppercase">MOQ</label>
              <input type="number" min={0} value={form.moq} onChange={e => handleFormChange('moq', parseInt(e.target.value) || 0)} className={inputCls} />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-zinc-500 uppercase">Lead Time (Days)</label>
              <input type="number" min={0} value={form.lead_time_days} onChange={e => handleFormChange('lead_time_days', parseInt(e.target.value) || 0)} className={inputCls} />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-zinc-500 uppercase">COGS (AED)</label>
              <input type="number" step="0.01" min={0} value={form.cogs} onChange={e => handleFormChange('cogs', parseFloat(e.target.value) || 0)} className={inputCls} />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-zinc-500 uppercase">Dimensions (LxWxH cm)</label>
              <input value={form.dimensions} onChange={e => handleFormChange('dimensions', e.target.value)} placeholder="e.g. 50x40x30" className={inputCls} />
            </div>
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
