/**
 * SECTL KV 存储服务
 * 基于 SECTL-One-Stop SDK 的云存储 KV API 实现
 */

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
  private getAccessToken(): string {
    const token = sectlAuth.getAccessToken()
    if (!token) throw new Error("未授权，请先登录")
    return token
  }

  private getAuthHeaders(): Record<string, string> {
    return { Authorization: `Bearer ${this.getAccessToken()}` }
  }

  private buildParams(extra?: Record<string, string>): URLSearchParams {
    const params = new URLSearchParams({ client_id: SECTL_CONFIG.platformId })
    const userId = sectlAuth.getUserId()
    if (userId) params.append("user_id", userId)
    if (extra) {
      for (const [key, value] of Object.entries(extra)) {
        params.append(key, value)
      }
    }
    return params
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
    const isJson = typeof value === "object" && value !== null
    const body: Record<string, unknown> = {
      client_id: SECTL_CONFIG.platformId,
      key,
      value,
    }
    const userId = sectlAuth.getUserId()
    if (userId) body.user_id = userId
    if (ttl) body.ttl = ttl

    const response = await fetch(`${SECTL_CONFIG.baseUrl}/api/cloud/kv`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...this.getAuthHeaders() },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      throw new Error(err.error_description || "设置 KV 失败")
    }

    const result = await response.json()
    return {
      success: result.success ?? true,
      key: result.key ?? key,
      size: result.size ?? 0,
      is_json: result.is_json ?? isJson,
      created_at: result.created_at,
      updated_at: result.updated_at,
      message: result.message ?? "OK",
    }
  }

  async getKV<T = unknown>(key: string): Promise<KVItem & { key: string; value: T }> {
    const params = this.buildParams()
    const response = await fetch(
      `${SECTL_CONFIG.baseUrl}/api/cloud/kv/${encodeURIComponent(key)}?${params}`,
      {
        headers: this.getAuthHeaders(),
      }
    )

    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      throw new Error(err.error_description || "获取 KV 失败")
    }

    const result = await response.json()
    return {
      key: result.key ?? key,
      value: result.value as T,
      size: result.size ?? 0,
      is_json: result.is_json ?? false,
      created_at: result.created_at ?? "",
      updated_at: result.updated_at ?? "",
    }
  }

  async listKV(
    options: ListKVOptions = {}
  ): Promise<{ kv_list: KVItem[]; total: number; has_more: boolean }> {
    const params = this.buildParams({
      limit: String(options.limit ?? 100),
      offset: String(options.offset ?? 0),
    })
    if (options.prefix) params.append("prefix", options.prefix)

    const response = await fetch(`${SECTL_CONFIG.baseUrl}/api/cloud/kv?${params}`, {
      headers: this.getAuthHeaders(),
    })

    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      throw new Error(err.error_description || "获取 KV 列表失败")
    }

    const result = await response.json()
    return {
      kv_list: result.kv_list ?? [],
      total: result.total ?? 0,
      has_more: result.has_more ?? false,
    }
  }

  async updateKVField(
    key: string,
    field: string,
    value: unknown
  ): Promise<{ success: boolean; message: string }> {
    const body: Record<string, unknown> = {
      client_id: SECTL_CONFIG.platformId,
      field,
      value,
    }
    const userId = sectlAuth.getUserId()
    if (userId) body.user_id = userId

    const response = await fetch(
      `${SECTL_CONFIG.baseUrl}/api/cloud/kv/${encodeURIComponent(key)}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...this.getAuthHeaders() },
        body: JSON.stringify(body),
      }
    )

    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      throw new Error(err.error_description || "更新 KV 字段失败")
    }

    return { success: true, message: "OK" }
  }

  async deleteKV(key: string): Promise<{ success: boolean; message: string }> {
    const body = {
      client_id: SECTL_CONFIG.platformId,
    }
    const userId = sectlAuth.getUserId()
    if (userId) (body as Record<string, unknown>).user_id = userId

    const response = await fetch(
      `${SECTL_CONFIG.baseUrl}/api/cloud/kv/${encodeURIComponent(key)}`,
      {
        method: "DELETE",
        headers: { "Content-Type": "application/json", ...this.getAuthHeaders() },
        body: JSON.stringify(body),
      }
    )

    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      throw new Error(err.error_description || "删除 KV 失败")
    }

    return { success: true, message: "OK" }
  }
}

export const sectlKVStorage = new SectlKVStorageService()
