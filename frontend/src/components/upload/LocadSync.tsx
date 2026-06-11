import React from 'react'
import { Package, CheckCircle2, RefreshCw } from 'lucide-react'
import { SectionTile, DropZone } from './shared'
import type { SyncStatus, UploadLocadResponse } from '../../types'

interface LocadSyncProps {
  locadState: { loading: boolean, error: string | null, result: UploadLocadResponse | null }
  syncStatus: SyncStatus | null
  handleUpload: (type: 'locad', file: File) => void
  setShowMappingModal: (v: boolean) => void
}

export function LocadSync({ locadState, syncStatus, handleUpload, setShowMappingModal }: LocadSyncProps) {
  return (
    <SectionTile 
      icon={Package} 
      title="Locad Logistics Sync" 
      subtitle="Inventory reports & warehouse matching"
      accent="border-t-brand-blue"
    >
      <div className="flex flex-col h-full space-y-6">
        <div className="flex-1">
          <p className="text-[10px] text-zinc-500 uppercase font-bold leading-relaxed mb-4 tracking-wider">
            Reports → Inventory Report → Export (.xlsx)
          </p>
          {locadState.loading ? (
            <div className="h-32 flex flex-col items-center justify-center gap-4 bg-white/5 rounded-2xl border-2 border-dashed border-white/10">
              <RefreshCw className="h-8 w-8 text-brand-blue animate-spin" />
              <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Processing Payload...</span>
            </div>
          ) : (
            <DropZone 
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              label="Drop Locad XLSX"
              onFile={(f) => handleUpload('locad', f)}
            />
          )}
        </div>

        <div className="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/5">
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Unmapped SKUs</span>
            <span className={`text-xl font-black ${(syncStatus?.locad_xlsx?.rows_unmatched ?? 0) > 0 ? 'text-amber-400' : 'text-green-400'}`}>
              {syncStatus?.locad_xlsx?.rows_unmatched ?? 0}
            </span>
          </div>
          <button 
            onClick={() => setShowMappingModal(true)}
            disabled={(syncStatus?.locad_xlsx?.rows_unmatched ?? 0) === 0}
            className="px-6 py-2.5 bg-white/5 border border-white/10 rounded-2xl text-[10px] font-black uppercase tracking-widest text-white hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
          >
            Mapping Manager
          </button>
        </div>
        
        {locadState.result && (
          <div className="flex items-center gap-2 text-green-400 text-[10px] font-black uppercase tracking-widest bg-green-500/10 px-3 py-2 rounded-lg">
            <CheckCircle2 className="h-3 w-3" /> {locadState.result.rows_matched} SKUs Synchronized
          </div>
        )}
        {locadState.error && <div className="text-red-400 text-[10px] font-black uppercase tracking-widest">{locadState.error}</div>}
      </div>
    </SectionTile>
  )
}
