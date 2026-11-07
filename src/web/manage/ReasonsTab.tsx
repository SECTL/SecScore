import React, { useMemo, useState } from "react"
import { DeleteOutlined, EditOutlined } from "@ant-design/icons"
import { BottomSheet } from "./BottomSheet"
import { SearchBar, Pills } from "./controls"
import { ChoiceChips, DeltaStepper, Fab, Field, SheetActions, useSubmit } from "./forms"
import {
  callEdit,
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
  const [sheet, setSheet] = useState<
    { mode: "view" | "edit" | "delete"; content: string } | { mode: "create" } | null
  >(null)
  const selected =
    sheet && sheet.mode !== "create"
      ? data.reasons.find((r) => r.content === sheet.content) ?? null
      : null
  const setSelected = (r: ManageReason) => setSheet({ mode: "view", content: r.content })
  const categories = useMemo(
    () => [...new Set(data.reasons.map((r) => r.category).filter(Boolean))],
    [data.reasons]
  )
  const showAfterSave = async (content: string) => {
    await data.reload()
    setSheet({ mode: "view", content })
  }

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

      <Fab label="添加理由" onClick={() => setSheet({ mode: "create" })} />

      <BottomSheet
        open={sheet?.mode === "create" || !!selected}
        title={
          sheet?.mode === "create"
            ? "添加理由"
            : sheet?.mode === "edit"
              ? "编辑理由"
              : sheet?.mode === "delete"
                ? "删除理由"
                : "理由详情"
        }
        onClose={() => setSheet(null)}
      >
        {sheet?.mode === "create" && (
          <ReasonForm
            categories={categories}
            onDone={showAfterSave}
            onCancel={() => setSheet(null)}
          />
        )}
        {selected && sheet?.mode === "edit" && (
          <ReasonForm
            reason={selected}
            categories={categories}
            onDone={showAfterSave}
            onCancel={() => setSheet({ mode: "view", content: selected.content })}
          />
        )}
        {selected && sheet?.mode === "delete" && (
          <DeleteReason
            reason={selected}
            onDone={() => setSheet(null)}
            onCancel={() => setSheet({ mode: "view", content: selected.content })}
          />
        )}
        {selected && sheet?.mode === "view" && (
          <>
            <div className="ssm-detail-hero">
              <div className={`ssm-detail-delta${selected.delta < 0 ? " is-neg" : ""}`}>
                {formatDelta(selected.delta)}
              </div>
              <div className="ssm-detail-text">{selected.content}</div>
            </div>
            <div className="ssm-action-grid">
              <button
                type="button"
                className="ssm-btn"
                onClick={() => setSheet({ mode: "edit", content: selected.content })}
              >
                <EditOutlined /> 编辑
              </button>
              <button
                type="button"
                className="ssm-btn is-danger-text"
                onClick={() => setSheet({ mode: "delete", content: selected.content })}
              >
                <DeleteOutlined /> 删除
              </button>
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

function ReasonForm({
  reason,
  categories,
  onDone,
  onCancel,
}: {
  reason?: ManageReason
  categories: string[]
  onDone: (content: string) => void
  onCancel: () => void
}): React.JSX.Element {
  const [content, setContent] = useState(reason?.content ?? "")
  const [category, setCategory] = useState(
    reason && reason.category !== "未分类" ? reason.category : ""
  )
  const [delta, setDelta] = useState(reason?.delta ?? 1)
  const { busy, error, run } = useSubmit()

  const submit = () =>
    run(
      () =>
        callEdit("webSaveReason", {
          old_content: reason?.content,
          content,
          category,
          delta,
        }),
      reason ? "已保存" : "已添加",
      () => onDone(content.trim())
    )

  return (
    <div className="ssm-form">
      <Field label="理由内容">
        <textarea
          className="ssm-input ssm-textarea"
          rows={2}
          value={content}
          placeholder="例如：课堂积极发言"
          maxLength={200}
          autoFocus={!reason}
          onChange={(e) => setContent(e.target.value)}
        />
      </Field>
      <Field label="分值">
        <div className="ssm-delta-editor">
          <div className="ssm-pills">
            <button
              type="button"
              className={`ssm-pill${delta > 0 ? " is-active" : ""}`}
              onClick={() => setDelta(Math.abs(delta) || 1)}
            >
              加分
            </button>
            <button
              type="button"
              className={`ssm-pill is-neg${delta < 0 ? " is-active" : ""}`}
              onClick={() => setDelta(-(Math.abs(delta) || 1))}
            >
              扣分
            </button>
          </div>
          <DeltaStepper value={delta} onChange={setDelta} />
        </div>
      </Field>
      <Field label="分类" hint="可直接输入新分类">
        <input
          className="ssm-input"
          value={category}
          placeholder="其他"
          enterKeyHint="done"
          onChange={(e) => setCategory(e.target.value)}
        />
        <ChoiceChips options={categories} value={category} onChange={setCategory} />
      </Field>
      <SheetActions
        primary={submit}
        primaryLabel={reason ? "保存" : "添加"}
        onSecondary={onCancel}
        busy={busy}
        error={error}
      />
    </div>
  )
}

function DeleteReason({
  reason,
  onDone,
  onCancel,
}: {
  reason: ManageReason
  onDone: () => void
  onCancel: () => void
}): React.JSX.Element {
  const { busy, error, run } = useSubmit()
  return (
    <div className="ssm-form">
      <div className="ssm-confirm-text">
        确定删除理由 <strong>{reason.content}</strong> 吗？
        <br />
        已经记录的积分不受影响。
      </div>
      <SheetActions
        primary={() => run(() => callEdit("webDeleteReason", reason.content), "已删除", onDone)}
        primaryLabel="删除"
        danger
        onSecondary={onCancel}
        busy={busy}
        error={error}
      />
    </div>
  )
}
