import React, { useState } from 'react'
import { Layers, History, Database, CheckCircle2, RefreshCw, Zap, AlertTriangle } from 'lucide-react'
import { SectionTile, DropZone, UploadingState } from './shared'
import { api } from '../../lib/api'
import type { UploadNoonResponse, UploadNoonInventoryResponse } from '../../types'

interface NoonSyncProps {
  noonSalesState: { loading: boolean, error: string | null, result: UploadNoonResponse | null }
  noonInvState: { loading: boolean, error: string | null, result: UploadNoonInventoryResponse | null }
  handleUpload: (type: 'noon-sales' | 'noon-inv', file: File) => void
}

export function NoonSync({ noonSalesState, noonInvState, handleUpload }: NoonSyncProps) {
  const [apiSyncing, setApiSyncing] = useState(false)
  const [apiSyncSuccess, setApiSyncSuccess] = useState<string | null>(null)
  const [apiSyncError, setApiSyncError] = useState<string | null>(null)

  const handleApiSync = async () => {
    setApiSyncing(true)
    setApiSyncSuccess(null)
    setApiSyncError(null)
    try {
      const res = await api.syncNoonInventory()
      if ((res as any).errors?.length && !(res as any).skus_processed) {
        setApiSyncError((res as any).errors[0])
      } else {
        const count = (res as any).skus_processed ?? 0
        const notice = (res as any).errors?.length ? ` (${(res as any).errors[0]})` : ''
        setApiSyncSuccess(`Synced ${count} SKUs from Noon API${notice}`)
      }
    } catch (err: any) {
      setApiSyncError(err.message || 'Failed to sync from Noon API')
    } finally {
      setApiSyncing(false)
    }
  }

  return (
    <SectionTile 
      icon={Layers} 
      title="Noon Marketplace Sync" 
      subtitle="Sales velocity & FBN automated API inventory"
      accent="border-t-amber-500"
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 h-full">
        {/* Sales Column */}
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

        {/* FBN Inventory Column (Automated API + CSV fallback) */}
        <div className="flex flex-col h-full">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Database className="h-3.5 w-3.5 text-green-500" />
              <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">FBN Inventory</span>
            </div>
            <span className="text-[8px] font-bold text-amber-400/80 uppercase tracking-wider bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">
              Source of Truth: API
            </span>
          </div>

          {/* Primary Action: Direct API Pull */}
          <div className="p-3 bg-zinc-900/60 border border-zinc-800 rounded-xl mb-3">
            <div className="flex items-center justify-between gap-2 mb-2">
              <div>
                <div className="text-[10px] font-bold text-zinc-200 flex items-center gap-1.5">
                  <Zap className="h-3 w-3 text-amber-400" /> Automated Daily Pull
                </div>
                <div className="text-[9px] text-zinc-500">
                  Fetches live FBN saleable stock from Saddl (schema noon_api)
                </div>
              </div>
              <button
                type="button"
                onClick={handleApiSync}
                disabled={apiSyncing || noonInvState.loading}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 text-black font-black text-[9px] uppercase tracking-wider rounded-lg hover:bg-amber-400 transition-all disabled:opacity-50 shrink-0"
              >
                <RefreshCw className={`h-3 w-3 ${apiSyncing ? 'animate-spin' : ''}`} />
                {apiSyncing ? 'Syncing...' : 'Sync via API'}
              </button>
            </div>

            {apiSyncSuccess && (
              <div className="mt-2 text-[9px] font-bold text-green-400 bg-green-500/10 border border-green-500/20 px-2 py-1 rounded flex items-center gap-1.5">
                <CheckCircle2 className="h-2.5 w-2.5 shrink-0" />
                <span>{apiSyncSuccess}</span>
              </div>
            )}
            {apiSyncError && (
              <div className="mt-2 text-[9px] font-bold text-red-400 bg-red-500/10 border border-red-500/20 px-2 py-1 rounded flex items-center gap-1.5">
                <AlertTriangle className="h-2.5 w-2.5 shrink-0" />
                <span>{apiSyncError}</span>
              </div>
            )}
          </div>

          {/* Fallback Action: Manual CSV */}
          <div className="text-[8px] font-black uppercase tracking-wider text-zinc-500 mb-1">
            Manual CSV Fallback
          </div>
          {noonInvState.loading ? <UploadingState label="Syncing Inventory..." /> : (
            <DropZone 
              accept=".csv,text/csv"
              label="Inventory CSV"
              hint="FBN → My Inventory"
              onFile={(f) => handleUpload('noon-inv', f)}
            />
          )}
          {noonInvState.result && (
            <div className="mt-2 text-green-400 text-[9px] font-black uppercase">
              {noonInvState.result.rows_matched} SKUs Uploaded via CSV
            </div>
          )}
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
