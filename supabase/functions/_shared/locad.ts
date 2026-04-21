/**
 * _shared/locad.ts  — Phase 2 REST API scaffold (dormant until credentials configured)
 *
 * Based on the Locad OpenAPI v2 specification (locad.yaml).
 *
 * Auth endpoint : POST /openapi/v2/auth/token/obtain/MERCHANT_APP/
 *   Body: { username, password, data: { brand_id } }
 *   Response: { success, data: { access, refresh } }
 *   Token validity: access=24h, refresh=7d
 *
 * Inventory endpoint: GET /openapi/v2/products/inventory/
 *   Response: { success, data: { count, next, previous, results: [...] } }
 *   Each result has: id, sku, name, upc, stocks: [{ warehouse_name, quantity, ... }]
 *
 * Rate limit: 90 req/min. Retry with exponential backoff (max 3 retries).
 * If LOCAD_USERNAME is not set: log warning and return empty arrays gracefully.
 *
 * Env vars required:
 *   LOCAD_BASE_URL   — e.g. https://dashboard.golocad.com
 *   LOCAD_USERNAME   — merchant email
 *   LOCAD_PASSWORD   — merchant password
 *   LOCAD_BRAND_ID   — numeric brand id provided by Locad
 */

// ---------------------------------------------------------------------------
// Configuration check
// ---------------------------------------------------------------------------

export function isLocadConfigured(): boolean {
  return !!Deno.env.get('LOCAD_USERNAME')
}

// ---------------------------------------------------------------------------
// LocadClient
// ---------------------------------------------------------------------------

export class LocadClient {
  private token: string | null = null
  private tokenExpiry: number = 0 // Unix ms

  private get baseUrl(): string {
    return (Deno.env.get('LOCAD_BASE_URL') ?? 'https://dashboard.golocad.com').replace(/\/$/, '')
  }

  // -------------------------------------------------------------------------
  // Token management
  // -------------------------------------------------------------------------

  async getToken(): Promise<string> {
    // Return cached token if still valid (with 60 s buffer)
    if (this.token && Date.now() < this.tokenExpiry - 60_000) {
      return this.token
    }

    const username = Deno.env.get('LOCAD_USERNAME')
    const password = Deno.env.get('LOCAD_PASSWORD')
    const brandIdRaw = Deno.env.get('LOCAD_BRAND_ID')

    if (!username || !password || !brandIdRaw) {
      throw new Error('[locad] Missing LOCAD_USERNAME / LOCAD_PASSWORD / LOCAD_BRAND_ID')
    }

    const brandId = parseInt(brandIdRaw, 10)
    if (isNaN(brandId)) {
      throw new Error(`[locad] LOCAD_BRAND_ID is not a valid integer: "${brandIdRaw}"`)
    }

    const url = `${this.baseUrl}/openapi/v2/auth/token/obtain/MERCHANT_APP/`
    const body = JSON.stringify({
      username,
      password,
      data: { brand_id: brandId },
    })

    const res = await this._fetchWithRetry(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    })

    const json = await res.json()
    if (!json.success || !json.data?.access) {
      throw new Error(`[locad] Token obtain failed: ${JSON.stringify(json)}`)
    }

    this.token = json.data.access as string
    // Token is valid 24 h from now
    this.tokenExpiry = Date.now() + 24 * 60 * 60 * 1000
    return this.token
  }

  // -------------------------------------------------------------------------
  // Inventory fetch
  // -------------------------------------------------------------------------

  /**
   * Returns only SKU + total available units (sum of quantity across all
   * warehouses for each product). All other API fields are discarded.
   */
  async getInventory(): Promise<{ sku: string; upc: string; available: number }[]> {
    if (!isLocadConfigured()) {
      console.warn('[locad] LOCAD_USERNAME not configured — returning empty inventory')
      return []
    }

    const token = await this.getToken()
    const results: { sku: string; upc: string; available: number }[] = []
    let url: string | null = `${this.baseUrl}/openapi/v2/products/inventory/?limit=5000&offset=0`

    while (url) {
      const res = await this._fetchWithRetry(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      })

      const json = await res.json()
      if (!json.success || !json.data?.results) {
        console.error('[locad] Unexpected inventory response:', JSON.stringify(json).slice(0, 500))
        break
      }

      for (const product of json.data.results) {
        const sku = String(product.sku ?? '').trim()
        if (!sku) continue
        const upc = String(product.upc ?? '').trim()

        // Sum sellable quantity across all warehouses
        let available = 0
        if (Array.isArray(product.stocks)) {
          for (const stock of product.stocks) {
            available += parseInt(String(stock.quantity ?? '0'), 10) || 0
          }
        }

        results.push({ sku, upc, available })
      }

      // Follow pagination
      url = json.data.next ?? null
    }

    return results
  }

  // -------------------------------------------------------------------------
  // Fetch with exponential backoff (max 3 retries, respects 90 req/min)
  // -------------------------------------------------------------------------

  private async _fetchWithRetry(
    url: string,
    init: RequestInit,
    maxRetries = 3
  ): Promise<Response> {
    let lastError: Error | null = null

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const res = await fetch(url, init)

        // 429 = rate limited — back off and retry
        if (res.status === 429) {
          const retryAfter = parseInt(res.headers.get('Retry-After') ?? '1', 10)
          const delayMs = (isNaN(retryAfter) ? 1 : retryAfter) * 1000
          console.warn(`[locad] Rate limited (429). Waiting ${delayMs}ms before retry ${attempt + 1}/${maxRetries}`)
          await sleep(delayMs)
          continue
        }

        // 5xx server errors — exponential backoff
        if (res.status >= 500 && attempt < maxRetries) {
          const delayMs = Math.pow(2, attempt) * 500 // 500ms, 1s, 2s
          console.warn(`[locad] Server error ${res.status}. Backoff ${delayMs}ms (attempt ${attempt + 1}/${maxRetries})`)
          await sleep(delayMs)
          continue
        }

        return res
      } catch (err) {
        lastError = err as Error
        if (attempt < maxRetries) {
          const delayMs = Math.pow(2, attempt) * 500
          console.warn(`[locad] Fetch error: ${lastError.message}. Backoff ${delayMs}ms (attempt ${attempt + 1}/${maxRetries})`)
          await sleep(delayMs)
        }
      }
    }

    throw lastError ?? new Error(`[locad] Failed after ${maxRetries} retries: ${url}`)
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
