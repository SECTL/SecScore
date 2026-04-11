/**
 * SECTL 通知服务
 * 提供通知的获取、发送、管理等功能
 */

import { SECTL_CONFIG, sectlAuth } from "./sectlAuth"

// 通知类型
export interface Notification {
  $id: string
  user_id: string
  title: string
  content?: string
  type: string
  source?: string
  source_id?: string
  is_read: boolean
  created_at: string
  read_at?: string
  action_url?: string
  icon?: string
  priority: "low" | "normal" | "high"
  expires_at?: string
}

// 发送通知参数
export interface SendNotificationParams {
  user_id: string
  title: string
  content?: string
  type?: string
  source_id?: string
  action_url?: string
  icon?: string
  priority?: "low" | "normal" | "high"
  expires_at?: string
}

class SectlNotificationService {
  /**
   * 获取通知列表
   */
  async getNotifications(options?: {
    limit?: number
    offset?: number
    unread_only?: boolean
  }): Promise<{ notifications: Notification[]; total: number }> {
    const accessToken = sectlAuth.getAccessToken()
    if (!accessToken) {
      throw new Error("未授权，请先登录")
    }

    const params = new URLSearchParams({
      limit: String(options?.limit || 20),
      offset: String(options?.offset || 0),
    })

    if (options?.unread_only) {
      params.append("unread_only", "true")
    }

    const url = `${SECTL_CONFIG.baseUrl}/api/notifications?${params.toString()}`

    try {
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error_description || "获取通知列表失败")
      }

      return await response.json()
    } catch (error) {
      console.error("获取通知列表失败:", error)
      throw error
    }
  }

  /**
   * 标记通知为已读
   */
  async markNotificationRead(notificationId: string): Promise<{
    success: boolean
    notification: {
      $id: string
      is_read: boolean
      read_at: string
    }
  }> {
    const accessToken = sectlAuth.getAccessToken()
    if (!accessToken) {
      throw new Error("未授权，请先登录")
    }

    const url = `${SECTL_CONFIG.baseUrl}/api/notifications/${notificationId}/read`

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error_description || "标记通知已读失败")
      }

      return await response.json()
    } catch (error) {
      console.error("标记通知已读失败:", error)
      throw error
    }
  }

  /**
   * 标记所有通知为已读
   */
  async markAllNotificationsRead(): Promise<{ success: boolean; marked_count: number }> {
    const accessToken = sectlAuth.getAccessToken()
    if (!accessToken) {
      throw new Error("未授权，请先登录")
    }

    const url = `${SECTL_CONFIG.baseUrl}/api/notifications/read-all`

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error_description || "标记所有通知已读失败")
      }

      return await response.json()
    } catch (error) {
      console.error("标记所有通知已读失败:", error)
      throw error
    }
  }

  /**
   * 删除通知
   */
  async deleteNotification(notificationId: string): Promise<{ success: boolean; message: string }> {
    const accessToken = sectlAuth.getAccessToken()
    if (!accessToken) {
      throw new Error("未授权，请先登录")
    }

    const url = `${SECTL_CONFIG.baseUrl}/api/notifications/${notificationId}`

    try {
      const response = await fetch(url, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error_description || "删除通知失败")
      }

      return await response.json()
    } catch (error) {
      console.error("删除通知失败:", error)
      throw error
    }
  }

  /**
   * 发送通知（需要平台权限）
   */
  async sendNotification(params: SendNotificationParams): Promise<{
    success: boolean
    notification_id: string
    message: string
  }> {
    const accessToken = sectlAuth.getAccessToken()
    if (!accessToken) {
      throw new Error("未授权，请先登录")
    }

    const url = `${SECTL_CONFIG.baseUrl}/api/notifications/send`

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...params,
          client_id: SECTL_CONFIG.platformId,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error_description || "发送通知失败")
      }

      return await response.json()
    } catch (error) {
      console.error("发送通知失败:", error)
      throw error
    }
  }
}

// 导出单例
export const sectlNotification = new SectlNotificationService()
