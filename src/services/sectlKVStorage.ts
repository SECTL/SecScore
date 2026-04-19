/**
 * SECTL KV 键值对存储服务
 * 基于 SECTL-One-Stop SDK 规范实现
 * 提供键值对存储功能，支持 JSON 格式和字段级操作
 */

import { SECTL_CONFIG, sectlAuth } from "./sectlAuth"

// KV 数据类型
export interface KVItem {
  key: string
  value: any
  size: number
  is_json: boolean
  created_at: string
  updated_at: string
}

// KV 列表选项
export interface ListKVOptions {
  prefix?: string
  limit?: number
  offset?: number
}

class SectlKVStorageService {
  /**
   * 设置 KV 键值对
   * @param key 键名（最大 255 字符）
   * @param value 值（任意 JSON 可序列化数据，最大 64KB）
   * @param ttl 过期时间（秒），可选
   */
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
    const accessToken = sectlAuth.getAccessToken()
    if (!accessToken) {
      throw new Error("未授权，请先登录")
    }

    const url = `${SECTL_CONFIG.baseUrl}/api/cloud/kv`

    const body: Record<string, unknown> = {
      client_id: SECTL_CONFIG.platformId,
      user_id: sectlAuth.getToken()?.user_id || "",
      key,
      value,
    }

    if (ttl !== undefined) {
      body.ttl = ttl
    }

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error_description || "设置键值对失败")
      }

      return await response.json()
    } catch (error) {
      console.error("设置键值对失败:", error)
      throw error
    }
  }

  /**
   * 获取 KV 键值对
   * @param key 键名
   * @param field JSON 字段路径，如 "theme" 或 "user.name"，可选
   */
  async getKV<T = unknown>(
    key: string,
    field?: string
  ): Promise<
    | (KVItem & { key: string; value: T })
    | { key: string; field: string; value: T; is_json: boolean }
  > {
    const accessToken = sectlAuth.getAccessToken()
    if (!accessToken) {
      throw new Error("未授权，请先登录")
    }

    const params = new URLSearchParams({
      client_id: SECTL_CONFIG.platformId,
      user_id: sectlAuth.getToken()?.user_id || "",
    })

    if (field) {
      params.append("field", field)
    }

    const url = `${SECTL_CONFIG.baseUrl}/api/cloud/kv/${encodeURIComponent(key)}?${params.toString()}`

    try {
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error_description || "获取键值对失败")
      }

      return await response.json()
    } catch (error) {
      console.error("获取键值对失败:", error)
      throw error
    }
  }

  /**
   * 获取 KV 键值对列表
   * @param options 列表选项
   */
  async listKV(options: ListKVOptions = {}): Promise<{
    kv_list: KVItem[]
    total: number
    has_more: boolean
  }> {
    const accessToken = sectlAuth.getAccessToken()
    if (!accessToken) {
      throw new Error("未授权，请先登录")
    }

    const params = new URLSearchParams({
      client_id: SECTL_CONFIG.platformId,
      user_id: sectlAuth.getToken()?.user_id || "",
      limit: String(options.limit || 100),
      offset: String(options.offset || 0),
    })

    if (options.prefix) {
      params.append("prefix", options.prefix)
    }

    const url = `${SECTL_CONFIG.baseUrl}/api/cloud/kv?${params.toString()}`

    try {
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error_description || "获取键值对列表失败")
      }

      return await response.json()
    } catch (error) {
      console.error("获取键值对列表失败:", error)
      throw error
    }
  }

  /**
   * 更新 KV JSON 字段
   * @param key 键名
   * @param field JSON 字段路径，支持嵌套如 "user.name" 或数组索引 "items.0.id"
   * @param value 要设置的值
   */
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
    const accessToken = sectlAuth.getAccessToken()
    if (!accessToken) {
      throw new Error("未授权，请先登录")
    }

    const url = `${SECTL_CONFIG.baseUrl}/api/cloud/kv/${encodeURIComponent(key)}`

    try {
      const response = await fetch(url, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          client_id: SECTL_CONFIG.platformId,
          user_id: sectlAuth.getToken()?.user_id || "",
          field,
          value,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error_description || "更新字段失败")
      }

      return await response.json()
    } catch (error) {
      console.error("更新字段失败:", error)
      throw error
    }
  }

  /**
   * 删除 KV 键值对
   * @param key 键名
   */
  async deleteKV(key: string): Promise<{ success: boolean; message: string }> {
    const accessToken = sectlAuth.getAccessToken()
    if (!accessToken) {
      throw new Error("未授权，请先登录")
    }

    const url = `${SECTL_CONFIG.baseUrl}/api/cloud/kv/${encodeURIComponent(key)}`

    try {
      const response = await fetch(url, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          client_id: SECTL_CONFIG.platformId,
          user_id: sectlAuth.getToken()?.user_id || "",
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error_description || "删除键值对失败")
      }

      return await response.json()
    } catch (error) {
      console.error("删除键值对失败:", error)
      throw error
    }
  }
}

// 导出单例
export const sectlKVStorage = new SectlKVStorageService()
