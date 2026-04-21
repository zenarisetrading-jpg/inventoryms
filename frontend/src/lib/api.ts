import type {
  CommandCenterResponse,
  SKUListItem,
  SKUDetailResponse,
  PO,
  CreatePOInput,
  UploadNoonResponse,
  UploadLocadResponse,
  UploadNoonInventoryResponse,
  UploadPOResponse,
  SyncStatus,
  SyncResponse,
  PlanningResponse,
  AnalyticsResponse,
} from '../types'

const BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`
const HEADERS = {
  Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
  'Content-Type': 'application/json',
}

interface SKUListResponse {
  skus: SKUListItem[]
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let message = `HTTP ${res.status}`
    try {
      const body = await res.json()
      message = body.error ?? body.message ?? message
    } catch {
      // ignore parse errors
    }
    throw new Error(message)
  }
  return res.json() as Promise<T>
}

function buildQuery(params: Record<string, string | undefined>): string {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== '')
  if (entries.length === 0) return ''
  return '?' + entries.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v as string)}`).join('&')
}

export const api = {
  getCommandCenter: (): Promise<CommandCenterResponse> =>
    fetch(`${BASE}/dashboard`, { headers: HEADERS })
      .then(r => handleResponse<CommandCenterResponse>(r))
      .catch(err => ({ error: err.message } as unknown as CommandCenterResponse)),

  getSKUs: (params?: { search?: string; category?: string; flag?: string }): Promise<SKUListResponse> =>
    fetch(`${BASE}/skus${buildQuery(params ?? {})}`, { headers: HEADERS })
      .then(r => handleResponse<SKUListResponse>(r))
      .catch(err => ({ error: err.message } as unknown as SKUListResponse)),

  getSKU: (sku: string): Promise<SKUDetailResponse> =>
    fetch(`${BASE}/skus/${encodeURIComponent(sku)}`, { headers: HEADERS })
      .then(r => handleResponse<SKUDetailResponse>(r))
      .catch(err => ({ error: err.message } as unknown as SKUDetailResponse)),

  getPOs: (params?: { status?: string; sku?: string; supplier?: string }): Promise<{ pos: PO[] }> =>
    fetch(`${BASE}/po${buildQuery(params ?? {})}`, { headers: HEADERS })
      .then(r => handleResponse<{ pos: PO[] }>(r))
      .catch(err => ({ error: err.message } as unknown as { pos: PO[] })),

  getSuppliers: (): Promise<{ suppliers: string[] }> =>
    fetch(`${BASE}/po/suppliers`, { headers: HEADERS })
      .then(r => handleResponse<{ suppliers: string[] }>(r))
      .catch(err => ({ error: err.message } as unknown as { suppliers: string[] })),

  createPO: (data: CreatePOInput): Promise<PO> =>
    fetch(`${BASE}/po`, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify(data),
    })
      .then(r => handleResponse<PO>(r))
      .catch(err => ({ error: err.message } as unknown as PO)),

  updatePO: (id: string, data: Partial<PO>): Promise<PO> =>
    fetch(`${BASE}/po/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: HEADERS,
      body: JSON.stringify(data),
    })
      .then(r => handleResponse<PO>(r))
      .catch(err => ({ error: err.message } as unknown as PO)),

  classifySkus: (): Promise<{ ok: true; total_classified: number; A: number; B: number; C: number }> =>
    fetch(`${BASE}/skus/classify`, { method: 'POST', headers: HEADERS })
      .then(r => handleResponse<{ ok: true; total_classified: number; A: number; B: number; C: number }>(r))
      .catch(err => ({ error: err.message } as unknown as { ok: true; total_classified: number; A: number; B: number; C: number })),

  createSKU: (data: any): Promise<{ ok: true }> =>
    fetch(`${BASE}/skus`, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify(data),
    })
      .then(r => handleResponse<{ ok: true }>(r))
      .catch(err => ({ error: err.message } as unknown as { ok: true })),

  updateSKU: (sku: string, data: { category?: string | null; moq?: number | null; lead_time_days?: number | null; cogs?: number | null; units_per_box?: number | null; is_active?: boolean }): Promise<{ ok: true }> =>
    fetch(`${BASE}/skus/${encodeURIComponent(sku)}`, {
      method: 'PATCH',
      headers: HEADERS,
      body: JSON.stringify(data),
    })
      .then(r => handleResponse<{ ok: true }>(r))
      .catch(err => ({ error: err.message } as unknown as { ok: true })),

  uploadNoonCSV: (file: File): Promise<UploadNoonResponse> => {
    const form = new FormData()
    form.append('file', file)
    return fetch(`${BASE}/upload-noon`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}` },
      body: form,
    })
      .then(r => handleResponse<UploadNoonResponse>(r))
      .catch(err => ({ error: err.message } as unknown as UploadNoonResponse))
  },

  uploadNoonInventory: (file: File): Promise<UploadNoonInventoryResponse> => {
    const form = new FormData()
    form.append('file', file)
    return fetch(`${BASE}/upload-noon-inventory`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}` },
      body: form,
    })
      .then(r => handleResponse<UploadNoonInventoryResponse>(r))
      .catch(err => ({ error: err.message } as unknown as UploadNoonInventoryResponse))
  },

  uploadLocadXLSX: (file: File): Promise<UploadLocadResponse> => {
    const form = new FormData()
    form.append('file', file)
    return fetch(`${BASE}/upload-locad-report`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}` },
      body: form,
    })
      .then(r => handleResponse<UploadLocadResponse>(r))
      .catch(err => ({ error: err.message } as unknown as UploadLocadResponse))
  },

  getLocadUnmatched: (): Promise<{ unmatched: { locad_sku: string; product_name: string }[] }> =>
    fetch(`${BASE}/upload-locad-report/unmatched`, { headers: HEADERS })
      .then(r => handleResponse<{ unmatched: { locad_sku: string; product_name: string }[] }>(r))
      .catch(err => ({ error: err.message } as unknown as { unmatched: { locad_sku: string; product_name: string }[] })),

  mapLocadSKU: (locad_sku: string, internal_sku: string): Promise<{ ok: true }> =>
    fetch(`${BASE}/upload-locad-report/map`, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify({ locad_sku, internal_sku }),
    })
      .then(r => handleResponse<{ ok: true }>(r))
      .catch(err => ({ error: err.message } as unknown as { ok: true })),

  getSyncStatus: (): Promise<SyncStatus> =>
    fetch(`${BASE}/sync/status`, { headers: HEADERS })
      .then(r => handleResponse<SyncStatus>(r))
      .catch(err => ({ error: err.message } as unknown as SyncStatus)),

  triggerSync: (source: 'amazon' | 'locad' | 'all'): Promise<SyncResponse> =>
    fetch(`${BASE}/sync/${source}`, {
      method: 'POST',
      headers: HEADERS,
    })
      .then(r => handleResponse<SyncResponse>(r))
      .catch(err => ({ error: err.message } as unknown as SyncResponse)),

  refreshFactTable: (): Promise<{ status: string; message: string }> =>
    fetch(`${BASE}/sync/refresh-fact`, {
      method: 'POST',
      headers: HEADERS,
    })
      .then(r => handleResponse<{ status: string; message: string }>(r))
      .catch(err => ({ error: err.message } as unknown as { status: string; message: string })),

  uploadPOCSV: (file: File): Promise<UploadPOResponse> => {
    const form = new FormData()
    form.append('file', file)
    return fetch(`${BASE}/upload-pos`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}` },
      body: form,
    })
      .then(r => handleResponse<UploadPOResponse>(r))
      .catch(err => ({ error: err.message } as unknown as UploadPOResponse))
  },

  getPlanning: (): Promise<PlanningResponse> =>
    fetch(`${BASE}/planning`, { headers: HEADERS })
      .then(r => handleResponse<PlanningResponse>(r))
      .catch(err => ({ error: err.message } as unknown as PlanningResponse)),

  getAnalytics: (days: 7 | 30 | 90 = 30): Promise<AnalyticsResponse> =>
    fetch(`${BASE}/analytics?days=${days}`, { headers: HEADERS })
      .then(r => handleResponse<AnalyticsResponse>(r))
      .catch(err => ({ error: err.message } as unknown as AnalyticsResponse)),

}
