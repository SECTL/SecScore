import React, { useMemo, useState } from "react"
import { DeleteOutlined, EditOutlined, RightOutlined } from "@ant-design/icons"
import { BottomSheet } from "./BottomSheet"
import { SearchBar, Pills } from "./controls"
import { ChoiceChips, Fab, Field, SheetActions, TextInput, useSubmit } from "./forms"
import {
  callEdit,
  dayLabel,
  formatDelta,
  matchText,
  timeLabel,
  type ManageData,
  type ManageStudent,
} from "./data"

type SortKey = "score" | "name" | "group"
const SORTS: Array<{ key: SortKey; label: string }> = [
  { key: "score", label: "按积分" },
  { key: "name", label: "按姓名" },
  { key: "group", label: "按小组" },
]

const collator = new Intl.Collator("zh-CN", { numeric: true })
const CN_DIGITS: Record<string, number> = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 }
/** 「第十二组」→「第12组」，让小组按数字顺序排列。 */
const groupSortKey = (name: string) =>
  name.replace(/[一二三四五六七八九十]+/g, (m) => {
    if (!m.includes("十")) return String(Number([...m].map((c) => CN_DIGITS[c]).join("")))
    const [tens, ones] = m.split("十")
    return String((tens ? CN_DIGITS[tens] || 1 : 1) * 10 + (ones ? CN_DIGITS[ones] || 0 : 0))
  })

export function StudentsTab({
  data,
  onOpenHistory,
}: {
  data: ManageData
  onOpenHistory: (studentName: string) => void
}): React.JSX.Element {
  const [query, setQuery] = useState("")
  const [sort, setSort] = useState<SortKey>("score")
  // 同一个弹层在「详情 / 编辑 / 删除确认 / 新建」之间切换，避免叠加弹层与返回键记录错乱。
  const [sheet, setSheet] = useState<
    { mode: "view" | "edit" | "delete"; name: string } | { mode: "create" } | null
  >(null)
  const selected =
    sheet && sheet.mode !== "create"
      ? data.students.find((s) => s.name === sheet.name) ?? null
      : null
  const setSelected = (s: ManageStudent | null) => setSheet(s ? { mode: "view", name: s.name } : null)
  // 保存后先等数据刷新（新名字进入列表）再切回详情，否则弹层会因找不到学生而闪退。
  const showAfterSave = async (name: string) => {
    await data.reload()
    setSheet({ mode: "view", name })
  }
  const groups = useMemo(
    () =>
      [...new Set(data.students.map((s) => s.group_name).filter((g): g is string => !!g))].sort(
        (a, b) => collator.compare(groupSortKey(a), groupSortKey(b))
      ),
    [data.students]
  )

  // 排名按积分计算（同分同名次），不受搜索/排序影响。
  const rankOf = useMemo(() => {
    const scores = data.students.map((s) => s.score).sort((a, b) => b - a)
    return (score: number) => scores.indexOf(score) + 1
  }, [data.students])

  const filtered = useMemo(() => {
    const list = data.students.filter(
      (s) =>
        matchText(s.name, query) ||
        (s.group_name ? matchText(s.group_name, query) : false) ||
        s.tags.some((t) => matchText(t, query))
    )
    return list.sort((a, b) => {
      if (sort === "score") return b.score - a.score || collator.compare(a.name, b.name)
      if (sort === "group")
        return (
          Number(!a.group_name) - Number(!b.group_name) ||
          collator.compare(groupSortKey(a.group_name || ""), groupSortKey(b.group_name || "")) ||
          collator.compare(a.name, b.name)
        )
      return collator.compare(a.name, b.name)
    })
  }, [data.students, query, sort])

  const sections = useMemo(() => {
    if (sort !== "group") return [{ title: null as string | null, items: filtered }]
    const map = new Map<string, ManageStudent[]>()
    for (const s of filtered) {
      const g = s.group_name || "未分组"
      map.set(g, [...(map.get(g) || []), s])
    }
    return [...map].map(([title, items]) => ({ title, items }))
  }, [filtered, sort])

  const stats = useMemo(() => {
    const n = data.students.length
    const total = data.students.reduce((sum, s) => sum + s.score, 0)
    return {
      n,
      avg: n ? Math.round((total / n) * 10) / 10 : 0,
      max: n ? Math.max(...data.students.map((s) => s.score)) : 0,
    }
  }, [data.students])

  const studentEvents = useMemo(
    () => (selected ? data.events.filter((e) => e.student_name === selected.name) : []),
    [data.events, selected]
  )

  return (
    <>
      <div className="ssm-sticky">
        <SearchBar value={query} onChange={setQuery} placeholder="搜索姓名、拼音、小组或标签" />
        <Pills options={SORTS} value={sort} onChange={setSort} />
      </div>

      <div className="ssm-stats">
        <div className="ssm-stat">
          <div className="ssm-stat-value">{stats.n}</div>
          <div className="ssm-stat-label">学生</div>
        </div>
        <div className="ssm-stat">
          <div className="ssm-stat-value">{stats.avg}</div>
          <div className="ssm-stat-label">平均分</div>
        </div>
        <div className="ssm-stat">
          <div className="ssm-stat-value">{stats.max}</div>
          <div className="ssm-stat-label">最高分</div>
        </div>
      </div>

      {data.loading && !data.students.length ? (
        <div className="ssm-empty">加载中…</div>
      ) : filtered.length === 0 ? (
        <div className="ssm-empty">{query ? "没有匹配的学生" : "暂无学生"}</div>
      ) : (
        sections.map((sec) => (
          <section key={sec.title ?? "all"}>
            {sec.title && (
              <div className="ssm-section-head">
                <span>{sec.title}</span>
                <span className="ssm-section-meta">
                  {sec.items.length} 人 · 合计 {sec.items.reduce((s, x) => s + x.score, 0)}
                </span>
              </div>
            )}
            <div className="ssm-list">
              {sec.items.map((s) => {
                const rank = rankOf(s.score)
                return (
                  <button
                    key={s.id}
                    type="button"
                    className="ssm-row ssm-row-btn"
                    onClick={() => setSelected(s)}
                  >
                    {sort === "score" ? (
                      <span className={`ssm-rank${rank <= 3 ? ` is-top${rank}` : ""}`}>{rank}</span>
                    ) : (
                      <span className="ssm-avatar">{s.name.slice(0, 1)}</span>
                    )}
                    <span className="ssm-row-main">
                      <span className="ssm-row-title">{s.name}</span>
                      {(s.group_name || s.tags.length > 0) && (
                        <span className="ssm-row-sub">
                          {[s.group_name, ...s.tags].filter(Boolean).join(" · ")}
                        </span>
                      )}
                    </span>
                    <span className="ssm-row-end">
                      <span
                        className={`ssm-score${s.score < 0 ? " is-neg" : ""}`}
                      >
                        {s.score}
                      </span>
                      <span className="ssm-row-sub">可兑 {s.reward_points}</span>
                    </span>
                  </button>
                )
              })}
            </div>
          </section>
        ))
      )}

      <Fab label="添加学生" onClick={() => setSheet({ mode: "create" })} />

      <BottomSheet
        open={sheet?.mode === "create" || !!selected}
        title={
          sheet?.mode === "create"
            ? "添加学生"
            : sheet?.mode === "edit"
              ? "编辑学生"
              : sheet?.mode === "delete"
                ? "删除学生"
                : selected?.name
        }
        onClose={() => setSheet(null)}
      >
        {sheet?.mode === "create" && (
          <StudentForm
            groups={groups}
            onDone={showAfterSave}
            onCancel={() => setSheet(null)}
          />
        )}
        {selected && sheet?.mode === "edit" && (
          <StudentForm
            student={selected}
            groups={groups}
            onDone={showAfterSave}
            onCancel={() => setSheet({ mode: "view", name: selected.name })}
          />
        )}
        {selected && sheet?.mode === "delete" && (
          <DeleteStudent
            student={selected}
            onDone={() => setSheet(null)}
            onCancel={() => setSheet({ mode: "view", name: selected.name })}
          />
        )}
        {selected && sheet?.mode === "view" && (
          <>
            <div className="ssm-detail-grid">
              <div className="ssm-detail-cell">
                <div className="ssm-stat-value">{selected.score}</div>
                <div className="ssm-stat-label">积分</div>
              </div>
              <div className="ssm-detail-cell">
                <div className="ssm-stat-value">{selected.reward_points}</div>
                <div className="ssm-stat-label">可兑换</div>
              </div>
              <div className="ssm-detail-cell">
                <div className="ssm-stat-value">第 {rankOf(selected.score)}</div>
                <div className="ssm-stat-label">排名</div>
              </div>
            </div>
            <div className="ssm-action-grid">
              <button
                type="button"
                className="ssm-btn"
                onClick={() => setSheet({ mode: "edit", name: selected.name })}
              >
                <EditOutlined /> 编辑信息
              </button>
              <button
                type="button"
                className="ssm-btn is-danger-text"
                onClick={() => setSheet({ mode: "delete", name: selected.name })}
              >
                <DeleteOutlined /> 删除
              </button>
            </div>
            <div className="ssm-kv">
              <span>小组</span>
              <span>{selected.group_name || "未分组"}</span>
            </div>
            {selected.student_no && (
              <div className="ssm-kv">
                <span>学号</span>
                <span>{selected.student_no}</span>
              </div>
            )}
            {selected.alias && (
              <div className="ssm-kv">
                <span>别名</span>
                <span>{selected.alias}</span>
              </div>
            )}
            {selected.tags.length > 0 && (
              <div className="ssm-chips">
                {selected.tags.map((t) => (
                  <span key={t} className="ssm-chip">
                    {t}
                  </span>
                ))}
              </div>
            )}
            <div className="ssm-section-head is-plain">
              <span>最近记录</span>
              <span className="ssm-section-meta">共 {studentEvents.length} 条</span>
            </div>
            {studentEvents.length === 0 ? (
              <div className="ssm-empty is-compact">暂无积分记录</div>
            ) : (
              <div className="ssm-list">
                {studentEvents.slice(0, 8).map((e) => (
                  <div key={e.key} className="ssm-row">
                    <span className="ssm-row-main">
                      <span className="ssm-row-title">{e.reason_content || "（无理由）"}</span>
                      <span className="ssm-row-sub">
                        {dayLabel(e.event_time)} {timeLabel(e.event_time)}
                        {e.pending && <span className="ssm-badge">待同步</span>}
                      </span>
                    </span>
                    <span className={`ssm-delta${e.delta < 0 ? " is-neg" : ""}`}>
                      {formatDelta(e.delta)}
                    </span>
                  </div>
                ))}
              </div>
            )}
            {studentEvents.length > 0 && (
              <button
                type="button"
                className="ssm-link-btn"
                onClick={() => {
                  const name = selected.name
                  setSelected(null)
                  onOpenHistory(name)
                }}
              >
                查看全部积分历史 <RightOutlined />
              </button>
            )}
          </>
        )}
      </BottomSheet>
    </>
  )
}

function StudentForm({
  student,
  groups,
  onDone,
  onCancel,
}: {
  student?: ManageStudent
  groups: string[]
  onDone: (name: string) => void
  onCancel: () => void
}): React.JSX.Element {
  const [name, setName] = useState(student?.name ?? "")
  const [group, setGroup] = useState(student?.group_name ?? "")
  const [studentNo, setStudentNo] = useState(student?.student_no ?? "")
  const [alias, setAlias] = useState(student?.alias ?? "")
  const { busy, error, run } = useSubmit()
  const renamed = !!student && name.trim() !== student.name

  const submit = () =>
    run(
      () =>
        callEdit("webSaveStudent", {
          old_name: student?.name,
          name,
          group_name: group,
          student_no: studentNo,
          alias,
        }),
      student ? "已保存" : "已添加",
      () => onDone(name.trim())
    )

  return (
    <div className="ssm-form">
      <Field label="姓名">
        <TextInput
          value={name}
          onValue={setName}
          placeholder="学生姓名"
          maxLength={64}
          autoFocus={!student}
        />
      </Field>
      {renamed && (
        <div className="ssm-form-note">改名后，该学生的历史积分记录会一并改到新名字下。</div>
      )}
      <Field label="小组" hint="可直接输入新小组">
        <TextInput value={group} onValue={setGroup} placeholder="未分组" />
        <ChoiceChips options={groups} value={group} onChange={setGroup} />
      </Field>
      <div className="ssm-form-row">
        <Field label="学号" hint="选填">
          <TextInput value={studentNo} onValue={setStudentNo} inputMode="numeric" />
        </Field>
        <Field label="别名" hint="选填">
          <TextInput value={alias} onValue={setAlias} />
        </Field>
      </div>
      <SheetActions
        primary={submit}
        primaryLabel={student ? "保存" : "添加"}
        onSecondary={onCancel}
        busy={busy}
        error={error}
      />
    </div>
  )
}

function DeleteStudent({
  student,
  onDone,
  onCancel,
}: {
  student: ManageStudent
  onDone: () => void
  onCancel: () => void
}): React.JSX.Element {
  const { busy, error, run } = useSubmit()
  return (
    <div className="ssm-form">
      <div className="ssm-confirm-text">
        确定删除 <strong>{student.name}</strong> 吗？
        <br />
        当前 {student.score} 分，删除后桌面端同步时也会删除该学生，历史积分记录保留。
      </div>
      <SheetActions
        primary={() => run(() => callEdit("webDeleteStudent", student.name), "已删除", onDone)}
        primaryLabel="删除"
        danger
        onSecondary={onCancel}
        busy={busy}
        error={error}
      />
    </div>
  )
}
