import { syncOps, type PendingOp } from "./api"

const DEVICE_KEY = "ssw_sync_device_id"

export const deviceId = (): string => {
  let id = localStorage.getItem(DEVICE_KEY)
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem(DEVICE_KEY, id)
  }
  return id
}

const key = (name: string, classId: string) => `ssw_${name}:${classId}`
const num = (k: string) => Number(localStorage.getItem(k) || "0")

export const getOutbox = (classId: string): PendingOp[] => {
  try {
    return JSON.parse(localStorage.getItem(key("outbox", classId)) || "[]")
  } catch {
    return []
  }
}
const setOutbox = (classId: string, ops: PendingOp[]) =>
  localStorage.setItem(key("outbox", classId), JSON.stringify(ops))

/** 与桌面端 deterministicEntityId 一致（FNV-1a + Math.abs）。 */
export const entityId = (name: string): string => {
  let hash = 2166136261
  for (let i = 0; i < name.length; i++) {
    hash ^= name.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  const hex = Math.abs(hash).toString(16).padStart(8, "0")
  return `${hex}-0000-5000-8000-${hex}${hex.slice(0, 4)}`
}

export const enqueueScore = (classId: string, studentName: string, delta: number, reason: string) => {
  const seq = num(key("seq", classId)) + 1
  const lamport = Math.max(num(key("lamport", classId)), seq) + 1
  localStorage.setItem(key("seq", classId), String(seq))
  localStorage.setItem(key("lamport", classId), String(lamport))
  const op: PendingOp = {
    op_id: crypto.randomUUID(),
    client_seq: seq,
    lamport,
    entity_type: "student",
    entity_id: entityId(studentName),
    operation_type: "score.adjust",
    payload: { student_name: studentName, reason_content: reason, score_delta: delta, reward_delta: delta },
    client_created_at: new Date().toISOString(),
  }
  setOutbox(classId, [...getOutbox(classId), op])
}

export const enqueueRedeem = (
  classId: string,
  studentName: string,
  reward: { id: number; name: string; cost_points: number }
) => {
  const seq = num(key("seq", classId)) + 1
  const lamport = Math.max(num(key("lamport", classId)), seq) + 1
  localStorage.setItem(key("seq", classId), String(seq))
  localStorage.setItem(key("lamport", classId), String(lamport))
  const op: PendingOp = {
    op_id: crypto.randomUUID(),
    client_seq: seq,
    lamport,
    entity_type: "student",
    entity_id: entityId(studentName),
    operation_type: "reward.redeem",
    // reward_delta 供服务端账本扣减；桌面端按 cost_points 处理，忽略该字段。
    payload: {
      student_name: studentName,
      reward_id: reward.id,
      reward_name: reward.name,
      cost_points: reward.cost_points,
      reward_delta: -reward.cost_points,
    },
    client_created_at: new Date().toISOString(),
  }
  setOutbox(classId, [...getOutbox(classId), op])
}

/** 编辑类操作（学生/理由增删改、撤销记录）入队；entityKey 只用于生成稳定的实体 ID。 */
export const enqueueEdit = (
  classId: string,
  operationType: Exclude<PendingOp["operation_type"], "score.adjust" | "reward.redeem">,
  entityKey: string,
  payload: Record<string, any>
) => {
  const seq = num(key("seq", classId)) + 1
  const lamport = Math.max(num(key("lamport", classId)), seq) + 1
  localStorage.setItem(key("seq", classId), String(seq))
  localStorage.setItem(key("lamport", classId), String(lamport))
  const op: PendingOp = {
    op_id: crypto.randomUUID(),
    client_seq: seq,
    lamport,
    entity_type: operationType.startsWith("student")
      ? "student"
      : operationType.startsWith("reason")
        ? "reason"
        : "score_event",
    entity_id: entityId(entityKey),
    operation_type: operationType,
    payload,
    client_created_at: new Date().toISOString(),
  }
  setOutbox(classId, [...getOutbox(classId), op])
}

/** 待发送操作对各学生分数的叠加，用于乐观显示。 */
export const pendingDeltas = (
  classId: string
): Map<string, { score: number; reward: number }> => {
  const map = new Map<string, { score: number; reward: number }>()
  for (const op of getOutbox(classId)) {
    const n = op.payload.student_name
    if (typeof n !== "string") continue
    const cur = map.get(n) || { score: 0, reward: 0 }
    cur.score += Number(op.payload.score_delta || 0)
    cur.reward += Number(op.payload.reward_delta || 0)
    map.set(n, cur)
  }
  return map
}

let flushing: Promise<number> | null = null

/** 按 op_id 幂等重发；返回成功发送的条数。并发调用共用同一次请求。 */
export const flush = (classId: string): Promise<number> => {
  flushing ??= (async () => {
    const batch = getOutbox(classId)
    if (!batch.length) return 0
    const res = await syncOps(classId, deviceId(), batch)
    const done = new Set(res.accepted_operations.map((o) => o.op_id))
    // 重新读取：发送期间可能又有新操作入队。
    setOutbox(classId, getOutbox(classId).filter((o) => !done.has(o.op_id)))
    return done.size
  })().finally(() => {
    flushing = null
  })
  return flushing
}
