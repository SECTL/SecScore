// 验证用：把桌面 UI 的 window.api 适配到云端 Sync Server（/v1/web/bootstrap + /v1/sync）。
import { bootstrap, listClasses, openChanges, type Bootstrap } from "./api"
import { deviceId, enqueueRedeem, enqueueScore, flush, pendingDeltas } from "./sync"
import { getSession, getUserId, getUserName, handleCallback, login } from "./auth"
import { lanApi } from "../services/lanApi"

const CLASS_KEY = "ssw_class_id"
let cache: Bootstrap | null = null
let loading: Promise<Bootstrap> | null = null

const classId = async (): Promise<string> => {
  const saved = localStorage.getItem(CLASS_KEY)
  if (saved) return saved
  const first = (await listClasses())[0]
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
      /* 离线时保留队列 */
    }
    cache = await bootstrap(id)
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
    wrap(async () => ({ classes: await listClasses(), current: await classId() })),
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

cloudBase.rewardRedeem = (data: { student_name: string; reward_id: number }) =>
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
