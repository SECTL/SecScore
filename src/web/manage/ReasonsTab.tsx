import React, { useMemo, useState } from "react"
import { BottomSheet } from "./BottomSheet"
import { SearchBar, Pills } from "./controls"
import {
  dayLabel,
  formatDelta,
  matchText,
  timeLabel,
  type ManageData,
  type ManageReason,
} from "./data"

type Filter = "all" | "plus" | "minus"
const FILTERS: Array<{ key: Filter; label: string }> = [
  { key: "all", label: "全部" },
  { key: "plus", label: "加分" },
  { key: "minus", label: "扣分" },
]

export function ReasonsTab({ data }: { data: ManageData }): React.JSX.Element {
  const [query, setQuery] = useState("")
  const [filter, setFilter] = useState<Filter>("all")
  const [selected, setSelected] = useState<ManageReason | null>(null)

  const usage = useMemo(() => {
    const map = new Map<string, number>()
    for (const e of data.events) {
      if (e.kind === "score") map.set(e.reason_content, (map.get(e.reason_content) || 0) + 1)
    }
    return map
  }, [data.events])

  const sections = useMemo(() => {
    const map = new Map<string, ManageReason[]>()
    for (const r of data.reasons) {
      if (filter === "plus" && r.delta <= 0) continue
      if (filter === "minus" && r.delta >= 0) continue
      if (!matchText(r.content, query) && !matchText(r.category, query)) continue
      map.set(r.category, [...(map.get(r.category) || []), r])
    }
    return [...map].map(([title, items]) => ({ title, items }))
  }, [data.reasons, filter, query])

  const reasonEvents = useMemo(
    () =>
      selected
        ? data.events.filter((e) => e.kind === "score" && e.reason_content === selected.content)
        : [],
    [data.events, selected]
  )

  return (
    <>
      <div className="ssm-sticky">
        <SearchBar value={query} onChange={setQuery} placeholder="搜索理由或分类" />
        <Pills options={FILTERS} value={filter} onChange={setFilter} />
      </div>

      {data.loading && !data.reasons.length ? (
        <div className="ssm-empty">加载中…</div>
      ) : sections.length === 0 ? (
        <div className="ssm-empty">{query ? "没有匹配的理由" : "暂无理由"}</div>
      ) : (
        sections.map((sec) => (
          <section key={sec.title}>
            <div className="ssm-section-head">
              <span>{sec.title}</span>
              <span className="ssm-section-meta">{sec.items.length} 项</span>
            </div>
            <div className="ssm-list">
              {sec.items.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  className="ssm-row ssm-row-btn"
                  onClick={() => setSelected(r)}
                >
                  <span className="ssm-row-main">
                    <span className="ssm-row-title is-wrap">{r.content}</span>
                    <span className="ssm-row-sub">已使用 {usage.get(r.content) || 0} 次</span>
                  </span>
                  <span className={`ssm-delta-pill${r.delta < 0 ? " is-neg" : ""}`}>
                    {formatDelta(r.delta)}
                  </span>
                </button>
              ))}
            </div>
          </section>
        ))
      )}

      <BottomSheet open={!!selected} title="理由详情" onClose={() => setSelected(null)}>
        {selected && (
          <>
            <div className="ssm-detail-hero">
              <div className={`ssm-detail-delta${selected.delta < 0 ? " is-neg" : ""}`}>
                {formatDelta(selected.delta)}
              </div>
              <div className="ssm-detail-text">{selected.content}</div>
            </div>
            <div className="ssm-kv">
              <span>分类</span>
              <span>{selected.category}</span>
            </div>
            <div className="ssm-kv">
              <span>使用次数</span>
              <span>{reasonEvents.length}</span>
            </div>
            <div className="ssm-section-head is-plain">
              <span>最近使用</span>
            </div>
            {reasonEvents.length === 0 ? (
              <div className="ssm-empty is-compact">暂无使用记录</div>
            ) : (
              <div className="ssm-list">
                {reasonEvents.slice(0, 10).map((e) => (
                  <div key={e.key} className="ssm-row">
                    <span className="ssm-avatar">{e.student_name.slice(0, 1)}</span>
                    <span className="ssm-row-main">
                      <span className="ssm-row-title">{e.student_name}</span>
                      <span className="ssm-row-sub">
                        {dayLabel(e.event_time)} {timeLabel(e.event_time)}
                      </span>
                    </span>
                    <span className={`ssm-delta${e.delta < 0 ? " is-neg" : ""}`}>
                      {formatDelta(e.delta)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </BottomSheet>
    </>
  )
}
