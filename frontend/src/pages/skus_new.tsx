import { useState, useEffect } from 'react'
import { ArrowLeft, Save, Package, ShieldCheck, Truck, Coins } from 'lucide-react'
import { api } from '../lib/api'
import { navigate } from '../lib/router'
import type { SKUCategory } from '../types'

interface NewSKUForm {
  sku: string
  name: string
  asin: string
  fnsku: string
  saddl_id: string
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
    saddl_id: localStorage.getItem('selected_account') || '',
    category: 'C',
    sub_category: '',
    units_per_box: 1,
    moq: 0,
    lead_time_days: 0,
    cogs: 0,
    dimensions: '',
  }
}

const inputCls = 'w-full bg-white/5 border border-white/10 text-white px-4 py-3 text-sm rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-blue/50 focus:border-transparent transition-all placeholder:text-zinc-600 font-bold uppercase tracking-widest'

export default function SKUNewPage() {
  const [form, setForm] = useState<NewSKUForm>(emptyForm())
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [locations, setLocations] = useState<{ country: string, saddl_account_id: string, display_name: string }[]>([])

  useEffect(() => {
    api.getLocations().then(locs => {
      setLocations(locs)
      if (locs.length > 0 && !form.saddl_id) {
        setForm(prev => ({ ...prev, saddl_id: locs[0].saddl_account_id }))
      }
    }).catch(console.error)
  }, [])

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
    <div className="w-full space-y-8 px-0 sm:px-6 lg:px-8 max-w-[1400px] mx-auto pb-20 mt-2 lg:mt-4">
      {/* HEADER CARD */}
      <div className="bg-card border border-white/5 shadow-2xl p-8 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        <div className="flex items-center gap-6">
          <button 
            onClick={() => navigate('/skus')} 
            className="p-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl transition-all text-zinc-400 hover:text-white"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <div className="flex items-center gap-3 mb-1">
              <Package className="w-5 h-5 text-brand-blue" />
              <h1 className="text-2xl font-black text-white uppercase tracking-tighter">Register New SKU</h1>
            </div>
            <p className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.3em] opacity-80">
              Master Catalog Ingestion • Global Identifier Control
            </p>
          </div>
        </div>
        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="flex items-center justify-center gap-3 px-8 py-4 bg-brand-blue text-white rounded-2xl text-[11px] font-black shadow-xl shadow-brand-blue/20 hover:bg-brand-blue/90 transition-all disabled:opacity-50 uppercase tracking-[0.2em] active:scale-95"
        >
          <Save className="h-4 w-4" />
          {submitting ? 'PROCESSING...' : 'SAVE PRODUCT'}
        </button>
      </div>

      <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* IDENTIFIERS SECTION */}
        <div className="bg-card border border-white/5 p-8 rounded-2xl shadow-2xl space-y-8">
          <div className="flex items-center gap-3 border-b border-white/5 pb-6">
            <ShieldCheck className="w-5 h-5 text-emerald-500" />
            <h2 className="text-xs font-black text-white uppercase tracking-[0.2em]">Product Identifiers</h2>
          </div>
          
          <div className="grid grid-cols-1 gap-6">
            <div className="space-y-2.5">
              <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest ml-1">Internal SKU Code <span className="text-rose-500">*</span></label>
              <input required value={form.sku} onChange={e => handleFormChange('sku', e.target.value)} placeholder="E.G. PRO-001" className={inputCls} />
            </div>
            <div className="space-y-2.5">
              <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest ml-1">SADDL Account ID <span className="text-rose-500">*</span></label>
              <select 
                required 
                value={form.saddl_id} 
                onChange={e => handleFormChange('saddl_id', e.target.value)} 
                className={`${inputCls} border-brand-blue/40 shadow-[0_0_15px_rgba(59,130,246,0.1)] appearance-none cursor-pointer`}
                style={{ backgroundColor: 'rgba(59, 130, 246, 0.08)' }}
              >
                <option value="" disabled style={{ backgroundColor: '#18181b', color: 'white' }}>Select an Account...</option>
                {locations.map(loc => (
                  <option key={`${loc.country}-${loc.saddl_account_id}`} value={loc.saddl_account_id} style={{ backgroundColor: '#18181b', color: 'white' }}>
                    {loc.saddl_account_id} ({loc.display_name})
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2.5">
              <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest ml-1">Official Product Name <span className="text-rose-500">*</span></label>
              <input required value={form.name} onChange={e => handleFormChange('name', e.target.value)} placeholder="E.G. PREMIUM WATER BOTTLE 1L" className={inputCls} />
            </div>
            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-2.5">
                <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest ml-1">Amazon ASIN</label>
                <input value={form.asin} onChange={e => handleFormChange('asin', e.target.value)} placeholder="B0CM9..." className={inputCls} />
              </div>
              <div className="space-y-2.5">
                <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest ml-1">Amazon FNSKU</label>
                <input value={form.fnsku} onChange={e => handleFormChange('fnsku', e.target.value)} placeholder="X002..." className={inputCls} />
              </div>
            </div>
          </div>
        </div>

        {/* LOGISTICS & PARAMS */}
        <div className="bg-card border border-white/5 p-8 rounded-2xl shadow-2xl space-y-8">
          <div className="flex items-center gap-3 border-b border-white/5 pb-6">
            <Truck className="w-5 h-5 text-brand-amber" />
            <h2 className="text-xs font-black text-white uppercase tracking-[0.2em]">Logistics & Parameters</h2>
          </div>

          <div className="grid grid-cols-1 gap-6">
            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-2.5">
                <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest ml-1">Volume Class</label>
                <select 
                  value={form.category} 
                  onChange={e => handleFormChange('category', e.target.value as SKUCategory)} 
                  className={`${inputCls} border-brand-blue/40 shadow-[0_0_15px_rgba(59,130,246,0.1)]`}
                  style={{ backgroundColor: 'rgba(59, 130, 246, 0.08)', color: 'white' }}
                >
                  <option value="A" style={{ backgroundColor: '#18181b', color: 'white' }}>CLASS A (HIGH)</option>
                  <option value="B" style={{ backgroundColor: '#18181b', color: 'white' }}>CLASS B (MED)</option>
                  <option value="C" style={{ backgroundColor: '#18181b', color: 'white' }}>CLASS C (LOW)</option>
                </select>
              </div>
              <div className="space-y-2.5">
                <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest ml-1">Sub-category</label>
                <input value={form.sub_category} onChange={e => handleFormChange('sub_category', e.target.value)} placeholder="KITCHENWARE" className={inputCls} />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-6">
              <div className="space-y-2.5">
                <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest ml-1">Units/Box</label>
                <input 
                  type="number" 
                  min={1} 
                  value={form.units_per_box || ''} 
                  onChange={e => handleFormChange('units_per_box', e.target.value === '' ? 0 : parseInt(e.target.value))} 
                  className={inputCls} 
                />
              </div>
              <div className="space-y-2.5">
                <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest ml-1">MOQ</label>
                <input 
                  type="number" 
                  min={0} 
                  value={form.moq === 0 ? '' : form.moq} 
                  onChange={e => handleFormChange('moq', e.target.value === '' ? 0 : parseInt(e.target.value))} 
                  placeholder="0"
                  className={inputCls} 
                />
              </div>
              <div className="space-y-2.5">
                <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest ml-1">Lead Time</label>
                <input 
                  type="number" 
                  min={0} 
                  value={form.lead_time_days === 0 ? '' : form.lead_time_days} 
                  onChange={e => handleFormChange('lead_time_days', e.target.value === '' ? 0 : parseInt(e.target.value))} 
                  placeholder="0"
                  className={inputCls} 
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-2.5">
                <div className="flex items-center gap-2 mb-1">
                  <Coins className="w-3.5 h-3.5 text-emerald-500" />
                  <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">COGS (AED)</label>
                </div>
                <input 
                  type="number" 
                  step="0.01" 
                  min={0} 
                  value={form.cogs === 0 ? '' : form.cogs} 
                  onChange={e => handleFormChange('cogs', e.target.value === '' ? 0 : parseFloat(e.target.value))} 
                  placeholder="0.00"
                  className={inputCls} 
                />
              </div>
              <div className="space-y-2.5">
                <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest ml-1">Dimensions (CM)</label>
                <input value={form.dimensions} onChange={e => handleFormChange('dimensions', e.target.value)} placeholder="50x40x30" className={inputCls} />
              </div>
            </div>
          </div>
        </div>

        {submitError && (
          <div className="lg:col-span-2 bg-rose-500/10 border border-rose-500/20 text-rose-500 px-6 py-4 rounded-2xl text-[11px] font-black uppercase tracking-widest animate-in fade-in slide-in-from-top-2 duration-300">
            {submitError}
          </div>
        )}
      </form>
    </div>
  )
}
