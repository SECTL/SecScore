/**
 * SECTL 云存储服务
 * 提供文件上传、下载、管理、分享等功能
 */

import { SECTL_CONFIG, sectlAuth } from "./sectlAuth"

// 文件信息类型
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

// 分享信息类型
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

// KV 存储类型
export interface KVData {
  kv_id: string
  key: string
  value: any
  is_json: boolean
  size: number
  created_at: string
  updated_at: string
}

// 存储使用情况
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
  /**
   * 获取文件列表
   */
  async listFiles(options?: {
    folder_id?: string
    limit?: number
    offset?: number
  }): Promise<{ files: CloudFile[]; total: number; has_more: boolean }> {
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

    if (options?.folder_id) {
      params.append("folder_id", options.folder_id)
    }

    const url = `${SECTL_CONFIG.baseUrl}/api/cloud/files?${params.toString()}`

    try {
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error_description || "获取文件列表失败")
      }

      return await response.json()
    } catch (error) {
      console.error("获取文件列表失败:", error)
      throw error
    }
  }

  /**
   * 上传文件
   */
  async uploadFile(
    file: File | Blob,
    options?: {
      folder_id?: string
      filename?: string
    }
  ): Promise<{
    success: boolean
    file_id: string
    filename: string
    size: number
    size_formatted: string
  }> {
    const accessToken = sectlAuth.getAccessToken()
    if (!accessToken) {
      throw new Error("未授权，请先登录")
    }

    const formData = new FormData()
    formData.append("client_id", SECTL_CONFIG.platformId)
    formData.append("user_id", sectlAuth.getToken()?.user_id || "")
    if (options?.folder_id) {
      formData.append("folder_id", options.folder_id)
    }

    // 如果是 File 对象，直接使用；否则需要指定文件名
    if (file instanceof File) {
      formData.append("file", file)
    } else {
      const filename = options?.filename || "upload_" + Date.now()
      formData.append("file", file, filename)
    }

    const url = `${SECTL_CONFIG.baseUrl}/api/cloud/upload`

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        body: formData,
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error_description || "文件上传失败")
      }

      return await response.json()
    } catch (error) {
      console.error("文件上传失败:", error)
      throw error
    }
  }

  /**
   * 上传文件（Base64 格式）
   */
  async uploadFileBase64(
    base64Data: string,
    filename: string,
    mimeType: string = "application/octet-stream",
    options?: {
      folder_id?: string
    }
  ): Promise<{
    success: boolean
    file_id: string
    filename: string
    size: number
  }> {
    const accessToken = sectlAuth.getAccessToken()
    if (!accessToken) {
      throw new Error("未授权，请先登录")
    }

    const url = `${SECTL_CONFIG.baseUrl}/api/cloud/upload`

    const payload = {
      client_id: SECTL_CONFIG.platformId,
      user_id: sectlAuth.getToken()?.user_id || "",
      filename,
      mime_type: mimeType,
      file: base64Data,
      folder_id: options?.folder_id,
    }

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error_description || "文件上传失败")
      }

      return await response.json()
    } catch (error) {
      console.error("文件上传失败:", error)
      throw error
    }
  }

  /**
   * 获取文件下载链接
   */
  async downloadFile(fileId: string): Promise<{ download_url: string; expires_at: string }> {
    const accessToken = sectlAuth.getAccessToken()
    if (!accessToken) {
      throw new Error("未授权，请先登录")
    }

    const params = new URLSearchParams({
      client_id: SECTL_CONFIG.platformId,
    })

    const url = `${SECTL_CONFIG.baseUrl}/api/cloud/files/${fileId}/download?${params.toString()}`

    try {
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error_description || "获取下载链接失败")
      }

      return await response.json()
    } catch (error) {
      console.error("获取下载链接失败:", error)
      throw error
    }
  }

  /**
   * 获取文件预览链接
   */
  async previewFile(fileId: string): Promise<{ view_url: string; expires_at: string }> {
    const accessToken = sectlAuth.getAccessToken()
    if (!accessToken) {
      throw new Error("未授权，请先登录")
    }

    const params = new URLSearchParams({
      client_id: SECTL_CONFIG.platformId,
    })

    const url = `${SECTL_CONFIG.baseUrl}/api/cloud/files/${fileId}/preview?${params.toString()}`

    try {
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error_description || "获取预览链接失败")
      }

      return await response.json()
    } catch (error) {
      console.error("获取预览链接失败:", error)
      throw error
    }
  }

  /**
   * 删除文件
   */
  async deleteFile(fileId: string): Promise<{ success: boolean; message: string }> {
    const accessToken = sectlAuth.getAccessToken()
    if (!accessToken) {
      throw new Error("未授权，请先登录")
    }

    const url = `${SECTL_CONFIG.baseUrl}/api/cloud/files/${fileId}`

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
        throw new Error(error.error_description || "删除文件失败")
      }

      return await response.json()
    } catch (error) {
      console.error("删除文件失败:", error)
      throw error
    }
  }

  /**
   * 重命名文件
   */
  async renameFile(
    fileId: string,
    newFilename: string
  ): Promise<{
    file_id: string
    filename: string
    updated_at: string
  }> {
    const accessToken = sectlAuth.getAccessToken()
    if (!accessToken) {
      throw new Error("未授权，请先登录")
    }

    const url = `${SECTL_CONFIG.baseUrl}/api/cloud/files/${fileId}`

    try {
      const response = await fetch(url, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          client_id: SECTL_CONFIG.platformId,
          user_id: sectlAuth.getToken()?.user_id || "",
          filename: newFilename,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error_description || "重命名文件失败")
      }

      return await response.json()
    } catch (error) {
      console.error("重命名文件失败:", error)
      throw error
    }
  }

  /**
   * 创建分享链接
   */
  async createShare(
    fileId: string,
    options?: {
      expires_in?: number // 秒，0 表示永久
      password?: string
    }
  ): Promise<{
    share_id: string
    share_url: string
    file_id: string
    filename: string
    expires_at?: string
    has_password: boolean
  }> {
    const accessToken = sectlAuth.getAccessToken()
    if (!accessToken) {
      throw new Error("未授权，请先登录")
    }

    const url = `${SECTL_CONFIG.baseUrl}/api/cloud/share`

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
          file_id: fileId,
          expires_in: options?.expires_in || 86400, // 默认 1 天
          password: options?.password,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error_description || "创建分享失败")
      }

      return await response.json()
    } catch (error) {
      console.error("创建分享失败:", error)
      throw error
    }
  }

  /**
   * 获取分享列表
   */
  async listShares(): Promise<{ shares: ShareLink[]; total: number }> {
    const accessToken = sectlAuth.getAccessToken()
    if (!accessToken) {
      throw new Error("未授权，请先登录")
    }

    const params = new URLSearchParams({
      client_id: SECTL_CONFIG.platformId,
      user_id: sectlAuth.getToken()?.user_id || "",
    })

    const url = `${SECTL_CONFIG.baseUrl}/api/cloud/shares?${params.toString()}`

    try {
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error_description || "获取分享列表失败")
      }

      return await response.json()
    } catch (error) {
      console.error("获取分享列表失败:", error)
      throw error
    }
  }

  /**
   * 禁用分享
   */
  async disableShare(shareId: string): Promise<{ success: boolean; message: string }> {
    const accessToken = sectlAuth.getAccessToken()
    if (!accessToken) {
      throw new Error("未授权，请先登录")
    }

    const url = `${SECTL_CONFIG.baseUrl}/api/cloud/shares/${shareId}/disable`

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
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error_description || "禁用分享失败")
      }

      return await response.json()
    } catch (error) {
      console.error("禁用分享失败:", error)
      throw error
    }
  }

  /**
   * 启用分享
   */
  async enableShare(shareId: string): Promise<{ success: boolean; message: string }> {
    const accessToken = sectlAuth.getAccessToken()
    if (!accessToken) {
      throw new Error("未授权，请先登录")
    }

    const url = `${SECTL_CONFIG.baseUrl}/api/cloud/shares/${shareId}/enable`

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
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error_description || "启用分享失败")
      }

      return await response.json()
    } catch (error) {
      console.error("启用分享失败:", error)
      throw error
    }
  }

  /**
   * 删除分享
   */
  async deleteShare(shareId: string): Promise<{ success: boolean; message: string }> {
    const accessToken = sectlAuth.getAccessToken()
    if (!accessToken) {
      throw new Error("未授权，请先登录")
    }

    const url = `${SECTL_CONFIG.baseUrl}/api/cloud/shares/${shareId}`

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
        throw new Error(error.error_description || "删除分享失败")
      }

      return await response.json()
    } catch (error) {
      console.error("删除分享失败:", error)
      throw error
    }
  }

  /**
   * 获取存储使用情况
   */
  async getStorageUsage(): Promise<StorageUsage> {
    const accessToken = sectlAuth.getAccessToken()
    if (!accessToken) {
      throw new Error("未授权，请先登录")
    }

    const params = new URLSearchParams({
      client_id: SECTL_CONFIG.platformId,
      user_id: sectlAuth.getToken()?.user_id || "",
    })

    const url = `${SECTL_CONFIG.baseUrl}/api/cloud/storage/usage?${params.toString()}`

    try {
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error_description || "获取存储使用情况失败")
      }

      return await response.json()
    } catch (error) {
      console.error("获取存储使用情况失败:", error)
      throw error
    }
  }
}

// 导出单例
export const sectlCloudStorage = new SectlCloudStorageService()
