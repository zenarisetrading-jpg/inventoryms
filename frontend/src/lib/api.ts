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
import { supabase } from './supabase'

const BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`

async function getHeaders() {
  const { data: { session } } = await supabase.auth.getSession()
  const token = session?.access_token || import.meta.env.VITE_SUPABASE_ANON_KEY
  
  return {
    Authorization: `Bearer ${token}`,
    apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
    'Content-Type': 'application/json',
  }
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
  
  // Handle empty or 204 No Content responses
  const text = await res.text()
  if (!text) return {} as T
  
  try {
    return JSON.parse(text) as T
  } catch (err) {
    return {} as T
  }
}

function getCountry(): string {
  return localStorage.getItem('selected_region') || 'UAE'
}

function buildQuery(params: Record<string, string | undefined>): string {
  const allParams = { ...params, country: getCountry() }
  const entries = Object.entries(allParams).filter(([, v]) => v !== undefined && v !== '')
  if (entries.length === 0) return ''
  return '?' + entries.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v as string)}`).join('&')
}

export const api = {
  getLocations: async (): Promise<{ country: string, saddl_account_id: string }[]> => {
    const { data, error } = await supabase.from('amazon_locations').select('country, saddl_account_id').eq('is_active', true)
    if (error) {
      console.error(error)
      return []
    }
    return data || []
  },

  addLocation: async (country: string, accountId: string): Promise<boolean> => {
    const { error } = await supabase.from('amazon_locations').insert({
      country,
      saddl_account_id: accountId,
      saddl_client_id: accountId,
      is_active: true
    })
    if (error) {
      console.error(error)
      return false
    }
    return true
  },
  getCommandCenter: async (): Promise<CommandCenterResponse> =>
    fetch(`${BASE}/dashboard?country=${getCountry()}`, { headers: await getHeaders() })
      .then(r => handleResponse<CommandCenterResponse>(r))
      .catch(err => ({ error: err.message } as unknown as CommandCenterResponse)),

  getSKUs: async (params?: { search?: string; category?: string; flag?: string }): Promise<SKUListResponse> =>
    fetch(`${BASE}/skus${buildQuery(params ?? {})}`, { headers: await getHeaders() })
      .then(r => handleResponse<SKUListResponse>(r))
      .catch(err => ({ error: err.message } as unknown as SKUListResponse)),

  getSKU: async (sku: string): Promise<SKUDetailResponse> =>
    fetch(`${BASE}/skus/${encodeURIComponent(sku)}?country=${getCountry()}`, { headers: await getHeaders() })
      .then(r => handleResponse<SKUDetailResponse>(r))
      .catch(err => ({ error: err.message } as unknown as SKUDetailResponse)),

  getPOs: async (params?: { status?: string; sku?: string; supplier?: string }): Promise<{ pos: PO[] }> =>
    fetch(`${BASE}/po${buildQuery(params ?? {})}`, { headers: await getHeaders() })
      .then(r => handleResponse<{ pos: PO[] }>(r))
      .catch(err => ({ error: err.message } as unknown as { pos: PO[] })),

  getSuppliers: async (): Promise<{ suppliers: string[] }> =>
    fetch(`${BASE}/po/suppliers`, { headers: await getHeaders() })
      .then(r => handleResponse<{ suppliers: string[] }>(r))
      .catch(err => ({ error: err.message } as unknown as { suppliers: string[] })),

  createPO: async (data: CreatePOInput): Promise<PO> =>
    fetch(`${BASE}/po`, {
      method: 'POST',
      headers: await getHeaders(),
      body: JSON.stringify({ ...data, country: data.country || getCountry() }),
    })
      .then(r => handleResponse<PO>(r))
      .catch(err => ({ error: err.message } as unknown as PO)),

  updatePO: async (id: string, data: Partial<PO>, _poNumber?: string): Promise<PO> => {
    return fetch(`${BASE}/po/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: await getHeaders(),
      body: JSON.stringify(data),
    })
      .then(r => handleResponse<PO>(r))
      .catch(err => ({ error: err.message } as unknown as PO))
  },

  getPO: async (idOrPo: string): Promise<PO> =>
    fetch(`${BASE}/po/${encodeURIComponent(idOrPo)}`, { headers: await getHeaders() })
      .then(r => handleResponse<PO>(r))
      .catch(err => ({ error: err.message } as unknown as PO)),

  deletePO: async (id: string): Promise<{ ok: boolean; error?: string }> =>
    fetch(`${BASE}/po/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: await getHeaders(),
    })
      .then(r => handleResponse<{ ok: boolean }>(r))
      .catch(err => ({ error: err.message } as unknown as { ok: boolean })),

  classifySkus: async (): Promise<{ ok: true; total_classified: number; A: number; B: number; C: number }> =>
    fetch(`${BASE}/skus/classify`, { method: 'POST', headers: await getHeaders() })
      .then(r => handleResponse<{ ok: true; total_classified: number; A: number; B: number; C: number }>(r))
      .catch(err => ({ error: err.message } as unknown as { ok: true; total_classified: number; A: number; B: number; C: number })),

  createSKU: async (data: any): Promise<{ ok: true }> =>
    fetch(`${BASE}/skus`, {
      method: 'POST',
      headers: await getHeaders(),
      body: JSON.stringify({ ...data, country: getCountry() }),
    })
      .then(r => handleResponse<{ ok: true }>(r))
      .catch(err => ({ error: err.message } as unknown as { ok: true })),

  updateSKU: async (sku: string, data: { category?: string | null; moq?: number | null; lead_time_days?: number | null; cogs?: number | null; units_per_box?: number | null; is_active?: boolean; amazon_active?: boolean; noon_active?: boolean }): Promise<{ ok: true }> =>
    fetch(`${BASE}/skus/${encodeURIComponent(sku)}`, {
      method: 'PATCH',
      headers: await getHeaders(),
      body: JSON.stringify(data),
    })
      .then(r => handleResponse<{ ok: true }>(r))
      .catch(err => ({ error: err.message } as unknown as { ok: true })),

  uploadNoonCSV: async (file: File): Promise<UploadNoonResponse> => {
    const form = new FormData()
    form.append('country', getCountry())
    form.append('file', file)
    const headers = await getHeaders()
    delete (headers as any)['Content-Type'] // Let browser set boundary for FormData
    return fetch(`${BASE}/upload-noon`, {
      method: 'POST',
      headers,
      body: form,
    })
      .then(r => handleResponse<UploadNoonResponse>(r))
      .catch(err => ({ error: err.message } as unknown as UploadNoonResponse))
  },

  uploadNoonInventory: async (file: File): Promise<UploadNoonInventoryResponse> => {
    const form = new FormData()
    form.append('country', getCountry())
    form.append('file', file)
    const headers = await getHeaders()
    delete (headers as any)['Content-Type']
    return fetch(`${BASE}/upload-noon-inventory`, {
      method: 'POST',
      headers,
      body: form,
    })
      .then(r => handleResponse<UploadNoonInventoryResponse>(r))
      .catch(err => ({ error: err.message } as unknown as UploadNoonInventoryResponse))
  },

  uploadNoonMinutesSales: async (file: File): Promise<UploadNoonResponse> => {
    const form = new FormData()
    form.append('country', getCountry())
    form.append('file', file)
    const headers = await getHeaders()
    delete (headers as any)['Content-Type']
    return fetch(`${BASE}/upload-noon-minutes`, {
      method: 'POST',
      headers,
      body: form,
    })
      .then(r => handleResponse<UploadNoonResponse>(r))
      .catch(err => ({ error: err.message } as unknown as UploadNoonResponse))
  },

  uploadLocadXLSX: async (file: File): Promise<UploadLocadResponse> => {
    const form = new FormData()
    form.append('file', file)
    const headers = await getHeaders()
    delete (headers as any)['Content-Type']
    return fetch(`${BASE}/upload-locad-report`, {
      method: 'POST',
      headers,
      body: form,
    })
      .then(r => handleResponse<UploadLocadResponse>(r))
      .catch(err => ({ error: err.message } as unknown as UploadLocadResponse))
  },

  getLocadUnmatched: async (): Promise<{ unmatched: { locad_sku: string; product_name: string }[] }> =>
    fetch(`${BASE}/upload-locad-report/unmatched`, { headers: await getHeaders() })
      .then(r => handleResponse<{ unmatched: { locad_sku: string; product_name: string }[] }>(r))
      .catch(err => ({ error: err.message } as unknown as { unmatched: { locad_sku: string; product_name: string }[] })),

  mapLocadSKU: async (locad_sku: string, internal_sku: string): Promise<{ ok: true }> =>
    fetch(`${BASE}/upload-locad-report/map`, {
      method: 'POST',
      headers: await getHeaders(),
      body: JSON.stringify({ locad_sku, internal_sku }),
    })
      .then(r => handleResponse<{ ok: true }>(r))
      .catch(err => ({ error: err.message } as unknown as { ok: true })),

  getSyncStatus: async (): Promise<SyncStatus> =>
    fetch(`${BASE}/sync/status`, { headers: await getHeaders() })
      .then(r => handleResponse<SyncStatus>(r))
      .catch(err => ({ error: err.message } as unknown as SyncStatus)),

  triggerSync: async (source: 'amazon' | 'locad' | 'all'): Promise<SyncResponse> =>
    fetch(`${BASE}/sync/${source}`, {
      method: 'POST',
      headers: await getHeaders(),
    })
      .then(r => handleResponse<SyncResponse>(r))
      .catch(err => ({ error: err.message } as unknown as SyncResponse)),

  triggerAmazonFDW: async (): Promise<{ status: string; message: string }> =>
    fetch(`${BASE}/sync/amazon-fdw`, {
      method: 'POST',
      headers: await getHeaders(),
    })
      .then(r => handleResponse<{ status: string; message: string }>(r))
      .catch(err => ({ error: err.message } as unknown as { status: string; message: string })),

  refreshFactTable: async (): Promise<{ status: string; message: string }> =>
    fetch(`${BASE}/sync/refresh-fact`, {
      method: 'POST',
      headers: await getHeaders(),
    })
      .then(r => handleResponse<{ status: string; message: string }>(r))
      .catch(err => ({ error: err.message } as unknown as { status: string; message: string })),

  uploadPOCSV: async (file: File): Promise<UploadPOResponse> => {
    const form = new FormData()
    form.append('file', file)
    const headers = await getHeaders()
    delete (headers as any)['Content-Type']
    return fetch(`${BASE}/upload-pos`, {
      method: 'POST',
      headers,
      body: form,
    })
      .then(r => handleResponse<UploadPOResponse>(r))
      .catch(err => ({ error: err.message } as unknown as UploadPOResponse))
  },

  getPlanning: async (): Promise<PlanningResponse> =>
    fetch(`${BASE}/planning?country=${getCountry()}`, { headers: await getHeaders() })
      .then(r => handleResponse<PlanningResponse>(r))
      .catch(err => ({ error: err.message } as unknown as PlanningResponse)),

  getAnalytics: async (days: 7 | 30 | 90 = 30): Promise<AnalyticsResponse> =>
    fetch(`${BASE}/analytics?days=${days}&country=${getCountry()}`, { headers: await getHeaders() })
      .then(r => handleResponse<AnalyticsResponse>(r))
      .catch(err => ({ error: err.message } as unknown as AnalyticsResponse)),

}
