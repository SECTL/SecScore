import { sectlKVStorage } from "./sectlKVStorage"
import { sectlAuth } from "./sectlAuth"

const SYNC_PREFIX = "ss"

const SYNC_TABLES = [
  "students",
  "reasons",
  "score_events",
  "tags",
  "student_tags",
  "reward_settings",
  "reward_redemptions",
] as const

type SyncTable = (typeof SYNC_TABLES)[number]

interface SyncMetadata {
  last_sync_at: string
  table_versions: Record<SyncTable, string>
  device_id: string
}

interface TableSyncResult {
  table: SyncTable
  uploaded: number
  downloaded: number
  errors: string[]
}

export interface CloudSyncResult {
  success: boolean
  message: string
  tables: TableSyncResult[]
  synced_at: string
}

export interface CloudSyncStatus {
  is_configured: boolean
  last_sync_at: string | null
  last_error: string | null
  table_count: number
  is_syncing: boolean
}

type SyncDirection = "push" | "pull" | "bidirectional"

const generateDeviceId = (): string => {
  const stored = localStorage.getItem("ss_cloud_device_id")
  if (stored) return stored
  const id = `dev_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
  localStorage.setItem("ss_cloud_device_id", id)
  return id
}

const buildKey = (table: SyncTable): string => `${SYNC_PREFIX}:${table}`

const buildMetadataKey = (): string => `${SYNC_PREFIX}:__metadata`

const safeJsonParse = <T>(value: unknown): T | null => {
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as T
    } catch {
      return null
    }
  }
  if (value && typeof value === "object") return value as T
  return null
}

class SectlCloudSyncService {
  private deviceId: string
  private isSyncing: boolean = false
  private lastSyncAt: string | null = null
  private lastError: string | null = null

  constructor() {
    this.deviceId = generateDeviceId()
  }

  getStatus(): CloudSyncStatus {
    const cached = localStorage.getItem("ss_cloud_sync_status")
    let lastSyncAt = this.lastSyncAt
    if (!lastSyncAt && cached) {
      try {
        const parsed = JSON.parse(cached)
        lastSyncAt = parsed.last_sync_at || null
      } catch {
        // ignore
      }
    }
    return {
      is_configured: sectlAuth.isAuthenticated(),
      last_sync_at: lastSyncAt,
      last_error: this.lastError,
      table_count: SYNC_TABLES.length,
      is_syncing: this.isSyncing,
    }
  }

  private saveStatus() {
    localStorage.setItem(
      "ss_cloud_sync_status",
      JSON.stringify({
        last_sync_at: this.lastSyncAt,
        last_error: this.lastError,
      })
    )
  }

  async fetchCloudData(table: SyncTable): Promise<unknown[] | null> {
    try {
      const key = buildKey(table)
      const result = await sectlKVStorage.getKV(key)
      if (result && "value" in result) {
        const parsed = safeJsonParse<unknown[]>(result.value)
        return Array.isArray(parsed) ? parsed : null
      }
      return null
    } catch {
      return null
    }
  }

  async pushTableData(table: SyncTable, data: unknown[]): Promise<number> {
    try {
      const key = buildKey(table)
      const jsonValue = JSON.stringify(data)
      const result = await sectlKVStorage.setKV(key, jsonValue)
      return result.success ? data.length : 0
    } catch {
      return 0
    }
  }

  async fetchMetadata(): Promise<SyncMetadata | null> {
    try {
      const key = buildMetadataKey()
      const result = await sectlKVStorage.getKV(key)
      if (result && "value" in result) {
        return safeJsonParse<SyncMetadata>(result.value)
      }
      return null
    } catch {
      return null
    }
  }

  async pushMetadata(metadata: SyncMetadata): Promise<boolean> {
    try {
      const key = buildMetadataKey()
      const result = await sectlKVStorage.setKV(key, JSON.stringify(metadata))
      return result.success
    } catch {
      return false
    }
  }

  private async getLocalData(table: SyncTable): Promise<unknown[]> {
    const api = (window as any).api
    if (!api) return []
    try {
      const apiMap: Record<SyncTable, string> = {
        students: "getStudents",
        reasons: "getReasons",
        score_events: "getScoreEvents",
        tags: "getTags",
        student_tags: "getStudentTags",
        reward_settings: "getRewardSettings",
        reward_redemptions: "getRewardRedemptions",
      }
      const methodName = apiMap[table]
      if (!methodName || !api[methodName]) return []
      const res = await api[methodName]()
      return res.success && Array.isArray(res.data) ? res.data : []
    } catch {
      return []
    }
  }

  private async setLocalData(table: SyncTable, data: unknown[]): Promise<boolean> {
    const api = (window as any).api
    if (!api) return false
    try {
      const methodName = `import${table.charAt(0).toUpperCase() + table.slice(1)}Data`
      if (api[methodName]) {
        const res = await api[methodName](JSON.stringify(data))
        return res.success
      }
      const res = await api.importTableData(table, JSON.stringify(data))
      return res.success
    } catch {
      return false
    }
  }

  async syncToCloud(localDataMap?: Map<SyncTable, unknown[]>): Promise<CloudSyncResult> {
    if (this.isSyncing) {
      return {
        success: false,
        message: "同步正在进行中",
        tables: [],
        synced_at: new Date().toISOString(),
      }
    }

    if (!sectlAuth.isAuthenticated()) {
      return {
        success: false,
        message: "请先登录 SECTL Auth 账户",
        tables: [],
        synced_at: new Date().toISOString(),
      }
    }

    this.isSyncing = true
    const results: TableSyncResult[] = []
    const syncedAt = new Date().toISOString()

    try {
      for (const table of SYNC_TABLES) {
        const tableResult: TableSyncResult = {
          table,
          uploaded: 0,
          downloaded: 0,
          errors: [],
        }

        try {
          const localData = localDataMap?.get(table) ?? (await this.getLocalData(table))
          const uploaded = await this.pushTableData(table, localData)
          tableResult.uploaded = uploaded
        } catch (err: unknown) {
          tableResult.errors.push(err instanceof Error ? err.message : String(err))
        }

        results.push(tableResult)
      }

      const metadata: SyncMetadata = {
        last_sync_at: syncedAt,
        table_versions: Object.fromEntries(SYNC_TABLES.map((t) => [t, syncedAt])) as Record<
          SyncTable,
          string
        >,
        device_id: this.deviceId,
      }
      await this.pushMetadata(metadata)

      this.lastSyncAt = syncedAt
      this.lastError = null
      this.saveStatus()

      return {
        success: true,
        message: `已上传 ${results.reduce((s, r) => s + r.uploaded, 0)} 条记录到云端`,
        tables: results,
        synced_at: syncedAt,
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      this.lastError = msg
      this.saveStatus()
      return {
        success: false,
        message: `同步失败：${msg}`,
        tables: results,
        synced_at: syncedAt,
      }
    } finally {
      this.isSyncing = false
    }
  }

  async syncFromCloud(): Promise<CloudSyncResult> {
    if (this.isSyncing) {
      return {
        success: false,
        message: "同步正在进行中",
        tables: [],
        synced_at: new Date().toISOString(),
      }
    }

    if (!sectlAuth.isAuthenticated()) {
      return {
        success: false,
        message: "请先登录 SECTL Auth 账户",
        tables: [],
        synced_at: new Date().toISOString(),
      }
    }

    this.isSyncing = true
    const results: TableSyncResult[] = []
    const syncedAt = new Date().toISOString()

    try {
      for (const table of SYNC_TABLES) {
        const tableResult: TableSyncResult = {
          table,
          uploaded: 0,
          downloaded: 0,
          errors: [],
        }

        try {
          const cloudData = await this.fetchCloudData(table)
          if (cloudData) {
            const applied = await this.setLocalData(table, cloudData)
            if (applied) {
              tableResult.downloaded = cloudData.length
            } else {
              tableResult.errors.push("应用云端数据失败")
            }
          }
        } catch (err: unknown) {
          tableResult.errors.push(err instanceof Error ? err.message : String(err))
        }

        results.push(tableResult)
      }

      this.lastSyncAt = syncedAt
      this.lastError = null
      this.saveStatus()

      return {
        success: true,
        message: `已从云端下载 ${results.reduce((s, r) => s + r.downloaded, 0)} 条记录`,
        tables: results,
        synced_at: syncedAt,
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      this.lastError = msg
      this.saveStatus()
      return {
        success: false,
        message: `同步失败：${msg}`,
        tables: results,
        synced_at: syncedAt,
      }
    } finally {
      this.isSyncing = false
    }
  }

  async fullSync(direction: SyncDirection = "bidirectional"): Promise<CloudSyncResult> {
    if (this.isSyncing) {
      return {
        success: false,
        message: "同步正在进行中",
        tables: [],
        synced_at: new Date().toISOString(),
      }
    }

    if (!sectlAuth.isAuthenticated()) {
      return {
        success: false,
        message: "请先登录 SECTL Auth 账户",
        tables: [],
        synced_at: new Date().toISOString(),
      }
    }

    this.isSyncing = true
    const results: TableSyncResult[] = []
    const syncedAt = new Date().toISOString()

    try {
      const metadata = await this.fetchMetadata()
      const isRemoteDevice = metadata?.device_id !== this.deviceId

      for (const table of SYNC_TABLES) {
        const tableResult: TableSyncResult = {
          table,
          uploaded: 0,
          downloaded: 0,
          errors: [],
        }

        try {
          if (direction === "push") {
            const localData = await this.getLocalData(table)
            const uploaded = await this.pushTableData(table, localData)
            tableResult.uploaded = uploaded
          } else if (direction === "pull") {
            const cloudData = await this.fetchCloudData(table)
            if (cloudData) {
              const applied = await this.setLocalData(table, cloudData)
              if (applied) tableResult.downloaded = cloudData.length
              else tableResult.errors.push("应用云端数据失败")
            }
          } else {
            const cloudData = await this.fetchCloudData(table)
            const localData = await this.getLocalData(table)

            if (!cloudData || cloudData.length === 0) {
              const uploaded = await this.pushTableData(table, localData)
              tableResult.uploaded = uploaded
            } else if (localData.length === 0) {
              const applied = await this.setLocalData(table, cloudData)
              if (applied) tableResult.downloaded = cloudData.length
              else tableResult.errors.push("应用云端数据失败")
            } else {
              const cloudTs = metadata?.table_versions?.[table]
              const cloudTime = cloudTs ? new Date(cloudTs).getTime() : 0
              const now = Date.now()

              if (isRemoteDevice || cloudTime < now - 60_000) {
                const uploaded = await this.pushTableData(table, localData)
                tableResult.uploaded = uploaded
              } else {
                const applied = await this.setLocalData(table, cloudData)
                if (applied) tableResult.downloaded = cloudData.length
                else tableResult.errors.push("应用云端数据失败")
              }
            }
          }
        } catch (err: unknown) {
          tableResult.errors.push(err instanceof Error ? err.message : String(err))
        }

        results.push(tableResult)
      }

      const newMetadata: SyncMetadata = {
        last_sync_at: syncedAt,
        table_versions: Object.fromEntries(SYNC_TABLES.map((t) => [t, syncedAt])) as Record<
          SyncTable,
          string
        >,
        device_id: this.deviceId,
      }
      await this.pushMetadata(newMetadata)

      this.lastSyncAt = syncedAt
      this.lastError = null
      this.saveStatus()

      const totalUploaded = results.reduce((s, r) => s + r.uploaded, 0)
      const totalDownloaded = results.reduce((s, r) => s + r.downloaded, 0)
      return {
        success: true,
        message: `同步完成：上传 ${totalUploaded} 条，下载 ${totalDownloaded} 条`,
        tables: results,
        synced_at: syncedAt,
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      this.lastError = msg
      this.saveStatus()
      return {
        success: false,
        message: `同步失败：${msg}`,
        tables: results,
        synced_at: syncedAt,
      }
    } finally {
      this.isSyncing = false
    }
  }

  async getCloudStorageUsage(): Promise<{
    used: number
    total: number
    percentage: number
    table_stats: Array<{ table: SyncTable; count: number; size: number }>
  } | null> {
    try {
      const tableStats: Array<{ table: SyncTable; count: number; size: number }> = []
      let totalSize = 0

      for (const table of SYNC_TABLES) {
        const key = buildKey(table)
        const result = await sectlKVStorage.getKV(key)
        if (result && "value" in result) {
          const size = (result as any).size || 0
          const parsed = safeJsonParse<unknown[]>(result.value)
          tableStats.push({
            table,
            count: Array.isArray(parsed) ? parsed.length : 0,
            size,
          })
          totalSize += size
        } else {
          tableStats.push({ table, count: 0, size: 0 })
        }
      }

      const maxStorage = 64 * 1024 * SYNC_TABLES.length
      return {
        used: totalSize,
        total: maxStorage,
        percentage: maxStorage > 0 ? Math.round((totalSize / maxStorage) * 100) : 0,
        table_stats: tableStats,
      }
    } catch {
      return null
    }
  }
}

export const sectlCloudSync = new SectlCloudSyncService()
