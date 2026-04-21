import { useEffect, useRef, useState } from 'react'
import { X, Upload, CheckCircle2, AlertCircle, Package, Download } from 'lucide-react'
import { api } from '../lib/api'
import type { SyncStatus, UploadLocadResponse, UploadNoonResponse, UploadNoonInventoryResponse } from '../types'

// ─── Drop Zone ────────────────────────────────────────────────────────────────

interface DropZoneProps {
  accept: string
  label: string
  hint?: string
  onFile: (f: File) => void
  disabled?: boolean
}

function DropZone({ accept, label, hint, onFile, disabled }: DropZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) onFile(file)
  }

  return (
    <div
      className={`border-2 border-dashed rounded-lg px-6 py-8 text-center cursor-pointer transition-all ${
        disabled
          ? 'border-zinc-200 bg-zinc-50 cursor-not-allowed'
          : dragging
            ? 'border-amber-400 bg-amber-50'
            : 'border-zinc-300 bg-white hover:border-amber-300 hover:bg-amber-50/30'
      }`}
      onDragOver={e => { e.preventDefault(); if (!disabled) setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={disabled ? undefined : handleDrop}
      onClick={() => { if (!disabled) inputRef.current?.click() }}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        disabled={disabled}
        onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = '' }}
      />
      <Upload className={`mx-auto h-8 w-8 mb-2 ${disabled ? 'text-zinc-300' : dragging ? 'text-amber-500' : 'text-zinc-400'}`} />
      <div className={`text-sm font-medium mb-1 ${disabled ? 'text-zinc-400' : 'text-zinc-700'}`}>
        {label}
      </div>
      <div className="text-xs text-zinc-400">
        {disabled ? 'Not available' : hint ?? 'Drag and drop or click to browse'}
      </div>
    </div>
  )
}

// ─── Uploading Spinner ────────────────────────────────────────────────────────

function UploadingZone() {
  return (
    <div className="border-2 border-dashed border-zinc-200 rounded-lg px-6 py-8 text-center bg-zinc-50">
      <div className="inline-block w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin mb-2" />
      <div className="text-sm font-medium text-zinc-500">Uploading and processing…</div>
    </div>
  )
}

// ─── SKU Mapping Modal ────────────────────────────────────────────────────────

interface UnmatchedEntry {
  locad_sku: string
  product_name: string
}

interface MappingModalProps {
  onClose: () => void
  onSaved: () => void
  internalSKUs: string[]
}

function MappingModal({ onClose, onSaved, internalSKUs }: MappingModalProps) {
  const [unmatched, setUnmatched] = useState<UnmatchedEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [mappings, setMappings] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.getLocadUnmatched().then(res => {
      const resAny = res as unknown as { error?: string; unmatched?: UnmatchedEntry[] }
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
      const result = await api.mapLocadSKU(locad_sku, internal_sku)
      const resultAny = result as unknown as { error?: string }
      if (resultAny.error) {
        setError(`Failed to map ${locad_sku}: ${resultAny.error}`)
        setSaving(false)
        return
      }
    }
    setSaving(false)
    onSaved()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-2xl max-h-[80vh] flex flex-col bg-white rounded-xl border border-zinc-200 shadow-xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-200">
          <div>
            <h2 className="text-base font-semibold text-zinc-900">Map Locad SKUs</h2>
            <p className="text-xs text-zinc-500 mt-0.5">Match Locad identifiers to internal SKUs</p>
          </div>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600 transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded-md mb-4">
              {error}
            </div>
          )}

          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="animate-pulse h-12 bg-zinc-100 rounded-lg" />
              ))}
            </div>
          ) : unmatched.length === 0 ? (
            <div className="py-10 text-center">
              <CheckCircle2 className="mx-auto h-10 w-10 text-green-500 mb-2" />
              <p className="text-sm font-medium text-zinc-700">All Locad SKUs mapped</p>
              <p className="text-xs text-zinc-400 mt-1">No unmatched identifiers found.</p>
            </div>
          ) : (
            <div>
              <div className="grid grid-cols-3 gap-3 text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2 px-1">
                <span>Locad SKU</span>
                <span>Product Name</span>
                <span>Internal SKU</span>
              </div>
              <div className="space-y-2">
                {unmatched.map(u => (
                  <div key={u.locad_sku} className="grid grid-cols-3 gap-3 items-center border border-zinc-200 rounded-lg px-3 py-2.5">
                    <span className="font-data text-xs text-zinc-700 truncate">{u.locad_sku}</span>
                    <span className="text-xs text-zinc-500 truncate">{u.product_name}</span>
                    <input
                      list={`sku-list-${u.locad_sku}`}
                      value={mappings[u.locad_sku] ?? ''}
                      onChange={e => setMappings(prev => ({ ...prev, [u.locad_sku]: e.target.value }))}
                      placeholder="Select SKU…"
                      className="border border-zinc-300 rounded-md px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-amber-500 font-data"
                    />
                    {internalSKUs.length > 0 && (
                      <datalist id={`sku-list-${u.locad_sku}`}>
                        {internalSKUs.map(s => <option key={s} value={s} />)}
                      </datalist>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="px-5 py-4 border-t border-zinc-200 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm text-zinc-600 hover:text-zinc-900 font-medium transition-colors">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || Object.values(mappings).every(v => !v)}
            className="px-4 py-2 text-sm font-semibold bg-amber-500 text-white rounded-md hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? 'Saving…' : 'Save Mapping'}
          </button>
        </div>
      </div>
    </div>
  )
}

function SectionCard({
  icon,
  title,
  subtitle,
  accentColor,
  children,
}: {
  icon: React.ReactNode
  title: string
  subtitle: string
  accentColor: string
  children: React.ReactNode
}) {
  return (
    <div className={`bg-white border border-zinc-200 rounded-xl shadow-sm overflow-hidden border-l-4 ${accentColor}`}>
      <div className="px-5 py-4 border-b border-zinc-200 bg-zinc-50/50 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-white rounded-lg shadow-sm text-zinc-500">{icon}</div>
          <div>
            <h2 className="text-sm font-black text-sidebar uppercase tracking-tight">{title}</h2>
            <p className="text-[10px] font-bold text-muted uppercase tracking-widest opacity-60 mt-0.5">{subtitle}</p>
          </div>
        </div>
      </div>
      {children}
    </div>
  )
}

function ResultRow({ icon, text, color }: { icon: React.ReactNode; text: string; color: string }) {
  return (
    <div className={`flex items-center gap-2 text-xs font-bold uppercase tracking-tight ${color}`}>
      {icon}
      <span>{text}</span>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function UploadPage() {
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null)
  const [statusLoading, setStatusLoading] = useState(true)
  const [showMappingModal, setShowMappingModal] = useState(false)

  const [locadUploading, setLocadUploading] = useState(false)
  const [locadResult, setLocadResult] = useState<UploadLocadResponse | null>(null)
  const [locadError, setLocadError] = useState<string | null>(null)

  const [noonUploading, setNoonUploading] = useState(false)
  const [noonResult, setNoonResult] = useState<UploadNoonResponse | null>(null)
  const [noonError, setNoonError] = useState<string | null>(null)

  const [noonInvUploading, setNoonInvUploading] = useState(false)
  const [noonInvResult, setNoonInvResult] = useState<UploadNoonInventoryResponse | null>(null)
  const [noonInvError, setNoonInvError] = useState<string | null>(null)

  const loadStatus = () => {
    setStatusLoading(true)
    api.getSyncStatus().then(res => {
      const resAny = res as unknown as { error?: string }
      if (!resAny.error) setSyncStatus(res as unknown as SyncStatus)
      setStatusLoading(false)
    })
  }

  useEffect(() => { loadStatus() }, [])

  const handleLocadUpload = async (file: File) => {
    setLocadUploading(true)
    setLocadError(null)
    setLocadResult(null)
    const res = await api.uploadLocadXLSX(file)
    setLocadUploading(false)
    const resAny = res as unknown as { error?: string }
    if (resAny.error) setLocadError(resAny.error)
    else { setLocadResult(res as unknown as UploadLocadResponse); loadStatus() }
  }

  const handleNoonUpload = async (file: File) => {
    setNoonUploading(true)
    setNoonError(null)
    setNoonResult(null)
    const res = await api.uploadNoonCSV(file)
    setNoonUploading(false)
    const resAny = res as unknown as { error?: string }
    if (resAny.error) setNoonError(resAny.error)
    else { setNoonResult(res as unknown as UploadNoonResponse); loadStatus() }
  }

  const handleNoonInvUpload = async (file: File) => {
    setNoonInvUploading(true)
    setNoonInvError(null)
    setNoonInvResult(null)
    const res = await api.uploadNoonInventory(file)
    setNoonInvUploading(false)
    const resAny = res as unknown as { error?: string }
    if (resAny.error) setNoonInvError(resAny.error)
    else { setNoonInvResult(res as unknown as UploadNoonInventoryResponse); loadStatus() }
  }

  const locadXlsx = syncStatus?.locad_xlsx
  const hasUnmapped = (locadXlsx?.rows_unmatched ?? 0) > 0

  return (
    <div className="w-full max-w-[1920px] mx-auto space-y-6 px-4 sm:px-6 lg:px-8 py-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div>
          <h1 className="text-xl lg:text-2xl font-black text-sidebar uppercase tracking-tight">Upload Center</h1>
          <p className="text-xs font-bold text-muted uppercase tracking-wider opacity-60 mt-1">Sync logistics, sales, and catalog data</p>
        </div>
        {!statusLoading && (
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 bg-white border border-border-color rounded-xl px-4 py-3 shadow-sm">
            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest">
              <span className={`w-2 h-2 rounded-full ${syncStatus?.locad_api?.status === 'connected' ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.4)]' : 'bg-zinc-300'}`} />
              <span className="text-muted">Locad API:</span>
              <span className={syncStatus?.locad_api?.status === 'connected' ? 'text-green-600' : 'text-zinc-500'}>{syncStatus?.locad_api?.status === 'connected' ? 'Connected' : 'Disconnected'}</span>
            </div>
            {hasUnmapped && (
              <button
                onClick={() => setShowMappingModal(true)}
                className="text-[10px] font-black uppercase tracking-widest text-amber-600 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-lg px-2.5 py-1.5 transition-all w-full sm:w-auto text-center"
              >
                {locadXlsx!.rows_unmatched} Mappings Required
              </button>
            )}
          </div>
        )}
      </div>

      <SectionCard 
        title="Inventory & Sales Inbound" 
        subtitle="Manage all data imports in one place" 
        icon={<Upload className="h-5 w-5" />} 
        accentColor="border-l-brand-blue"
      >
        <div className="p-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {/* 1. Locad XLSX */}
            <div className="flex flex-col h-full space-y-4 p-6 rounded-2xl bg-zinc-50/50 border border-zinc-100 hover:border-brand-blue/30 transition-all group">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 bg-white rounded-lg shadow-sm group-hover:scale-110 transition-transform">
                  <Package className="h-4 w-4 text-brand-blue" />
                </div>
                <h4 className="text-xs font-black uppercase tracking-widest text-zinc-900">Locad Inventory</h4>
              </div>
              <p className="text-[10px] text-zinc-500 uppercase font-bold leading-relaxed min-h-[30px]">
                Dashboard → Reports → Inventory Report → Export (.xlsx)
              </p>
              {locadUploading ? <UploadingZone /> : (
                <DropZone
                  accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  label="Drop Locad XLSX here"
                  onFile={handleLocadUpload}
                />
              )}
              {locadError && <p className="text-[10px] text-red-600 font-bold uppercase">{locadError}</p>}
              {locadResult && (
                <div className="space-y-1">
                  <ResultRow icon={<CheckCircle2 className="h-3 w-3" />} text={`${locadResult.rows_matched} synced`} color="text-green-600" />
                  {locadResult.rows_unmatched > 0 && <button onClick={() => setShowMappingModal(true)} className="text-[10px] font-bold text-amber-600 underline">MAP {locadResult.rows_unmatched} SKUS</button>}
                </div>
              )}
            </div>

            {/* 2. Noon Sales CSV */}
            <div className="flex flex-col h-full space-y-4 p-6 rounded-2xl bg-zinc-50/50 border border-zinc-100 hover:border-amber-500/30 transition-all group">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 bg-white rounded-lg shadow-sm group-hover:scale-110 transition-transform">
                  <Download className="h-4 w-4 text-amber-500" />
                </div>
                <h4 className="text-xs font-black uppercase tracking-widest text-zinc-900">Noon Sales</h4>
              </div>
              <p className="text-[10px] text-zinc-500 uppercase font-bold leading-relaxed min-h-[30px]">
                Noon Seller Portal → Account Health & Reports → Sales → Export
              </p>
              {noonUploading ? <UploadingZone /> : (
                <DropZone
                  accept=".csv,text/csv"
                  label="Drop Noon Sales CSV"
                  onFile={handleNoonUpload}
                />
              )}
              {noonError && <p className="text-[10px] text-red-600 font-bold uppercase">{noonError}</p>}
              {noonResult && <ResultRow icon={<CheckCircle2 className="h-3 w-3" />} text={`${noonResult.rows_processed} orders processed`} color="text-green-600" />}
            </div>

            {/* 3. Noon Inventory CSV */}
            <div className="flex flex-col h-full space-y-4 p-6 rounded-2xl bg-zinc-50/50 border border-zinc-100 hover:border-green-500/30 transition-all group">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 bg-white rounded-lg shadow-sm group-hover:scale-110 transition-transform">
                  <Package className="h-4 w-4 text-green-500" />
                </div>
                <h4 className="text-xs font-black uppercase tracking-widest text-zinc-900">Noon Inventory</h4>
              </div>
              <p className="text-[10px] text-zinc-500 uppercase font-bold leading-relaxed min-h-[30px]">
                Noon Seller Portal → FBN → My Inventory → Export
              </p>
              {noonInvUploading ? <UploadingZone /> : (
                <DropZone
                  accept=".csv,text/csv"
                  label="Drop Noon Inv CSV"
                  onFile={handleNoonInvUpload}
                />
              )}
              {noonInvError && <p className="text-[10px] text-red-600 font-bold uppercase">{noonInvError}</p>}
              {noonInvResult && <ResultRow icon={<CheckCircle2 className="h-3 w-3" />} text={`${noonInvResult.rows_matched} FBN SKUs updated`} color="text-green-600" />}
            </div>
        </div>
      </SectionCard>

      {/* Mapping Modal */}
      {showMappingModal && (
        <MappingModal
          onClose={() => setShowMappingModal(false)}
          onSaved={loadStatus}
          internalSKUs={[]}
        />
      )}
    </div>
  )
}
