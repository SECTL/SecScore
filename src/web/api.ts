import { getSession, refresh, logout } from "./auth"

export class AuthError extends Error {}

export interface Student {
  entity_id: string
  name: string
  score: number
  reward_points: number
  group_name?: string
  pinyin?: string
}
export interface Bootstrap {
  class_id: string
  server_change_seq: number
  snapshot_updated_at: string | null
  students: Student[]
  reasons: Array<{ content: string; delta?: number; category?: string }>
  reward_settings: Array<{ id: number; name: string; cost_points: number }>
  tags: Array<{ name: string }>
  student_tags: Array<{ student_name: string; tag_name: string }>
  recent_events: any[]
}
export interface ClassInfo {
  id: string
  name: string
  join_code: string
}

const call = async (path: string, init: RequestInit = {}, retry = true): Promise<Response> => {
  const session = getSession()
  if (!session) throw new AuthError("未登录")
  const res = await fetch(path, {
    ...init,
    headers: {
      ...(init.headers || {}),
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
    },
  })
  if (res.status === 401 && retry) {
    try {
      await refresh()
    } catch (e) {
      // 只有服务端明确拒绝（4xx）才清除登录态；网络错误保留会话以便离线使用。
      const status = (e as { status?: number }).status
      if (status && status >= 400 && status < 500 && status !== 429) {
        logout()
        throw new AuthError("登录已过期")
      }
      throw new Error("网络异常，稍后重试")
    }
    return call(path, init, false)
  }
  if (res.status === 401) {
    logout()
    throw new AuthError("登录已过期")
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `请求失败 (${res.status})`)
  }
  return res
}

export const listClasses = async (): Promise<ClassInfo[]> => {
  const data = await (await call("/v1/classes")).json()
  return Array.isArray(data) ? data : data.classes || []
}

export const bootstrap = async (classId: string): Promise<Bootstrap> =>
  (await call(`/v1/web/bootstrap?class_id=${encodeURIComponent(classId)}`)).json()

export interface PendingOp {
  op_id: string
  client_seq: number
  lamport: number
  entity_type: "student"
  entity_id: string
  operation_type: "score.adjust" | "reward.redeem"
  payload: Record<string, any> & { student_name: string }
  client_created_at: string
}

export const syncOps = async (classId: string, deviceId: string, ops: PendingOp[]) =>
  (
    await call("/v1/sync", {
      method: "POST",
      body: JSON.stringify({
        class_id: classId,
        device_id: deviceId,
        last_server_change_seq: 0,
        operations: ops,
        limit: 1,
      }),
    })
  ).json() as Promise<{ accepted_operations: Array<{ op_id: string }> }>

/** 打开 /v1/changes 的 SSE 流（用 fetch 以便携带 Authorization 头）。 */
export const openChanges = async (
  classId: string,
  seq: number,
  deviceId: string,
  signal: AbortSignal
): Promise<Response> =>
  call(
    `/v1/changes?class_id=${encodeURIComponent(classId)}&last_server_change_seq=${seq}&device_id=${encodeURIComponent(deviceId)}`,
    { signal }
  )
