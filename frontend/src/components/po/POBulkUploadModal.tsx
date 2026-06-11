import React, { useRef, useState } from 'react'
import { X } from 'lucide-react'
import { api } from '../../lib/api'
import type { UploadPOResponse } from '../../types'

interface POBulkUploadModalProps {
  onClose: () => void
  onSuccess: () => void
}

export function POBulkUploadModal({ onClose, onSuccess }: POBulkUploadModalProps) {
  const [bulkFile, setBulkFile] = useState<File | null>(null)
  const [bulkUploading, setBulkUploading] = useState(false)
  const [bulkResult, setBulkResult] = useState<UploadPOResponse | null>(null)
  const [bulkError, setBulkError] = useState<string | null>(null)
  const bulkInputRef = useRef<HTMLInputElement>(null)

  const downloadTemplate = () => {
    const header = 'po_number,po_name,supplier,country,order_date,eta,status,po_notes,notes,sku,units_ordered,units_received'
    const example = [
      'PO-001,Spring Batch,Shenzhen Supplier,UAE,2026-03-01,2026-04-01,ordered,Main summer batch notes,Item notes for straw lid,32OZSTRAWLIDBLACK,500,0',
      'PO-001,Spring Batch,Shenzhen Supplier,UAE,2026-03-01,2026-04-01,ordered,Main summer batch notes,Item notes for water bottle,WB750MLBLACK,300,0',
      'PO-002,Summer Refresh,Another Supplier,KSA,2026-03-10,2026-04-15,draft,Urgent shipment,Specific notes for navy blue,32OZWBNAVYBLUE,250,0',
    ].join('\n')
    const blob = new Blob([header + '\n' + example], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'po_bulk_upload_template.csv'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    setTimeout(() => {
      URL.revokeObjectURL(url)
    }, 100)
  }

  const handleBulkUpload = async () => {
    if (!bulkFile) return
    setBulkUploading(true)
    setBulkResult(null)
    setBulkError(null)
    const result = await api.uploadPOCSV(bulkFile)
    const resultAny = result as unknown as { error?: string }
    if (resultAny.error) {
      setBulkError(resultAny.error)
      setBulkUploading(false)
      return
    }
    setBulkResult(result)
    setBulkUploading(false)
    if (result.pos_created > 0 || (result.pos_merged && result.pos_merged > 0)) {
      onSuccess()
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-lg shadow-xl w-full max-w-lg border border-zinc-200">
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-200">
          <h2 className="text-base font-semibold text-zinc-900">Bulk PO Upload</h2>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600 transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-5 py-5 space-y-4">
          {/* Instructions */}
          <div className="bg-zinc-50 border border-zinc-200 rounded-md p-3 text-xs text-zinc-600 space-y-1">
            <p className="font-medium text-zinc-800">CSV/XLSX Format — one row per line item:</p>
            <p><span className="font-mono text-zinc-500">po_number, po_name, supplier, order_date, eta, status, po_notes, notes, sku, units_ordered, units_received</span></p>
            <ul className="mt-1.5 space-y-0.5 list-disc list-inside text-zinc-500">
              <li>Repeat <span className="font-mono text-zinc-700">po_number</span>, <span className="font-mono text-zinc-700">po_name</span> and <span className="font-mono text-zinc-700">po_notes</span> for each SKU in the same PO</li>
              <li><span className="font-mono text-zinc-700">po_notes</span>: General PO-level notes (applies to whole PO)</li>
              <li><span className="font-mono text-zinc-700">notes</span>: SKU/item-level notes (specific to this line item)</li>
              <li><span className="font-mono text-zinc-700">status</span>: draft, ordered, shipped, arrived, closed, cancelled (defaults to draft)</li>
              <li>Existing PO numbers are skipped (no overwrite)</li>
              <li>Unknown SKUs within a PO are skipped; rest still imports</li>
            </ul>
          </div>

          <button
            type="button"
            onClick={downloadTemplate}
            className="text-sm text-blue-600 hover:text-blue-800 font-medium underline underline-offset-2 transition-colors"
          >
            Download template CSV
          </button>

          {/* File picker */}
          <div
            onClick={() => bulkInputRef.current?.click()}
            className="border-2 border-dashed border-zinc-300 hover:border-amber-400 bg-zinc-50 hover:bg-zinc-100 rounded-md px-4 py-6 text-center cursor-pointer transition-all"
          >
            <input
              ref={bulkInputRef}
              type="file"
              accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
              className="hidden"
              onChange={e => { setBulkFile(e.target.files?.[0] ?? null); setBulkResult(null) }}
            />
            {bulkFile ? (
              <p className="text-sm text-zinc-700 font-medium">{bulkFile.name}</p>
            ) : (
              <p className="text-sm text-zinc-400">Click to select a CSV or XLSX file</p>
            )}
          </div>

          {/* Result */}
          {bulkError && (
            <div className="rounded-md px-3 py-3 text-sm bg-red-50 border border-red-200 text-red-700">
              {bulkError}
            </div>
          )}

          {bulkResult && (
            <div className={`rounded-md px-3 py-3 text-sm space-y-1 ${bulkResult.pos_created > 0 ? 'bg-green-50 border border-green-200' : 'bg-amber-50 border border-amber-200'}`}>
              <div className="flex gap-4 font-medium text-zinc-800">
                <span>Created: <span className="text-green-700">{bulkResult.pos_created}</span></span>
                {!!bulkResult.pos_merged && <span>Merged: <span className="text-blue-700">{bulkResult.pos_merged}</span></span>}
                <span>Skipped: <span className="text-amber-700">{bulkResult.pos_skipped}</span></span>
                {bulkResult.pos_failed > 0 && <span>Failed: <span className="text-red-700">{bulkResult.pos_failed}</span></span>}
                <span className="text-zinc-500">({bulkResult.rows_processed} rows)</span>
              </div>
              {bulkResult.merged_pos && bulkResult.merged_pos.length > 0 && (
                <p className="text-xs text-blue-700">Merged into existing POs: {bulkResult.merged_pos.join(', ')}</p>
              )}
              {bulkResult.skipped_pos && bulkResult.skipped_pos.length > 0 && (
                <p className="text-xs text-amber-700">Already exist: {bulkResult.skipped_pos.join(', ')}</p>
              )}
              {bulkResult.failed_pos && bulkResult.failed_pos.length > 0 && bulkResult.failed_pos.map((f, i) => (
                <p key={i} className="text-xs text-red-700">{f.po_number}: {f.reason}</p>
              ))}
              {bulkResult.errors && bulkResult.errors.filter(e => e.row === -1).map((e, i) => (
                <p key={i} className="text-xs text-zinc-500">{e.message}</p>
              ))}
            </div>
          )}

          <button
            onClick={handleBulkUpload}
            disabled={!bulkFile || bulkUploading}
            className="w-full py-2.5 text-sm font-semibold bg-amber-500 text-white rounded-md hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-95"
          >
            {bulkUploading ? 'Uploading…' : 'Upload File'}
          </button>
        </div>
      </div>
    </div>
  )
}
