import { sectlAuth } from "./sectlAuth"

const SERVER_URL_KEY = "ss_sync_server_url"
const DEVICE_ID_KEY = "ss_sync_device_id"
const USER_ID_KEY = "ss_sync_dev_user_id"
const OUTBOX_KEY = "ss_sync_outbox"
const APPLIED_KEY = "ss_sync_applied_operations"
const CURSOR_KEY = "ss_sync_cursor"
const DEFAULT_SERVER_URL =
  (import.meta as any).env?.VITE_SYNC_SERVER_URL || "http://127.0.0.1:8787"

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
  private timer: number | null = null
  private enabled = false

  setEnabled(enabled: boolean) {
    this.enabled = enabled
    if (enabled) void this.syncNow()
  }

  setServerUrl(url: string) {
    localStorage.setItem(SERVER_URL_KEY, url.replace(/\/$/, ""))
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
    const outbox = getJson<PendingOperation[]>(OUTBOX_KEY, [])
    outbox.push(operation)
    setJson(OUTBOX_KEY, outbox)
    void this.syncNow()
  }

  async enqueueRewardRedemption(input: {
    student_name: string
    reward_id: number
  }): Promise<void> {
    const reward = await (window as any).api.rewardSettingQuery()
    const rewardSetting = Array.isArray(reward?.data)
      ? reward.data.find((item: any) => Number(item.id) === input.reward_id)
      : null
    if (!rewardSetting) return
    const operation = this.createOperation("reward.redeem", input.student_name, {
      student_name: input.student_name,
      reward_id: input.reward_id,
      reward_name: rewardSetting.name,
      cost_points: Number(rewardSetting.cost_points),
    })
    const outbox = getJson<PendingOperation[]>(OUTBOX_KEY, [])
    outbox.push(operation)
    setJson(OUTBOX_KEY, outbox)
    void this.syncNow()
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
    const response = await fetch(
      `${localStorage.getItem(SERVER_URL_KEY) || DEFAULT_SERVER_URL}/v1/snapshot`,
      {
        method: "POST",
        headers: await this.headers(),
        body: JSON.stringify({ device_id: this.getDeviceId(), snapshot: await this.buildSnapshot() }),
      }
    )
    if (!response.ok) return
    const result = (await response.json()) as { snapshot?: Record<string, unknown> }
    if (result.snapshot) {
      const applied = await api.syncApplySnapshot(result.snapshot)
      if (applied?.success) {
        window.dispatchEvent(new CustomEvent("ss:data-updated", { detail: { category: "all", source: "sync" } }))
      }
    }
  }

  private async headers(): Promise<HeadersInit> {
    const token = sectlAuth.getAccessToken()
    if (token) return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
    return {
      "Content-Type": "application/json",
      "X-Dev-User-Id": localStorage.getItem(USER_ID_KEY) || "local-demo-user",
    }
  }

  async syncNow(): Promise<void> {
    if (!this.enabled || this.syncing || !(window as any).api?.syncApplyRemoteOperation) return
    this.syncing = true
    try {
      const outbox = getJson<PendingOperation[]>(OUTBOX_KEY, [])
      const response = await fetch(
        `${localStorage.getItem(SERVER_URL_KEY) || DEFAULT_SERVER_URL}/v1/sync`,
        {
          method: "POST",
          headers: await this.headers(),
          body: JSON.stringify({
            device_id: this.getDeviceId(),
            last_server_change_seq: Number(localStorage.getItem(CURSOR_KEY) || "0"),
            operations: outbox,
            limit: 500,
          }),
        }
      )
      if (!response.ok) return
      const result = (await response.json()) as SyncResponse
      const acceptedIds = new Set(result.accepted_operations.map((item) => item.op_id))
      setJson(OUTBOX_KEY, outbox.filter((operation) => !acceptedIds.has(operation.op_id)))

      const applied = getJson<string[]>(APPLIED_KEY, [])
      const appliedSet = new Set(applied)
      for (const operation of result.accepted_operations) appliedSet.add(operation.op_id)
      for (const operation of result.remote_operations) {
        if (appliedSet.has(operation.op_id)) continue
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
      await this.syncSnapshot()
    } catch (error) {
      console.debug("Sync server unavailable", error)
    } finally {
      this.syncing = false
    }
  }

  start() {
    if (this.timer !== null) return
    void this.syncNow()
    this.timer = window.setInterval(() => void this.syncNow(), 30_000)
    window.addEventListener("online", () => void this.syncNow())
  }
}

export const syncClient = new SyncClient()
