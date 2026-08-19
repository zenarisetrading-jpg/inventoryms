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

// ---------------------------------------------------------------------------
// In-Memory Cache & Request Deduplication Layer
// ---------------------------------------------------------------------------
interface CacheEntry {
  data: any
  expiry: number
}

const responseCache = new Map<string, CacheEntry>()
const inFlightRequests = new Map<string, Promise<any>>()

/** Invalidate cached entries matching a key prefix (or all if no prefix given) */
export function invalidateApiCache(prefix?: string) {
  if (!prefix) {
    responseCache.clear()
    return
  }
  for (const key of responseCache.keys()) {
    if (key.includes(prefix)) {
      responseCache.delete(key)
    }
  }
}

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
  return localStorage.getItem('selected_country') || 'UAE'
}

function getAccountId(): string {
  return localStorage.getItem('selected_account') || 's2c_uae_test'
}

function buildQuery(params: Record<string, string | undefined>): string {
  const allParams = { ...params, country: getCountry(), account_id: getAccountId() }
  const entries = Object.entries(allParams).filter(([, v]) => v !== undefined && v !== '')
  if (entries.length === 0) return ''
  return '?' + entries.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v as string)}`).join('&')
}

/**
 * Executes a GET request with smart caching & in-flight request deduplication.
 * @param url URL to fetch
 * @param ttlMs Time-to-live in ms (defaults to 30s)
 * @param forceRefresh If true, ignores cache and forces a fresh request
 */
async function fetchCached<T>(url: string, ttlMs = 30000, forceRefresh = false): Promise<T> {
  const now = Date.now()

  // 1. Return fresh cached response if available
  if (!forceRefresh) {
    const cached = responseCache.get(url)
    if (cached && cached.expiry > now) {
      return cached.data as T
    }
  }

  // 2. Deduplicate in-flight concurrent requests for the exact same URL
  if (inFlightRequests.has(url)) {
    return inFlightRequests.get(url) as Promise<T>
  }

  // 3. Initiate new fetch and track in-flight promise
  const fetchPromise = (async () => {
    try {
      const headers = await getHeaders()
      const res = await fetch(url, { headers })
      const data = await handleResponse<T>(res)
      
      // Store in cache only on success
      if (!(data as any)?.error) {
        responseCache.set(url, { data, expiry: Date.now() + ttlMs })
      }
      return data
    } finally {
      inFlightRequests.delete(url)
    }
  })()

  inFlightRequests.set(url, fetchPromise)
  return fetchPromise
}

export const api = {
  invalidateCache: invalidateApiCache,

  getLocations: async (forceRefresh = false): Promise<{ country: string, saddl_account_id: string, display_name: string, is_active?: boolean }[]> => {
    const cacheKey = 'amazon_locations_list'
    if (!forceRefresh) {
      const cached = responseCache.get(cacheKey)
      if (cached && cached.expiry > Date.now()) return cached.data
    }

    const { data, error } = await supabase.from('amazon_locations').select('country, saddl_account_id, display_name, is_active').order('country')
    if (error) {
      console.error(error)
      return []
    }
    const result = data || []
    responseCache.set(cacheKey, { data: result, expiry: Date.now() + 60000 })
    return result
  },

  addLocation: async (country: string, accountId: string, displayName: string): Promise<{ success: boolean; error?: string }> => {
    const { error } = await supabase.from('amazon_locations').insert({
      country,
      saddl_account_id: accountId,
      saddl_client_id: accountId,
      display_name: displayName,
      is_active: true
    })
    if (error) {
      console.error(error)
      return { success: false, error: error.message }
    }
    invalidateApiCache('amazon_locations_list')
    return { success: true }
  },

  updateLocation: async (oldAccountId: string, newDisplayName: string, newAccountId: string, isActive: boolean): Promise<{ success: boolean; error?: string }> => {
    const { error } = await supabase.from('amazon_locations').update({
      saddl_account_id: newAccountId,
      saddl_client_id: newAccountId,
      display_name: newDisplayName,
      is_active: isActive
    }).eq('saddl_account_id', oldAccountId)
    if (error) {
      console.error(error)
      return { success: false, error: error.message }
    }
    invalidateApiCache('amazon_locations_list')
    return { success: true }
  },

  deleteLocation: async (accountId: string): Promise<{ success: boolean; error?: string }> => {
    const { error } = await supabase.from('amazon_locations').delete().eq('saddl_account_id', accountId)
    if (error) {
      console.error(error)
      return { success: false, error: error.message }
    }
    invalidateApiCache('amazon_locations_list')
    return { success: true }
  },

  getCommandCenter: async (forceRefresh = false): Promise<CommandCenterResponse> =>
    fetchCached<CommandCenterResponse>(
      `${BASE}/dashboard?country=${getCountry()}&account_id=${getAccountId()}`,
      30000,
      forceRefresh
    ).catch(err => ({ error: err.message } as unknown as CommandCenterResponse)),

  getSKUs: async (params?: { search?: string; category?: string; flag?: string }, forceRefresh = false): Promise<SKUListResponse> =>
    fetchCached<SKUListResponse>(
      `${BASE}/skus${buildQuery(params ?? {})}`,
      30000,
      forceRefresh
    ).catch(err => ({ error: err.message } as unknown as SKUListResponse)),

  getSKU: async (sku: string, forceRefresh = false): Promise<SKUDetailResponse> =>
    fetchCached<SKUDetailResponse>(
      `${BASE}/skus/${encodeURIComponent(sku)}?country=${getCountry()}&account_id=${getAccountId()}`,
      30000,
      forceRefresh
    ).catch(err => ({ error: err.message } as unknown as SKUDetailResponse)),

  getPOs: async (params?: { status?: string; sku?: string; supplier?: string; country?: string }, forceRefresh = false): Promise<{ pos: PO[] }> =>
    fetchCached<{ pos: PO[] }>(
      `${BASE}/po${buildQuery({ country: getCountry(), ...(params ?? {}) })}`,
      20000,
      forceRefresh
    ).catch(err => ({ error: err.message } as unknown as { pos: PO[] })),

  getSuppliers: async (forceRefresh = false): Promise<{ suppliers: string[] }> =>
    fetchCached<{ suppliers: string[] }>(
      `${BASE}/po/suppliers`,
      60000,
      forceRefresh
    ).catch(err => ({ error: err.message } as unknown as { suppliers: string[] })),

  createPO: async (data: CreatePOInput): Promise<PO> => {
    const res = await fetch(`${BASE}/po`, {
      method: 'POST',
      headers: await getHeaders(),
      body: JSON.stringify({ country: data.country || getCountry(), saddl_id: data.saddl_id || getAccountId(), ...data }),
    })
      .then(r => handleResponse<PO>(r))
      .catch(err => ({ error: err.message } as unknown as PO))

    invalidateApiCache('/po')
    invalidateApiCache('/dashboard')
    invalidateApiCache('/planning')
    return res
  },

  updatePO: async (id: string, data: Partial<PO>, _poNumber?: string): Promise<PO> => {
    const res = await fetch(`${BASE}/po/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: await getHeaders(),
      body: JSON.stringify(data),
    })
      .then(r => handleResponse<PO>(r))
      .catch(err => ({ error: err.message } as unknown as PO))

    invalidateApiCache('/po')
    invalidateApiCache('/dashboard')
    invalidateApiCache('/planning')
    return res
  },

  getPO: async (idOrPo: string, forceRefresh = false): Promise<PO> =>
    fetchCached<PO>(
      `${BASE}/po/${encodeURIComponent(idOrPo)}`,
      15000,
      forceRefresh
    ).catch(err => ({ error: err.message } as unknown as PO)),

  deletePO: async (id: string): Promise<{ ok: boolean; error?: string }> => {
    const res = await fetch(`${BASE}/po/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: await getHeaders(),
    })
      .then(r => handleResponse<{ ok: boolean }>(r))
      .catch(err => ({ error: err.message } as unknown as { ok: boolean }))

    invalidateApiCache('/po')
    invalidateApiCache('/dashboard')
    invalidateApiCache('/planning')
    return res
  },

  classifySkus: async (): Promise<{ ok: true; total_classified: number; A: number; B: number; C: number }> => {
    const res = await fetch(`${BASE}/skus/classify`, { method: 'POST', headers: await getHeaders() })
      .then(r => handleResponse<{ ok: true; total_classified: number; A: number; B: number; C: number }>(r))
      .catch(err => ({ error: err.message } as unknown as { ok: true; total_classified: number; A: number; B: number; C: number }))

    invalidateApiCache('/skus')
    invalidateApiCache('/dashboard')
    invalidateApiCache('/planning')
    return res
  },

  createSKU: async (data: any): Promise<{ ok: true }> => {
    const res = await fetch(`${BASE}/skus`, {
      method: 'POST',
      headers: await getHeaders(),
      body: JSON.stringify({ country: getCountry(), saddl_id: getAccountId(), ...data }),
    })
      .then(r => handleResponse<{ ok: true }>(r))
      .catch(err => ({ error: err.message } as unknown as { ok: true }))

    invalidateApiCache('/skus')
    invalidateApiCache('/dashboard')
    invalidateApiCache('/planning')
    return res
  },

  updateSKU: async (sku: string, data: { category?: string | null; moq?: number | null; lead_time_days?: number | null; cogs?: number | null; units_per_box?: number | null; is_active?: boolean; amazon_active?: boolean; noon_active?: boolean; minutes_active?: boolean }): Promise<{ ok: true }> => {
    const res = await fetch(`${BASE}/skus/${encodeURIComponent(sku)}?country=${getCountry()}&account_id=${getAccountId()}`, {
      method: 'PATCH',
      headers: await getHeaders(),
      body: JSON.stringify(data),
    })
      .then(r => handleResponse<{ ok: true }>(r))
      .catch(err => ({ error: err.message } as unknown as { ok: true }))

    invalidateApiCache('/skus')
    invalidateApiCache('/dashboard')
    invalidateApiCache('/planning')
    return res
  },

  bulkUpsertSKUs: async (skus: any[]): Promise<{ ok: true, count: number }> => {
    const { error } = await supabase.from('sku_master').upsert(skus, { onConflict: 'sku,country' })
    if (error) throw new Error(error.message)
    invalidateApiCache('/skus')
    invalidateApiCache('/dashboard')
    invalidateApiCache('/planning')
    return { ok: true, count: skus.length }
  },

  uploadNoonCSV: async (file: File): Promise<UploadNoonResponse> => {
    const form = new FormData()
    form.append('country', getCountry())
    form.append('saddl_id', getAccountId())
    form.append('file', file)
    const headers = await getHeaders()
    delete (headers as any)['Content-Type'] // Let browser set boundary for FormData
    const res = await fetch(`${BASE}/upload-noon`, {
      method: 'POST',
      headers,
      body: form,
    })
      .then(r => handleResponse<UploadNoonResponse>(r))
      .catch(err => ({ error: err.message } as unknown as UploadNoonResponse))

    invalidateApiCache()
    return res
  },

  uploadNoonInventory: async (file: File): Promise<UploadNoonInventoryResponse> => {
    const form = new FormData()
    form.append('country', getCountry())
    form.append('saddl_id', getAccountId())
    form.append('file', file)
    const headers = await getHeaders()
    delete (headers as any)['Content-Type']
    const res = await fetch(`${BASE}/upload-noon-inventory`, {
      method: 'POST',
      headers,
      body: form,
    })
      .then(r => handleResponse<UploadNoonInventoryResponse>(r))
      .catch(err => ({ error: err.message } as unknown as UploadNoonInventoryResponse))

    invalidateApiCache()
    return res
  },

  uploadNoonMinutesSales: async (file: File): Promise<UploadNoonResponse> => {
    const form = new FormData()
    form.append('country', getCountry())
    form.append('saddl_id', getAccountId())
    form.append('file', file)
    const headers = await getHeaders()
    delete (headers as any)['Content-Type']
    const res = await fetch(`${BASE}/upload-noon-minutes`, {
      method: 'POST',
      headers,
      body: form,
    })
      .then(r => handleResponse<UploadNoonResponse>(r))
      .catch(err => ({ error: err.message } as unknown as UploadNoonResponse))

    invalidateApiCache()
    return res
  },

  uploadLocadXLSX: async (file: File): Promise<UploadLocadResponse> => {
    const form = new FormData()
    form.append('file', file)
    const headers = await getHeaders()
    delete (headers as any)['Content-Type']
    const res = await fetch(`${BASE}/upload-locad-report`, {
      method: 'POST',
      headers,
      body: form,
    })
      .then(r => handleResponse<UploadLocadResponse>(r))
      .catch(err => ({ error: err.message } as unknown as UploadLocadResponse))

    invalidateApiCache()
    return res
  },

  getLocadUnmatched: async (forceRefresh = false): Promise<{ unmatched: { locad_sku: string; product_name: string }[] }> =>
    fetchCached<{ unmatched: { locad_sku: string; product_name: string }[] }>(
      `${BASE}/upload-locad-report/unmatched`,
      15000,
      forceRefresh
    ).catch(err => ({ error: err.message } as unknown as { unmatched: { locad_sku: string; product_name: string }[] })),

  mapLocadSKU: async (locad_sku: string, internal_sku: string): Promise<{ ok: true }> => {
    const res = await fetch(`${BASE}/upload-locad-report/map`, {
      method: 'POST',
      headers: await getHeaders(),
      body: JSON.stringify({ locad_sku, internal_sku }),
    })
      .then(r => handleResponse<{ ok: true }>(r))
      .catch(err => ({ error: err.message } as unknown as { ok: true }))

    invalidateApiCache('/upload-locad-report')
    return res
  },

  getSyncStatus: async (forceRefresh = false): Promise<SyncStatus> =>
    fetchCached<SyncStatus>(
      `${BASE}/sync/status`,
      15000,
      forceRefresh
    ).catch(err => ({ error: err.message } as unknown as SyncStatus)),

  triggerSync: async (source: 'amazon' | 'locad' | 'all'): Promise<SyncResponse> => {
    const res = await fetch(`${BASE}/sync/${source}`, {
      method: 'POST',
      headers: await getHeaders(),
    })
      .then(r => handleResponse<SyncResponse>(r))
      .catch(err => ({ error: err.message } as unknown as SyncResponse))

    invalidateApiCache()
    return res
  },

  triggerAmazonFDW: async (): Promise<{ status: string; message: string }> => {
    const res = await fetch(`${BASE}/sync/amazon-fdw`, {
      method: 'POST',
      headers: await getHeaders(),
    })
      .then(r => handleResponse<{ status: string; message: string }>(r))
      .catch(err => ({ error: err.message } as unknown as { status: string; message: string }))

    invalidateApiCache()
    return res
  },

  refreshFactTable: async (): Promise<{ status: string; message: string }> => {
    const res = await fetch(`${BASE}/sync/refresh-fact`, {
      method: 'POST',
      headers: await getHeaders(),
    })
      .then(r => handleResponse<{ status: string; message: string }>(r))
      .catch(err => ({ error: err.message } as unknown as { status: string; message: string }))

    invalidateApiCache()
    return res
  },

  uploadPOCSV: async (file: File): Promise<UploadPOResponse> => {
    const form = new FormData()
    form.append('country', getCountry())
    form.append('file', file)
    const headers = await getHeaders()
    delete (headers as any)['Content-Type']
    const res = await fetch(`${BASE}/upload-pos`, {
      method: 'POST',
      headers,
      body: form,
    })
      .then(r => handleResponse<UploadPOResponse>(r))
      .catch(err => ({ error: err.message } as unknown as UploadPOResponse))

    invalidateApiCache()
    return res
  },

  uploadSKUMasterCSV: async (file: File): Promise<{ rows_processed?: number; errors?: any[]; error?: string }> => {
    const form = new FormData()
    form.append('country', getCountry())
    form.append('saddl_id', getAccountId())
    form.append('file', file)
    const headers = await getHeaders()
    delete (headers as any)['Content-Type']
    const res = await fetch(`${BASE}/upload-sku-master`, {
      method: 'POST',
      headers,
      body: form,
    })
      .then(r => handleResponse<{ rows_processed?: number; errors?: any[]; error?: string }>(r))
      .catch(err => ({ error: err.message } as unknown as { rows_processed?: number; errors?: any[]; error?: string }))

    invalidateApiCache()
    return res
  },

  getPlanning: async (forceRefresh = false): Promise<PlanningResponse> =>
    fetchCached<PlanningResponse>(
      `${BASE}/planning?country=${getCountry()}&account_id=${getAccountId()}`,
      30000,
      forceRefresh
    ).catch(err => ({ error: err.message } as unknown as PlanningResponse)),

  getAnalytics: async (days: 7 | 30 | 90 = 30, forceRefresh = false): Promise<AnalyticsResponse> =>
    fetchCached<AnalyticsResponse>(
      `${BASE}/analytics?days=${days}&country=${getCountry()}&account_id=${getAccountId()}`,
      30000,
      forceRefresh
    ).catch(err => ({ error: err.message } as unknown as AnalyticsResponse)),
}
