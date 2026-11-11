import React, { useState } from 'react'
import { Layers, History, Activity, Database, CheckCircle2, RefreshCw, Zap, AlertTriangle } from 'lucide-react'
import { SectionTile, DropZone, UploadingState } from './shared'
import { api } from '../../lib/api'
import type { UploadNoonResponse, UploadNoonInventoryResponse } from '../../types'

interface NoonSyncProps {
  noonSalesState: { loading: boolean, error: string | null, result: UploadNoonResponse | null }
  minutesState: { loading: boolean, error: string | null, result: UploadNoonResponse | null }
  noonInvState: { loading: boolean, error: string | null, result: UploadNoonInventoryResponse | null }
  handleUpload: (type: 'noon-sales' | 'noon-inv' | 'minutes', file: File) => void
  onApiSyncComplete?: () => void
}

export function NoonSync({
  noonSalesState,
  minutesState,
  noonInvState,
  handleUpload,
  onApiSyncComplete,
}: NoonSyncProps) {
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
        onApiSyncComplete?.()
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
      subtitle="Noon Core & Minutes Sales • FBN Automated API & File Inventory"
      accent="border-t-amber-500"
    >
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 h-full">
        {/* 1. Noon Core Sales Data */}
        <div className="flex flex-col h-full">
          <div className="flex items-center justify-between min-h-[24px] mb-3">
            <div className="flex items-center gap-2">
              <History className="h-3.5 w-3.5 text-amber-500" />
              <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Noon Core Sales Data</span>
            </div>
            <span className="text-[8px] font-bold text-amber-400/80 uppercase tracking-wider bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">
              Core Feed
            </span>
          </div>

          {noonSalesState.loading ? (
            <UploadingState label="Uploading Core Sales..." />
          ) : (
            <DropZone
              accept=".csv,text/csv"
              label="Sales CSV"
              hint="Account Health → Sales"
              onFile={(f) => handleUpload('noon-sales', f)}
            />
          )}

          {noonSalesState.result && (
            <div className="mt-2 flex flex-col gap-1 bg-green-500/10 px-2.5 py-2 rounded-lg border border-green-500/10">
              <div className="text-green-400 text-[9px] font-black uppercase flex items-center gap-1.5">
                <CheckCircle2 className="h-2.5 w-2.5 shrink-0" /> {noonSalesState.result.rows_processed} Orders
              </div>
              {(noonSalesState.result as any).message ? (
                <div className="text-yellow-400/80 text-[8px] font-bold uppercase flex items-center gap-1.5">
                  <Database className="h-2.5 w-2.5 shrink-0" /> {(noonSalesState.result as any).message}
                </div>
              ) : (noonSalesState.result as any).raw_rows_inserted !== undefined && (
                <div className="text-green-400/60 text-[8px] font-bold uppercase flex items-center gap-1.5">
                  <Database className="h-2.5 w-2.5 shrink-0" /> {(noonSalesState.result as any).raw_rows_inserted} Raw Saved
                </div>
              )}
            </div>
          )}
          {noonSalesState.error && (
            <div className="mt-2 text-red-400 text-[9px] font-black uppercase bg-red-500/10 border border-red-500/20 px-2.5 py-1.5 rounded-lg">
              {noonSalesState.error}
            </div>
          )}
        </div>

        {/* 2. Noon Minutes Sales Data */}
        <div className="flex flex-col h-full">
          <div className="flex items-center justify-between min-h-[24px] mb-3">
            <div className="flex items-center gap-2">
              <Activity className="h-3.5 w-3.5 text-purple-400" />
              <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Noon Minutes Sales Data</span>
            </div>
            <span className="text-[8px] font-bold text-purple-400/90 uppercase tracking-wider bg-purple-500/10 px-1.5 py-0.5 rounded border border-purple-500/20">
              Quick-Commerce
            </span>
          </div>

          {minutesState.loading ? (
            <UploadingState label="Injecting Minutes Data..." />
          ) : (
            <DropZone
              accept=".csv,text/csv"
              label="Minutes Sales CSV"
              hint="Minutes Export → CSV Feed"
              onFile={(f) => handleUpload('minutes', f)}
            />
          )}

          {minutesState.result && (
            <div className="mt-2 flex flex-col gap-1 bg-green-500/10 px-2.5 py-2 rounded-lg border border-green-500/10">
              <div className="text-green-400 text-[9px] font-black uppercase flex items-center gap-1.5">
                <CheckCircle2 className="h-2.5 w-2.5 shrink-0" /> {minutesState.result.rows_processed} Orders Injected
              </div>
              {(minutesState.result as any).message ? (
                <div className="text-yellow-400/80 text-[8px] font-bold uppercase flex items-center gap-1.5">
                  <Database className="h-2.5 w-2.5 shrink-0" /> {(minutesState.result as any).message}
                </div>
              ) : (minutesState.result as any).raw_rows_inserted !== undefined && (
                <div className="text-green-400/60 text-[8px] font-bold uppercase flex items-center gap-1.5">
                  <Database className="h-2.5 w-2.5 shrink-0" /> {(minutesState.result as any).raw_rows_inserted} Raw Saved
                </div>
              )}
            </div>
          )}
          {minutesState.error && (
            <div className="mt-2 text-red-400 text-[9px] font-black uppercase bg-red-500/10 border border-red-500/20 px-2.5 py-1.5 rounded-lg">
              {minutesState.error}
            </div>
          )}
        </div>

        {/* 3. FBN Inventory API Sync */}
        <div className="flex flex-col h-full">
          <div className="flex items-center justify-between min-h-[24px] mb-3">
            <div className="flex items-center gap-2">
              <Zap className="h-3.5 w-3.5 text-amber-400" />
              <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">FBN Inventory API Sync</span>
            </div>
            <span className="text-[8px] font-bold text-amber-400/80 uppercase tracking-wider bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">
              Source of Truth: API
            </span>
          </div>

          <div className="flex-1 flex flex-col items-center justify-between min-h-[148px] bg-white/5 border border-white/10 rounded-2xl px-4 py-5 text-center">
            <div className="flex flex-col items-center">
              <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20 mb-2">
                <Zap className="h-4 w-4 text-amber-400" />
              </div>
              <div className="text-[11px] font-black text-zinc-200 uppercase tracking-tight mb-1">
                Automated Daily Pull
              </div>
              <div className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider leading-relaxed">
                Live FBN &amp; Minutes stock via Saddl (noon_api)
              </div>
            </div>

            <button
              type="button"
              onClick={handleApiSync}
              disabled={apiSyncing || noonInvState.loading}
              className="mt-3 w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-amber-500 text-black font-black text-[10px] uppercase tracking-wider rounded-xl hover:bg-amber-400 transition-all disabled:opacity-50"
            >
              <RefreshCw className={`h-3 w-3 ${apiSyncing ? 'animate-spin' : ''}`} />
              {apiSyncing ? 'Syncing via API...' : 'Sync via API'}
            </button>
          </div>

          {apiSyncSuccess && (
            <div className="mt-2 text-[9px] font-bold text-green-400 bg-green-500/10 border border-green-500/20 px-2.5 py-1.5 rounded-lg flex items-center gap-1.5">
              <CheckCircle2 className="h-2.5 w-2.5 shrink-0" />
              <span>{apiSyncSuccess}</span>
            </div>
          )}
          {apiSyncError && (
            <div className="mt-2 text-[9px] font-bold text-red-400 bg-red-500/10 border border-red-500/20 px-2.5 py-1.5 rounded-lg flex items-center gap-1.5">
              <AlertTriangle className="h-2.5 w-2.5 shrink-0" />
              <span>{apiSyncError}</span>
            </div>
          )}
        </div>

        {/* 4. File Sync */}
        <div className="flex flex-col h-full">
          <div className="flex items-center justify-between min-h-[24px] mb-3">
            <div className="flex items-center gap-2">
              <Database className="h-3.5 w-3.5 text-green-500" />
              <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">File Sync</span>
            </div>
            <span className="text-[8px] font-bold text-zinc-400 uppercase tracking-wider bg-white/5 px-1.5 py-0.5 rounded border border-white/10">
              CSV Fallback
            </span>
          </div>

          {noonInvState.loading ? (
            <UploadingState label="Syncing Inventory..." />
          ) : (
            <DropZone
              accept=".csv,text/csv"
              label="Inventory CSV"
              hint="FBN → My Inventory"
              onFile={(f) => handleUpload('noon-inv', f)}
            />
          )}

          {noonInvState.result && (
            <div className="mt-2 flex items-center gap-1.5 text-green-400 text-[9px] font-black uppercase bg-green-500/10 border border-green-500/10 px-2.5 py-2 rounded-lg">
              <CheckCircle2 className="h-2.5 w-2.5 shrink-0" />
              <span>{noonInvState.result.rows_matched} SKUs Uploaded via CSV</span>
            </div>
          )}
          {noonInvState.error && (
            <div className="mt-2 text-red-400 text-[9px] font-black uppercase bg-red-500/10 border border-red-500/20 px-2.5 py-1.5 rounded-lg">
              {noonInvState.error}
            </div>
          )}
        </div>
      </div>

      {/* Row-level CSV parsing errors */}
      {noonSalesState.result?.errors && noonSalesState.result.errors.length > 0 && (
        <div className="mt-4 p-4 bg-red-500/10 border border-red-500/20 rounded-2xl">
          <div className="text-red-400 text-[10px] font-black uppercase mb-2">
            Noon Core Sales Upload Errors ({noonSalesState.result.errors.length})
          </div>
          <ul className="text-red-300 text-[9px] font-bold list-disc pl-4 space-y-1 max-h-32 overflow-y-auto custom-scrollbar">
            {noonSalesState.result.errors.map((e, i) => (
              <li key={i}>Row {e.row}: {e.message}</li>
            ))}
          </ul>
        </div>
      )}

      {minutesState.result?.errors && minutesState.result.errors.length > 0 && (
        <div className="mt-4 p-4 bg-red-500/10 border border-red-500/20 rounded-2xl">
          <div className="text-red-400 text-[10px] font-black uppercase mb-2">
            Noon Minutes Sales Upload Errors ({minutesState.result.errors.length})
          </div>
          <ul className="text-red-300 text-[9px] font-bold list-disc pl-4 space-y-1 max-h-32 overflow-y-auto custom-scrollbar">
            {minutesState.result.errors.map((e, i) => (
              <li key={i}>Row {e.row}: {e.message}</li>
            ))}
          </ul>
        </div>
      )}
    </SectionTile>
  )
}
