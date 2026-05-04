import { SECTL_CONFIG, sectlAuth } from "./sectlAuth"

export interface KVItem {
  key: string
  value: unknown
  size: number
  is_json: boolean
  created_at: string
  updated_at: string
}

export interface ListKVOptions {
  prefix?: string
  limit?: number
  offset?: number
}

class SectlKVStorageService {
  private get platformId(): string {
    return SECTL_CONFIG.platformId
  }

  private getAuthHeaders(): Record<string, string> {
    const token = sectlAuth.getAccessToken()
    if (!token) throw new Error("未授权，请先登录")
    return { Authorization: `Bearer ${token}` }
  }

  private async makeRequest<T>(
    method: string,
    endpoint: string,
    options: { jsonData?: Record<string, unknown>; params?: Record<string, unknown> } = {}
  ): Promise<T> {
    const headers: Record<string, string> = {
      ...this.getAuthHeaders(),
      "Content-Type": "application/json",
    }

    let url = `${SECTL_CONFIG.baseUrl}${endpoint}`
    if (options.params) {
      const searchParams = new URLSearchParams()
      for (const [k, v] of Object.entries(options.params)) {
        if (v !== undefined && v !== null) searchParams.set(k, String(v))
      }
      const qs = searchParams.toString()
      if (qs) url += `?${qs}`
    }

    const init: RequestInit = { method, headers }
    if (options.jsonData && method !== "GET") {
      init.body = JSON.stringify(options.jsonData)
    }

    const response = await fetch(url, init)

    if (!response.ok) {
      let errorData: { error?: string; error_description?: string; message?: string } = {}
      try {
        errorData = await response.json()
      } catch {
        // ignore
      }
      const desc = errorData.error_description || errorData.message || `HTTP ${response.status}`
      const err = new Error(desc) as Error & { status?: number; error?: string }
      err.status = response.status
      err.error = errorData.error
      throw err
    }

    return response.json() as Promise<T>
  }

  async setKV(
    key: string,
    value: unknown,
    ttl?: number
  ): Promise<{
    success: boolean
    key: string
    size: number
    is_json: boolean
    created_at?: string
    updated_at?: string
    message: string
  }> {
    const jsonData: Record<string, unknown> = {
      client_id: this.platformId,
      key,
      value,
    }
    if (ttl !== undefined) jsonData.ttl = ttl

    return this.makeRequest("POST", "/api/cloud/kv", { jsonData })
  }

  async getKV<T = unknown>(
    key: string,
    field?: string
  ): Promise<
    | (KVItem & { key: string; value: T })
    | { key: string; field: string; value: T; is_json: boolean }
  > {
    const params: Record<string, string> = { client_id: this.platformId }
    if (field) params.field = field

    return this.makeRequest("GET", `/api/cloud/kv/${encodeURIComponent(key)}`, { params })
  }

  async listKV(
    options: ListKVOptions = {}
  ): Promise<{ kv_list: KVItem[]; total: number; has_more: boolean }> {
    const params: Record<string, unknown> = {
      client_id: this.platformId,
      limit: Math.min(options.limit || 100, 1000),
      offset: options.offset || 0,
    }
    if (options.prefix) params.prefix = options.prefix

    return this.makeRequest("GET", "/api/cloud/kv", { params })
  }

  async updateKVField(
    key: string,
    field: string,
    value: unknown
  ): Promise<{
    success: boolean
    key: string
    field: string
    size: number
    updated_at: string
    message: string
  }> {
    return this.makeRequest("PATCH", `/api/cloud/kv/${encodeURIComponent(key)}`, {
      jsonData: { client_id: this.platformId, field, value },
    })
  }

  async deleteKV(key: string): Promise<{ success: boolean; message: string }> {
    return this.makeRequest("DELETE", `/api/cloud/kv/${encodeURIComponent(key)}`, {
      jsonData: { client_id: this.platformId },
    })
  }

  getPlatformId(): string {
    return this.platformId
  }
}

export const sectlKVStorage = new SectlKVStorageService()
