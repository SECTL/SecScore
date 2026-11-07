import { useCallback, useEffect, useState } from "react"
import { pinyin } from "pinyin-pro"

export interface ManageStudent {
  id: number
  name: string
  score: number
  reward_points: number
  group_name?: string | null
  tags: string[]
}

export interface ManageEvent {
  key: string
  student_name: string
  reason_content: string
  delta: number
  val_prev?: number | null
  val_curr?: number | null
  event_time: string
  pending?: boolean
  kind: "score" | "redeem"
}

export interface ManageReason {
  id: number
  content: string
  delta: number
  category: string
}

export interface ManageClass {
  id: string
  name: string
}

export interface ManageData {
  students: ManageStudent[]
  events: ManageEvent[]
  reasons: ManageReason[]
  classes: ManageClass[]
  currentClassId?: string
  loading: boolean
  error: string | null
  reload: () => Promise<void>
}

const api = () => (window as any).api

const normalizeEvents = (raw: any[], pendingOps: any[]): ManageEvent[] => {
  const pending: ManageEvent[] = pendingOps.map((op) =>
    op.operation_type === "reward.redeem"
      ? {
          key: `p-${op.op_id}`,
          student_name: String(op.payload.student_name),
          reason_content: `兑换：${op.payload.reward_name ?? "奖励"}`,
          delta: -Number(op.payload.cost_points || 0),
          event_time: op.client_created_at,
          pending: true,
          kind: "redeem" as const,
        }
      : {
          key: `p-${op.op_id}`,
          student_name: String(op.payload.student_name),
          reason_content: String(op.payload.reason_content || ""),
          delta: Number(op.payload.score_delta || 0),
          event_time: op.client_created_at,
          pending: true,
          kind: "score" as const,
        }
  )
  const synced: ManageEvent[] = raw.map((e, i) => ({
    key: String(e.uuid ?? e.id ?? `e-${i}`),
    student_name: String(e.student_name ?? ""),
    reason_content: String(e.reason_content ?? ""),
    delta: Number(e.delta) || 0,
    val_prev: e.val_prev ?? null,
    val_curr: e.val_curr ?? null,
    event_time: String(e.event_time ?? ""),
    kind: "score",
  }))
  return [...pending.reverse(), ...synced].sort(
    (a, b) => (Date.parse(b.event_time) || 0) - (Date.parse(a.event_time) || 0)
  )
}

/** 管理页共用数据：切换底部标签不重复请求，云端有更新时自动刷新。 */
export function useManageData(): ManageData {
  const [state, setState] = useState<Omit<ManageData, "reload">>({
    students: [],
    events: [],
    reasons: [],
    classes: [],
    loading: true,
    error: null,
  })

  const reload = useCallback(async () => {
    const a = api()
    const [stuRes, evRes, reaRes, pendRes, clsRes] = await Promise.all([
      a.queryStudents(),
      a.queryEvents({ limit: 5000 }),
      a.queryReasons(),
      a.webPendingOps ? a.webPendingOps() : Promise.resolve({ success: true, data: [] }),
      a.webListClasses(),
    ])
    setState((prev) => ({
      students: stuRes?.success
        ? (stuRes.data as any[]).map((s) => ({
            id: Number(s.id),
            name: String(s.name),
            score: Number(s.score) || 0,
            reward_points: Number(s.reward_points) || 0,
            group_name: s.group_name || null,
            tags: Array.isArray(s.tags) ? s.tags.map(String) : [],
          }))
        : prev.students,
      events: evRes?.success
        ? normalizeEvents(evRes.data || [], pendRes?.success ? pendRes.data || [] : [])
        : prev.events,
      reasons: reaRes?.success
        ? (reaRes.data as any[]).map((r) => ({
            id: Number(r.id),
            content: String(r.content ?? ""),
            delta: Number(r.delta) || 0,
            category: String(r.category || "未分类"),
          }))
        : prev.reasons,
      classes: clsRes?.success
        ? (clsRes.data.classes as any[]).map((c) => ({ id: String(c.id), name: String(c.name) }))
        : prev.classes,
      currentClassId: clsRes?.success ? String(clsRes.data.current) : prev.currentClassId,
      loading: false,
      error: stuRes?.success ? null : stuRes?.message || "加载失败",
    }))
  }, [])

  useEffect(() => {
    void reload()
    const onUpdated = () => void reload()
    window.addEventListener("ss:data-updated", onUpdated)
    return () => window.removeEventListener("ss:data-updated", onUpdated)
  }, [reload])

  return { ...state, reload }
}

const pinyinCache = new Map<string, { full: string; initials: string }>()
const pinyinOf = (text: string) => {
  let hit = pinyinCache.get(text)
  if (!hit) {
    hit = {
      full: pinyin(text, { toneType: "none", type: "array" }).join("").toLowerCase(),
      initials: pinyin(text, { pattern: "first", toneType: "none", type: "array" })
        .join("")
        .toLowerCase(),
    }
    pinyinCache.set(text, hit)
  }
  return hit
}

/** 支持汉字、全拼、首字母模糊匹配。 */
export const matchText = (text: string, query: string): boolean => {
  const q = query.trim().toLowerCase()
  if (!q) return true
  if (text.toLowerCase().includes(q)) return true
  const p = pinyinOf(text)
  return p.full.includes(q) || p.initials.includes(q)
}

export const formatDelta = (n: number) => (n > 0 ? `+${n}` : String(n))

export const dayLabel = (iso: string): string => {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return "未知日期"
  const today = new Date()
  const start = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const diff = Math.round((start(today) - start(d)) / 86_400_000)
  if (diff === 0) return "今天"
  if (diff === 1) return "昨天"
  const week = "日一二三四五六"[d.getDay()]
  const md = `${d.getMonth() + 1}月${d.getDate()}日 周${week}`
  return d.getFullYear() === today.getFullYear() ? md : `${d.getFullYear()}年${md}`
}

export const timeLabel = (iso: string): string => {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
}
