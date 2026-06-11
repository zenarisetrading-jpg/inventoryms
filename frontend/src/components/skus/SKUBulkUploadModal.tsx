import React, { useRef, useState } from 'react'
import { X } from 'lucide-react'
import { api } from '../../lib/api'

interface SKUBulkUploadModalProps {
  onClose: () => void
  onSuccess: () => void
}

export function SKUBulkUploadModal({ onClose, onSuccess }: SKUBulkUploadModalProps) {
  const [bulkFile, setBulkFile] = useState<File | null>(null)
  const [bulkUploading, setBulkUploading] = useState(false)
  const [bulkResult, setBulkResult] = useState<{ rows_processed?: number; errors?: any[]; error?: string } | null>(null)
  const [bulkError, setBulkError] = useState<string | null>(null)
  const bulkInputRef = useRef<HTMLInputElement>(null)

  const downloadTemplate = () => {
    const header = 'sku,asin,fnsku,name,category,sub_category,moq,lead_time_days,cogs,units_per_box,dimensions,weight_kg,cbm,is_active,amazon_active,noon_active,country,saddl_id'
    const example = 'SKU-001,B00EXAMP1,X00EXAMP2,Sample Item,A,Sample Sub,50,30,12.5,10,10x10x10,1.5,0.01,true,true,true,UAE,SD-001'
    const blob = new Blob([header + '\n' + example], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'sku_bulk_upload_template.csv'
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

    try {
      const res = await api.uploadSKUMasterCSV(bulkFile)
      if (res.error) throw new Error(res.error)
      
      setBulkResult(res)
      
      if (!res.errors || res.errors.length === 0) {
        onSuccess()
      }
    } catch (err: any) {
      setBulkError(`Failed to upload SKUs: ${err.message}`)
    } finally {
      setBulkUploading(false)
      if (bulkInputRef.current) bulkInputRef.current.value = ''
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-lg shadow-xl w-full max-w-lg border border-zinc-200">
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-200">
          <h2 className="text-base font-semibold text-zinc-900">Bulk SKU Upload</h2>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600 transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-5 py-5 space-y-4">
          {/* Instructions */}
          <div className="bg-zinc-50 border border-zinc-200 rounded-md p-3 text-xs text-zinc-600 space-y-1">
            <p className="font-medium text-zinc-800">CSV/XLSX Format:</p>
            <p className="overflow-x-auto whitespace-nowrap pb-1 font-mono text-zinc-500">sku, asin, fnsku, name, category, sub_category, moq, lead_time_days, cogs, units_per_box, dimensions, weight_kg, cbm, is_active, amazon_active, noon_active, country, saddl_id</p>
            <ul className="mt-1.5 space-y-0.5 list-disc list-inside text-zinc-500">
              <li><span className="font-mono text-zinc-700">sku</span> and <span className="font-mono text-zinc-700">country</span> are the unique identifiers.</li>
              <li>Existing SKUs will be updated with the new values.</li>
              <li>Unknown SKUs will be created as new entries.</li>
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
            <div className={`rounded-md px-3 py-3 text-sm space-y-1 ${(bulkResult.errors && bulkResult.errors.length > 0) ? 'bg-amber-50 border border-amber-200' : 'bg-green-50 border border-green-200'}`}>
              <div className="flex gap-4 font-medium text-zinc-800">
                <span>Processed: <span className="text-green-700">{bulkResult.rows_processed || 0}</span></span>
                {bulkResult.errors && bulkResult.errors.length > 0 && <span>Errors: <span className="text-red-700">{bulkResult.errors.length}</span></span>}
              </div>
              {bulkResult.errors?.filter(e => e.row === -1).map((e, i) => (
                <p key={i} className="text-xs text-zinc-500">{e.message}</p>
              ))}
              {bulkResult.errors && bulkResult.errors.length > 0 && (
                 <p className="text-xs text-red-700">See first error: {bulkResult.errors[0].message}</p>
              )}
            </div>
          )}

          <button
            onClick={handleBulkUpload}
            disabled={!bulkFile || bulkUploading}
            className="w-full py-2.5 text-sm font-semibold bg-emerald-600 text-white rounded-md hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-95"
          >
            {bulkUploading ? 'Uploading…' : 'Upload File'}
          </button>
        </div>
      </div>
    </div>
  )
}
