import { sectlAuth } from "./sectlAuth"

const SERVER_URL_KEY = "ss_sync_server_url"
const DEVICE_ID_KEY = "ss_sync_device_id"
const OUTBOX_KEY = "ss_sync_outbox"
const APPLIED_KEY = "ss_sync_applied_operations"
const CURSOR_KEY = "ss_sync_cursor"
const SYNC_ENABLED_KEY = "ss_sync_enabled"
const DEFAULT_SERVER_URL = (import.meta as any).env?.VITE_SYNC_SERVER_URL || "http://127.0.0.1:8787"
const SYNC_REQUEST_TIMEOUT_MS = 10_000
const SNAPSHOT_REQUEST_TIMEOUT_MS = 15_000
const SNAPSHOT_RETRY_INTERVAL_MS = 60_000

const getCurrentClassId = (): string => {
  try {
    return localStorage.getItem("ss_current_class_id") || "default"
  } catch {
    return "default"
  }
}

const scopedKey = (key: string): string => `${key}:${getCurrentClassId()}`

const maskIdentifier = (value: string | null | undefined): string => {
  if (!value) return "none"
  if (value.length <= 8) return "***"
  return `${value.slice(0, 4)}…${value.slice(-4)}`
}

const getScopedValue = (key: string, fallback: string): string => {
  try {
    return localStorage.getItem(scopedKey(key)) || fallback
  } catch {
    return fallback
  }
}

const setScopedValue = (key: string, value: string) => {
  localStorage.setItem(scopedKey(key), value)
}

export type SyncConnectionState =
  | "disabled"
  | "connecting"
  | "online"
  | "offline"
  | "auth_error"
  | "error"

export interface SyncStatus {
  state: SyncConnectionState
  enabled: boolean
  browserOnline: boolean
  authenticated: boolean
  realtimeConnected: boolean
  isSyncing: boolean
  serverUrl: string
  lastSyncAt: string | null
  lastError: string | null
}

const syncLog = (
  level: "debug" | "info" | "warn" | "error",
  message: string,
  meta: Record<string, unknown> = {}
) => {
  try {
    void (window as any).api?.writeLog?.({
      level,
      message: `[sync] ${message}`,
      meta: { ...meta, at: new Date().toISOString() },
    })
  } catch {
    // 日志失败不能影响同步。
  }
}

const describeAccessToken = (token: string | null) => ({
  has_token: Boolean(token),
  token_length: token?.length || 0,
  token_kind: token ? (token.split(".").length === 3 ? "jwt_like" : "opaque") : "none",
})

interface PendingOperation {
  op_id: string
  client_seq: number
  lamport: number
  entity_type: "student"
  entity_id: string
  operation_type: "score.adjust" | "reward.redeem"
  payload: Record<string, unknown>
  client_created_at: string
}

interface SyncResponse {
  server_change_seq: number
  accepted_operations: Array<{ op_id: string; server_change_seq: number; status: string }>
  remote_operations: Array<PendingOperation & { server_change_seq: number; device_id: string }>
  balances: Array<{ student_id: string; score: number; reward_points: number }>
  has_more: boolean
}

const getJson = <T>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(scopedKey(key))
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

const setJson = (key: string, value: unknown) => {
  localStorage.setItem(scopedKey(key), JSON.stringify(value))
}

const newUuid = () => {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID()
  return `op_${Date.now()}_${Math.random().toString(36).slice(2)}`
}

const deterministicEntityId = (studentName: string): string => {
  let hash = 2166136261
  for (let index = 0; index < studentName.length; index += 1) {
    hash ^= studentName.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  const hex = Math.abs(hash).toString(16).padStart(8, "0")
  return `${hex}-0000-5000-8000-${hex}${hex.slice(0, 4)}`
}

class SyncClient {
  private syncing = false
  private syncRequested = false
  private syncRequestedForceSnapshot = false
  private snapshotRequested = false
  private snapshotPullRequested = false
  private snapshotRequestTimer: number | null = null
  private timer: number | null = null
  private enabled = false
  private lastSnapshotAt = 0
  private lastSnapshotAttemptAt = 0
  private snapshotAbortController: AbortController | null = null
  private changeStreamAbortController: AbortController | null = null
  private changeStreamRunning = false
  private changeStreamConnected = false
  private changeStreamAuthError = false
  private tokenRecoveryInProgress = false
  private lastTokenRecoveryAt = 0
  private readonly appliedOperationIds = new Set<string>()
  private readonly applyingOperationPromises = new Map<string, Promise<boolean>>()
  private onlineHandler: (() => void) | null = null
  private offlineHandler: (() => void) | null = null
  private oauthHandler: (() => void) | null = null
  private readonly statusListeners = new Set<(status: SyncStatus) => void>()
  private status: SyncStatus = {
    state: "disabled",
    enabled: false,
    browserOnline: typeof navigator === "undefined" ? true : navigator.onLine,
    authenticated: sectlAuth.isAuthenticated(),
    realtimeConnected: false,
    isSyncing: false,
    serverUrl: localStorage.getItem(SERVER_URL_KEY) || DEFAULT_SERVER_URL,
    lastSyncAt: null,
    lastError: null,
  }

  getStatus(): SyncStatus {
    return { ...this.status }
  }

  private async getRemoteClassId(): Promise<string | null> {
    try {
      const result = await (window as any).api?.workspaceGetState?.()
      const current = result?.success
        ? result.data?.classes?.find((item: { is_current?: boolean }) => item.is_current)
        : null
      return current?.remote_id || null
    } catch (error) {
      syncLog("warn", "读取当前云端班级失败", {
        local_class_id: getCurrentClassId(),
        error: String(error),
      })
      return null
    }
  }

  subscribeStatus(listener: (status: SyncStatus) => void): () => void {
    this.statusListeners.add(listener)
    listener(this.getStatus())
    return () => this.statusListeners.delete(listener)
  }

  private updateStatus(patch: Partial<SyncStatus>): void {
    this.status = { ...this.status, ...patch }
    const nextStatus = this.getStatus()
    for (const listener of this.statusListeners) listener(nextStatus)
  }

  setEnabled(enabled: boolean) {
    const changed = this.enabled !== enabled
    this.enabled = enabled
    if (!enabled) {
      this.changeStreamAbortController?.abort()
      this.changeStreamConnected = false
      this.changeStreamAuthError = false
    }
    this.updateStatus({
      enabled,
      state: enabled ? (this.status.browserOnline ? "connecting" : "offline") : "disabled",
      authenticated: sectlAuth.isAuthenticated(),
      realtimeConnected: enabled ? this.changeStreamConnected : false,
      lastError: null,
    })
    localStorage.setItem(SYNC_ENABLED_KEY, String(enabled))
    syncLog("info", enabled ? "同步已启用" : "同步已停用", {
      server_url: localStorage.getItem(SERVER_URL_KEY) || DEFAULT_SERVER_URL,
      authenticated: sectlAuth.isAuthenticated(),
    })
    if (enabled && changed) {
      this.startChangeStream()
      // 启动阶段由 start() 发起唯一一次强制同步；运行中切换到云同步时才立即补一次快照。
      if (this.timer !== null) void this.syncNow(true)
    }
  }

  getRememberedEnabled(): boolean | null {
    const value = localStorage.getItem(SYNC_ENABLED_KEY)
    if (value === "true") return true
    if (value === "false") return false
    return null
  }

  setServerUrl(url: string) {
    const normalizedUrl = url.replace(/\/$/, "")
    localStorage.setItem(SERVER_URL_KEY, normalizedUrl)
    this.updateStatus({ serverUrl: normalizedUrl })
    syncLog("info", "同步服务器地址已更新", { server_url: localStorage.getItem(SERVER_URL_KEY) })
  }

  createOperationId(): string {
    return newUuid()
  }

  requestSnapshot(): void {
    this.snapshotRequested = true
    this.snapshotPullRequested = false
    syncLog("debug", "已登记上传快照请求", { local_class_id: getCurrentClassId() })
    this.snapshotAbortController?.abort()
    if (!this.enabled || this.snapshotRequestTimer !== null) return
    this.snapshotRequestTimer = window.setTimeout(() => {
      this.snapshotRequestTimer = null
      void this.syncNow()
    }, 100)
  }

  private requestSnapshotFromServer(): void {
    if (!this.snapshotRequested) this.snapshotPullRequested = true
    syncLog("debug", "已登记拉取远端快照请求", { local_class_id: getCurrentClassId() })
    this.snapshotAbortController?.abort()
    if (!this.enabled || this.snapshotRequestTimer !== null) return
    this.snapshotRequestTimer = window.setTimeout(() => {
      this.snapshotRequestTimer = null
      void this.syncNow()
    }, 100)
  }

  private getDeviceId(): string {
    const existing = localStorage.getItem(DEVICE_ID_KEY)
    if (existing) return existing
    const id = newUuid()
    localStorage.setItem(DEVICE_ID_KEY, id)
    return id
  }

  private getNextSequence(): number {
    const next = Number(getScopedValue("ss_sync_client_seq", "0")) + 1
    setScopedValue("ss_sync_client_seq", String(next))
    return next
  }

  private createOperation(
    operationType: PendingOperation["operation_type"],
    studentName: string,
    payload: Record<string, unknown>,
    operationId?: string
  ): PendingOperation {
    const clientSeq = this.getNextSequence()
    const lamport = Math.max(Number(getScopedValue("ss_sync_lamport", "0")), clientSeq) + 1
    setScopedValue("ss_sync_lamport", String(lamport))
    return {
      op_id: operationId || newUuid(),
      client_seq: clientSeq,
      lamport,
      entity_type: "student",
      entity_id: deterministicEntityId(studentName),
      operation_type: operationType,
      payload,
      client_created_at: new Date().toISOString(),
    }
  }

  private appendOperation(operation: PendingOperation): void {
    // 快照写入 SQLite 时如果用户产生了新操作，立即取消快照，让增量操作先发出。
    this.snapshotAbortController?.abort()
    const outbox = getJson<PendingOperation[]>(OUTBOX_KEY, [])
    outbox.push(operation)
    setJson(OUTBOX_KEY, outbox)
    syncLog("info", "积分操作已加入待同步队列", {
      local_class_id: getCurrentClassId(),
      op_id: operation.op_id,
      operation_type: operation.operation_type,
      student_name: operation.payload.student_name,
      score_delta: operation.payload.score_delta,
      reward_delta: operation.payload.reward_delta,
      outbox_count: outbox.length,
    })
  }

  async enqueueScoreAdjustment(input: {
    student_name: string
    reason_content: string
    delta: number
    operation_id?: string
  }): Promise<void> {
    const operation = this.createOperation(
      "score.adjust",
      input.student_name,
      {
        student_name: input.student_name,
        reason_content: input.reason_content,
        score_delta: input.delta,
        reward_delta: input.delta,
      },
      input.operation_id
    )
    try {
      this.appendOperation(operation)
      // 复用唯一的同步互斥锁，避免即时请求与定时请求同时发送同一个 outbox。
      void this.syncNow()
    } catch (error) {
      syncLog("error", "积分操作加入待同步队列失败", {
        operation_type: operation.operation_type,
        student_name: input.student_name,
        error: String(error),
      })
    }
  }

  async enqueueRewardRedemption(input: {
    student_name: string
    reward_id: number
    operation_id?: string
  }): Promise<void> {
    try {
      const reward = await (window as any).api.rewardSettingQuery()
      const rewardSetting = Array.isArray(reward?.data)
        ? reward.data.find((item: any) => Number(item.id) === input.reward_id)
        : null
      if (!rewardSetting) {
        syncLog("error", "奖励兑换未加入同步队列：找不到奖励配置", {
          student_name: input.student_name,
          reward_id: input.reward_id,
        })
        return
      }
      const operation = this.createOperation(
        "reward.redeem",
        input.student_name,
        {
          student_name: input.student_name,
          reward_id: input.reward_id,
          reward_name: rewardSetting.name,
          cost_points: Number(rewardSetting.cost_points),
        },
        input.operation_id
      )
      this.appendOperation(operation)
      void this.syncNow()
    } catch (error) {
      syncLog("error", "奖励兑换加入待同步队列失败", {
        operation_type: "reward.redeem",
        student_name: input.student_name,
        reward_id: input.reward_id,
        error: String(error),
      })
    }
  }

  private async buildSnapshot(): Promise<Record<string, unknown>> {
    const api = (window as any).api
    const [
      students,
      reasons,
      rewards,
      tags,
      events,
      redemptions,
      settlements,
      boards,
      settings,
      rules,
      batches,
    ] = await Promise.all([
      api.queryStudents(),
      api.queryReasons(),
      api.rewardSettingQuery(),
      api.tagsGetAll(),
      api.queryEvents({ limit: 100000 }),
      api.rewardRedemptionQuery({ limit: 100000 }),
      api.querySettlements(),
      api.boardGetConfigs(),
      api.getAllSettings(),
      api.autoScoreGetRules(),
      api.autoScoreQueryBatches(),
    ])

    const studentRows = Array.isArray(students?.data) ? students.data : []
    const studentTags = (
      await Promise.all(
        studentRows.map(async (student: any) => {
          const result = await api.tagsGetByStudent(Number(student.id))
          return (Array.isArray(result?.data) ? result.data : []).map((tag: any) => ({
            student_name: student.name,
            tag_name: tag.name,
            created_at: tag.created_at,
          }))
        })
      )
    ).flat()

    return {
      version: 1,
      students: studentRows,
      reasons: Array.isArray(reasons?.data) ? reasons.data : [],
      reward_settings: Array.isArray(rewards?.data) ? rewards.data : [],
      tags: Array.isArray(tags?.data) ? tags.data : [],
      student_tags: studentTags,
      score_events: Array.isArray(events?.data) ? events.data : [],
      reward_redemptions: Array.isArray(redemptions?.data) ? redemptions.data : [],
      settlements: Array.isArray(settlements?.data) ? settlements.data : [],
      board_configs: Array.isArray(boards?.data) ? boards.data : [],
      settings: {
        ...(settings?.data || {}),
        auto_score_rules: rules?.data || [],
        auto_score_batches: batches?.data || [],
      },
    }
  }

  private async syncSnapshot(): Promise<void> {
    const api = (window as any).api
    if (!api?.syncApplySnapshot) return
    const classId = await this.getRemoteClassId()
    if (!classId) return
    const serverUrl = localStorage.getItem(SERVER_URL_KEY) || DEFAULT_SERVER_URL
    const deviceId = this.getDeviceId()
    const snapshot = await this.buildSnapshot()
    const requestId = newUuid()
    const counts = Object.fromEntries(
      [
        "students",
        "reasons",
        "reward_settings",
        "tags",
        "student_tags",
        "score_events",
        "reward_redemptions",
        "settlements",
        "board_configs",
      ].map((key) => [key, Array.isArray(snapshot[key]) ? (snapshot[key] as unknown[]).length : 0])
    )
    syncLog("info", "开始上传业务数据快照", {
      local_class_id: getCurrentClassId(),
      remote_class_id: classId,
      request_id: requestId,
      server_url: serverUrl,
      device_id: deviceId,
      counts,
    })
    const controller = new AbortController()
    this.snapshotAbortController = controller
    const timeout = window.setTimeout(() => controller.abort(), SNAPSHOT_REQUEST_TIMEOUT_MS)
    try {
      const response = await fetch(`${serverUrl}/v1/snapshot`, {
        method: "POST",
        headers: await this.headers(requestId),
        body: JSON.stringify({ class_id: classId, device_id: deviceId, snapshot }),
        signal: controller.signal,
      })
      const responseText = await response.text()
      syncLog("debug", "收到业务数据快照响应", {
        request_id: requestId,
        status: response.status,
        response_bytes: responseText.length,
      })
      if (!response.ok) {
        syncLog("error", "业务数据快照上传失败", {
          local_class_id: getCurrentClassId(),
          remote_class_id: classId,
          request_id: requestId,
          status: response.status,
          body: responseText.slice(0, 1000),
          server_url: serverUrl,
          device_id: deviceId,
        })
        throw new Error(`snapshot HTTP ${response.status}`)
      }
      // 用户在请求期间产生了新积分时，不应用旧快照，避免覆盖刚写入的本地余额。
      if (getJson<PendingOperation[]>(OUTBOX_KEY, []).length > 0) {
        syncLog("info", "快照响应已收到，但存在新的积分操作，跳过本地快照写入", {
          local_class_id: getCurrentClassId(),
          remote_class_id: classId,
          device_id: deviceId,
        })
        return
      }
      const result = JSON.parse(responseText) as { snapshot?: Record<string, unknown> }
      if (result.snapshot) await this.applySnapshotResult(result.snapshot, deviceId)
    } finally {
      window.clearTimeout(timeout)
      if (this.snapshotAbortController === controller) this.snapshotAbortController = null
    }
  }

  private async applySnapshotResult(
    snapshot: Record<string, unknown>,
    deviceId: string
  ): Promise<void> {
    const api = (window as any).api
    const applied = await api.syncApplySnapshot(snapshot)
    syncLog(
      applied?.success ? "info" : "error",
      applied?.success ? "业务数据快照已应用到本地" : "业务数据快照写入本地失败",
      {
        local_class_id: getCurrentClassId(),
        device_id: deviceId,
        merged_counts: Object.fromEntries(
          Object.entries(snapshot).map(([key, value]) => [
            key,
            Array.isArray(value) ? value.length : typeof value,
          ])
        ),
        message: applied?.message,
      }
    )
    if (!applied?.success) throw new Error(applied?.message || "sync_apply_snapshot failed")
    window.dispatchEvent(
      new CustomEvent("ss:data-updated", { detail: { category: "all", source: "sync" } })
    )
  }

  private async pullSnapshot(): Promise<void> {
    const api = (window as any).api
    if (!api?.syncApplySnapshot) return
    const classId = await this.getRemoteClassId()
    if (!classId) return
    const serverUrl = localStorage.getItem(SERVER_URL_KEY) || DEFAULT_SERVER_URL
    const deviceId = this.getDeviceId()
    const requestId = newUuid()
    syncLog("info", "开始拉取服务器最新业务数据快照", {
      local_class_id: getCurrentClassId(),
      remote_class_id: classId,
      request_id: requestId,
      server_url: serverUrl,
      device_id: deviceId,
    })
    const controller = new AbortController()
    this.snapshotAbortController = controller
    const timeout = window.setTimeout(() => controller.abort(), SNAPSHOT_REQUEST_TIMEOUT_MS)
    try {
      const response = await fetch(`${serverUrl}/v1/snapshot?class_id=${encodeURIComponent(classId)}`, {
        headers: await this.headers(requestId),
        signal: controller.signal,
      })
      const responseText = await response.text()
      syncLog("debug", "收到服务器快照响应", {
        request_id: requestId,
        status: response.status,
        response_bytes: responseText.length,
      })
      if (!response.ok) {
        const message = `snapshot pull HTTP ${response.status}: ${responseText.slice(0, 500)}`
        syncLog("error", "拉取服务器快照失败", {
          local_class_id: getCurrentClassId(),
          remote_class_id: classId,
          request_id: requestId,
          status: response.status,
          body: responseText.slice(0, 1000),
        })
        throw new Error(message)
      }
      if (getJson<PendingOperation[]>(OUTBOX_KEY, []).length > 0) {
        syncLog("info", "拉取快照响应已收到，但存在待同步积分操作，跳过本地快照写入", {
          local_class_id: getCurrentClassId(),
          remote_class_id: classId,
          device_id: deviceId,
        })
        return
      }
      const result = JSON.parse(responseText) as { snapshot?: Record<string, unknown> }
      if (result.snapshot) await this.applySnapshotResult(result.snapshot, deviceId)
    } finally {
      window.clearTimeout(timeout)
      if (this.snapshotAbortController === controller) this.snapshotAbortController = null
    }
  }

  private async headers(requestId?: string): Promise<HeadersInit> {
    const token = sectlAuth.getAccessToken()
    const requestHeaders: Record<string, string> = {
      "Content-Type": "application/json",
    }
    if (requestId) requestHeaders["X-Request-Id"] = requestId
    if (token) {
      syncLog("debug", "准备携带 OAuth 令牌发送同步请求", {
        local_class_id: getCurrentClassId(),
        request_id: requestId,
        device_id: this.getDeviceId(),
        user_id: maskIdentifier(sectlAuth.getUserId()),
        ...describeAccessToken(token),
      })
      requestHeaders.Authorization = `Bearer ${token}`
      return {
        ...requestHeaders,
      }
    }
    syncLog("warn", "未找到 OAuth 令牌，同步请求将由服务器拒绝", {
      local_class_id: getCurrentClassId(),
      request_id: requestId,
      device_id: this.getDeviceId(),
      user_id: maskIdentifier(sectlAuth.getUserId()),
      ...describeAccessToken(token),
    })
    return requestHeaders
  }

  private getFailureState(error: unknown, status?: number): SyncConnectionState {
    if (status === 401 || status === 403) return "auth_error"
    if (!this.status.browserOnline || error instanceof TypeError) return "offline"
    return "error"
  }

  private async tryRecoverAuthentication(): Promise<boolean> {
    const token = sectlAuth.getToken()
    const now = Date.now()
    if (
      this.tokenRecoveryInProgress ||
      !token?.refresh_token ||
      now - this.lastTokenRecoveryAt < 60_000
    ) {
      return false
    }

    this.tokenRecoveryInProgress = true
    this.lastTokenRecoveryAt = now
    syncLog("warn", "检测到同步认证失败，尝试使用 refresh_token 恢复会话", {
      local_class_id: getCurrentClassId(),
      user_id: maskIdentifier(sectlAuth.getUserId()),
      device_id: this.getDeviceId(),
    })
    try {
      await sectlAuth.refreshAccessToken()
      this.changeStreamAuthError = false
      this.updateStatus({
        state: this.enabled ? "connecting" : "disabled",
        authenticated: true,
        realtimeConnected: false,
        lastError: null,
      })
      syncLog("info", "同步 OAuth 会话恢复成功，将重新建立实时连接", {
        local_class_id: getCurrentClassId(),
        user_id: maskIdentifier(sectlAuth.getUserId()),
        device_id: this.getDeviceId(),
      })
      return true
    } catch (error) {
      syncLog("warn", "同步 OAuth 会话恢复失败，需要重新登录", { error: String(error) })
      return false
    } finally {
      this.tokenRecoveryInProgress = false
    }
  }

  private rememberAppliedOperation(operationId: string): void {
    this.appliedOperationIds.add(operationId)
    const applied = getJson<string[]>(APPLIED_KEY, [])
    if (applied.includes(operationId)) return
    setJson(APPLIED_KEY, [...applied, operationId].slice(-5000))
  }

  private async applyRemoteOperationOnce(
    operation: PendingOperation & { server_change_seq: number; device_id: string }
  ): Promise<boolean> {
    // 服务端会把本设备的操作广播回本设备。该操作已经由 event_create/reward_redeem
    // 写入本地，不能再次作为远端增量应用，否则一次加分会再加一遍。
    if (operation.device_id === this.getDeviceId()) {
      this.rememberAppliedOperation(operation.op_id)
      return true
    }

    if (
      this.appliedOperationIds.has(operation.op_id) ||
      getJson<string[]>(APPLIED_KEY, []).includes(operation.op_id)
    ) {
      return true
    }

    const existing = this.applyingOperationPromises.get(operation.op_id)
    if (existing) return existing

    const promise = (async () => {
      try {
        const result = await (window as any).api.syncApplyRemoteOperation({
          operation_id: operation.op_id,
          operation_type: operation.operation_type,
          payload: operation.payload,
          client_created_at: operation.client_created_at,
        })
        if (result?.success) this.rememberAppliedOperation(operation.op_id)
        return Boolean(result?.success)
      } finally {
        this.applyingOperationPromises.delete(operation.op_id)
      }
    })()
    this.applyingOperationPromises.set(operation.op_id, promise)
    return promise
  }

  private async applySyncResponse(result: SyncResponse): Promise<void> {
    const acceptedIds = new Set(result.accepted_operations.map((item) => item.op_id))
    const currentOutbox = getJson<PendingOperation[]>(OUTBOX_KEY, [])
    setJson(
      OUTBOX_KEY,
      currentOutbox.filter((operation) => !acceptedIds.has(operation.op_id))
    )

    const applied = getJson<string[]>(APPLIED_KEY, [])
    const appliedSet = new Set(applied)
    for (const operation of result.accepted_operations) {
      appliedSet.add(operation.op_id)
      this.rememberAppliedOperation(operation.op_id)
    }
    for (const operation of result.remote_operations) {
      if (appliedSet.has(operation.op_id)) continue
      if (
        (operation.operation_type === "score.adjust" ||
          operation.operation_type === "reward.redeem") &&
        typeof operation.payload.student_name !== "string"
      ) {
        syncLog("warn", "跳过缺少 student_name 的历史远端操作", {
          operation_id: operation.op_id,
          operation_type: operation.operation_type,
          server_change_seq: operation.server_change_seq,
          device_id: operation.device_id,
        })
        appliedSet.add(operation.op_id)
        continue
      }
      const appliedSuccessfully = await this.applyRemoteOperationOnce(operation)
      if (appliedSuccessfully) appliedSet.add(operation.op_id)
    }
    setJson(APPLIED_KEY, Array.from(appliedSet).slice(-5000))
    const lastRemoteSeq = result.remote_operations.at(-1)?.server_change_seq
    localStorage.setItem(
      CURSOR_KEY,
      String(
        result.has_more
          ? lastRemoteSeq || Number(getScopedValue(CURSOR_KEY, "0"))
          : result.server_change_seq
      )
    )
    if (result.remote_operations.length > 0) {
      window.dispatchEvent(
        new CustomEvent("ss:data-updated", { detail: { category: "all", source: "sync" } })
      )
    }
  }

  private async applyStreamOperation(
    operation: PendingOperation & { server_change_seq: number; device_id: string }
  ): Promise<void> {
    await this.applyRemoteOperationOnce(operation)
    if (operation.server_change_seq > Number(getScopedValue(CURSOR_KEY, "0"))) {
      setScopedValue(CURSOR_KEY, String(operation.server_change_seq))
    }
    window.dispatchEvent(
      new CustomEvent("ss:data-updated", { detail: { category: "all", source: "sync" } })
    )
  }

  private startChangeStream() {
    if (this.changeStreamRunning) return
    this.changeStreamRunning = true
    void (async () => {
      while (this.enabled) {
        try {
          const serverUrl = localStorage.getItem(SERVER_URL_KEY) || DEFAULT_SERVER_URL
          const requestId = newUuid()
          const classId = await this.getRemoteClassId()
          if (!classId) {
            await new Promise((resolve) => window.setTimeout(resolve, 5000))
            continue
          }
          const cursor = Number(getScopedValue(CURSOR_KEY, "0"))
          const deviceId = this.getDeviceId()
          const controller = new AbortController()
          this.changeStreamAbortController = controller
          syncLog("info", "发起同步长连接请求", {
            local_class_id: getCurrentClassId(),
            remote_class_id: classId,
            request_id: requestId,
            server_url: serverUrl,
            device_id: deviceId,
            cursor,
            authenticated: sectlAuth.isAuthenticated(),
            user_id: maskIdentifier(sectlAuth.getUserId()),
          })
          const response = await fetch(
            `${serverUrl}/v1/changes?class_id=${encodeURIComponent(classId)}&last_server_change_seq=${cursor}&device_id=${encodeURIComponent(deviceId)}`,
            { headers: await this.headers(requestId), signal: controller.signal }
          )
          if (!response.ok || !response.body) {
            const responseText = await response.text().catch(() => "")
            const message = `changes HTTP ${response.status}: ${responseText.slice(0, 500)}`
            syncLog("error", "同步长连接请求失败", {
              local_class_id: getCurrentClassId(),
              remote_class_id: classId,
              request_id: requestId,
              status: response.status,
              response_bytes: responseText.length,
              body: responseText.slice(0, 1000),
            })
            const error = new Error(message) as Error & {
              status?: number
            }
            error.status = response.status
            throw error
          }
          syncLog("info", "同步长连接已建立", {
            local_class_id: getCurrentClassId(),
            remote_class_id: classId,
            request_id: requestId,
            status: response.status,
            content_type: response.headers.get("content-type"),
          })
          this.changeStreamConnected = true
          this.changeStreamAuthError = false
          this.updateStatus({
            state: "online",
            authenticated: sectlAuth.isAuthenticated(),
            realtimeConnected: true,
            lastError: null,
          })
          const reader = response.body.getReader()
          const decoder = new TextDecoder()
          let buffer = ""
          while (this.enabled) {
            const { done, value } = await reader.read()
            if (done) {
              syncLog("warn", "同步长连接由服务端关闭", { request_id: requestId })
              throw new Error("changes stream closed")
            }
            buffer += decoder.decode(value, { stream: true })
            const frames = buffer.split("\n\n")
            buffer = frames.pop() || ""
            for (const frame of frames) {
              const data = frame
                .split("\n")
                .filter((line) => line.startsWith("data:"))
                .map((line) => line.slice(5).trim())
                .join("\n")
              if (!data) continue
              if (frame.includes("event: snapshot_changed")) {
                this.requestSnapshotFromServer()
                continue
              }
              if (frame.includes("event: reset")) {
                void this.syncNow(false)
                continue
              }
              try {
                await this.applyStreamOperation(JSON.parse(data))
              } catch (error) {
                syncLog("warn", "长连接变更应用失败", { error: String(error) })
              }
            }
          }
        } catch (error) {
          if (this.enabled) {
            const status = (error as Error & { status?: number })?.status
            const isAuthError = status === 401 || status === 403
            this.changeStreamConnected = false
            this.changeStreamAuthError = isAuthError
            this.updateStatus({
              state: this.getFailureState(error, status),
              authenticated: isAuthError ? false : sectlAuth.isAuthenticated(),
              realtimeConnected: false,
              lastError: error instanceof Error ? error.message : String(error),
            })
            syncLog("warn", "长连接已断开，稍后重连并依赖轮询兜底", {
              error: String(error),
              auth_error: isAuthError,
            })
            const recovered = isAuthError && (await this.tryRecoverAuthentication())
            await new Promise((resolve) =>
              window.setTimeout(resolve, recovered ? 250 : isAuthError ? 5000 : 1000)
            )
          }
        } finally {
          this.changeStreamAbortController = null
        }
      }
      this.changeStreamRunning = false
    })()
  }

  async syncNow(forceSnapshot = false): Promise<void> {
    if (!this.enabled || !(window as any).api?.syncApplyRemoteOperation) return
    if (this.syncing) {
      this.syncRequested = true
      this.syncRequestedForceSnapshot ||= forceSnapshot
      syncLog("debug", "同步正在进行，已登记后续同步请求", {
        local_class_id: getCurrentClassId(),
        force_snapshot: forceSnapshot,
      })
      return
    }
    const requestedSnapshot = this.snapshotRequested
    const requestedSnapshotPull = this.snapshotPullRequested
    this.snapshotRequested = false
    this.snapshotPullRequested = false
    this.syncing = true
    const startedAt = Date.now()
    const serverUrl = localStorage.getItem(SERVER_URL_KEY) || DEFAULT_SERVER_URL
    const deviceId = this.getDeviceId()
    const requestId = newUuid()
    this.updateStatus({
      state: this.changeStreamAuthError
        ? "auth_error"
        : this.status.browserOnline
          ? "connecting"
          : "offline",
      authenticated: this.changeStreamAuthError ? false : sectlAuth.isAuthenticated(),
      realtimeConnected: this.changeStreamConnected,
      isSyncing: true,
      serverUrl,
      lastError: null,
    })
    syncLog("info", "同步周期开始", {
      local_class_id: getCurrentClassId(),
      request_id: requestId,
      server_url: serverUrl,
      device_id: deviceId,
      authenticated: sectlAuth.isAuthenticated(),
      outbox_count: getJson<PendingOperation[]>(OUTBOX_KEY, []).length,
      cursor: Number(getScopedValue(CURSOR_KEY, "0")),
    })
    try {
      const classId = await this.getRemoteClassId()
      if (!classId) {
        syncLog("debug", "当前班级未绑定云端班级，跳过同步", {
          local_class_id: getCurrentClassId(),
          request_id: requestId,
        })
        return
      }
      syncLog("debug", "已解析当前云端班级上下文", {
        local_class_id: getCurrentClassId(),
        remote_class_id: classId,
        request_id: requestId,
      })
      const now = Date.now()
      const shouldSnapshot =
        forceSnapshot ||
        requestedSnapshot ||
        requestedSnapshotPull ||
        (now - this.lastSnapshotAt >= 5 * 60_000 &&
          now - this.lastSnapshotAttemptAt >= SNAPSHOT_RETRY_INTERVAL_MS)
      const outbox = getJson<PendingOperation[]>(OUTBOX_KEY, [])
      // 永远先发增量请求，快照只能在增量完成后执行，避免积分操作排队在大快照之后。
      const response = await fetch(`${serverUrl}/v1/sync`, {
        method: "POST",
        headers: await this.headers(requestId),
        body: JSON.stringify({
          device_id: this.getDeviceId(),
          class_id: classId,
          last_server_change_seq: Number(getScopedValue(CURSOR_KEY, "0")),
          operations: outbox,
          limit: 500,
        }),
        signal: AbortSignal.timeout(SYNC_REQUEST_TIMEOUT_MS),
      })
      const responseText = await response.text()
      syncLog("debug", "收到增量同步响应", {
        request_id: requestId,
        status: response.status,
        response_bytes: responseText.length,
      })
      if (!response.ok) {
        const errorMessage = `sync HTTP ${response.status}: ${responseText.slice(0, 500)}`
        const isAuthError = response.status === 401 || response.status === 403
        if (isAuthError) {
          this.changeStreamConnected = false
          this.changeStreamAuthError = true
        }
        this.updateStatus({
          state: this.getFailureState(new Error(errorMessage), response.status),
          authenticated: isAuthError ? false : sectlAuth.isAuthenticated(),
          realtimeConnected: this.changeStreamConnected,
          lastError: errorMessage,
        })
        syncLog("error", "增量同步请求失败", {
          local_class_id: getCurrentClassId(),
          remote_class_id: classId,
          request_id: requestId,
          status: response.status,
          body: responseText.slice(0, 1000),
        })
        if (isAuthError) {
          const recovered = await this.tryRecoverAuthentication()
          if (recovered) this.syncRequested = true
        }
        return
      }
      const result = JSON.parse(responseText) as SyncResponse
      await this.applySyncResponse(result)
      if (shouldSnapshot && getJson<PendingOperation[]>(OUTBOX_KEY, []).length === 0) {
        this.lastSnapshotAttemptAt = Date.now()
        try {
          if (requestedSnapshotPull && !requestedSnapshot) {
            await this.pullSnapshot()
          } else {
            await this.syncSnapshot()
          }
          this.lastSnapshotAt = Date.now()
        } catch (error) {
          const message =
            error instanceof DOMException && error.name === "AbortError"
              ? "快照已取消或超时"
              : String(error)
          syncLog("warn", "增量同步完成但快照阶段未完成", { error: message })
        }
      }
      syncLog("info", "同步周期完成", {
        local_class_id: getCurrentClassId(),
        remote_class_id: classId,
        request_id: requestId,
        duration_ms: Date.now() - startedAt,
        accepted_count: result.accepted_operations.length,
        remote_count: result.remote_operations.length,
        balance_count: result.balances.length,
      cursor: getScopedValue(CURSOR_KEY, "0"),
      })
      this.updateStatus({
        state: this.changeStreamConnected
          ? "online"
          : this.changeStreamAuthError
            ? "auth_error"
            : "connecting",
        browserOnline: true,
        authenticated: this.changeStreamAuthError ? false : sectlAuth.isAuthenticated(),
        realtimeConnected: this.changeStreamConnected,
        lastSyncAt: new Date().toISOString(),
        lastError: this.changeStreamAuthError ? this.status.lastError : null,
      })
    } catch (error) {
      this.updateStatus({
        state: this.getFailureState(error),
        authenticated: sectlAuth.isAuthenticated(),
        realtimeConnected: this.changeStreamConnected,
        lastError: error instanceof Error ? error.message : String(error),
      })
      syncLog("error", "同步周期异常", {
        local_class_id: getCurrentClassId(),
        request_id: requestId,
        duration_ms: Date.now() - startedAt,
        error: String(error),
        stack: error instanceof Error ? error.stack : undefined,
      })
    } finally {
      this.syncing = false
      this.updateStatus({ isSyncing: false })
      if (this.syncRequested) {
        const nextForceSnapshot = this.syncRequestedForceSnapshot || this.snapshotRequested
        this.syncRequested = false
        this.syncRequestedForceSnapshot = false
        void this.syncNow(nextForceSnapshot)
      }
    }
  }

  start() {
    if (this.timer !== null) return
    void this.syncNow(true)
    this.timer = window.setInterval(() => void this.syncNow(), 10_000)
    if (this.enabled) this.startChangeStream()
    if (!this.onlineHandler) {
      this.onlineHandler = () => {
        this.updateStatus({
          browserOnline: true,
          state: this.enabled
            ? this.changeStreamAuthError
              ? "auth_error"
              : "connecting"
            : "disabled",
          lastError: null,
        })
        void this.syncNow()
      }
      window.addEventListener("online", this.onlineHandler)
    }
    if (!this.offlineHandler) {
      this.offlineHandler = () => {
        this.updateStatus({
          browserOnline: false,
          state: this.enabled ? "offline" : "disabled",
          realtimeConnected: false,
        })
        this.changeStreamConnected = false
        this.changeStreamAuthError = false
        this.lastTokenRecoveryAt = 0
        this.changeStreamAbortController?.abort()
      }
      window.addEventListener("offline", this.offlineHandler)
    }
    if (!this.oauthHandler) {
      this.oauthHandler = () => {
        syncLog("info", "检测到 OAuth 登录状态变化", {
          authenticated: sectlAuth.isAuthenticated(),
          user_id: maskIdentifier(sectlAuth.getUserId()),
          ...describeAccessToken(sectlAuth.getAccessToken()),
        })
        this.changeStreamConnected = false
        this.changeStreamAuthError = false
        this.lastTokenRecoveryAt = 0
        this.changeStreamAbortController?.abort()
        this.updateStatus({
          authenticated: sectlAuth.isAuthenticated(),
          realtimeConnected: false,
          state: this.enabled ? "connecting" : "disabled",
          lastError: null,
        })
        if (this.enabled) void this.syncNow(true)
      }
      window.addEventListener("ss:oauth-user-updated", this.oauthHandler)
    }
  }

  stop() {
    if (this.timer !== null) {
      window.clearInterval(this.timer)
      this.timer = null
    }
    this.enabled = false
    this.snapshotRequested = false
    this.snapshotPullRequested = false
    this.syncRequestedForceSnapshot = false
    if (this.snapshotRequestTimer !== null) {
      window.clearTimeout(this.snapshotRequestTimer)
      this.snapshotRequestTimer = null
    }
    this.changeStreamAbortController?.abort()
    this.changeStreamConnected = false
    this.changeStreamAuthError = false
    this.snapshotAbortController?.abort()
    if (this.onlineHandler) {
      window.removeEventListener("online", this.onlineHandler)
      this.onlineHandler = null
    }
    if (this.offlineHandler) {
      window.removeEventListener("offline", this.offlineHandler)
      this.offlineHandler = null
    }
    if (this.oauthHandler) {
      window.removeEventListener("ss:oauth-user-updated", this.oauthHandler)
      this.oauthHandler = null
    }
    this.updateStatus({
      enabled: false,
      state: "disabled",
      isSyncing: false,
      authenticated: sectlAuth.isAuthenticated(),
      realtimeConnected: false,
    })
  }
}

export const syncClient = new SyncClient()

if (import.meta.hot) {
  import.meta.hot.dispose(() => syncClient.stop())
}
