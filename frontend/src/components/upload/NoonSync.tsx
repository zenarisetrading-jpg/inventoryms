import React from 'react'
import { Layers, History, Database, CheckCircle2 } from 'lucide-react'
import { SectionTile, DropZone, UploadingState } from './shared'
import type { UploadNoonResponse, UploadNoonInventoryResponse } from '../../types'

interface NoonSyncProps {
  noonSalesState: { loading: boolean, error: string | null, result: UploadNoonResponse | null }
  noonInvState: { loading: boolean, error: string | null, result: UploadNoonInventoryResponse | null }
  handleUpload: (type: 'noon-sales' | 'noon-inv', file: File) => void
}

export function NoonSync({ noonSalesState, noonInvState, handleUpload }: NoonSyncProps) {
  return (
    <SectionTile 
      icon={Layers} 
      title="Noon Marketplace Sync" 
      subtitle="Sales velocity & FBN inventory payloads"
      accent="border-t-amber-500"
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 h-full">
        <div className="flex flex-col h-full">
          <div className="flex items-center gap-2 mb-3">
            <History className="h-3.5 w-3.5 text-amber-500" />
            <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Sales Data</span>
          </div>
          {noonSalesState.loading ? <UploadingState /> : (
            <DropZone 
              accept=".csv,text/csv"
              label="Sales CSV"
              hint="Account Health → Sales"
              onFile={(f) => handleUpload('noon-sales', f)}
            />
          )}
          {noonSalesState.result && (
            <div className="mt-2 flex flex-col gap-1 bg-green-500/10 px-2 py-1.5 rounded-lg border border-green-500/10">
              <div className="text-green-400 text-[9px] font-black uppercase flex items-center gap-1.5">
                <CheckCircle2 className="h-2.5 w-2.5" /> {noonSalesState.result.rows_processed} Orders
              </div>
              {(noonSalesState.result as any).message ? (
                <div className="text-yellow-400/80 text-[8px] font-bold uppercase flex items-center gap-1.5">
                  <Database className="h-2.5 w-2.5" /> {(noonSalesState.result as any).message}
                </div>
              ) : (noonSalesState.result as any).raw_rows_inserted !== undefined && (
                <div className="text-green-400/60 text-[8px] font-bold uppercase flex items-center gap-1.5">
                  <Database className="h-2.5 w-2.5" /> {(noonSalesState.result as any).raw_rows_inserted} Raw Saved
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-col h-full">
          <div className="flex items-center gap-2 mb-3">
            <Database className="h-3.5 w-3.5 text-green-500" />
            <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">FBN Inventory</span>
          </div>
          {noonInvState.loading ? <UploadingState label="Syncing Inventory..." /> : (
            <DropZone 
              accept=".csv,text/csv"
              label="Inventory CSV"
              hint="FBN → My Inventory"
              onFile={(f) => handleUpload('noon-inv', f)}
            />
          )}
          {noonInvState.result && <div className="mt-2 text-green-400 text-[9px] font-black uppercase">{noonInvState.result.rows_matched} SKUs</div>}
        </div>
      </div>
      {noonSalesState.result?.errors && noonSalesState.result.errors.length > 0 && (
        <div className="mt-4 p-4 bg-red-500/10 border border-red-500/20 rounded-2xl">
          <div className="text-red-400 text-[10px] font-black uppercase mb-2">Upload Errors ({noonSalesState.result.errors.length})</div>
          <ul className="text-red-300 text-[9px] font-bold list-disc pl-4 space-y-1 max-h-32 overflow-y-auto custom-scrollbar">
            {noonSalesState.result.errors.map((e, i) => (
              <li key={i}>Row {e.row}: {e.message}</li>
            ))}
          </ul>
        </div>
      )}
      {noonSalesState.error && <div className="mt-4 text-red-400 text-[10px] font-black uppercase">{noonSalesState.error}</div>}
      {noonInvState.error && <div className="mt-4 text-red-400 text-[10px] font-black uppercase">{noonInvState.error}</div>}
    </SectionTile>
  )
}
