import React from 'react'
import { Activity, Database, CheckCircle2 } from 'lucide-react'
import { SectionTile, DropZone, UploadingState } from './shared'
import type { UploadNoonResponse } from '../../types'

interface MinutesSyncProps {
  minutesState: { loading: boolean, error: string | null, result: UploadNoonResponse | null }
  handleUpload: (type: 'minutes', file: File) => void
}

export function MinutesSync({ minutesState, handleUpload }: MinutesSyncProps) {
  return (
    <SectionTile 
      icon={Activity} 
      title="Minutes & Micro-Sales" 
      subtitle="Quick-commerce & secondary payloads"
      accent="border-t-purple-500"
    >
      <div className="flex flex-col h-full space-y-6">
        <div className="flex-1">
          <p className="text-[10px] text-zinc-500 uppercase font-bold leading-relaxed mb-4 tracking-wider">
            Minutes Sales Export → CSV Feed
          </p>
          {minutesState.loading ? <UploadingState label="Injecting Minutes Data..." /> : (
            <DropZone 
              accept=".csv,text/csv"
              label="Drop Minutes CSV"
              onFile={(f) => handleUpload('minutes', f)}
            />
          )}
        </div>
        
        <div className="p-4 bg-white/5 rounded-2xl border border-white/5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-1.5 h-1.5 rounded-full bg-purple-500 animate-pulse" />
            <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Channel Resolution</span>
          </div>
          <span className="text-[10px] font-black text-white uppercase tracking-widest">High Precision</span>
        </div>

        {minutesState.result && (
          <div className="flex flex-col gap-2 bg-green-500/10 px-3 py-2 rounded-lg">
            <div className="flex items-center gap-2 text-green-400 text-[10px] font-black uppercase tracking-widest">
              <CheckCircle2 className="h-3 w-3" /> {minutesState.result.rows_processed} Orders Injected
            </div>
            {(minutesState.result as any).message ? (
              <div className="flex items-center gap-2 text-yellow-400/80 text-[9px] font-bold uppercase tracking-widest">
                <Database className="h-3 w-3" /> {(minutesState.result as any).message}
              </div>
            ) : (minutesState.result as any).raw_rows_inserted !== undefined && (
              <div className="flex items-center gap-2 text-green-400/70 text-[9px] font-bold uppercase tracking-widest">
                <Database className="h-3 w-3" /> {(minutesState.result as any).raw_rows_inserted} Raw Rows Saved
              </div>
            )}
          </div>
        )}
        {minutesState.result?.errors && minutesState.result.errors.length > 0 && (
          <div className="mt-4 p-4 bg-red-500/10 border border-red-500/20 rounded-2xl">
            <div className="text-red-400 text-[10px] font-black uppercase mb-2">Upload Errors ({minutesState.result.errors.length})</div>
            <ul className="text-red-300 text-[9px] font-bold list-disc pl-4 space-y-1 max-h-32 overflow-y-auto custom-scrollbar">
              {minutesState.result.errors.map((e, i) => (
                <li key={i}>Row {e.row}: {e.message}</li>
              ))}
            </ul>
          </div>
        )}
        {minutesState.error && <div className="text-red-400 text-[10px] font-black uppercase tracking-widest">{minutesState.error}</div>}
      </div>
    </SectionTile>
  )
}
