import { sectlAuth } from "./sectlAuth"

const SERVER_URL_KEY = "ss_sync_server_url"
const DEVICE_ID_KEY = "ss_sync_device_id"
const USER_ID_KEY = "ss_sync_dev_user_id"
const OUTBOX_KEY = "ss_sync_outbox"
const APPLIED_KEY = "ss_sync_applied_operations"
const CURSOR_KEY = "ss_sync_cursor"
const SYNC_ENABLED_KEY = "ss_sync_enabled"
const DEFAULT_SERVER_URL =
  (import.meta as any).env?.VITE_SYNC_SERVER_URL || "http://127.0.0.1:8787"
const SYNC_REQUEST_TIMEOUT_MS = 10_000
const SNAPSHOT_REQUEST_TIMEOUT_MS = 15_000

const syncLog = (level: "debug" | "info" | "warn" | "error", message: string, meta: Record<string, unknown> = {}) => {
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
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

const setJson = (key: string, value: unknown) => {
  localStorage.setItem(key, JSON.stringify(value))
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
  private timer: number | null = null
  private enabled = false
  private lastSnapshotAt = 0
  private snapshotAbortController: AbortController | null = null
  private changeStreamAbortController: AbortController | null = null
  private changeStreamRunning = false

  setEnabled(enabled: boolean) {
    const changed = this.enabled !== enabled
    this.enabled = enabled
    if (!enabled) this.changeStreamAbortController?.abort()
    localStorage.setItem(SYNC_ENABLED_KEY, String(enabled))
    syncLog("info", enabled ? "同步已启用" : "同步已停用", {
      server_url: localStorage.getItem(SERVER_URL_KEY) || DEFAULT_SERVER_URL,
      dev_user_id: localStorage.getItem(USER_ID_KEY) || "local-demo-user",
    })
    if (enabled && changed) {
      void this.syncNow(true)
      this.startChangeStream()
    }
  }

  getRememberedEnabled(): boolean | null {
    const value = localStorage.getItem(SYNC_ENABLED_KEY)
    if (value === "true") return true
    if (value === "false") return false
    return null
  }

  setServerUrl(url: string) {
    localStorage.setItem(SERVER_URL_KEY, url.replace(/\/$/, ""))
    syncLog("info", "同步服务器地址已更新", { server_url: localStorage.getItem(SERVER_URL_KEY) })
  }

  setDevUserId(userId: string) {
    const normalized = userId.trim() || "local-demo-user"
    localStorage.setItem(USER_ID_KEY, normalized)
    syncLog("info", "开发账号已更新", { dev_user_id: normalized })
  }

  getDevUserId() {
    return localStorage.getItem(USER_ID_KEY) || "local-demo-user"
  }

  private getDeviceId(): string {
    const existing = localStorage.getItem(DEVICE_ID_KEY)
    if (existing) return existing
    const id = newUuid()
    localStorage.setItem(DEVICE_ID_KEY, id)
    return id
  }

  private getNextSequence(): number {
    const next = Number(localStorage.getItem("ss_sync_client_seq") || "0") + 1
    localStorage.setItem("ss_sync_client_seq", String(next))
    return next
  }

  private createOperation(
    operationType: PendingOperation["operation_type"],
    studentName: string,
    payload: Record<string, unknown>
  ): PendingOperation {
    const clientSeq = this.getNextSequence()
    const lamport = Math.max(Number(localStorage.getItem("ss_sync_lamport") || "0"), clientSeq) + 1
    localStorage.setItem("ss_sync_lamport", String(lamport))
    return {
      op_id: newUuid(),
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
  }): Promise<void> {
    const operation = this.createOperation("score.adjust", input.student_name, {
      student_name: input.student_name,
      reason_content: input.reason_content,
      score_delta: input.delta,
      reward_delta: input.delta,
    })
    try {
      this.appendOperation(operation)
      // 每次积分操作独立发送一个 HTTP 请求，不等待轮询周期或快照。
      void this.sendOperationImmediately(operation)
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
      const operation = this.createOperation("reward.redeem", input.student_name, {
        student_name: input.student_name,
        reward_id: input.reward_id,
        reward_name: rewardSetting.name,
        cost_points: Number(rewardSetting.cost_points),
      })
      this.appendOperation(operation)
      void this.sendOperationImmediately(operation)
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
    const [students, reasons, rewards, tags, events, redemptions, settlements, boards, settings, rules, batches] =
      await Promise.all([
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
    const serverUrl = localStorage.getItem(SERVER_URL_KEY) || DEFAULT_SERVER_URL
    const deviceId = this.getDeviceId()
    const snapshot = await this.buildSnapshot()
    const counts = Object.fromEntries(
      ["students", "reasons", "reward_settings", "tags", "student_tags", "score_events", "reward_redemptions", "settlements", "board_configs"].map((key) => [key, Array.isArray(snapshot[key]) ? (snapshot[key] as unknown[]).length : 0])
    )
    syncLog("info", "开始上传业务数据快照", { server_url: serverUrl, device_id: deviceId, counts })
    const controller = new AbortController()
    this.snapshotAbortController = controller
    const timeout = window.setTimeout(() => controller.abort(), SNAPSHOT_REQUEST_TIMEOUT_MS)
    try {
      const response = await fetch(`${serverUrl}/v1/snapshot`, {
        method: "POST",
        headers: await this.headers(),
        body: JSON.stringify({ device_id: deviceId, snapshot }),
        signal: controller.signal,
      })
      const responseText = await response.text()
      if (!response.ok) {
        syncLog("error", "业务数据快照上传失败", { status: response.status, body: responseText.slice(0, 1000), server_url: serverUrl, device_id: deviceId })
        throw new Error(`snapshot HTTP ${response.status}`)
      }
      // 用户在请求期间产生了新积分时，不应用旧快照，避免覆盖刚写入的本地余额。
      if (getJson<PendingOperation[]>(OUTBOX_KEY, []).length > 0) {
        syncLog("info", "快照响应已收到，但存在新的积分操作，跳过本地快照写入", { device_id: deviceId })
        return
      }
      const result = JSON.parse(responseText) as { snapshot?: Record<string, unknown> }
      if (result.snapshot) {
        const applied = await api.syncApplySnapshot(result.snapshot)
        syncLog(applied?.success ? "info" : "error", applied?.success ? "业务数据快照已应用到本地" : "业务数据快照写入本地失败", {
          device_id: deviceId,
          merged_counts: Object.fromEntries(Object.entries(result.snapshot).map(([key, value]) => [key, Array.isArray(value) ? value.length : typeof value])),
          message: applied?.message,
        })
        if (!applied?.success) throw new Error(applied?.message || "sync_apply_snapshot failed")
        window.dispatchEvent(new CustomEvent("ss:data-updated", { detail: { category: "all", source: "sync" } }))
      }
    } finally {
      window.clearTimeout(timeout)
      if (this.snapshotAbortController === controller) this.snapshotAbortController = null
    }
  }

  private async headers(): Promise<HeadersInit> {
    const token = sectlAuth.getAccessToken()
    if (token) {
      syncLog("debug", "使用 OAuth 令牌同步", { device_id: this.getDeviceId() })
      // DEV_AUTH 服务端会优先使用开发账号；生产服务端会忽略该头并校验 Bearer token。
      return {
        Authorization: `Bearer ${token}`,
        "X-Dev-User-Id": this.getDevUserId(),
        "Content-Type": "application/json",
      }
    }
    return {
      "Content-Type": "application/json",
      "X-Dev-User-Id": this.getDevUserId(),
    }
  }

  private async applySyncResponse(result: SyncResponse): Promise<void> {
    const acceptedIds = new Set(result.accepted_operations.map((item) => item.op_id))
    const currentOutbox = getJson<PendingOperation[]>(OUTBOX_KEY, [])
    setJson(OUTBOX_KEY, currentOutbox.filter((operation) => !acceptedIds.has(operation.op_id)))

    const applied = getJson<string[]>(APPLIED_KEY, [])
    const appliedSet = new Set(applied)
    for (const operation of result.accepted_operations) appliedSet.add(operation.op_id)
    for (const operation of result.remote_operations) {
      if (appliedSet.has(operation.op_id)) continue
      if (
        (operation.operation_type === "score.adjust" || operation.operation_type === "reward.redeem") &&
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
      const applyResult = await (window as any).api.syncApplyRemoteOperation({
        operation_id: operation.op_id,
        operation_type: operation.operation_type,
        payload: operation.payload,
        client_created_at: operation.client_created_at,
      })
      if (applyResult?.success) appliedSet.add(operation.op_id)
    }
    setJson(APPLIED_KEY, Array.from(appliedSet).slice(-5000))
    const lastRemoteSeq = result.remote_operations.at(-1)?.server_change_seq
    localStorage.setItem(
      CURSOR_KEY,
      String(result.has_more ? lastRemoteSeq || Number(localStorage.getItem(CURSOR_KEY) || "0") : result.server_change_seq)
    )
    if (result.remote_operations.length > 0) {
      window.dispatchEvent(new CustomEvent("ss:data-updated", { detail: { category: "all", source: "sync" } }))
    }
  }

  private async sendOperationImmediately(operation: PendingOperation): Promise<void> {
    const startedAt = Date.now()
    const serverUrl = localStorage.getItem(SERVER_URL_KEY) || DEFAULT_SERVER_URL
    try {
      const response = await fetch(`${serverUrl}/v1/operations`, {
        method: "POST",
        headers: await this.headers(),
        body: JSON.stringify({
          device_id: this.getDeviceId(),
          last_server_change_seq: Number(localStorage.getItem(CURSOR_KEY) || "0"),
          operation,
        }),
        signal: AbortSignal.timeout(SYNC_REQUEST_TIMEOUT_MS),
      })
      const responseText = await response.text()
      if (!response.ok) throw new Error(`operation HTTP ${response.status}: ${responseText.slice(0, 500)}`)
      await this.applySyncResponse(JSON.parse(responseText) as SyncResponse)
      syncLog("info", "积分操作 HTTP 请求完成", {
        op_id: operation.op_id,
        operation_type: operation.operation_type,
        duration_ms: Date.now() - startedAt,
      })
    } catch (error) {
      syncLog("warn", "积分操作 HTTP 请求失败，将由兜底同步重试", {
        op_id: operation.op_id,
        duration_ms: Date.now() - startedAt,
        error: String(error),
      })
    }
  }

  private async applyStreamOperation(operation: PendingOperation & { server_change_seq: number; device_id: string }): Promise<void> {
    const applied = getJson<string[]>(APPLIED_KEY, [])
    const appliedSet = new Set(applied)
    if (!appliedSet.has(operation.op_id)) {
      const result = await (window as any).api.syncApplyRemoteOperation({
        operation_id: operation.op_id,
        operation_type: operation.operation_type,
        payload: operation.payload,
        client_created_at: operation.client_created_at,
      })
      if (result?.success) appliedSet.add(operation.op_id)
    }
    setJson(APPLIED_KEY, Array.from(appliedSet).slice(-5000))
    if (operation.server_change_seq > Number(localStorage.getItem(CURSOR_KEY) || "0")) {
      localStorage.setItem(CURSOR_KEY, String(operation.server_change_seq))
    }
    window.dispatchEvent(new CustomEvent("ss:data-updated", { detail: { category: "all", source: "sync" } }))
  }

  private startChangeStream() {
    if (this.changeStreamRunning) return
    this.changeStreamRunning = true
    void (async () => {
      while (this.enabled) {
        try {
          const serverUrl = localStorage.getItem(SERVER_URL_KEY) || DEFAULT_SERVER_URL
          const controller = new AbortController()
          this.changeStreamAbortController = controller
          const response = await fetch(
            `${serverUrl}/v1/changes?last_server_change_seq=${Number(localStorage.getItem(CURSOR_KEY) || "0")}`,
            { headers: await this.headers(), signal: controller.signal }
          )
          if (!response.ok || !response.body) throw new Error(`changes HTTP ${response.status}`)
          const reader = response.body.getReader()
          const decoder = new TextDecoder()
          let buffer = ""
          while (this.enabled) {
            const { done, value } = await reader.read()
            if (done) throw new Error("changes stream closed")
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
            syncLog("warn", "长连接已断开，稍后重连并依赖轮询兜底", { error: String(error) })
            await new Promise((resolve) => window.setTimeout(resolve, 1000))
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
      syncLog("debug", "同步正在进行，已登记后续同步请求", { force_snapshot: forceSnapshot })
      return
    }
    this.syncing = true
    const startedAt = Date.now()
    const serverUrl = localStorage.getItem(SERVER_URL_KEY) || DEFAULT_SERVER_URL
    const deviceId = this.getDeviceId()
    syncLog("info", "同步周期开始", { server_url: serverUrl, device_id: deviceId, dev_user_id: this.getDevUserId(), outbox_count: getJson<PendingOperation[]>(OUTBOX_KEY, []).length, cursor: Number(localStorage.getItem(CURSOR_KEY) || "0") })
    try {
      const shouldSnapshot = forceSnapshot || Date.now() - this.lastSnapshotAt >= 5 * 60_000
      const outbox = getJson<PendingOperation[]>(OUTBOX_KEY, [])
      // 永远先发增量请求，快照只能在增量完成后执行，避免积分操作排队在大快照之后。
      const response = await fetch(
        `${serverUrl}/v1/sync`,
        {
          method: "POST",
          headers: await this.headers(),
          body: JSON.stringify({
            device_id: this.getDeviceId(),
            last_server_change_seq: Number(localStorage.getItem(CURSOR_KEY) || "0"),
            operations: outbox,
            limit: 500,
          }),
          signal: AbortSignal.timeout(SYNC_REQUEST_TIMEOUT_MS),
        }
      )
      const responseText = await response.text()
      if (!response.ok) {
        syncLog("error", "增量同步请求失败", { status: response.status, body: responseText.slice(0, 1000) })
        return
      }
      const result = JSON.parse(responseText) as SyncResponse
      await this.applySyncResponse(result)
      if (shouldSnapshot && getJson<PendingOperation[]>(OUTBOX_KEY, []).length === 0) {
        try {
          await this.syncSnapshot()
          this.lastSnapshotAt = Date.now()
        } catch (error) {
          const message = error instanceof DOMException && error.name === "AbortError" ? "快照已取消或超时" : String(error)
          syncLog("warn", "增量同步完成但快照阶段未完成", { error: message })
        }
      }
      syncLog("info", "同步周期完成", {
        duration_ms: Date.now() - startedAt,
        accepted_count: result.accepted_operations.length,
        remote_count: result.remote_operations.length,
        balance_count: result.balances.length,
        cursor: localStorage.getItem(CURSOR_KEY),
      })
    } catch (error) {
      syncLog("error", "同步周期异常", { duration_ms: Date.now() - startedAt, error: String(error), stack: error instanceof Error ? error.stack : undefined })
    } finally {
      this.syncing = false
      if (this.syncRequested) {
        this.syncRequested = false
        void this.syncNow(false)
      }
    }
  }

  start() {
    if (this.timer !== null) return
    void this.syncNow(true)
    this.timer = window.setInterval(() => void this.syncNow(), 10_000)
    if (this.enabled) this.startChangeStream()
    window.addEventListener("online", () => void this.syncNow())
  }

  stop() {
    if (this.timer !== null) {
      window.clearInterval(this.timer)
      this.timer = null
    }
    this.enabled = false
    this.changeStreamAbortController?.abort()
    this.snapshotAbortController?.abort()
  }
}

export const syncClient = new SyncClient()

if (import.meta.hot) {
  import.meta.hot.dispose(() => syncClient.stop())
}
