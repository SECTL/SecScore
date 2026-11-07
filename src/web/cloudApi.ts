// 验证用：把桌面 UI 的 window.api 适配到云端 Sync Server（/v1/web/bootstrap + /v1/sync）。
import { AuthError, bootstrap, listClasses, openChanges, type Bootstrap, type ClassInfo } from "./api"
import {
  deviceId,
  enqueueEdit,
  enqueueRedeem,
  enqueueScore,
  entityId,
  flush,
  getOutbox,
  pendingDeltas,
} from "./sync"
import {
  clearLoggedOut,
  getSession,
  getUserId,
  getUserName,
  handleCallback,
  isLoggedOut,
  login,
  signOut,
} from "./auth"
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

/** 把队列里尚未上传的编辑操作叠加到 bootstrap 上，离线编辑也能立即看到。 */
const withPending = (b: Bootstrap): Bootstrap => {
  const ops = getOutbox(b.class_id).filter(
    (o) => o.operation_type !== "score.adjust" && o.operation_type !== "reward.redeem"
  )
  if (!ops.length) return b
  const v: Bootstrap = {
    ...b,
    students: [...b.students],
    reasons: [...b.reasons],
    student_tags: [...b.student_tags],
    recent_events: [...b.recent_events],
  }
  for (const { operation_type: type, payload: p } of ops) {
    if (type === "student.upsert") {
      const old = p.old_name || p.name
      const patch: Record<string, any> = { name: p.name }
      for (const f of ["group_name", "student_no", "alias"]) if (f in p) patch[f] = p[f] || null
      const i = v.students.findIndex((s) => s.name === old)
      if (i >= 0) v.students[i] = { ...v.students[i], ...patch }
      else
        v.students.push({ entity_id: entityId(p.name), score: 0, reward_points: 0, ...patch } as any)
      if (old !== p.name) {
        const rename = <T extends { student_name: string }>(x: T): T =>
          x.student_name === old ? { ...x, student_name: p.name } : x
        v.student_tags = v.student_tags.map(rename)
        v.recent_events = v.recent_events.map(rename)
      }
    } else if (type === "student.delete") {
      v.students = v.students.filter((s) => s.name !== p.name)
      v.student_tags = v.student_tags.filter((t) => t.student_name !== p.name)
    } else if (type === "reason.upsert") {
      const old = p.old_content || p.content
      const patch = { content: p.content, category: p.category, delta: p.delta }
      const i = v.reasons.findIndex((r) => r.content === old)
      if (i >= 0) v.reasons[i] = { ...v.reasons[i], ...patch }
      else v.reasons.push(patch)
    } else if (type === "reason.delete") {
      v.reasons = v.reasons.filter((r) => r.content !== p.content)
    } else if (type === "score.revoke") {
      v.recent_events = v.recent_events.filter((e) => e.uuid !== p.event_uuid)
    }
  }
  return v
}

const loadView = async () => withPending(await load())

/** 编辑入队后立即通知界面刷新，再在后台上传并拉取服务端结果。 */
const afterEdit = (id: string) => {
  const notify = () =>
    window.dispatchEvent(new CustomEvent("ss:data-updated", { detail: { category: "all" } }))
  notify()
  void flush(id)
    .then(() => load(true))
    .then(notify)
    .catch(() => void 0)
}

const clean = (v: unknown) => (typeof v === "string" ? v.trim() : "")

const cloudBase: Record<string, any> = {
  oauthLoadLoginState: () =>
    wrap(async () => {
      const session = getSession()
      const userId = await getUserId()
      return session && userId ? { access_token: session.access_token, user_id: userId } : null
    }),
  webGetUserName: () => wrap(async () => getUserName()),
  webLogout: () => wrap(async () => signOut()),
  webListClasses: () =>
    wrap(async () => ({ classes: await cachedClasses(), current: await classId() })),
  webSwitchClass: (id: string) => {
    localStorage.setItem(CLASS_KEY, id)
    location.reload()
    return Promise.resolve(ok(null))
  },
  webPendingOps: () => wrap(async () => getOutbox(await classId())),
  webSaveStudent: (data: {
    old_name?: string
    name: string
    group_name?: string
    student_no?: string
    alias?: string
  }) =>
    wrap(async () => {
      const name = clean(data.name)
      if (!name) throw new Error("姓名不能为空")
      if ([...name].length > 64) throw new Error("姓名最多 64 个字")
      const b = await loadView()
      const old = clean(data.old_name)
      if (old && !b.students.some((s) => s.name === old)) throw new Error("学生不存在")
      if (old !== name && b.students.some((s) => s.name === name)) throw new Error("已有同名学生")
      const payload: Record<string, string> = { name }
      if (old && old !== name) payload.old_name = old
      for (const f of ["group_name", "student_no", "alias"] as const) {
        if (data[f] !== undefined) payload[f] = clean(data[f])
      }
      enqueueEdit(b.class_id, "student.upsert", name, payload)
      afterEdit(b.class_id)
      return null
    }),
  webDeleteStudent: (name: string) =>
    wrap(async () => {
      const b = await loadView()
      if (!b.students.some((s) => s.name === name)) throw new Error("学生不存在")
      enqueueEdit(b.class_id, "student.delete", name, { name })
      afterEdit(b.class_id)
      return null
    }),
  webSaveReason: (data: { old_content?: string; content: string; category: string; delta: number }) =>
    wrap(async () => {
      const content = clean(data.content)
      if (!content) throw new Error("理由内容不能为空")
      const delta = Math.trunc(Number(data.delta))
      if (!Number.isFinite(delta) || Math.abs(delta) > 9999) throw new Error("分值无效")
      const b = await loadView()
      const old = clean(data.old_content)
      if (old && !b.reasons.some((r) => r.content === old)) throw new Error("理由不存在")
      if (old !== content && b.reasons.some((r) => r.content === content))
        throw new Error("已有相同的理由")
      const payload: Record<string, unknown> = {
        content,
        category: clean(data.category) || "其他",
        delta,
      }
      if (old && old !== content) payload.old_content = old
      enqueueEdit(b.class_id, "reason.upsert", `reason:${content}`, payload)
      afterEdit(b.class_id)
      return null
    }),
  webDeleteReason: (content: string) =>
    wrap(async () => {
      const b = await loadView()
      enqueueEdit(b.class_id, "reason.delete", `reason:${content}`, { content })
      afterEdit(b.class_id)
      return null
    }),
  /** 撤销一条积分记录（含尚未上传的）。统一入队，服务端按顺序先加后撤，避免与上传中的操作竞争。 */
  webRevokeEvent: (uuid: string) =>
    wrap(async () => {
      const b = await loadView()
      const pendingOp = getOutbox(b.class_id).find(
        (o) => o.op_id === uuid && o.operation_type === "score.adjust"
      )
      const event: any = pendingOp
        ? { student_name: pendingOp.payload.student_name, delta: pendingOp.payload.score_delta }
        : b.recent_events.find((e: any) => e.uuid === uuid)
      if (!event) throw new Error("记录不存在或已撤销")
      if (event.settlement_id != null) throw new Error("该记录已结算，无法撤销")
      const delta = Number(event.delta) || 0
      enqueueEdit(b.class_id, "score.revoke", String(event.student_name), {
        event_uuid: uuid,
        student_name: String(event.student_name),
        // 仅供本地乐观显示；服务端按原记录计算。
        score_delta: -delta,
        reward_delta: -delta,
      })
      afterEdit(b.class_id)
      return null
    }),
  queryStudents: () =>
    wrap(async () => {
      const b = await loadView()
      const pending = pendingDeltas(b.class_id)
      return b.students.map((s: any, i) => ({
        ...s,
        id: s.id ?? 100000 + i,
        score: s.score + (pending.get(s.name)?.score || 0),
        reward_points: s.reward_points + (pending.get(s.name)?.reward || 0),
        tags: tagsOf(b, s.name),
      }))
    }),
  queryReasons: () => wrap(async () => (await loadView()).reasons.map((r, i) => ({ id: i + 1, ...r }))),
  rewardSettingQuery: () => wrap(async () => (await load()).reward_settings),
  tagsGetAll: () => wrap(async () => (await load()).tags.map((t, i) => ({ id: i + 1, ...t }))),
  tagsGetByStudent: (id: number) =>
    wrap(async () => {
      const b: any = await loadView()
      const s = b.students.find((x: any, i: number) => (x.id ?? 100000 + i) === id)
      return s ? tagsOf(b, s.name).map((name, i) => ({ id: i + 1, name })) : []
    }),
  queryEvents: (params?: { limit?: number }) =>
    wrap(async () => (await loadView()).recent_events.slice(0, Number(params?.limit || 100))),
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
    const b = await loadView()
    const events: Array<{ name: string; time: number; delta: number }> = (b.recent_events as any[]).map(
      (e) => ({ name: String(e.student_name), time: Date.parse(e.event_time), delta: Number(e.delta) || 0 })
    )
    const outbox = getOutbox(b.class_id)
    const revoked = new Set(
      outbox.filter((o) => o.operation_type === "score.revoke").map((o) => o.payload.event_uuid)
    )
    for (const op of outbox) {
      if (op.operation_type !== "score.adjust" || revoked.has(op.op_id)) continue
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

// 主页的「撤销」按钮走同一条撤销通道。
cloudBase.deleteEvent = (uuid: string) => cloudBase.webRevokeEvent(uuid)

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
    // 主动退出后不自动跳转，否则 SECTL 已登录时授权页会立刻把人登录回来。
    if (isLoggedOut()) {
      showLoggedOutPage()
      return false
    }
    await login()
    return false
  }
  clearLoggedOut()
  return true
}

const showLoggedOutPage = () => {
  const root = document.getElementById("root") || document.body
  root.innerHTML = `
    <div style="height:var(--ss-app-height,100dvh);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;padding:24px;box-sizing:border-box;font-family:inherit;color:#1f2329;background:#f5f7fb;text-align:center">
      <img src="/favicon.svg" alt="" style="width:56px;height:56px" />
      <div style="font-size:18px;font-weight:600">已退出登录</div>
      <div style="font-size:14px;color:#646a73">如需切换账号，请先在 SECTL 退出当前账号再登录。</div>
      <button id="ssw-relogin" type="button" style="min-width:180px;height:44px;border:none;border-radius:999px;background:#1677ff;color:#fff;font-size:16px;cursor:pointer">重新登录</button>
    </div>`
  document.getElementById("ssw-relogin")?.addEventListener("click", () => {
    clearLoggedOut()
    void login()
  })
}

// 云端没有推送通道给浏览器，这里轮询 bootstrap：可见时每 10 秒一次，切回前台/恢复联网立即一次。
// 服务端序号或快照时间变化时才通知 UI 刷新，避免无谓重绘。
let pollTimer: number | undefined
let lastSignature = ""
const signature = (b: Bootstrap) => `${b.class_id}:${b.server_change_seq}:${b.snapshot_updated_at}`

const pollOnce = async () => {
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
  refreshDebounce = window.setTimeout(() => void pollOnce(), 150)
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
