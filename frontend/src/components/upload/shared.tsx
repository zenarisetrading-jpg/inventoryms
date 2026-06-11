import React, { useRef, useState } from 'react'
import { Upload, RefreshCw } from 'lucide-react'
import type { SyncStatus } from '../../types'

export function formatRelativeTime(iso: string | null | undefined): string {
  if (!iso) return 'Never'
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

export function staleness(iso: string | null | undefined): 'fresh' | 'stale' | 'old' | 'missing' {
  if (!iso) return 'missing'
  const diffHrs = (Date.now() - new Date(iso).getTime()) / 3600000
  if (diffHrs < 6) return 'fresh'
  if (diffHrs < 48) return 'stale'
  return 'old'
}

export function StatusLabel({ status }: { status: 'fresh' | 'stale' | 'old' | 'missing' | 'ok' | 'error' | 'warning' }) {
  const cfg = {
    fresh: { cls: 'bg-green-500/10 text-green-400 border-green-500/20', label: 'Fresh' },
    ok: { cls: 'bg-green-500/10 text-green-400 border-green-500/20', label: 'OK' },
    stale: { cls: 'bg-amber-500/10 text-amber-400 border-amber-500/20', label: 'Stale' },
    warning: { cls: 'bg-amber-500/10 text-amber-400 border-amber-500/20', label: 'Warning' },
    old: { cls: 'bg-red-500/10 text-red-400 border-red-500/20', label: 'Old' },
    missing: { cls: 'bg-red-500/10 text-red-400 border-red-500/20', label: 'Missing' },
    error: { cls: 'bg-red-500/10 text-red-400 border-red-500/20', label: 'Error' },
  }[status]

  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-[9px] font-black uppercase border tracking-widest ${cfg.cls}`}>
      {cfg.label}
    </span>
  )
}

export interface HealthRow {
  source: string
  type: string
  lastUpdated: string | null
  status: 'fresh' | 'stale' | 'old' | 'missing' | 'ok' | 'error' | 'warning'
  detail?: string
}

export function buildHealthRows(syncStatus: SyncStatus): HealthRow[] {
  const rows: HealthRow[] = []

  const amzStatus = syncStatus.amazon?.status === 'connected'
    ? staleness(syncStatus.amazon.last_synced) === 'missing' ? 'warning' : staleness(syncStatus.amazon.last_synced) === 'fresh' ? 'ok' : 'stale'
    : 'error'
  rows.push({ source: 'Amazon', type: 'Auto (Saddl)', lastUpdated: syncStatus.amazon?.last_synced ?? null, status: amzStatus })

  const locadTs = syncStatus.locad_api?.last_synced ?? syncStatus.locad_xlsx?.last_uploaded ?? null
  rows.push({ source: 'Locad', type: syncStatus.locad_api?.last_synced ? 'API' : 'Manual', lastUpdated: locadTs, status: staleness(locadTs) })

  const noonTs = syncStatus.noon_csv?.last_uploaded ?? null
  rows.push({ source: 'Noon Sales', type: 'Manual CSV', lastUpdated: noonTs, status: staleness(noonTs) })

  const noonInvTs = syncStatus.noon_inventory?.last_uploaded ?? null
  rows.push({ source: 'Noon Inventory', type: 'Manual CSV', lastUpdated: noonInvTs, status: staleness(noonInvTs) })

  return rows
}

export function DropZone({ accept, label, hint, onFile, disabled }: { accept: string, label: string, hint?: string, onFile: (f: File) => void, disabled?: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const handleDrop = (e: React.DragEvent) => { e.preventDefault(); setDragging(false); const file = e.dataTransfer.files[0]; if (file) onFile(file) }
  return (
    <div
      className={`border-2 border-dashed rounded-2xl px-4 py-6 text-center cursor-pointer transition-all ${
        disabled ? 'border-white/5 bg-white/5 cursor-not-allowed opacity-50' :
        dragging ? 'border-brand-amber bg-brand-amber/10' : 'border-white/10 bg-white/5 hover:border-brand-amber/50 hover:bg-white/10'
      }`}
      onDragOver={e => { e.preventDefault(); if (!disabled) setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={disabled ? undefined : handleDrop}
      onClick={() => { if (!disabled) inputRef.current?.click() }}
    >
      <input ref={inputRef} type="file" accept={accept} className="hidden" disabled={disabled} onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = '' }} />
      <Upload className={`mx-auto h-6 w-6 mb-2 ${disabled ? 'text-zinc-600' : dragging ? 'text-brand-amber' : 'text-zinc-500'}`} />
      <div className={`text-[11px] font-black uppercase tracking-tight mb-1 ${disabled ? 'text-zinc-500' : 'text-zinc-300'}`}>{label}</div>
      <div className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest">{disabled ? 'Not available' : hint ?? 'Drag/Drop or Click'}</div>
    </div>
  )
}

export function UploadingState({ label = "Processing Payload..." }: { label?: string }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-4 bg-white/5 rounded-2xl border-2 border-dashed border-white/10 min-h-[140px]">
      <RefreshCw className="h-8 w-8 text-brand-blue animate-spin" />
      <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">{label}</span>
    </div>
  )
}

export function SectionTile({ icon: Icon, title, subtitle, accent, children }: { icon: any, title: string, subtitle: string, accent: string, children: React.ReactNode }) {
  return (
    <div className={`bg-card border border-white/5 rounded-2xl shadow-2xl overflow-hidden flex flex-col border-t-4 ${accent}`}>
      <div className="px-6 py-5 border-b border-white/5 bg-white/5 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="p-2.5 bg-white/5 rounded-2xl shadow-inner text-zinc-300"><Icon className="h-5 w-5" /></div>
          <div>
            <h2 className="text-sm font-black text-white uppercase tracking-tight leading-none">{title}</h2>
            <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest opacity-60 mt-1.5">{subtitle}</p>
          </div>
        </div>
      </div>
      <div className="flex-1 p-6 flex flex-col">
        {children}
      </div>
    </div>
  )
}
