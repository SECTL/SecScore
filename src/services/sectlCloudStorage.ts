/**
 * SECTL 云存储服务
 * 基于 SECTL-One-Stop SDK 的云存储 API 实现
 */

import { SECTL_CONFIG, sectlAuth } from "./sectlAuth"

export interface CloudFile {
  file_id: string
  filename: string
  extension: string
  size: number
  size_formatted: string
  created_at: string
  updated_at: string
  url: string
  thumbnail_url?: string
}

export interface ShareLink {
  share_id: string
  share_url: string
  file_id: string
  filename: string
  expires_at?: string
  has_password: boolean
  view_count?: number
  download_count?: number
  status: "active" | "disabled" | "expired"
}

export interface KVData {
  kv_id: string
  key: string
  value: unknown
  is_json: boolean
  size: number
  created_at: string
  updated_at: string
}

export interface StorageUsage {
  used_storage: number
  used_storage_formatted: string
  total_storage: number
  total_storage_formatted: string
  available_storage: number
  available_storage_formatted: string
  percentage: number
  file_count: number
}

class SectlCloudStorageService {
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

  async uploadFile(
    file: File | Blob,
    options?: { filename?: string; description?: string; tags?: string[] }
  ): Promise<CloudFile> {
    const formData = new FormData()
    formData.append("file", file, options?.filename)
    formData.append("client_id", SECTL_CONFIG.platformId)
    const userId = sectlAuth.getUserId()
    if (userId) formData.append("user_id", userId)
    if (options?.description) formData.append("description", options.description)
    if (options?.tags) formData.append("tags", JSON.stringify(options.tags))

    const response = await fetch(`${SECTL_CONFIG.baseUrl}/api/cloud/upload`, {
      method: "POST",
      headers: this.getAuthHeaders(),
      body: formData,
    })

    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      throw new Error(err.error_description || "文件上传失败")
    }
    return response.json()
  }

  async listFiles(options?: {
    folder?: string
    limit?: number
    offset?: number
  }): Promise<{ files: CloudFile[]; total: number }> {
    const params = this.buildParams()
    if (options?.folder) params.append("folder", options.folder)
    if (options?.limit) params.append("limit", String(options.limit))
    if (options?.offset) params.append("offset", String(options.offset))

    const response = await fetch(`${SECTL_CONFIG.baseUrl}/api/cloud/files?${params}`, {
      headers: this.getAuthHeaders(),
    })

    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      throw new Error(err.error_description || "获取文件列表失败")
    }
    return response.json()
  }

  async getFileInfo(fileId: string): Promise<CloudFile> {
    const response = await fetch(`${SECTL_CONFIG.baseUrl}/api/cloud/files/${fileId}`, {
      headers: this.getAuthHeaders(),
    })

    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      throw new Error(err.error_description || "获取文件信息失败")
    }
    return response.json()
  }

  async downloadFile(fileId: string): Promise<Blob> {
    const params = this.buildParams()
    const response = await fetch(
      `${SECTL_CONFIG.baseUrl}/api/cloud/files/${fileId}/download?${params}`,
      { headers: this.getAuthHeaders() }
    )

    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      throw new Error(err.error_description || "下载文件失败")
    }
    return response.blob()
  }

  async previewFile(fileId: string): Promise<CloudFile> {
    const params = this.buildParams()
    const response = await fetch(
      `${SECTL_CONFIG.baseUrl}/api/cloud/files/${fileId}/preview?${params}`,
      { headers: this.getAuthHeaders() }
    )

    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      throw new Error(err.error_description || "预览文件失败")
    }
    return response.json()
  }

  async deleteFile(fileId: string, userId?: string): Promise<void> {
    const response = await fetch(`${SECTL_CONFIG.baseUrl}/api/cloud/files/${fileId}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json", ...this.getAuthHeaders() },
      body: JSON.stringify({
        client_id: SECTL_CONFIG.platformId,
        ...(userId ? { user_id: userId } : {}),
      }),
    })

    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      throw new Error(err.error_description || "删除文件失败")
    }
  }

  async renameFile(fileId: string, newFilename: string): Promise<CloudFile> {
    const response = await fetch(`${SECTL_CONFIG.baseUrl}/api/cloud/files/${fileId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...this.getAuthHeaders() },
      body: JSON.stringify({
        client_id: SECTL_CONFIG.platformId,
        filename: newFilename,
      }),
    })

    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      throw new Error(err.error_description || "重命名文件失败")
    }
    return response.json()
  }

  async createShare(
    fileId: string,
    options?: { expiresIn?: number; password?: string; userId?: string }
  ): Promise<ShareLink> {
    const response = await fetch(`${SECTL_CONFIG.baseUrl}/api/cloud/share`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...this.getAuthHeaders() },
      body: JSON.stringify({
        client_id: SECTL_CONFIG.platformId,
        file_id: fileId,
        ...(options?.expiresIn ? { expires_in: options.expiresIn } : {}),
        ...(options?.password ? { password: options.password } : {}),
        ...(options?.userId ? { user_id: options.userId } : {}),
      }),
    })

    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      throw new Error(err.error_description || "创建分享链接失败")
    }
    return response.json()
  }

  async listShares(): Promise<{ shares: ShareLink[]; total: number }> {
    const params = this.buildParams()
    const response = await fetch(`${SECTL_CONFIG.baseUrl}/api/cloud/shares?${params}`, {
      headers: this.getAuthHeaders(),
    })

    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      throw new Error(err.error_description || "获取分享列表失败")
    }
    return response.json()
  }

  async disableShare(shareId: string, userId?: string): Promise<void> {
    const response = await fetch(`${SECTL_CONFIG.baseUrl}/api/cloud/shares/${shareId}/disable`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...this.getAuthHeaders() },
      body: JSON.stringify({
        client_id: SECTL_CONFIG.platformId,
        ...(userId ? { user_id: userId } : {}),
      }),
    })

    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      throw new Error(err.error_description || "禁用分享失败")
    }
  }

  async enableShare(shareId: string, userId?: string): Promise<void> {
    const response = await fetch(`${SECTL_CONFIG.baseUrl}/api/cloud/shares/${shareId}/enable`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...this.getAuthHeaders() },
      body: JSON.stringify({
        client_id: SECTL_CONFIG.platformId,
        ...(userId ? { user_id: userId } : {}),
      }),
    })

    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      throw new Error(err.error_description || "启用分享失败")
    }
  }

  async deleteShare(shareId: string, userId?: string): Promise<void> {
    const response = await fetch(`${SECTL_CONFIG.baseUrl}/api/cloud/shares/${shareId}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json", ...this.getAuthHeaders() },
      body: JSON.stringify({
        client_id: SECTL_CONFIG.platformId,
        ...(userId ? { user_id: userId } : {}),
      }),
    })

    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      throw new Error(err.error_description || "删除分享失败")
    }
  }

  async getStorageUsage(): Promise<StorageUsage> {
    const params = this.buildParams()
    const response = await fetch(`${SECTL_CONFIG.baseUrl}/api/cloud/storage/usage?${params}`, {
      headers: this.getAuthHeaders(),
    })

    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      throw new Error(err.error_description || "获取存储使用情况失败")
    }
    return response.json()
  }

  async setKV(
    key: string,
    value: string | Record<string, unknown>,
    options?: { expiresIn?: number; userId?: string; description?: string }
  ): Promise<KVData> {
    const isJson = typeof value === "object"
    const response = await fetch(`${SECTL_CONFIG.baseUrl}/api/cloud/kv`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...this.getAuthHeaders() },
      body: JSON.stringify({
        client_id: SECTL_CONFIG.platformId,
        key,
        value: isJson ? JSON.stringify(value) : value,
        is_json: isJson,
        ...(options?.expiresIn ? { expires_in: options.expiresIn } : {}),
        ...(options?.userId ? { user_id: options.userId } : {}),
        ...(options?.description ? { description: options.description } : {}),
      }),
    })

    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      throw new Error(err.error_description || "设置 KV 失败")
    }
    return response.json()
  }

  async getKV(key: string): Promise<KVData> {
    const response = await fetch(
      `${SECTL_CONFIG.baseUrl}/api/cloud/kv/${encodeURIComponent(key)}`,
      {
        method: "GET",
        headers: this.getAuthHeaders(),
      }
    )

    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      throw new Error(err.error_description || "获取 KV 失败")
    }
    return response.json()
  }

  async updateKVField(
    key: string,
    field: string,
    value: unknown,
    userId?: string
  ): Promise<KVData> {
    const response = await fetch(
      `${SECTL_CONFIG.baseUrl}/api/cloud/kv/${encodeURIComponent(key)}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...this.getAuthHeaders() },
        body: JSON.stringify({
          client_id: SECTL_CONFIG.platformId,
          field,
          value: typeof value === "object" ? JSON.stringify(value) : value,
          ...(userId ? { user_id: userId } : {}),
        }),
      }
    )

    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      throw new Error(err.error_description || "更新 KV 字段失败")
    }
    return response.json()
  }

  async listKV(options?: {
    prefix?: string
    limit?: number
    offset?: number
  }): Promise<{ data: KVData[]; total: number }> {
    const params = this.buildParams()
    if (options?.prefix) params.append("prefix", options.prefix)
    if (options?.limit) params.append("limit", String(options.limit))
    if (options?.offset) params.append("offset", String(options.offset))

    const response = await fetch(`${SECTL_CONFIG.baseUrl}/api/cloud/kv?${params}`, {
      headers: this.getAuthHeaders(),
    })

    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      throw new Error(err.error_description || "获取 KV 列表失败")
    }
    return response.json()
  }

  async deleteKV(key: string, userId?: string): Promise<void> {
    const response = await fetch(
      `${SECTL_CONFIG.baseUrl}/api/cloud/kv/${encodeURIComponent(key)}`,
      {
        method: "DELETE",
        headers: { "Content-Type": "application/json", ...this.getAuthHeaders() },
        body: JSON.stringify({
          client_id: SECTL_CONFIG.platformId,
          ...(userId ? { user_id: userId } : {}),
        }),
      }
    )

    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      throw new Error(err.error_description || "删除 KV 失败")
    }
  }
}

export const sectlCloudStorage = new SectlCloudStorageService()
