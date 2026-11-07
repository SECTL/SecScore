import React, { useEffect, useMemo, useRef, useState } from "react"
import { CloseOutlined, UserOutlined } from "@ant-design/icons"
import { BottomSheet } from "./BottomSheet"
import { SearchBar, Pills } from "./controls"
import {
  dayLabel,
  formatDelta,
  matchText,
  timeLabel,
  type ManageData,
  type ManageEvent,
} from "./data"

type Filter = "all" | "plus" | "minus"
const FILTERS: Array<{ key: Filter; label: string }> = [
  { key: "all", label: "全部" },
  { key: "plus", label: "加分" },
  { key: "minus", label: "扣分" },
]
const PAGE = 60

export function HistoryTab({
  data,
  student,
  onClearStudent,
}: {
  data: ManageData
  student: string | null
  onClearStudent: () => void
}): React.JSX.Element {
  const [query, setQuery] = useState("")
  const [filter, setFilter] = useState<Filter>("all")
  const [limit, setLimit] = useState(PAGE)
  const [detail, setDetail] = useState<ManageEvent | null>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)

  const filtered = useMemo(
    () =>
      data.events.filter((e) => {
        if (student && e.student_name !== student) return false
        if (filter === "plus" && e.delta <= 0) return false
        if (filter === "minus" && e.delta >= 0) return false
        return matchText(e.student_name, query) || matchText(e.reason_content, query)
      }),
    [data.events, student, filter, query]
  )

  useEffect(() => setLimit(PAGE), [student, filter, query])

  // 滚动到底部附近时追加渲染，避免一次渲染上千条。
  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((x) => x.isIntersecting)) setLimit((n) => n + PAGE)
      },
      { root: el.closest(".ssm-scroll"), rootMargin: "400px 0px" }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [filtered.length, limit])

  const summary = useMemo(() => {
    let plus = 0
    let minus = 0
    for (const e of filtered) {
      if (e.kind !== "score") continue
      if (e.delta > 0) plus += e.delta
      else minus += e.delta
    }
    return { plus, minus }
  }, [filtered])

  const groups = useMemo(() => {
    const out: Array<{ day: string; net: number; items: ManageEvent[] }> = []
    for (const e of filtered.slice(0, limit)) {
      const day = dayLabel(e.event_time)
      let g = out[out.length - 1]
      if (!g || g.day !== day) {
        g = { day, net: 0, items: [] }
        out.push(g)
      }
      g.items.push(e)
      if (e.kind === "score") g.net += e.delta
    }
    return out
  }, [filtered, limit])

  return (
    <>
      <div className="ssm-sticky">
        <SearchBar value={query} onChange={setQuery} placeholder="搜索学生或理由" />
        <div className="ssm-toolbar-row">
          <Pills options={FILTERS} value={filter} onChange={setFilter} />
          {student && (
            <button type="button" className="ssm-filter-chip" onClick={onClearStudent}>
              <UserOutlined />
              <span>{student}</span>
              <CloseOutlined style={{ fontSize: 10 }} />
            </button>
          )}
        </div>
      </div>

      <div className="ssm-stats">
        <div className="ssm-stat">
          <div className="ssm-stat-value">{filtered.length}</div>
          <div className="ssm-stat-label">条记录</div>
        </div>
        <div className="ssm-stat">
          <div className="ssm-stat-value is-pos">{formatDelta(summary.plus)}</div>
          <div className="ssm-stat-label">加分合计</div>
        </div>
        <div className="ssm-stat">
          <div className="ssm-stat-value is-neg">{summary.minus}</div>
          <div className="ssm-stat-label">扣分合计</div>
        </div>
      </div>

      {data.loading && !data.events.length ? (
        <div className="ssm-empty">加载中…</div>
      ) : filtered.length === 0 ? (
        <div className="ssm-empty">暂无记录</div>
      ) : (
        groups.map((g) => (
          <section key={g.day}>
            <div className="ssm-section-head">
              <span>{g.day}</span>
              <span className={`ssm-section-meta${g.net < 0 ? " is-neg" : g.net > 0 ? " is-pos" : ""}`}>
                净变化 {formatDelta(g.net)}
              </span>
            </div>
            <div className="ssm-list">
              {g.items.map((e) => (
                <button
                  key={e.key}
                  type="button"
                  className="ssm-row ssm-row-btn"
                  onClick={() => setDetail(e)}
                >
                  <span className="ssm-avatar">{e.student_name.slice(0, 1)}</span>
                  <span className="ssm-row-main">
                    <span className="ssm-row-title">
                      {e.student_name}
                      {e.pending && <span className="ssm-badge">待同步</span>}
                      {e.kind === "redeem" && <span className="ssm-badge is-info">兑换</span>}
                    </span>
                    <span className="ssm-row-sub">{e.reason_content || "（无理由）"}</span>
                  </span>
                  <span className="ssm-row-end">
                    <span className={`ssm-delta${e.delta < 0 ? " is-neg" : ""}`}>
                      {formatDelta(e.delta)}
                    </span>
                    <span className="ssm-row-sub">{timeLabel(e.event_time)}</span>
                  </span>
                </button>
              ))}
            </div>
          </section>
        ))
      )}
      {limit < filtered.length && (
        <div ref={sentinelRef} className="ssm-empty is-compact">
          加载更多…
        </div>
      )}

      <BottomSheet open={!!detail} title="记录详情" onClose={() => setDetail(null)}>
        {detail && (
          <>
            <div className="ssm-detail-hero">
              <div className={`ssm-detail-delta${detail.delta < 0 ? " is-neg" : ""}`}>
                {formatDelta(detail.delta)}
              </div>
              <div className="ssm-row-sub">{detail.kind === "redeem" ? "奖励兑换" : "积分变动"}</div>
            </div>
            <div className="ssm-kv">
              <span>学生</span>
              <span>{detail.student_name}</span>
            </div>
            <div className="ssm-kv">
              <span>理由</span>
              <span>{detail.reason_content || "（无理由）"}</span>
            </div>
            {detail.val_prev != null && detail.val_curr != null && (
              <div className="ssm-kv">
                <span>积分变化</span>
                <span>
                  {detail.val_prev} → {detail.val_curr}
                </span>
              </div>
            )}
            <div className="ssm-kv">
              <span>时间</span>
              <span>
                {dayLabel(detail.event_time)} {timeLabel(detail.event_time)}
              </span>
            </div>
            <div className="ssm-kv">
              <span>状态</span>
              <span>{detail.pending ? "待同步（联网后自动上传）" : "已同步"}</span>
            </div>
          </>
        )}
      </BottomSheet>
    </>
  )
}
