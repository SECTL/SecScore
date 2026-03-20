import React, { useCallback, useEffect, useMemo, useState } from "react"
import {
  Alert,
  Button,
  Card,
  Empty,
  Input,
  Popconfirm,
  Select,
  Space,
  Table,
  Tabs,
  Tag,
  Typography,
  message,
} from "antd"
import { DeleteOutlined, PlayCircleOutlined, PlusOutlined, ReloadOutlined } from "@ant-design/icons"
import { useTranslation } from "react-i18next"

interface StudentListConfig {
  id: string
  name: string
  sql: string
  viewMode: BoardStudentViewMode
}

interface BoardConfig {
  id: string
  name: string
  lists: StudentListConfig[]
}

interface BoardPreset {
  id: string
  name: string
  description: string
  sql: string
}

interface BoardManagerProps {
  canManage: boolean
}

type BoardStudentViewMode = "list" | "card" | "grid"

interface BoardStudentCardData {
  key: string
  name: string
  score?: number
  rewardPoints?: number
  weekChange?: number
  weekDeducted?: number
  answeredCount?: number
}

const makeId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

const getDefaultSql = () => `SELECT
  name AS student_name,
  score,
  reward_points
FROM students
ORDER BY score DESC`

const createDefaultList = (): StudentListConfig => ({
  id: makeId(),
  name: "学生积分榜",
  sql: getDefaultSql(),
  viewMode: "card",
})

const createDefaultBoard = (): BoardConfig => ({
  id: makeId(),
  name: "默认看板",
  lists: [createDefaultList()],
})

const normalizeBoards = (input: unknown): BoardConfig[] => {
  if (!Array.isArray(input)) return [createDefaultBoard()]

  const boards: BoardConfig[] = input
    .map((board: any) => {
      const lists = Array.isArray(board?.lists)
        ? board.lists
            .map((list: any) => ({
              id: typeof list?.id === "string" && list.id.trim() ? list.id : makeId(),
              name:
                typeof list?.name === "string" && list.name.trim() ? list.name.trim() : "学生列表",
              sql: typeof list?.sql === "string" && list.sql.trim() ? list.sql : getDefaultSql(),
              viewMode:
                list?.viewMode === "list" || list?.viewMode === "card" || list?.viewMode === "grid"
                  ? list.viewMode
                  : "card",
            }))
            .filter((list: StudentListConfig) => list.sql.trim())
        : []

      return {
        id: typeof board?.id === "string" && board.id.trim() ? board.id : makeId(),
        name: typeof board?.name === "string" && board.name.trim() ? board.name.trim() : "未命名看板",
        lists: lists.length > 0 ? lists : [createDefaultList()],
      }
    })
    .filter((board: BoardConfig) => board.id)

  return boards.length > 0 ? boards : [createDefaultBoard()]
}

const resolveSqlTemplate = (sql: string) => {
  const now = new Date()
  const dayMs = 24 * 60 * 60 * 1000
  const at = (offsetDays: number) => new Date(now.getTime() + offsetDays * dayMs)

  const formatIso = (date: Date) => date.toISOString().replace(/\.\d{3}Z$/, "Z")

  const todayStart = new Date(now)
  todayStart.setHours(0, 0, 0, 0)

  return sql
    .split("{{now}}")
    .join(formatIso(now))
    .split("{{today_start}}")
    .join(formatIso(todayStart))
    .split("{{since_7d}}")
    .join(formatIso(at(-7)))
    .split("{{since_30d}}")
    .join(formatIso(at(-30)))
}

const parseNumber = (value: unknown): number | undefined => {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : undefined
  }
  return undefined
}

const pickStudentName = (row: Record<string, unknown>): string | null => {
  const nameCandidate = row.student_name ?? row.name ?? row.studentName
  if (typeof nameCandidate !== "string") return null
  const name = nameCandidate.trim()
  return name ? name : null
}

const toStudentCards = (rows: any[]): BoardStudentCardData[] => {
  const cards: BoardStudentCardData[] = []
  rows.forEach((row, index) => {
    if (!row || typeof row !== "object") return
    const name = pickStudentName(row as Record<string, unknown>)
    if (!name) return

    const data = row as Record<string, unknown>
    cards.push({
      key: `${name}-${index}`,
      name,
      score: parseNumber(data.score),
      rewardPoints: parseNumber(data.reward_points ?? data.rewardPoints),
      weekChange: parseNumber(data.week_change ?? data.range_change ?? data.change),
      weekDeducted: parseNumber(data.week_deducted ?? data.deducted),
      answeredCount: parseNumber(data.answered_count ?? data.answer_count),
    })
  })

  if (cards.every((item) => item.score === undefined)) return cards

  return cards.sort((a, b) => (b.score ?? Number.MIN_SAFE_INTEGER) - (a.score ?? Number.MIN_SAFE_INTEGER))
}

const getAvatarText = (name: string): string => {
  const chars = name.trim()
  if (!chars) return "?"
  const first = chars[0]
  const second = chars.length > 1 ? chars[1] : ""
  return `${first}${second}`.trim()
}

const getAvatarColor = (name: string): string => {
  const palette = [
    "#1677ff",
    "#13c2c2",
    "#52c41a",
    "#faad14",
    "#eb2f96",
    "#722ed1",
    "#2f54eb",
    "#08979c",
  ]
  let hash = 0
  for (let i = 0; i < name.length; i += 1) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0
  }
  return palette[hash % palette.length]
}

export const BoardManager: React.FC<BoardManagerProps> = ({ canManage }) => {
  const { t } = useTranslation()
  const [messageApi, contextHolder] = message.useMessage()
  const [boards, setBoards] = useState<BoardConfig[]>([])
  const [activeBoardId, setActiveBoardId] = useState<string>("")
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [runningIds, setRunningIds] = useState<Record<string, boolean>>({})
  const [resultMap, setResultMap] = useState<Record<string, any[]>>({})
  const [errorMap, setErrorMap] = useState<Record<string, string>>({})

  const presets: BoardPreset[] = useMemo(
    () => [
      {
        id: "week-low-deduct",
        name: t("board.presets.weekLowDeduct.name"),
        description: t("board.presets.weekLowDeduct.description"),
        sql: `WITH week_stat AS (
  SELECT
    student_name,
    SUM(CASE WHEN delta < 0 THEN -delta ELSE 0 END) AS deducted,
    SUM(delta) AS week_change
  FROM score_events
  WHERE event_time >= '{{since_7d}}'
  GROUP BY student_name
)
SELECT
  s.name AS student_name,
  s.score,
  COALESCE(w.week_change, 0) AS week_change,
  COALESCE(w.deducted, 0) AS week_deducted
FROM students s
LEFT JOIN week_stat w ON w.student_name = s.name
WHERE COALESCE(w.deducted, 0) < 3
ORDER BY s.score DESC`,
      },
      {
        id: "today-active",
        name: t("board.presets.todayActive.name"),
        description: t("board.presets.todayActive.description"),
        sql: `SELECT
  student_name,
  COUNT(*) AS answered_count,
  SUM(delta) AS score_change
FROM score_events
WHERE event_time >= '{{today_start}}'
GROUP BY student_name
ORDER BY answered_count DESC, score_change DESC`,
      },
      {
        id: "reward-ranking",
        name: t("board.presets.rewardRanking.name"),
        description: t("board.presets.rewardRanking.description"),
        sql: `SELECT
  name AS student_name,
  score,
  reward_points
FROM students
ORDER BY reward_points DESC, score DESC`,
      },
    ],
    [t]
  )

  const activeBoard = useMemo(
    () => boards.find((board) => board.id === activeBoardId) || null,
    [boards, activeBoardId]
  )

  const saveBoards = useCallback(
    async (nextBoards: BoardConfig[]) => {
      if (!(window as any).api || !canManage) return

      setSaving(true)
      try {
        const res = await (window as any).api.setSetting("dashboards_config", nextBoards)
        if (!res?.success) {
          messageApi.error(res?.message || t("board.saveFailed"))
        }
      } catch {
        messageApi.error(t("board.saveFailed"))
      } finally {
        setSaving(false)
      }
    },
    [canManage, messageApi, t]
  )

  const fetchBoards = useCallback(async () => {
    if (!(window as any).api) return

    setLoading(true)
    try {
      const res = await (window as any).api.getSetting("dashboards_config")
      if (res?.success) {
        const normalized = normalizeBoards(res?.data)
        setBoards(normalized)
        setActiveBoardId((prev) => prev || normalized[0]?.id || "")
      } else {
        const fallback = [createDefaultBoard()]
        setBoards(fallback)
        setActiveBoardId(fallback[0].id)
      }
    } catch {
      const fallback = [createDefaultBoard()]
      setBoards(fallback)
      setActiveBoardId(fallback[0].id)
    } finally {
      setLoading(false)
    }
  }, [])

  const runListQuery = useCallback(
    async (list: StudentListConfig) => {
      if (!(window as any).api) return
      const sql = resolveSqlTemplate(list.sql)

      setRunningIds((prev) => ({ ...prev, [list.id]: true }))
      setErrorMap((prev) => ({ ...prev, [list.id]: "" }))

      try {
        const res = await (window as any).api.boardQuerySql({ sql, limit: 500 })
        if (res?.success) {
          setResultMap((prev) => ({ ...prev, [list.id]: Array.isArray(res.data) ? res.data : [] }))
        } else {
          setErrorMap((prev) => ({ ...prev, [list.id]: res?.message || t("board.runFailed") }))
          setResultMap((prev) => ({ ...prev, [list.id]: [] }))
        }
      } catch {
        setErrorMap((prev) => ({ ...prev, [list.id]: t("board.runFailed") }))
        setResultMap((prev) => ({ ...prev, [list.id]: [] }))
      } finally {
        setRunningIds((prev) => ({ ...prev, [list.id]: false }))
      }
    },
    [t]
  )

  const runAllInBoard = useCallback(
    async (board: BoardConfig | null) => {
      if (!board) return
      for (const list of board.lists) {
        await runListQuery(list)
      }
    },
    [runListQuery]
  )

  useEffect(() => {
    fetchBoards()
  }, [fetchBoards])

  useEffect(() => {
    if (!activeBoardId && boards.length > 0) {
      setActiveBoardId(boards[0].id)
    }
  }, [activeBoardId, boards])

  useEffect(() => {
    if (!activeBoard) return
    runAllInBoard(activeBoard).catch(() => void 0)
  }, [activeBoardId])

  useEffect(() => {
    const onDataUpdated = (e: Event) => {
      const detail = (e as CustomEvent<{ category?: string }>).detail
      if (!detail?.category || detail.category === "all") {
        runAllInBoard(activeBoard).catch(() => void 0)
      }
      if (detail.category === "students" || detail.category === "events" || detail.category === "reasons") {
        runAllInBoard(activeBoard).catch(() => void 0)
      }
    }

    window.addEventListener("ss:data-updated", onDataUpdated)
    return () => window.removeEventListener("ss:data-updated", onDataUpdated)
  }, [activeBoard, runAllInBoard])

  const mutateBoards = (updater: (prev: BoardConfig[]) => BoardConfig[]) => {
    setBoards((prev) => {
      const next = updater(prev)
      if (canManage) {
        saveBoards(next).catch(() => void 0)
      }
      return next
    })
  }

  const updateBoardName = (boardId: string, name: string) => {
    mutateBoards((prev) =>
      prev.map((board) => (board.id === boardId ? { ...board, name: name || t("board.untitledBoard") } : board))
    )
  }

  const addBoard = () => {
    if (!canManage) return
    const newBoard: BoardConfig = {
      id: makeId(),
      name: t("board.newBoard"),
      lists: [createDefaultList()],
    }

    mutateBoards((prev) => [...prev, newBoard])
    setActiveBoardId(newBoard.id)
  }

  const removeBoard = (boardId: string) => {
    if (!canManage) return
    mutateBoards((prev) => {
      if (prev.length <= 1) {
        messageApi.warning(t("board.keepAtLeastOneBoard"))
        return prev
      }
      const next = prev.filter((board) => board.id !== boardId)
      if (activeBoardId === boardId && next.length > 0) {
        setActiveBoardId(next[0].id)
      }
      return next
    })
  }

  const addList = (boardId: string) => {
    if (!canManage) return
    mutateBoards((prev) =>
      prev.map((board) =>
        board.id === boardId
          ? {
              ...board,
              lists: [
                ...board.lists,
                {
                  id: makeId(),
                  name: t("board.newList"),
                    sql: getDefaultSql(),
                  viewMode: "card",
                },
              ],
            }
          : board
      )
    )
  }

  const removeList = (boardId: string, listId: string) => {
    if (!canManage) return
    mutateBoards((prev) =>
      prev.map((board) => {
        if (board.id !== boardId) return board
        if (board.lists.length <= 1) {
          messageApi.warning(t("board.keepAtLeastOneList"))
          return board
        }
        return {
          ...board,
          lists: board.lists.filter((list) => list.id !== listId),
        }
      })
    )
  }

  const updateList = (boardId: string, listId: string, patch: Partial<StudentListConfig>) => {
    mutateBoards((prev) =>
      prev.map((board) =>
        board.id === boardId
          ? {
              ...board,
              lists: board.lists.map((list) =>
                list.id === listId
                  ? {
                      ...list,
                      ...patch,
                    }
                  : list
              ),
            }
          : board
      )
    )
  }

  const applyPreset = (boardId: string, listId: string, presetId: string) => {
    const preset = presets.find((item) => item.id === presetId)
    if (!preset) return

    updateList(boardId, listId, {
      name: preset.name,
      sql: preset.sql,
    })
  }

  return (
    <div style={{ padding: 24 }}>
      {contextHolder}
      <Space direction="vertical" size={16} style={{ width: "100%" }}>
        <Space style={{ width: "100%", justifyContent: "space-between" }}>
          <Space align="center">
            <Typography.Title level={2} style={{ margin: 0, color: "var(--ss-text-main)" }}>
              {t("board.title")}
            </Typography.Title>
            <Tag color={canManage ? "success" : "default"}>
              {canManage ? t("board.editable") : t("board.readonly")}
            </Tag>
          </Space>
          <Space>
            <Button icon={<ReloadOutlined />} loading={loading} onClick={fetchBoards}>
              {t("common.refresh")}
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={addBoard} disabled={!canManage}>
              {t("board.addBoard")}
            </Button>
          </Space>
        </Space>

        <Alert
          type="info"
          showIcon
          message={t("board.templateHint")}
          description={t("board.templateDescription")}
        />

        <Tabs
          type="card"
          activeKey={activeBoardId}
          onChange={setActiveBoardId}
          items={boards.map((board) => ({
            key: board.id,
            label: board.name,
          }))}
        />

        {activeBoard ? (
          <Space direction="vertical" size={16} style={{ width: "100%" }}>
            <Card
              title={t("board.boardConfig")}
              extra={
                <Space>
                  <Button onClick={() => runAllInBoard(activeBoard)} icon={<PlayCircleOutlined />}>
                    {t("board.runAll")}
                  </Button>
                  <Button onClick={() => addList(activeBoard.id)} icon={<PlusOutlined />} disabled={!canManage}>
                    {t("board.addList")}
                  </Button>
                  <Popconfirm
                    title={t("board.removeBoardConfirm")}
                    onConfirm={() => removeBoard(activeBoard.id)}
                    disabled={!canManage}
                  >
                    <Button danger icon={<DeleteOutlined />} disabled={!canManage}>
                      {t("board.removeBoard")}
                    </Button>
                  </Popconfirm>
                </Space>
              }
              style={{ backgroundColor: "var(--ss-card-bg)" }}
            >
              <Input
                value={activeBoard.name}
                onChange={(e) => updateBoardName(activeBoard.id, e.target.value.trim())}
                placeholder={t("board.boardNamePlaceholder")}
                disabled={!canManage}
              />
              {saving && (
                <Typography.Text type="secondary" style={{ display: "block", marginTop: 8 }}>
                  {t("board.saving")}
                </Typography.Text>
              )}
            </Card>

            {activeBoard.lists.map((list) => {
              const rows = resultMap[list.id] || []
              const studentCards = toStudentCards(rows)
              const useCardView = studentCards.length > 0
              const columns =
                rows.length > 0
                  ? Object.keys(rows[0]).map((key) => ({
                      title: key,
                      dataIndex: key,
                      key,
                      ellipsis: true,
                      render: (value: any) =>
                        value === null || value === undefined || value === "" ? "-" : String(value),
                    }))
                  : []

              return (
                <Card
                  key={list.id}
                  title={
                    <Input
                      value={list.name}
                      onChange={(e) => updateList(activeBoard.id, list.id, { name: e.target.value })}
                      placeholder={t("board.listNamePlaceholder")}
                      disabled={!canManage}
                    />
                  }
                  extra={
                    <Space>
                      <Select
                        style={{ width: 260 }}
                        placeholder={t("board.applyPreset")}
                        options={presets.map((preset) => ({
                          value: preset.id,
                          label: `${preset.name} · ${preset.description}`,
                        }))}
                        onChange={(presetId) => applyPreset(activeBoard.id, list.id, presetId)}
                        disabled={!canManage}
                      />
                      <Select
                        style={{ width: 140 }}
                        value={list.viewMode}
                        onChange={(viewMode: BoardStudentViewMode) =>
                          updateList(activeBoard.id, list.id, { viewMode })
                        }
                        options={[
                          { value: "list", label: t("board.viewModes.list") },
                          { value: "card", label: t("board.viewModes.card") },
                          { value: "grid", label: t("board.viewModes.grid") },
                        ]}
                        disabled={!canManage}
                      />
                      <Button
                        type="primary"
                        icon={<PlayCircleOutlined />}
                        loading={Boolean(runningIds[list.id])}
                        onClick={() => runListQuery(list)}
                      >
                        {t("board.run")}
                      </Button>
                      <Popconfirm
                        title={t("board.removeListConfirm")}
                        onConfirm={() => removeList(activeBoard.id, list.id)}
                        disabled={!canManage}
                      >
                        <Button
                          danger
                          icon={<DeleteOutlined />}
                          disabled={!canManage || activeBoard.lists.length <= 1}
                        >
                          {t("board.removeList")}
                        </Button>
                      </Popconfirm>
                    </Space>
                  }
                  style={{ backgroundColor: "var(--ss-card-bg)" }}
                >
                  <Input.TextArea
                    value={list.sql}
                    autoSize={{ minRows: 6, maxRows: 12 }}
                    onChange={(e) => updateList(activeBoard.id, list.id, { sql: e.target.value })}
                    disabled={!canManage}
                    spellCheck={false}
                    placeholder={t("board.sqlPlaceholder")}
                    style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" }}
                  />

                  {errorMap[list.id] && (
                    <Alert
                      style={{ marginTop: 12 }}
                      type="error"
                      message={errorMap[list.id]}
                      showIcon
                    />
                  )}

                  <div style={{ marginTop: 12 }}>
                    {useCardView ? (
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns:
                            list.viewMode === "grid"
                              ? "repeat(auto-fill, minmax(180px, 1fr))"
                              : list.viewMode === "list"
                                ? "1fr"
                                : "repeat(auto-fill, minmax(220px, 1fr))",
                          gap: 12,
                        }}
                      >
                        {studentCards.map((item, index) => {
                          const avatarColor = getAvatarColor(item.name)
                          const avatarText = getAvatarText(item.name)
                          const rankBadge = index === 0 ? "🥇" : index === 1 ? "🥈" : index === 2 ? "🥉" : null
                          return (
                            <Card
                              key={item.key}
                              style={{
                                backgroundColor: "var(--ss-card-bg)",
                                border: "1px solid var(--ss-border-color)",
                                boxShadow: "0 6px 16px rgba(0, 0, 0, 0.06)",
                                position: "relative",
                              }}
                              styles={{
                                body: {
                                  padding:
                                    list.viewMode === "grid" ? "12px" : list.viewMode === "list" ? "10px 12px" : "12px 14px",
                                },
                              }}
                            >
                              {rankBadge && (
                                <div
                                  style={{
                                    position: "absolute",
                                    top: "-10px",
                                    left: "-10px",
                                    fontSize: "24px",
                                  }}
                                >
                                  {rankBadge}
                                </div>
                              )}
                              <div
                                style={{
                                  display: "flex",
                                  alignItems: list.viewMode === "grid" ? "flex-start" : "center",
                                  flexDirection: list.viewMode === "grid" ? "column" : "row",
                                  gap: 10,
                                }}
                              >
                                <div
                                  style={{
                                    width: list.viewMode === "grid" ? 56 : 42,
                                    height: list.viewMode === "grid" ? 56 : 42,
                                    borderRadius: 12,
                                    backgroundColor: avatarColor,
                                    color: "#fff",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    fontWeight: 700,
                                    boxShadow: `0 4px 10px ${avatarColor}40`,
                                    flexShrink: 0,
                                  }}
                                >
                                  {avatarText}
                                </div>
                                <div style={{ minWidth: 0, flex: 1, width: "100%" }}>
                                  <div
                                    style={{
                                      fontSize: list.viewMode === "grid" ? 16 : 15,
                                      fontWeight: 600,
                                      color: "var(--ss-text-main)",
                                      overflow: "hidden",
                                      textOverflow: "ellipsis",
                                      whiteSpace: "nowrap",
                                      textAlign: list.viewMode === "grid" ? "center" : "left",
                                    }}
                                  >
                                    {item.name}
                                  </div>
                                  <div
                                    style={{
                                      marginTop: 4,
                                      display: "flex",
                                      flexWrap: "wrap",
                                      gap: 6,
                                      justifyContent: list.viewMode === "grid" ? "center" : "flex-start",
                                    }}
                                  >
                                    {item.score !== undefined && (
                                      <Tag color={item.score >= 0 ? "success" : "error"} style={{ margin: 0 }}>
                                        {t("board.metrics.totalScore")}: {item.score > 0 ? `+${item.score}` : item.score}
                                      </Tag>
                                    )}
                                    {item.rewardPoints !== undefined && (
                                      <Tag color="processing" style={{ margin: 0 }}>
                                        {t("board.metrics.rewardPoints")}: {item.rewardPoints}
                                      </Tag>
                                    )}
                                    {item.weekChange !== undefined && (
                                      <Tag color={item.weekChange >= 0 ? "success" : "error"} style={{ margin: 0 }}>
                                        {t("board.metrics.weekChange")}: {item.weekChange > 0 ? `+${item.weekChange}` : item.weekChange}
                                      </Tag>
                                    )}
                                    {item.weekDeducted !== undefined && (
                                      <Tag color="gold" style={{ margin: 0 }}>
                                        {t("board.metrics.weekDeducted")}: {item.weekDeducted}
                                      </Tag>
                                    )}
                                    {item.answeredCount !== undefined && (
                                      <Tag color="cyan" style={{ margin: 0 }}>
                                        {t("board.metrics.todayAnswered")}: {item.answeredCount}
                                      </Tag>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </Card>
                          )
                        })}
                      </div>
                    ) : (
                      <Table
                        rowKey={(_, index) => `${list.id}-${index}`}
                        dataSource={rows}
                        columns={columns}
                        loading={Boolean(runningIds[list.id])}
                        locale={{
                          emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("common.noData")} />,
                        }}
                        scroll={{ x: true }}
                        pagination={{ pageSize: 20, showSizeChanger: false }}
                        size="small"
                      />
                    )}
                  </div>
                </Card>
              )
            })}
          </Space>
        ) : (
          <Card>
            <Empty description={t("common.noData")} />
          </Card>
        )}
      </Space>
    </div>
  )
}
