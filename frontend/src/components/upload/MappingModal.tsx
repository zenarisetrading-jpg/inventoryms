import React, { useState, useEffect } from 'react'
import { X, CheckCircle2 } from 'lucide-react'
import { api } from '../../lib/api'
import { LoadingScreen } from '../shared/LoadingScreen'

interface UnmatchedEntry { locad_sku: string; product_name: string }

export function MappingModal({ onClose, onSaved, internalSKUs }: { onClose: () => void, onSaved: () => void, internalSKUs: string[] }) {
  const [unmatched, setUnmatched] = useState<UnmatchedEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [mappings, setMappings] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.getLocadUnmatched().then(res => {
      const resAny = res as any
      if (resAny.error) setError(resAny.error)
      else setUnmatched(resAny.unmatched ?? [])
      setLoading(false)
    })
  }, [])

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    const entries = Object.entries(mappings).filter(([, v]) => v !== '')
    for (const [locad_sku, internal_sku] of entries) {
      const result = await api.mapLocadSKU(locad_sku, internal_sku) as any
      if (result.error) { setError(`Failed to map ${locad_sku}: ${result.error}`); setSaving(false); return }
    }
    setSaving(false)
    onSaved(); onClose()
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-2xl max-h-[80vh] flex flex-col bg-slate-900 border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
        <div className="px-6 py-5 border-b border-white/5 flex items-center justify-between bg-white/5">
          <div>
            <h2 className="text-base font-black text-white uppercase tracking-tight">Locad SKU Mapper</h2>
            <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mt-1">Resolution of unknown identifiers</p>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-white transition-colors"><X className="h-6 w-6" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {error && <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-bold uppercase rounded-2xl">{error}</div>}
          {loading ? <LoadingScreen message="Resolving SKUs..." /> : unmatched.length === 0 ? (
            <div className="py-12 text-center flex flex-col items-center gap-4">
              <CheckCircle2 className="h-12 w-12 text-green-500" />
              <p className="text-sm font-black text-white uppercase tracking-widest">Database Synchronized</p>
              <p className="text-xs text-zinc-500 uppercase font-bold">All Locad identifiers are currently matched.</p>
            </div>
          ) : unmatched.map(u => (
            <div key={u.locad_sku} className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-center bg-white/5 border border-white/5 rounded-2xl p-4">
              <div className="flex flex-col">
                <span className="text-[9px] font-black text-zinc-500 uppercase tracking-widest mb-1">Locad SKU</span>
                <span className="font-data text-xs text-white truncate">{u.locad_sku}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-[9px] font-black text-zinc-500 uppercase tracking-widest mb-1">Entity Name</span>
                <span className="text-[11px] font-bold text-zinc-400 truncate uppercase">{u.product_name}</span>
              </div>
              <input
                value={mappings[u.locad_sku] ?? ''}
                onChange={e => setMappings(prev => ({ ...prev, [u.locad_sku]: e.target.value }))}
                placeholder="Match SKU..."
                className="bg-slate-950 border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:ring-2 focus:ring-brand-blue font-data uppercase"
              />
            </div>
          ))}
        </div>

        <div className="px-6 py-5 border-t border-white/5 flex justify-end gap-3 bg-white/5">
          <button onClick={onClose} className="px-6 py-2.5 text-[10px] font-black text-zinc-500 hover:text-white uppercase tracking-widest">Cancel</button>
          <button
            onClick={handleSave}
            disabled={saving || Object.values(mappings).every(v => !v)}
            className="px-6 py-2.5 bg-brand-blue text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-brand-blue/90 disabled:opacity-30 transition-all"
          >
            {saving ? 'Saving...' : 'Commit Mappings'}
          </button>
        </div>
      </div>
    </div>
  )
}
