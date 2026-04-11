/**
 * SECTL 积分数据同步服务
 * 使用 KV 存储同步 SecScore 的积分数据
 */

import { sectlKVStorage } from "./sectlKVStorage"
import { sectlAuth } from "./sectlAuth"

// 数据结构定义
export interface ScoreData {
  studentId: string
  studentName: string
  currentScore: number
  lastUpdated: string
}

export interface ScoreEvent {
  id: string
  studentId: string
  scoreChange: number
  reason: string
  createdAt: string
}

export interface SyncedData {
  version: string
  lastSyncTime: string
  students: ScoreData[]
  events: ScoreEvent[]
  settings: {
    reasons: any[]
    tags: any[]
  }
}

// 数据键名
const DATA_KEYS = {
  STUDENTS: "secscore_students",
  EVENTS: "secscore_events",
  SETTINGS: "secscore_settings",
  SYNC_META: "secscore_sync_metadata",
}

class ScoreSyncService {
  /**
   * 同步学生数据到云端
   */
  async syncStudents(students: any[]): Promise<void> {
    if (!sectlAuth.isAuthenticated()) {
      throw new Error("未授权，请先登录")
    }

    try {
      // 转换数据格式
      const scoreData: ScoreData[] = students.map((student) => ({
        studentId: student.id,
        studentName: student.name,
        currentScore: student.score || 0,
        lastUpdated: new Date().toISOString(),
      }))

      // 保存到云端
      await sectlKVStorage.setKV(DATA_KEYS.STUDENTS, scoreData, {
        is_json: true,
      })

      console.log("学生数据同步成功")
    } catch (error: any) {
      console.error("同步学生数据失败:", error)
      throw new Error(`同步失败：${error.message}`)
    }
  }

  /**
   * 从云端加载学生数据
   */
  async loadStudents(): Promise<ScoreData[]> {
    if (!sectlAuth.isAuthenticated()) {
      throw new Error("未授权，请先登录")
    }

    try {
      const result = await sectlKVStorage.getKV<ScoreData[]>(DATA_KEYS.STUDENTS)
      return result.value || []
    } catch (error: any) {
      if (error.message.includes("不存在")) {
        return []
      }
      throw error
    }
  }

  /**
   * 同步积分事件到云端
   */
  async syncEvents(events: any[]): Promise<void> {
    if (!sectlAuth.isAuthenticated()) {
      throw new Error("未授权，请先登录")
    }

    try {
      const scoreEvents: ScoreEvent[] = events.map((event) => ({
        id: event.id,
        studentId: event.student_id,
        scoreChange: event.score_change,
        reason: event.reason,
        createdAt: event.created_at,
      }))

      await sectlKVStorage.setKV(DATA_KEYS.EVENTS, scoreEvents, {
        is_json: true,
      })

      console.log("积分事件同步成功")
    } catch (error: any) {
      console.error("同步积分事件失败:", error)
      throw new Error(`同步失败：${error.message}`)
    }
  }

  /**
   * 从云端加载积分事件
   */
  async loadEvents(): Promise<ScoreEvent[]> {
    if (!sectlAuth.isAuthenticated()) {
      throw new Error("未授权，请先登录")
    }

    try {
      const result = await sectlKVStorage.getKV<ScoreEvent[]>(DATA_KEYS.EVENTS)
      return result.value || []
    } catch (error: any) {
      if (error.message.includes("不存在")) {
        return []
      }
      throw error
    }
  }

  /**
   * 同步设置数据（理由、标签等）
   */
  async syncSettings(settings: { reasons: any[]; tags: any[] }): Promise<void> {
    if (!sectlAuth.isAuthenticated()) {
      throw new Error("未授权，请先登录")
    }

    try {
      await sectlKVStorage.setKV(DATA_KEYS.SETTINGS, settings, {
        is_json: true,
      })

      console.log("设置数据同步成功")
    } catch (error: any) {
      console.error("同步设置数据失败:", error)
      throw new Error(`同步失败：${error.message}`)
    }
  }

  /**
   * 从云端加载设置数据
   */
  async loadSettings(): Promise<{ reasons: any[]; tags: any[] }> {
    if (!sectlAuth.isAuthenticated()) {
      throw new Error("未授权，请先登录")
    }

    try {
      const result = await sectlKVStorage.getKV(DATA_KEYS.SETTINGS)
      return result.value || { reasons: [], tags: [] }
    } catch (error: any) {
      if (error.message.includes("不存在")) {
        return { reasons: [], tags: [] }
      }
      throw error
    }
  }

  /**
   * 更新同步元数据
   */
  async updateSyncMetadata(): Promise<void> {
    const metadata = {
      version: "1.0",
      lastSyncTime: new Date().toISOString(),
      platform: "secscore",
    }

    await sectlKVStorage.setKV(DATA_KEYS.SYNC_META, metadata, {
      is_json: true,
    })
  }

  /**
   * 获取同步元数据
   */
  async getSyncMetadata(): Promise<{
    version: string
    lastSyncTime: string
    platform: string
  } | null> {
    try {
      const result = await sectlKVStorage.getKV(DATA_KEYS.SYNC_META)
      return result.value
    } catch {
      return null
    }
  }

  /**
   * 完整同步（所有数据）
   */
  async fullSync(data: {
    students: any[]
    events: any[]
    settings: { reasons: any[]; tags: any[] }
  }): Promise<void> {
    if (!sectlAuth.isAuthenticated()) {
      throw new Error("未授权，请先登录")
    }

    try {
      await this.syncStudents(data.students)
      await this.syncEvents(data.events)
      await this.syncSettings(data.settings)
      await this.updateSyncMetadata()

      console.log("完整数据同步成功")
    } catch (error: any) {
      console.error("完整数据同步失败:", error)
      throw error
    }
  }

  /**
   * 从云端恢复所有数据
   */
  async restoreFromCloud(): Promise<{
    students: ScoreData[]
    events: ScoreEvent[]
    settings: { reasons: any[]; tags: any[] }
    metadata: any
  }> {
    if (!sectlAuth.isAuthenticated()) {
      throw new Error("未授权，请先登录")
    }

    try {
      const [students, events, settings, metadata] = await Promise.all([
        this.loadStudents(),
        this.loadEvents(),
        this.loadSettings(),
        this.getSyncMetadata(),
      ])

      return { students, events, settings, metadata }
    } catch (error: any) {
      console.error("从云端恢复数据失败:", error)
      throw error
    }
  }

  /**
   * 检查云端是否有数据
   */
  async hasCloudData(): Promise<boolean> {
    try {
      const students = await this.loadStudents()
      return students.length > 0
    } catch {
      return false
    }
  }

  /**
   * 清除云端数据
   */
  async clearCloudData(): Promise<void> {
    if (!sectlAuth.isAuthenticated()) {
      throw new Error("未授权，请先登录")
    }

    try {
      await Promise.all([
        sectlKVStorage.deleteKV(DATA_KEYS.STUDENTS),
        sectlKVStorage.deleteKV(DATA_KEYS.EVENTS),
        sectlKVStorage.deleteKV(DATA_KEYS.SETTINGS),
        sectlKVStorage.deleteKV(DATA_KEYS.SYNC_META),
      ])

      console.log("云端数据已清除")
    } catch (error: any) {
      console.error("清除云端数据失败:", error)
      throw error
    }
  }
}

// 导出单例
export const scoreSyncService = new ScoreSyncService()
