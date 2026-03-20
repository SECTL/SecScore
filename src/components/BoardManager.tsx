import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  Alert,
  Button,
  Card,
  Empty,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Table,
  Tabs,
  Tag,
  Typography,
  message,
} from "antd"
import { DeleteOutlined, EditOutlined, PlusOutlined, ReloadOutlined } from "@ant-design/icons"
import { useTranslation } from "react-i18next"

type BoardStudentViewMode = "list" | "card" | "grid"
type SplitDirection = "horizontal" | "vertical"

interface StudentListConfig {
  id: string
  name: string
  sql: string
  viewMode: BoardStudentViewMode
}

interface LayoutLeafNode {
  id: string
  type: "leaf"
  listId: string
}

interface LayoutSplitNode {
  id: string
  type: "split"
  direction: SplitDirection
  ratio: number
  first: LayoutNode
  second: LayoutNode
}

type LayoutNode = LayoutLeafNode | LayoutSplitNode

interface BoardConfig {
  id: string
  name: string
  lists: StudentListConfig[]
  layout: LayoutNode
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

interface BoardStudentCardData {
  key: string
  name: string
  score?: number
  rewardPoints?: number
  weekChange?: number
  weekDeducted?: number
  answeredCount?: number
}

interface DragState {
  boardId: string
  splitNodeId: string
  direction: SplitDirection
  startRatio: number
  startX: number
  startY: number
  containerSize: number
}

const getFirstLeafId = (node: LayoutNode): string => {
  if (node.type === "leaf") return node.id
  return getFirstLeafId(node.first)
}

const makeId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

const clampRatio = (value: number) => Math.max(0.15, Math.min(0.85, value))

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

const createLeafForList = (listId: string): LayoutLeafNode => ({
  id: makeId(),
  type: "leaf",
  listId,
})

const createDefaultBoard = (): BoardConfig => {
  const list = createDefaultList()
  return {
    id: makeId(),
    name: "默认看板",
    lists: [list],
    layout: createLeafForList(list.id),
  }
}

const collectLeafListIds = (node: LayoutNode, acc: string[] = []): string[] => {
  if (node.type === "leaf") {
    acc.push(node.listId)
    return acc
  }
  collectLeafListIds(node.first, acc)
  collectLeafListIds(node.second, acc)
  return acc
}

const pruneLayout = (node: LayoutNode, validListIds: Set<string>): LayoutNode | null => {
  if (node.type === "leaf") {
    return validListIds.has(node.listId) ? node : null
  }

  const first = pruneLayout(node.first, validListIds)
  const second = pruneLayout(node.second, validListIds)

  if (!first && !second) return null
  if (!first) return second
  if (!second) return first

  return { ...node, first, second }
}

const appendLeafToLayout = (layout: LayoutNode, listId: string): LayoutNode => {
  return {
    id: makeId(),
    type: "split",
    direction: "horizontal",
    ratio: 0.5,
    first: layout,
    second: createLeafForList(listId),
  }
}

const syncBoardLayout = (board: BoardConfig): BoardConfig => {
  const validListIds = new Set(board.lists.map((item) => item.id))
  const pruned = pruneLayout(board.layout, validListIds)

  let layout = pruned
  const used = new Set(layout ? collectLeafListIds(layout) : [])
  const missing = board.lists.map((item) => item.id).filter((id) => !used.has(id))

  if (!layout) {
    const firstMissing = missing.shift() || board.lists[0]?.id
    if (!firstMissing) {
      const fallbackList = createDefaultList()
      return {
        ...board,
        lists: [fallbackList],
        layout: createLeafForList(fallbackList.id),
      }
    }
    layout = createLeafForList(firstMissing)
  }

  for (const listId of missing) {
    layout = appendLeafToLayout(layout, listId)
  }

  return { ...board, layout }
}

const normalizeBoards = (input: unknown): BoardConfig[] => {
  if (!Array.isArray(input)) return [createDefaultBoard()]

  const boards = input
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

      const normalizedLists = lists.length > 0 ? lists : [createDefaultList()]
      const fallbackLayout = createLeafForList(normalizedLists[0].id)
      const layout = board?.layout && typeof board.layout === "object" ? (board.layout as LayoutNode) : fallbackLayout

      return syncBoardLayout({
        id: typeof board?.id === "string" && board.id.trim() ? board.id : makeId(),
        name: typeof board?.name === "string" && board.name.trim() ? board.name.trim() : "未命名看板",
        lists: normalizedLists,
        layout,
      })
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

const replaceLayoutNode = (node: LayoutNode, targetId: string, replacement: LayoutNode): LayoutNode => {
  if (node.id === targetId) return replacement
  if (node.type === "leaf") return node
  return {
    ...node,
    first: replaceLayoutNode(node.first, targetId, replacement),
    second: replaceLayoutNode(node.second, targetId, replacement),
  }
}

const updateSplitRatio = (node: LayoutNode, splitNodeId: string, ratio: number): LayoutNode => {
  if (node.type === "leaf") return node
  if (node.id === splitNodeId) return { ...node, ratio: clampRatio(ratio) }
  return {
    ...node,
    first: updateSplitRatio(node.first, splitNodeId, ratio),
    second: updateSplitRatio(node.second, splitNodeId, ratio),
  }
}

const removeListFromBoard = (board: BoardConfig, listId: string): BoardConfig => {
  const nextLists = board.lists.filter((item) => item.id !== listId)
  if (nextLists.length <= 0) return board
  return syncBoardLayout({ ...board, lists: nextLists })
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
  const [dragState, setDragState] = useState<DragState | null>(null)
  const [editingListId, setEditingListId] = useState<string | null>(null)
  const [selectedLeafNodeId, setSelectedLeafNodeId] = useState<string | null>(null)
  const [renameVisible, setRenameVisible] = useState(false)
  const [renameValue, setRenameValue] = useState("")

  const panelRefs = useRef<Record<string, HTMLDivElement | null>>({})

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

  const editingList = useMemo(() => {
    if (!activeBoard || !editingListId) return null
    return activeBoard.lists.find((item) => item.id === editingListId) || null
  }, [activeBoard, editingListId])

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

  const mutateBoards = useCallback(
    (updater: (prev: BoardConfig[]) => BoardConfig[]) => {
      setBoards((prev) => {
        const next = updater(prev).map(syncBoardLayout)
        if (canManage) {
          saveBoards(next).catch(() => void 0)
        }
        return next
      })
    },
    [canManage, saveBoards]
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

  const listConfigSignature = useMemo(() => {
    if (!activeBoard) return ""
    return JSON.stringify(
      activeBoard.lists.map((item) => ({
        id: item.id,
        name: item.name,
        sql: item.sql,
        viewMode: item.viewMode,
      }))
    )
  }, [activeBoard])

  useEffect(() => {
    fetchBoards()
  }, [fetchBoards])

  useEffect(() => {
    if (!activeBoardId && boards.length > 0) setActiveBoardId(boards[0].id)
  }, [activeBoardId, boards])

  useEffect(() => {
    if (!activeBoard) {
      setSelectedLeafNodeId(null)
      return
    }
    const firstLeafId = getFirstLeafId(activeBoard.layout)
    setSelectedLeafNodeId((prev) => prev || firstLeafId)
  }, [activeBoard?.id, activeBoard?.layout])

  useEffect(() => {
    if (!activeBoard) return
    const timer = window.setTimeout(() => {
      runAllInBoard(activeBoard).catch(() => void 0)
    }, 260)
    return () => window.clearTimeout(timer)
  }, [activeBoard?.id, listConfigSignature, runAllInBoard])

  useEffect(() => {
    const onDataUpdated = (e: Event) => {
      const detail = (e as CustomEvent<{ category?: string }>).detail
      if (!detail?.category || detail.category === "all") runAllInBoard(activeBoard).catch(() => void 0)
      if (detail.category === "students" || detail.category === "events" || detail.category === "reasons") {
        runAllInBoard(activeBoard).catch(() => void 0)
      }
    }

    window.addEventListener("ss:data-updated", onDataUpdated)
    return () => window.removeEventListener("ss:data-updated", onDataUpdated)
  }, [activeBoard, runAllInBoard])

  useEffect(() => {
    if (!dragState) return

    const onMove = (event: MouseEvent) => {
      const delta =
        dragState.direction === "horizontal"
          ? event.clientX - dragState.startX
          : event.clientY - dragState.startY
      const ratio = clampRatio(dragState.startRatio + delta / dragState.containerSize)

      mutateBoards((prev) =>
        prev.map((board) =>
          board.id === dragState.boardId
            ? {
                ...board,
                layout: updateSplitRatio(board.layout, dragState.splitNodeId, ratio),
              }
            : board
        )
      )
    }

    const onUp = () => setDragState(null)

    window.addEventListener("mousemove", onMove)
    window.addEventListener("mouseup", onUp)
    return () => {
      window.removeEventListener("mousemove", onMove)
      window.removeEventListener("mouseup", onUp)
    }
  }, [dragState, mutateBoards])

  const updateBoardName = (boardId: string, name: string) => {
    mutateBoards((prev) =>
      prev.map((board) => (board.id === boardId ? { ...board, name: name || t("board.untitledBoard") } : board))
    )
  }

  const openRenameModal = () => {
    if (!activeBoard) return
    setRenameValue(activeBoard.name)
    setRenameVisible(true)
  }

  const submitRenameBoard = () => {
    if (!activeBoard) return
    updateBoardName(activeBoard.id, renameValue.trim() || t("board.untitledBoard"))
    setRenameVisible(false)
  }

  const addBoard = () => {
    if (!canManage) return
    const newBoard = createDefaultBoard()
    newBoard.name = t("board.newBoard")
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
      if (activeBoardId === boardId && next.length > 0) setActiveBoardId(next[0].id)
      return next
    })
  }

  const addListBySplit = (boardId: string, leafNodeId: string, direction: SplitDirection) => {
    if (!canManage) return

    mutateBoards((prev) =>
      prev.map((board) => {
        if (board.id !== boardId) return board

        const newList: StudentListConfig = {
          id: makeId(),
          name: t("board.newList"),
          sql: getDefaultSql(),
          viewMode: "card",
        }

        const findLeaf = (node: LayoutNode): LayoutLeafNode | null => {
          if (node.type === "leaf") return node.id === leafNodeId ? node : null
          return findLeaf(node.first) || findLeaf(node.second)
        }

        const targetLeaf = findLeaf(board.layout)
        if (!targetLeaf) return board

        const replacement: LayoutSplitNode = {
          id: makeId(),
          type: "split",
          direction,
          ratio: 0.5,
          first: targetLeaf,
          second: createLeafForList(newList.id),
        }

        return syncBoardLayout({
          ...board,
          lists: [...board.lists, newList],
          layout: replaceLayoutNode(board.layout, leafNodeId, replacement),
        })
      })
    )
  }

  const splitSelectedLeaf = (direction: SplitDirection) => {
    if (!activeBoard || !selectedLeafNodeId) return
    addListBySplit(activeBoard.id, selectedLeafNodeId, direction)
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
        return removeListFromBoard(board, listId)
      })
    )
  }

  const updateList = (boardId: string, listId: string, patch: Partial<StudentListConfig>) => {
    mutateBoards((prev) =>
      prev.map((board) =>
        board.id === boardId
          ? {
              ...board,
              lists: board.lists.map((list) => (list.id === listId ? { ...list, ...patch } : list)),
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

  const renderStudentView = (list: StudentListConfig) => {
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
            render: (value: any) => (value === null || value === undefined || value === "" ? "-" : String(value)),
          }))
        : []

    if (!useCardView) {
      return (
        <Table
          rowKey={(_, index) => `${list.id}-${index}`}
          dataSource={rows}
          columns={columns}
          loading={Boolean(runningIds[list.id])}
          locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("common.noData")} /> }}
          scroll={{ x: true }}
          pagination={{ pageSize: 20, showSizeChanger: false }}
          size="small"
        />
      )
    }

    return (
      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            list.viewMode === "grid"
              ? "repeat(auto-fill, minmax(102px, 1fr))"
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
          const primaryMetric =
            item.score !== undefined
              ? { label: t("board.metrics.totalScore"), value: item.score }
              : item.rewardPoints !== undefined
                ? { label: t("board.metrics.rewardPoints"), value: item.rewardPoints }
                : item.weekChange !== undefined
                  ? { label: t("board.metrics.weekChange"), value: item.weekChange }
                  : item.weekDeducted !== undefined
                    ? { label: t("board.metrics.weekDeducted"), value: item.weekDeducted }
                    : item.answeredCount !== undefined
                      ? { label: t("board.metrics.todayAnswered"), value: item.answeredCount }
                      : null

          return (
            <div key={item.key} style={{ ...(list.viewMode === "grid" ? { aspectRatio: "1 / 1" } : null) }}>
              <Card
                style={{
                  width: "100%",
                  height: "100%",
                  backgroundColor: "var(--ss-card-bg)",
                  border: "1px solid var(--ss-border-color)",
                  boxShadow: "0 6px 16px rgba(0, 0, 0, 0.06)",
                  position: "relative",
                }}
                styles={{
                  body: {
                    padding: list.viewMode === "grid" ? "8px" : list.viewMode === "list" ? "10px 12px" : "12px 14px",
                    height: list.viewMode === "grid" ? "100%" : undefined,
                  },
                }}
              >
                {rankBadge && (
                  <div style={{ position: "absolute", top: "-10px", left: "-10px", fontSize: "24px" }}>{rankBadge}</div>
                )}

                {list.viewMode === "grid" ? (
                  <div
                    style={{
                      height: "100%",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 8,
                      textAlign: "center",
                    }}
                  >
                    <div
                      style={{
                        width: 42,
                        height: 42,
                        borderRadius: 12,
                        backgroundColor: avatarColor,
                        color: "#fff",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontWeight: 700,
                        fontSize: avatarText.length > 1 ? "14px" : "18px",
                        boxShadow: `0 4px 10px ${avatarColor}40`,
                      }}
                    >
                      {avatarText}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, width: "100%" }}>
                      <div
                        style={{
                          fontWeight: 600,
                          fontSize: 13,
                          color: "var(--ss-text-main)",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {item.name}
                      </div>
                      {primaryMetric && (
                        <Tag
                          color={typeof primaryMetric.value === "number" && primaryMetric.value >= 0 ? "success" : "error"}
                          style={{ fontWeight: "bold", marginInlineEnd: 0 }}
                        >
                          {primaryMetric.label}:{primaryMetric.value > 0 ? `+${primaryMetric.value}` : primaryMetric.value}
                        </Tag>
                      )}
                    </div>
                  </div>
                ) : (
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div
                      style={{
                        width: 42,
                        height: 42,
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
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div
                        style={{
                          fontSize: 15,
                          fontWeight: 600,
                          color: "var(--ss-text-main)",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {item.name}
                      </div>
                      <div style={{ marginTop: 4, display: "flex", flexWrap: "wrap", gap: 6 }}>
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
                )}
              </Card>
            </div>
          )
        })}
      </div>
    )
  }

  const renderLeafPanel = (board: BoardConfig, leaf: LayoutLeafNode): React.JSX.Element => {
    const list = board.lists.find((item) => item.id === leaf.listId)
    if (!list) return <Empty description={t("common.noData")} />
    const isSelected = selectedLeafNodeId === leaf.id

    return (
      <Card
        onClick={() => setSelectedLeafNodeId(leaf.id)}
        style={{
          height: "100%",
          backgroundColor: "var(--ss-card-bg)",
          border: isSelected ? "1px solid var(--ant-color-primary, #1677ff)" : "1px solid var(--ss-border-color)",
          boxShadow: isSelected ? "0 8px 18px rgba(22, 119, 255, 0.14)" : undefined,
          cursor: "pointer",
        }}
        styles={{ body: { height: "100%", display: "flex", flexDirection: "column", padding: 12 } }}
        title={<span style={{ fontWeight: 600 }}>{list.name}</span>}
        extra={
          <Space size={6}>
            <Button size="small" onClick={() => setEditingListId(list.id)} icon={<EditOutlined />}>
              {t("board.editList")}
            </Button>
            <Popconfirm
              title={t("board.removeListConfirm")}
              onConfirm={() => removeList(board.id, list.id)}
              disabled={!canManage || board.lists.length <= 1}
            >
              <Button size="small" danger icon={<DeleteOutlined />} disabled={!canManage || board.lists.length <= 1}>
                {t("board.removeList")}
              </Button>
            </Popconfirm>
          </Space>
        }
      >
        {errorMap[list.id] && <Alert style={{ marginBottom: 12 }} type="error" message={errorMap[list.id]} showIcon />}
        <div style={{ flex: 1, overflow: "hidden" }}>{renderStudentView(list)}</div>
      </Card>
    )
  }

  const renderLayoutNode = (board: BoardConfig, node: LayoutNode): React.JSX.Element => {
    if (node.type === "leaf") {
      return (
        <div style={{ width: "100%", height: "100%", minHeight: 120 }}>
          {renderLeafPanel(board, node)}
        </div>
      )
    }

    const isHorizontal = node.direction === "horizontal"
    const handleSize = 8

    return (
      <div
        ref={(el) => {
          panelRefs.current[node.id] = el
        }}
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: isHorizontal ? "row" : "column",
          minHeight: 200,
        }}
      >
        <div style={{ flex: `${node.ratio} 1 0`, minWidth: 0, minHeight: 0 }}>{renderLayoutNode(board, node.first)}</div>
        <div
          onMouseDown={(event) => {
            if (!canManage) return
            const container = panelRefs.current[node.id]
            if (!container) return
            const rect = container.getBoundingClientRect()
            const containerSize = isHorizontal ? rect.width : rect.height
            if (containerSize <= 0) return

            setDragState({
              boardId: board.id,
              splitNodeId: node.id,
              direction: node.direction,
              startRatio: node.ratio,
              startX: event.clientX,
              startY: event.clientY,
              containerSize,
            })
          }}
          style={{
            flex: `0 0 ${handleSize}px`,
            cursor: canManage ? (isHorizontal ? "col-resize" : "row-resize") : "default",
            background: "var(--ss-border-color)",
            borderRadius: 4,
            opacity: canManage ? 0.85 : 0.5,
            margin: isHorizontal ? "0 4px" : "4px 0",
          }}
          title={t("board.dragHandle")}
        />
        <div style={{ flex: `${1 - node.ratio} 1 0`, minWidth: 0, minHeight: 0 }}>
          {renderLayoutNode(board, node.second)}
        </div>
      </div>
    )
  }

  const renderBoardWorkspace = () => {
    if (!activeBoard) return <Empty description={t("common.noData")} />

    return (
      <div style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
        {renderLayoutNode(activeBoard, activeBoard.layout)}
      </div>
    )
  }

  return (
    <div
      style={{
        padding: 24,
        height: "100%",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        boxSizing: "border-box",
      }}
    >
      {contextHolder}
      <div style={{ display: "flex", flexDirection: "column", gap: 16, width: "100%", minHeight: 0, flex: 1 }}>
        <div style={{ display: "flex", width: "100%", justifyContent: "space-between", alignItems: "center" }}>
          <Space align="center" size={8}>
            <Typography.Title level={2} style={{ margin: 0, color: "var(--ss-text-main)" }}>
              {t("board.title")}
            </Typography.Title>
            <Tag color={canManage ? "success" : "default"}>{canManage ? t("board.editable") : t("board.readonly")}</Tag>
          </Space>
          <Space>
            <Button
              icon={<PlusOutlined />}
              onClick={() => splitSelectedLeaf("horizontal")}
              disabled={!canManage || !activeBoard || !selectedLeafNodeId}
            >
              {t("board.splitHorizontal")}
            </Button>
            <Button
              icon={<PlusOutlined />}
              onClick={() => splitSelectedLeaf("vertical")}
              disabled={!canManage || !activeBoard || !selectedLeafNodeId}
            >
              {t("board.splitVertical")}
            </Button>
            <Button icon={<EditOutlined />} onClick={openRenameModal} disabled={!canManage || !activeBoard}>
              {t("board.renameBoard")}
            </Button>
            <Popconfirm
              title={t("board.removeBoardConfirm")}
              onConfirm={() => activeBoard && removeBoard(activeBoard.id)}
              disabled={!canManage || !activeBoard}
            >
              <Button danger icon={<DeleteOutlined />} disabled={!canManage || !activeBoard}>
                {t("board.removeBoard")}
              </Button>
            </Popconfirm>
            <Button icon={<ReloadOutlined />} loading={loading} onClick={fetchBoards}>
              {t("common.refresh")}
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={addBoard} disabled={!canManage}>
              {t("board.addBoard")}
            </Button>
          </Space>
        </div>

        <Tabs
          type="card"
          activeKey={activeBoardId}
          onChange={setActiveBoardId}
          items={boards.map((board) => ({ key: board.id, label: board.name }))}
          style={{ marginBottom: 0 }}
        />

        {activeBoard ? (
          <div style={{ width: "100%", minHeight: 0, flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
            {saving && (
              <Typography.Text type="secondary" style={{ flexShrink: 0 }}>
                {t("board.saving")}
              </Typography.Text>
            )}
            {renderBoardWorkspace()}
          </div>
        ) : (
          <Card style={{ flex: 1 }}>
            <Empty description={t("common.noData")} />
          </Card>
        )}
      </div>

      <Modal
        title={t("board.renameBoard")}
        open={renameVisible}
        onCancel={() => setRenameVisible(false)}
        onOk={submitRenameBoard}
        okText={t("common.confirm")}
        cancelText={t("common.cancel")}
      >
        <Input value={renameValue} onChange={(e) => setRenameValue(e.target.value)} placeholder={t("board.boardNamePlaceholder")} />
      </Modal>

      <Modal
        title={t("board.sqlEditorTitle")}
        open={Boolean(editingList)}
        onCancel={() => setEditingListId(null)}
        onOk={() => setEditingListId(null)}
        okText={t("common.confirm")}
        cancelText={t("common.cancel")}
        width={860}
      >
        {editingList && activeBoard && (
          <Space direction="vertical" style={{ width: "100%" }} size={12}>
            <Input
              value={editingList.name}
              onChange={(e) => updateList(activeBoard.id, editingList.id, { name: e.target.value })}
              placeholder={t("board.listNamePlaceholder")}
              disabled={!canManage}
            />
            <Space>
              <Select
                style={{ width: 260 }}
                placeholder={t("board.applyPreset")}
                options={presets.map((preset) => ({ value: preset.id, label: `${preset.name} · ${preset.description}` }))}
                onChange={(presetId) => applyPreset(activeBoard.id, editingList.id, presetId)}
                disabled={!canManage}
              />
              <Select
                style={{ width: 160 }}
                value={editingList.viewMode}
                onChange={(viewMode: BoardStudentViewMode) => updateList(activeBoard.id, editingList.id, { viewMode })}
                options={[
                  { value: "list", label: t("board.viewModes.list") },
                  { value: "card", label: t("board.viewModes.card") },
                  { value: "grid", label: t("board.viewModes.grid") },
                ]}
                disabled={!canManage}
              />
            </Space>
            <Input.TextArea
              value={editingList.sql}
              autoSize={{ minRows: 10, maxRows: 18 }}
              onChange={(e) => updateList(activeBoard.id, editingList.id, { sql: e.target.value })}
              disabled={!canManage}
              spellCheck={false}
              placeholder={t("board.sqlPlaceholder")}
              style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" }}
            />
          </Space>
        )}
      </Modal>
    </div>
  )
}
