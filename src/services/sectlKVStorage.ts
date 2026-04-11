/**
 * SECTL KV 键值对存储服务
 * 提供键值对存储功能，支持 JSON 格式和字段级操作
 */

import { SECTL_CONFIG, sectlAuth } from "./sectlAuth"
import { KVData } from "./sectlCloudStorage"

class SectlKVStorageService {
  /**
   * 创建或更新键值对
   */
  async setKV(
    key: string,
    value: any,
    options?: {
      is_json?: boolean
    }
  ): Promise<{
    success: boolean
    kv_id: string
    key: string
    value: any
    is_json: boolean
    size: number
    created_at: string
    updated_at: string
  }> {
    const accessToken = sectlAuth.getAccessToken()
    if (!accessToken) {
      throw new Error("未授权，请先登录")
    }

    const url = `${SECTL_CONFIG.baseUrl}/api/cloud/kv`

    // 自动检测是否为 JSON 格式
    let valueStr: string
    let isJson = options?.is_json

    if (typeof value === "object") {
      valueStr = JSON.stringify(value)
      if (isJson === undefined) {
        isJson = true
      }
    } else {
      valueStr = String(value)
      if (isJson === undefined) {
        // 尝试检测是否为 JSON 字符串
        try {
          JSON.parse(valueStr)
          isJson = true
        } catch {
          isJson = false
        }
      }
    }

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          client_id: SECTL_CONFIG.platformId,
          user_id: sectlAuth.getToken()?.user_id || "",
          key,
          value: valueStr,
          is_json: isJson,
        }),
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
   * 获取键值对
   */
  async getKV<T = any>(
    key: string,
    options?: {
      field?: string // 获取 JSON 中的特定字段
    }
  ): Promise<KVData | { key: string; field: string; value: T }> {
    const accessToken = sectlAuth.getAccessToken()
    if (!accessToken) {
      throw new Error("未授权，请先登录")
    }

    const params = new URLSearchParams({
      client_id: SECTL_CONFIG.platformId,
      user_id: sectlAuth.getToken()?.user_id || "",
    })

    if (options?.field) {
      params.append("field", options.field)
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
   * 获取键值对列表
   */
  async listKV(options?: {
    limit?: number
    offset?: number
  }): Promise<{ kvs: KVData[]; total: number; has_more: boolean }> {
    const accessToken = sectlAuth.getAccessToken()
    if (!accessToken) {
      throw new Error("未授权，请先登录")
    }

    const params = new URLSearchParams({
      client_id: SECTL_CONFIG.platformId,
      user_id: sectlAuth.getToken()?.user_id || "",
      limit: String(options?.limit || 100),
      offset: String(options?.offset || 0),
    })

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
   * 更新 JSON 字段
   */
  async updateKVField(
    key: string,
    field: string,
    value: any
  ): Promise<{
    success: boolean
    key: string
    field: string
    value: any
    updated_at: string
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
   * 删除键值对
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
