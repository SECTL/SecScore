// 验证用：把桌面 UI 的 window.api 适配到云端 Sync Server（/v1/web/bootstrap + /v1/sync）。
import { AuthError, bootstrap, listClasses, openChanges, type Bootstrap, type ClassInfo } from "./api"
import { deviceId, enqueueRedeem, enqueueScore, flush, getOutbox, pendingDeltas } from "./sync"
import { getSession, getUserId, getUserName, handleCallback, login } from "./auth"
import { lanApi } from "../services/lanApi"

const CLASS_KEY = "ssw_class_id"
let cache: Bootstrap | null = null
let loading: Promise<Bootstrap> | null = null

// 离线数据：最近一次成功的 bootstrap 与班级列表存在 localStorage，断网时回退使用。
const BOOT_KEY = (id: string) => `ssw_bootstrap:${id}`
const CLASSES_KEY = "ssw_classes"

const readStored = <T,>(key: string): T | null => {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}
const writeStored = (key: string, value: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* 配额不足时，bootstrap 退化为不含事件的精简版 */
    if (key.startsWith("ssw_bootstrap:")) {
      try {
        localStorage.setItem(
          key,
          JSON.stringify({ ...(value as Bootstrap), recent_events: [], group_score_events: [] })
        )
      } catch {
        /* 放弃持久化 */
      }
    }
  }
}

const cachedClasses = async (): Promise<ClassInfo[]> => {
  try {
    const list = await listClasses()
    writeStored(CLASSES_KEY, list)
    return list
  } catch (e) {
    const stored = readStored<ClassInfo[]>(CLASSES_KEY)
    if (stored?.length) return stored
    throw e
  }
}

const classId = async (): Promise<string> => {
  const saved = localStorage.getItem(CLASS_KEY)
  if (saved) return saved
  const first = (await cachedClasses())[0]
  if (!first) throw new Error("没有可用班级")
  localStorage.setItem(CLASS_KEY, first.id)
  return first.id
}

const load = (force = false): Promise<Bootstrap> => {
  if (cache && !force) return Promise.resolve(cache)
  loading ??= (async () => {
    const id = await classId()
    try {
      await flush(id)
    } catch {
      /* 离线时保留队列，联网后按 op_id 幂等重发 */
    }
    try {
      cache = await bootstrap(id)
      writeStored(BOOT_KEY(id), cache)
    } catch (e) {
      if (e instanceof AuthError) throw e
      const fallback = cache?.class_id === id ? cache : readStored<Bootstrap>(BOOT_KEY(id))
      if (!fallback) throw e
      cache = fallback
    }
    return cache
  })().finally(() => {
    loading = null
  })
  return loading
}

const ok = <T,>(data: T) => ({ success: true, data })
const wrap = async <T,>(fn: () => Promise<T>) => {
  try {
    return ok(await fn())
  } catch (e) {
    return { success: false, message: String((e as Error).message || e) }
  }
}

const tagsOf = (b: Bootstrap, name: string) =>
  b.student_tags.filter((t) => t.student_name === name).map((t) => t.tag_name)

const cloudBase: Record<string, any> = {
  oauthLoadLoginState: () =>
    wrap(async () => {
      const session = getSession()
      const userId = await getUserId()
      return session && userId ? { access_token: session.access_token, user_id: userId } : null
    }),
  webGetUserName: () => wrap(async () => getUserName()),
  webListClasses: () =>
    wrap(async () => ({ classes: await cachedClasses(), current: await classId() })),
  webSwitchClass: (id: string) => {
    localStorage.setItem(CLASS_KEY, id)
    location.reload()
    return Promise.resolve(ok(null))
  },
  queryStudents: () =>
    wrap(async () => {
      const b = await load()
      const pending = pendingDeltas(b.class_id)
      return b.students.map((s: any, i) => ({
        ...s,
        id: s.id ?? i + 1,
        score: s.score + (pending.get(s.name)?.score || 0),
        reward_points: s.reward_points + (pending.get(s.name)?.reward || 0),
        tags: tagsOf(b, s.name),
      }))
    }),
  queryReasons: () => wrap(async () => (await load()).reasons.map((r, i) => ({ id: i + 1, ...r }))),
  rewardSettingQuery: () => wrap(async () => (await load()).reward_settings),
  tagsGetAll: () => wrap(async () => (await load()).tags.map((t, i) => ({ id: i + 1, ...t }))),
  tagsGetByStudent: (id: number) =>
    wrap(async () => {
      const b: any = await load()
      const s = b.students.find((x: any, i: number) => (x.id ?? i + 1) === id)
      return s ? tagsOf(b, s.name).map((name, i) => ({ id: i + 1, name })) : []
    }),
  queryEvents: (params?: { limit?: number }) =>
    wrap(async () => (await load()).recent_events.slice(0, Number(params?.limit || 100))),
  createEvent: (data: { student_name: string; reason_content: string; delta: number }) =>
    wrap(async () => {
      const id = await classId()
      enqueueScore(id, data.student_name, data.delta, data.reason_content)
      void flush(id).then(() => load(true)).catch(() => void 0)
      return 0
    }),
}

// 桌面主页的区间统计用 boardQuerySql 跑固定模板的聚合 SQL。Web 端没有数据库，
// 这里识别这两条模板，从 bootstrap 的事件和待发送队列在本地计算同样的结果。
cloudBase.boardQuerySql = (params: { sql: string }) =>
  wrap(async () => {
    const sql = String(params?.sql || "")
    const t = [...sql.matchAll(/'(\d{4}-\d{2}-\d{2}T[^']+)'/g)].map((m) => Date.parse(m[1]))
    if (sql.includes("FROM group_score_events")) {
      // 小组统计模板：本周 [week0, week1)、本期 [per0, per1)，只统计未结算事件。
      if (t.length < 4 || t.some(Number.isNaN)) throw new Error("时间范围解析失败")
      const [week0, week1, per0, per1] = t
      const gb: any = await load()
      const rows = new Map<string, { group_name: string; week_net: number; period_net: number }>()
      for (const e of (gb.group_score_events || []) as any[]) {
        if (e.settlement_id != null) continue
        const g = String(e.group_name || "")
        const time = Date.parse(e.event_time)
        if (!g || Number.isNaN(time)) continue
        const row = rows.get(g) || { group_name: g, week_net: 0, period_net: 0 }
        const d = Number(e.delta) || 0
        if (time >= week0 && time < week1) row.week_net += d
        if (time >= per0 && time < per1) row.period_net += d
        rows.set(g, row)
      }
      return [...rows.values()]
    }
    if (!sql.includes("LEFT JOIN score_events")) throw new Error("Web 端不支持该查询")
    if (t.length < 8 || t.some(Number.isNaN)) throw new Error("时间范围解析失败")
    const [today0, now1, week0, week1, month0, now2, per0, per1] = t
    const b = await load()
    const events: Array<{ name: string; time: number; delta: number }> = (b.recent_events as any[]).map(
      (e) => ({ name: String(e.student_name), time: Date.parse(e.event_time), delta: Number(e.delta) || 0 })
    )
    for (const op of getOutbox(b.class_id)) {
      if (op.operation_type !== "score.adjust") continue
      events.push({
        name: op.payload.student_name,
        time: Date.parse(op.client_created_at),
        delta: Number(op.payload.score_delta) || 0,
      })
    }
    const within = (x: number, a: number, z: number) => x >= a && x < z
    return b.students.map((s) => {
      const row = { name: s.name, today_net: 0, week_net: 0, month_net: 0, period_net: 0 }
      for (const e of events) {
        if (e.name !== s.name || Number.isNaN(e.time)) continue
        if (within(e.time, today0, now1)) row.today_net += e.delta
        if (within(e.time, week0, week1)) row.week_net += e.delta
        if (within(e.time, month0, now2)) row.month_net += e.delta
        if (within(e.time, per0, per1)) row.period_net += e.delta
      }
      return row
    })
  })

// 小组总分 = 未结算小组事件 delta 之和。
cloudBase.queryGroupScores = () =>
  wrap(async () => {
    const b: any = await load()
    const sums = new Map<string, number>()
    for (const e of (b.group_score_events || []) as any[]) {
      if (e.settlement_id != null) continue
      const g = String(e.group_name || "")
      if (g) sums.set(g, (sums.get(g) || 0) + (Number(e.delta) || 0))
    }
    return [...sums].map(([group_name, score]) => ({ group_name, score }))
  })

cloudBase.rewardRedeem =(data: { student_name: string; reward_id: number }) =>
  wrap(async () => {
    const b = await load()
    const reward = b.reward_settings.find((r) => Number(r.id) === Number(data.reward_id))
    if (!reward) throw new Error("奖励不存在")
    const student: any = b.students.find((s) => s.name === data.student_name)
    const pending = pendingDeltas(b.class_id).get(data.student_name)
    const balance = (student?.reward_points ?? 0) + (pending?.reward || 0)
    if (balance < reward.cost_points) throw new Error("积分不足")
    const id = await classId()
    enqueueRedeem(id, data.student_name, reward)
    void flush(id).then(() => load(true)).catch(() => void 0)
    return { redemption_id: 0, remaining_reward_points: balance - reward.cost_points }
  })

export const cloudApi = new Proxy(cloudBase, {
  get(target, prop, receiver) {
    if (prop in target) return Reflect.get(target, prop, receiver)
    return (lanApi as any)[prop]
  },
})

/** 返回 false 表示正在跳转登录或处理回调。 */
export const ensureLogin = async (): Promise<boolean> => {
  if (location.pathname === "/oauth/callback") {
    await handleCallback()
    location.replace("/")
    return false
  }
  if (!getSession()) {
    await login()
    return false
  }
  return true
}

// 云端没有推送通道给浏览器，这里轮询 bootstrap：可见时每 10 秒一次，切回前台/恢复联网立即一次。
// 服务端序号或快照时间变化时才通知 UI 刷新，避免无谓重绘。
let pollTimer: number | undefined
let lastSignature = ""
const signature = (b: Bootstrap) => `${b.class_id}:${b.server_change_seq}:${b.snapshot_updated_at}`

const pollOnce = async (_fromStream = false) => {
  if (document.visibilityState !== "visible" || !navigator.onLine) return
  try {
    const b = await load(true)
    const next = signature(b)
    if (lastSignature && next !== lastSignature) {
      window.dispatchEvent(new CustomEvent("ss:data-updated", { detail: { category: "all" } }))
    }
    lastSignature = next
  } catch {
    /* 网络或登录问题下次再试 */
  }
}

let streamAbort: AbortController | null = null
let streamConnected = false
let refreshDebounce: number | undefined

const refreshSoon = () => {
  window.clearTimeout(refreshDebounce)
  refreshDebounce = window.setTimeout(() => void pollOnce(true), 150)
}

/** 长连接：服务端有新操作/快照变化时立即刷新；断线指数退避重连，期间靠轮询兜底。 */
const runStream = async () => {
  let failures = 0
  for (;;) {
    if (document.visibilityState !== "visible" || !navigator.onLine) {
      await new Promise((r) => setTimeout(r, 2000))
      continue
    }
    const controller = new AbortController()
    streamAbort = controller
    try {
      const id = await classId()
      const seq = cache?.server_change_seq ?? 0
      const res = await openChanges(id, seq, deviceId(), controller.signal)
      if (!res.body) throw new Error("no body")
      streamConnected = true
      failures = 0
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buf = ""
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n")
        const frames = buf.split("\n\n")
        buf = frames.pop() || ""
        if (frames.some((f) => f.includes("data:") || f.includes("event:"))) refreshSoon()
      }
    } catch {
      /* 断线或鉴权失败：退避后重连 */
    } finally {
      streamConnected = false
      streamAbort = null
    }
    failures += 1
    await new Promise((r) => setTimeout(r, Math.min(1000 * 2 ** Math.min(failures - 1, 5), 30_000)))
  }
}

export const startAutoRefresh = () => {
  if (pollTimer !== undefined) return
  void pollOnce()
  // 长连接正常时只做低频兜底轮询。
  pollTimer = window.setInterval(() => {
    if (!streamConnected) void pollOnce()
  }, 10_000)
  window.setInterval(() => void pollOnce(), 60_000)
  void runStream()
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      streamAbort?.abort()
      void pollOnce()
    }
  })
  window.addEventListener("online", () => {
    streamAbort?.abort()
    void pollOnce()
  })
}
