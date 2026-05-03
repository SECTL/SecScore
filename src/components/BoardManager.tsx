import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  Alert,
  Button,
  Card,
  DatePicker,
  Empty,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Select,
  Space,
  Switch,
  Table,
  Tabs,
  Tag,
  Typography,
  message,
} from "antd"
import { DeleteOutlined, EditOutlined, PlusOutlined, ReloadOutlined } from "@ant-design/icons"
import dayjs from "dayjs"
import { useTranslation } from "react-i18next"

type BoardStudentViewMode = "list" | "card" | "grid" | "largeAvatar"
type BoardScoreDisplayMode = "total" | "split"
type SplitDirection = "horizontal" | "vertical"
type BoardTimeRange = "last7d" | "last30d" | "thisWeek" | "lastWeek" | "thisMonth" | "lastMonth" | "custom"
type BoardReasonMode = "all" | "selected" | "keyword"
type BoardScoreDirection = "all" | "add" | "deduct"
type BoardMetric = "addScore" | "deductScore" | "netChange" | "addCount" | "eventCount"
type BoardSortDirection = "desc" | "asc"

interface BoardQueryRuleConfig {
  timeRange: BoardTimeRange
  customStart: string | null
  customEnd: string | null
  reasonMode: BoardReasonMode
  reasonValues: string[]
  scoreDirection: BoardScoreDirection
  metric: BoardMetric
  sortDirection: BoardSortDirection
  topN: number
  comparePreviousPeriod: boolean
  minMetric: number | null
  maxMetric: number | null
  minAddScore: number | null
  maxDeductScore: number | null
  minEventCount: number | null
  warnThreshold: number | null
  dangerThreshold: number | null
  studentNameKeyword: string
}

interface StudentListConfig {
  id: string
  name: string
  rule: BoardQueryRuleConfig
  viewMode: BoardStudentViewMode
  scoreDisplayMode: BoardScoreDisplayMode
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
  rulePatch: Partial<BoardQueryRuleConfig>
}

interface BoardManagerProps {
  canManage: boolean
}

interface BoardStudentCardData {
  key: string
  name: string
  avatarUrl?: string
  score?: number
  addScore?: number
  deductScore?: number
  hasAddScoreField?: boolean
  hasDeductScoreField?: boolean
  rewardPoints?: number
  weekChange?: number
  weekDeducted?: number
  answeredCount?: number
  metricValue?: number
  prevMetricValue?: number
  metricDelta?: number
  rankChange?: number
  highlightLevel?: number
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

const clampTopN = (value: unknown): number => {
  const num = typeof value === "number" ? value : Number(value)
  if (!Number.isFinite(num)) return 20
  return Math.max(1, Math.min(500, Math.floor(num)))
}

const createDefaultRule = (): BoardQueryRuleConfig => ({
  timeRange: "last7d",
  customStart: null,
  customEnd: null,
  reasonMode: "all",
  reasonValues: [],
  scoreDirection: "all",
  metric: "addScore",
  sortDirection: "desc",
  topN: 20,
  comparePreviousPeriod: true,
  minMetric: null,
  maxMetric: null,
  minAddScore: null,
  maxDeductScore: null,
  minEventCount: null,
  warnThreshold: null,
  dangerThreshold: null,
  studentNameKeyword: "",
})

const parseNullableNumber = (value: unknown): number | null => {
  if (typeof value === "number") return Number.isFinite(value) ? value : null
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

const normalizeRule = (input: unknown): BoardQueryRuleConfig => {
  const fallback = createDefaultRule()
  const raw = typeof input === "object" && input ? (input as Record<string, unknown>) : {}
  const reasonValues = Array.isArray(raw.reasonValues)
    ? raw.reasonValues
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .filter(Boolean)
    : []

  const allowedTimeRange = new Set<BoardTimeRange>([
    "last7d",
    "last30d",
    "thisWeek",
    "lastWeek",
    "thisMonth",
    "lastMonth",
    "custom",
  ])
  const allowedReasonMode = new Set<BoardReasonMode>(["all", "selected", "keyword"])
  const allowedScoreDirection = new Set<BoardScoreDirection>(["all", "add", "deduct"])
  const allowedMetric = new Set<BoardMetric>([
    "addScore",
    "deductScore",
    "netChange",
    "addCount",
    "eventCount",
  ])
  const allowedSortDirection = new Set<BoardSortDirection>(["desc", "asc"])

  return {
    timeRange: allowedTimeRange.has(raw.timeRange as BoardTimeRange)
      ? (raw.timeRange as BoardTimeRange)
      : fallback.timeRange,
    customStart:
      typeof raw.customStart === "string" && raw.customStart.trim() ? raw.customStart : null,
    customEnd: typeof raw.customEnd === "string" && raw.customEnd.trim() ? raw.customEnd : null,
    reasonMode: allowedReasonMode.has(raw.reasonMode as BoardReasonMode)
      ? (raw.reasonMode as BoardReasonMode)
      : fallback.reasonMode,
    reasonValues,
    scoreDirection: allowedScoreDirection.has(raw.scoreDirection as BoardScoreDirection)
      ? (raw.scoreDirection as BoardScoreDirection)
      : fallback.scoreDirection,
    metric: allowedMetric.has(raw.metric as BoardMetric) ? (raw.metric as BoardMetric) : fallback.metric,
    sortDirection: allowedSortDirection.has(raw.sortDirection as BoardSortDirection)
      ? (raw.sortDirection as BoardSortDirection)
      : fallback.sortDirection,
    topN: clampTopN(raw.topN),
    comparePreviousPeriod:
      typeof raw.comparePreviousPeriod === "boolean"
        ? raw.comparePreviousPeriod
        : fallback.comparePreviousPeriod,
    minMetric: parseNullableNumber(raw.minMetric),
    maxMetric: parseNullableNumber(raw.maxMetric),
    minAddScore: parseNullableNumber(raw.minAddScore),
    maxDeductScore: parseNullableNumber(raw.maxDeductScore),
    minEventCount: parseNullableNumber(raw.minEventCount),
    warnThreshold: parseNullableNumber(raw.warnThreshold),
    dangerThreshold: parseNullableNumber(raw.dangerThreshold),
    studentNameKeyword:
      typeof raw.studentNameKeyword === "string" ? raw.studentNameKeyword.trim() : "",
  }
}

const escapeSqlLiteral = (value: string) => value.replace(/'/g, "''")

const getTimeRangeBoundary = (rule: BoardQueryRuleConfig): { startAt?: string; endAt?: string } => {
  const now = new Date()
  const startOfDay = (date: Date) => {
    const next = new Date(date)
    next.setHours(0, 0, 0, 0)
    return next
  }
  const addDays = (date: Date, days: number) => {
    const next = new Date(date)
    next.setDate(next.getDate() + days)
    return next
  }
  const startOfMonth = (date: Date) => {
    const next = new Date(date.getFullYear(), date.getMonth(), 1)
    next.setHours(0, 0, 0, 0)
    return next
  }

  if (rule.timeRange === "last7d") {
    return { startAt: addDays(now, -7).toISOString(), endAt: now.toISOString() }
  }
  if (rule.timeRange === "last30d") {
    return { startAt: addDays(now, -30).toISOString(), endAt: now.toISOString() }
  }
  if (rule.timeRange === "thisWeek") {
    const today = startOfDay(now)
    const mondayOffset = (today.getDay() + 6) % 7
    return { startAt: addDays(today, -mondayOffset).toISOString(), endAt: now.toISOString() }
  }
  if (rule.timeRange === "lastWeek") {
    const today = startOfDay(now)
    const mondayOffset = (today.getDay() + 6) % 7
    const thisWeekStart = addDays(today, -mondayOffset)
    return {
      startAt: addDays(thisWeekStart, -7).toISOString(),
      endAt: thisWeekStart.toISOString(),
    }
  }
  if (rule.timeRange === "thisMonth") {
    return { startAt: startOfMonth(now).toISOString(), endAt: now.toISOString() }
  }
  if (rule.timeRange === "lastMonth") {
    const thisMonthStart = startOfMonth(now)
    return {
      startAt: startOfMonth(new Date(now.getFullYear(), now.getMonth() - 1, 1)).toISOString(),
      endAt: thisMonthStart.toISOString(),
    }
  }
  if (rule.timeRange === "custom") {
    if (!rule.customStart || !rule.customEnd) return {}
    const start = new Date(rule.customStart)
    const end = new Date(rule.customEnd)
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return {}
    const startDay = startOfDay(start)
    const endExclusive = addDays(startOfDay(end), 1)
    return {
      startAt: startDay.toISOString(),
      endAt: endExclusive.toISOString(),
    }
  }
  return {}
}

const getMetricExpression = (metric: BoardMetric): string => {
  if (metric === "deductScore") return "CASE WHEN e.delta < 0 THEN -e.delta ELSE 0 END"
  if (metric === "netChange") return "e.delta"
  if (metric === "addCount") return "CASE WHEN e.delta > 0 THEN 1 ELSE 0 END"
  if (metric === "eventCount") return "1"
  return "CASE WHEN e.delta > 0 THEN e.delta ELSE 0 END"
}

const buildSqlFromRule = (ruleInput: BoardQueryRuleConfig): string | null => {
  const rule = normalizeRule(ruleInput)
  const baseWhereClauses: string[] = []
  const timeRange = getTimeRangeBoundary(rule)
  if (rule.timeRange === "custom" && (!timeRange.startAt || !timeRange.endAt)) {
    return null
  }

  const currentStart = timeRange.startAt
  const currentEnd = timeRange.endAt
  if (!currentStart || !currentEnd) return null

  const currentStartMs = new Date(currentStart).getTime()
  const currentEndMs = new Date(currentEnd).getTime()
  if (!Number.isFinite(currentStartMs) || !Number.isFinite(currentEndMs) || currentEndMs <= currentStartMs) {
    return null
  }

  const durationMs = currentEndMs - currentStartMs
  const prevStart = new Date(currentStartMs - durationMs).toISOString()
  const prevEnd = new Date(currentStartMs).toISOString()

  const queryStart = rule.comparePreviousPeriod ? prevStart : currentStart
  const queryEnd = currentEnd

  if (rule.scoreDirection === "add") {
    baseWhereClauses.push("e.delta > 0")
  } else if (rule.scoreDirection === "deduct") {
    baseWhereClauses.push("e.delta < 0")
  }
  if (rule.reasonMode === "selected" && rule.reasonValues.length > 0) {
    const list = rule.reasonValues.map((item) => `'${escapeSqlLiteral(item)}'`).join(", ")
    baseWhereClauses.push(`e.reason_content IN (${list})`)
  } else if (rule.reasonMode === "keyword" && rule.reasonValues.length > 0) {
    const keywordClauses = rule.reasonValues
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => `e.reason_content LIKE '%${escapeSqlLiteral(item)}%'`)
    if (keywordClauses.length > 0) {
      baseWhereClauses.push(`(${keywordClauses.join(" OR ")})`)
    }
  }
  if (rule.studentNameKeyword.trim()) {
    baseWhereClauses.push(
      `e.student_name LIKE '%${escapeSqlLiteral(rule.studentNameKeyword.trim())}%'`
    )
  }

  const baseWhereSql =
    baseWhereClauses.length > 0 ? `AND ${baseWhereClauses.join(" AND ")}` : ""
  const metricExpression = getMetricExpression(rule.metric)
  const topN = clampTopN(rule.topN)
  const filterClauses: string[] = []
  if (typeof rule.minMetric === "number") filterClauses.push(`metric_value >= ${rule.minMetric}`)
  if (typeof rule.maxMetric === "number") filterClauses.push(`metric_value <= ${rule.maxMetric}`)
  if (typeof rule.minAddScore === "number") filterClauses.push(`add_score >= ${rule.minAddScore}`)
  if (typeof rule.maxDeductScore === "number")
    filterClauses.push(`deduct_score <= ${rule.maxDeductScore}`)
  if (typeof rule.minEventCount === "number")
    filterClauses.push(`event_count >= ${Math.max(0, Math.floor(rule.minEventCount))}`)

  const warnThreshold = typeof rule.warnThreshold === "number" ? rule.warnThreshold : null
  const dangerThreshold = typeof rule.dangerThreshold === "number" ? rule.dangerThreshold : null
  const highlightLevelSql =
    dangerThreshold !== null
      ? warnThreshold !== null
        ? `CASE WHEN metric_value >= ${dangerThreshold} THEN 2 WHEN metric_value >= ${warnThreshold} THEN 1 ELSE 0 END`
        : `CASE WHEN metric_value >= ${dangerThreshold} THEN 2 ELSE 0 END`
      : warnThreshold !== null
        ? `CASE WHEN metric_value >= ${warnThreshold} THEN 1 ELSE 0 END`
        : "0"

  const metricSort = rule.sortDirection.toUpperCase()
  const prevMetricSelect = rule.comparePreviousPeriod
    ? "prev_metric_value"
    : "CAST(NULL AS REAL) AS prev_metric_value"
  const metricDeltaSelect = rule.comparePreviousPeriod
    ? "(metric_value - prev_metric_value) AS metric_delta"
    : "CAST(NULL AS REAL) AS metric_delta"
  const currentRankSelect = rule.comparePreviousPeriod
    ? `ROW_NUMBER() OVER (ORDER BY metric_value ${metricSort}, score DESC, student_name ASC) AS current_rank`
    : "CAST(NULL AS INTEGER) AS current_rank"
  const prevRankSelect = rule.comparePreviousPeriod
    ? `ROW_NUMBER() OVER (ORDER BY prev_metric_value ${metricSort}, score DESC, student_name ASC) AS prev_rank`
    : "CAST(NULL AS INTEGER) AS prev_rank"
  const rankChangeSelect = rule.comparePreviousPeriod
    ? "(prev_rank - current_rank) AS rank_change"
    : "CAST(NULL AS INTEGER) AS rank_change"
  const filteredWhereSql = filterClauses.length > 0 ? `WHERE ${filterClauses.join(" AND ")}` : ""

  return `WITH scoped AS (
  SELECT
    e.student_name,
    e.delta,
    e.event_time,
    COALESCE(s.score, 0) AS score
  FROM score_events e
  LEFT JOIN students s ON s.name = e.student_name
  WHERE e.event_time >= '${escapeSqlLiteral(queryStart)}'
    AND e.event_time < '${escapeSqlLiteral(queryEnd)}'
    ${baseWhereSql}
),
aggregated AS (
  SELECT
    student_name,
    MAX(score) AS score,
    SUM(CASE WHEN e.event_time >= '${escapeSqlLiteral(currentStart)}' AND e.event_time < '${escapeSqlLiteral(currentEnd)}' AND e.delta > 0 THEN e.delta ELSE 0 END) AS add_score,
    SUM(CASE WHEN e.event_time >= '${escapeSqlLiteral(currentStart)}' AND e.event_time < '${escapeSqlLiteral(currentEnd)}' AND e.delta < 0 THEN -e.delta ELSE 0 END) AS deduct_score,
    SUM(CASE WHEN e.event_time >= '${escapeSqlLiteral(currentStart)}' AND e.event_time < '${escapeSqlLiteral(currentEnd)}' THEN e.delta ELSE 0 END) AS net_score_change,
    SUM(CASE WHEN e.event_time >= '${escapeSqlLiteral(currentStart)}' AND e.event_time < '${escapeSqlLiteral(currentEnd)}' THEN 1 ELSE 0 END) AS event_count,
    SUM(CASE WHEN e.event_time >= '${escapeSqlLiteral(currentStart)}' AND e.event_time < '${escapeSqlLiteral(currentEnd)}' THEN ${metricExpression} ELSE 0 END) AS metric_value,
    SUM(CASE WHEN e.event_time >= '${escapeSqlLiteral(prevStart)}' AND e.event_time < '${escapeSqlLiteral(prevEnd)}' THEN ${metricExpression} ELSE 0 END) AS prev_metric_value
  FROM scoped e
  GROUP BY student_name
),
filtered AS (
  SELECT
    student_name,
    score,
    add_score,
    deduct_score,
    net_score_change,
    event_count,
    metric_value,
    ${prevMetricSelect},
    ${metricDeltaSelect}
  FROM aggregated
  ${filteredWhereSql}
),
ranked AS (
  SELECT
    *,
    ${currentRankSelect},
    ${prevRankSelect},
    ${highlightLevelSql} AS highlight_level
  FROM filtered
)
SELECT
  student_name,
  score,
  add_score,
  deduct_score,
  net_score_change,
  event_count,
  metric_value,
  prev_metric_value,
  metric_delta,
  current_rank,
  prev_rank,
  ${rankChangeSelect},
  highlight_level
FROM ranked
ORDER BY metric_value ${metricSort}, score DESC, student_name ASC
LIMIT ${topN}`
}

const createDefaultList = (): StudentListConfig => ({
  id: makeId(),
  name: "学生积分榜",
  rule: createDefaultRule(),
  viewMode: "card",
  scoreDisplayMode: "total",
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
              rule: normalizeRule(list?.rule),
              viewMode:
                list?.viewMode === "list" ||
                list?.viewMode === "card" ||
                list?.viewMode === "grid" ||
                list?.viewMode === "largeAvatar"
                  ? list.viewMode
                  : "card",
              scoreDisplayMode:
                list?.scoreDisplayMode === "total" || list?.scoreDisplayMode === "split"
                  ? list.scoreDisplayMode
                  : "total",
            }))
        : []

      const normalizedLists = lists.length > 0 ? lists : [createDefaultList()]
      const fallbackLayout = createLeafForList(normalizedLists[0].id)
      const layout =
        board?.layout && typeof board.layout === "object"
          ? (board.layout as LayoutNode)
          : fallbackLayout

      return syncBoardLayout({
        id: typeof board?.id === "string" && board.id.trim() ? board.id : makeId(),
        name:
          typeof board?.name === "string" && board.name.trim() ? board.name.trim() : "未命名看板",
        lists: normalizedLists,
        layout,
      })
    })
    .filter((board: BoardConfig) => board.id)

  return boards.length > 0 ? boards : [createDefaultBoard()]
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
    let hasAddScoreField =
      "add_score" in data || "addScore" in data || "plus_score" in data || "plusScore" in data
    let hasDeductScoreField =
      "deduct_score" in data ||
      "deductScore" in data ||
      "minus_score" in data ||
      "minusScore" in data

    const addScoreRaw = data.add_score ?? data.addScore ?? data.plus_score ?? data.plusScore
    const deductScoreRaw =
      data.deduct_score ?? data.deductScore ?? data.minus_score ?? data.minusScore
    const delta = parseNumber(data.delta ?? data.score_delta ?? data.scoreDelta)

    let addScore =
      addScoreRaw === null || addScoreRaw === undefined
        ? hasAddScoreField
          ? 0
          : undefined
        : parseNumber(addScoreRaw)
    let deductScore =
      deductScoreRaw === null || deductScoreRaw === undefined
        ? hasDeductScoreField
          ? 0
          : undefined
        : parseNumber(deductScoreRaw)

    if (!hasAddScoreField && !hasDeductScoreField && delta !== undefined) {
      if (delta >= 0) {
        hasAddScoreField = true
        addScore = delta
      } else {
        hasDeductScoreField = true
        deductScore = Math.abs(delta)
      }
    }

    cards.push({
      key: `${name}-${index}`,
      name,
      avatarUrl:
        typeof (data.avatar_url ?? data.avatarUrl ?? data.avatar) === "string" &&
        String(data.avatar_url ?? data.avatarUrl ?? data.avatar).trim()
          ? String(data.avatar_url ?? data.avatarUrl ?? data.avatar).trim()
          : undefined,
      score: parseNumber(data.score),
      addScore,
      deductScore,
      hasAddScoreField,
      hasDeductScoreField,
      rewardPoints: parseNumber(data.reward_points ?? data.rewardPoints),
      weekChange: parseNumber(data.week_change ?? data.range_change ?? data.change),
      weekDeducted: parseNumber(data.week_deducted ?? data.deducted),
      answeredCount: parseNumber(data.answered_count ?? data.answer_count),
      metricValue: parseNumber(data.metric_value ?? data.metricValue),
      prevMetricValue: parseNumber(data.prev_metric_value ?? data.prevMetricValue),
      metricDelta: parseNumber(data.metric_delta ?? data.metricDelta),
      rankChange: parseNumber(data.rank_change ?? data.rankChange),
      highlightLevel: parseNumber(data.highlight_level ?? data.highlightLevel),
    })
  })

  return cards
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

const replaceLayoutNode = (
  node: LayoutNode,
  targetId: string,
  replacement: LayoutNode
): LayoutNode => {
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
  const [reasonOptions, setReasonOptions] = useState<string[]>([])

  const panelRefs = useRef<Record<string, HTMLDivElement | null>>({})

  const presets: BoardPreset[] = useMemo(
    () => [
      {
        id: "week-positive-hand",
        name: t("board.presets.weekLowDeduct.name"),
        description: t("board.presets.weekLowDeduct.description"),
        rulePatch: {
          timeRange: "lastWeek",
          reasonMode: "selected",
          reasonValues: ["积极举手"],
          scoreDirection: "add",
          metric: "addScore",
          sortDirection: "desc",
          topN: 20,
        },
      },
      {
        id: "today-active",
        name: t("board.presets.todayActive.name"),
        description: t("board.presets.todayActive.description"),
        rulePatch: {
          timeRange: "last7d",
          reasonMode: "all",
          scoreDirection: "all",
          metric: "eventCount",
          sortDirection: "desc",
          topN: 20,
        },
      },
      {
        id: "reward-ranking",
        name: t("board.presets.rewardRanking.name"),
        description: t("board.presets.rewardRanking.description"),
        rulePatch: {
          timeRange: "last30d",
          reasonMode: "all",
          scoreDirection: "add",
          metric: "addScore",
          sortDirection: "desc",
          topN: 20,
        },
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
        const res = await (window as any).api.boardSaveConfigs(nextBoards)
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
      const res = await (window as any).api.boardGetConfigs()
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

  const fetchReasons = useCallback(async () => {
    if (!(window as any).api) return
    try {
      const res = await (window as any).api.queryReasons()
      if (!res?.success || !Array.isArray(res.data)) return
      const next = Array.from(
        new Set<string>(
          res.data
            .map((item: any) => (typeof item?.content === "string" ? item.content.trim() : ""))
            .filter(Boolean)
        )
      ).sort((a, b) => a.localeCompare(b, "zh-CN"))
      setReasonOptions(next)
    } catch {
      void 0
    }
  }, [])

  const runListQuery = useCallback(
    async (list: StudentListConfig) => {
      if (!(window as any).api) return
      const sql = buildSqlFromRule(list.rule)

      setRunningIds((prev) => ({ ...prev, [list.id]: true }))
      setErrorMap((prev) => ({ ...prev, [list.id]: "" }))

      if (!sql) {
        setErrorMap((prev) => ({ ...prev, [list.id]: t("board.runFailed") }))
        setResultMap((prev) => ({ ...prev, [list.id]: [] }))
        setRunningIds((prev) => ({ ...prev, [list.id]: false }))
        return
      }

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
        rule: item.rule,
        viewMode: item.viewMode,
        scoreDisplayMode: item.scoreDisplayMode,
      }))
    )
  }, [activeBoard])

  useEffect(() => {
    fetchBoards()
    fetchReasons()
  }, [fetchBoards, fetchReasons])

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
      if (!detail?.category || detail.category === "all")
        runAllInBoard(activeBoard).catch(() => void 0)
      if (
        detail.category === "students" ||
        detail.category === "events" ||
        detail.category === "reasons"
      ) {
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
      prev.map((board) =>
        board.id === boardId ? { ...board, name: name || t("board.untitledBoard") } : board
      )
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
          rule: createDefaultRule(),
          viewMode: "card",
          scoreDisplayMode: "total",
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
              lists: board.lists.map((list) =>
                list.id === listId
                  ? {
                      ...list,
                      ...patch,
                      rule: patch.rule ? normalizeRule(patch.rule) : list.rule,
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
      rule: normalizeRule({ ...createDefaultRule(), ...preset.rulePatch }),
    })
  }

  const renderStudentView = (list: StudentListConfig) => {
    const rows = resultMap[list.id] || []
    const studentCards = toStudentCards(rows)
    const useCardView = studentCards.length > 0
    const metricLabelMap: Record<BoardMetric, string> = {
      addScore: "加分总和",
      deductScore: "扣分总和",
      netChange: "净变化",
      addCount: "加分次数",
      eventCount: "事件次数",
    }

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

    if (!useCardView) {
      return (
        <Table
          rowKey={(_, index) => `${list.id}-${index}`}
          dataSource={rows}
          columns={columns}
          loading={Boolean(runningIds[list.id])}
          locale={{
            emptyText: (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("common.noData")} />
            ),
          }}
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
              : list.viewMode === "largeAvatar"
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
          const useSplitScore = list.scoreDisplayMode === "split"
          const hasSplitScore = Boolean(item.hasAddScoreField || item.hasDeductScoreField)
          const metricTitle = metricLabelMap[list.rule.metric]
          const rankChangeText =
            item.rankChange === undefined
              ? null
              : item.rankChange > 0
                ? `↑${item.rankChange}`
                : item.rankChange < 0
                  ? `↓${Math.abs(item.rankChange)}`
                  : "→0"
          const primaryMetric = useSplitScore
            ? item.metricValue !== undefined
              ? { label: metricTitle, value: item.metricValue }
              : item.addScore !== undefined && item.addScore !== 0
              ? { label: t("board.metrics.addScore"), value: item.addScore }
              : item.deductScore !== undefined && item.deductScore !== 0
                ? { label: t("board.metrics.deductScore"), value: item.deductScore }
                : item.addScore !== undefined
                  ? { label: t("board.metrics.addScore"), value: item.addScore }
                  : item.deductScore !== undefined
                    ? { label: t("board.metrics.deductScore"), value: item.deductScore }
                    : item.score !== undefined
                      ? { label: t("board.metrics.totalScore"), value: item.score }
                      : item.rewardPoints !== undefined
                        ? { label: t("board.metrics.rewardPoints"), value: item.rewardPoints }
                        : item.weekChange !== undefined
                          ? { label: t("board.metrics.weekChange"), value: item.weekChange }
                          : item.weekDeducted !== undefined
                            ? { label: t("board.metrics.weekDeducted"), value: item.weekDeducted }
                            : item.answeredCount !== undefined
                              ? {
                                  label: t("board.metrics.todayAnswered"),
                                  value: item.answeredCount,
                                }
                              : null
            : item.score !== undefined
              ? item.metricValue !== undefined
                ? { label: metricTitle, value: item.metricValue }
                : { label: t("board.metrics.totalScore"), value: item.score }
              : item.rewardPoints !== undefined
                ? { label: t("board.metrics.rewardPoints"), value: item.rewardPoints }
                : item.weekChange !== undefined
                  ? { label: t("board.metrics.weekChange"), value: item.weekChange }
                  : item.weekDeducted !== undefined
                    ? { label: t("board.metrics.weekDeducted"), value: item.weekDeducted }
                    : item.answeredCount !== undefined
                      ? { label: t("board.metrics.todayAnswered"), value: item.answeredCount }
                      : null
          const metricValueText = primaryMetric
            ? primaryMetric.value > 0
              ? `+${primaryMetric.value}`
              : String(primaryMetric.value)
            : null

          return (
            <div
              key={item.key}
              style={{
                ...(list.viewMode === "grid"
                  ? { aspectRatio: "1 / 1" }
                  : list.viewMode === "largeAvatar"
                    ? { aspectRatio: "1.2 / 1" }
                    : null),
              }}
            >
              <Card
                style={{
                  width: "100%",
                  height: "100%",
                  backgroundColor: "var(--ss-card-bg)",
                  border:
                    item.highlightLevel && item.highlightLevel >= 2
                      ? "1px solid #ff4d4f"
                      : item.highlightLevel && item.highlightLevel >= 1
                        ? "1px solid #faad14"
                        : "1px solid var(--ss-border-color)",
                  boxShadow: "0 6px 16px rgba(0, 0, 0, 0.06)",
                  position: "relative",
                }}
                styles={{
                  body: {
                    padding:
                      list.viewMode === "grid"
                        ? "8px"
                        : list.viewMode === "largeAvatar"
                          ? 0
                          : list.viewMode === "list"
                            ? "10px 12px"
                            : "12px 14px",
                    height:
                      list.viewMode === "grid" || list.viewMode === "largeAvatar"
                        ? "100%"
                        : undefined,
                  },
                }}
              >
                {rankBadge && (
                  <div
                    style={{
                      position: "absolute",
                      top: 10,
                      right: 10,
                      fontSize: "32px",
                      lineHeight: 1,
                      zIndex: 1,
                    }}
                  >
                    {rankBadge}
                  </div>
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
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 6,
                        width: "100%",
                      }}
                    >
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
                          color={
                            typeof primaryMetric.value === "number" && primaryMetric.value >= 0
                              ? "success"
                              : "error"
                          }
                          style={{ fontWeight: "bold", marginInlineEnd: 0 }}
                        >
                          {primaryMetric.label}:
                          {primaryMetric.value > 0
                            ? `+${primaryMetric.value}`
                            : primaryMetric.value}
                        </Tag>
                      )}
                      {rankChangeText && (
                        <Tag color={item.rankChange && item.rankChange > 0 ? "success" : "default"}>
                          {rankChangeText}
                        </Tag>
                      )}
                    </div>
                  </div>
                ) : list.viewMode === "largeAvatar" ? (
                  <div style={{ position: "relative", width: "100%", height: "100%" }}>
                    {item.avatarUrl ? (
                      <img
                        src={item.avatarUrl}
                        alt={item.name}
                        style={{ width: "100%", height: "100%", objectFit: "cover" }}
                      />
                    ) : (
                      <div
                        style={{
                          width: "100%",
                          height: "100%",
                          background: `linear-gradient(140deg, ${avatarColor} 0%, ${avatarColor}aa 100%)`,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          color: "rgba(255,255,255,0.95)",
                          fontWeight: 700,
                          fontSize: avatarText.length > 1 ? "46px" : "56px",
                          letterSpacing: "0.02em",
                        }}
                      >
                        {avatarText}
                      </div>
                    )}

                    <div
                      style={{
                        position: "absolute",
                        inset: 0,
                        background:
                          "linear-gradient(180deg, rgba(255,255,255,0) 56%, rgba(255,255,255,0.72) 84%, rgba(255,255,255,0.95) 100%)",
                        pointerEvents: "none",
                      }}
                    />

                    <div
                      style={{
                        position: "absolute",
                        left: 8,
                        right: 8,
                        bottom: 8,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 8,
                      }}
                    >
                      <div
                        style={{
                          maxWidth: "65%",
                          fontWeight: 700,
                          fontSize: 22,
                          lineHeight: 1,
                          color: "#111",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          background: "rgba(255,255,255,0.62)",
                          border: "1px solid rgba(255,255,255,0.82)",
                          borderRadius: 8,
                          padding: "3px 9px",
                          backdropFilter: "blur(4px)",
                        }}
                      >
                        {item.name}
                      </div>
                      {metricValueText !== null && (
                        <div
                          style={{
                            fontWeight: 800,
                            fontSize: 28,
                            lineHeight: 1,
                            color:
                              primaryMetric && primaryMetric.value >= 0 ? "#52c41a" : "#ff4d4f",
                            background: "rgba(255,255,255,0.62)",
                            border: "1px solid rgba(255,255,255,0.82)",
                            borderRadius: 8,
                            padding: "2px 9px",
                            backdropFilter: "blur(4px)",
                          }}
                        >
                          {metricValueText}
                        </div>
                      )}
                    </div>
                    {rankChangeText && (
                      <div
                        style={{
                          position: "absolute",
                          left: 8,
                          top: 8,
                          fontWeight: 700,
                          fontSize: 16,
                          background: "rgba(255,255,255,0.72)",
                          border: "1px solid rgba(255,255,255,0.82)",
                          borderRadius: 8,
                          padding: "2px 8px",
                        }}
                      >
                        {rankChangeText}
                      </div>
                    )}
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
                        {(list.scoreDisplayMode === "total" ||
                          (list.scoreDisplayMode === "split" && !hasSplitScore)) &&
                          item.score !== undefined && (
                            <Tag
                              color={item.score >= 0 ? "success" : "error"}
                              style={{ margin: 0 }}
                            >
                              {t("board.metrics.totalScore")}:{" "}
                              {item.score > 0 ? `+${item.score}` : item.score}
                            </Tag>
                          )}
                        {list.scoreDisplayMode === "split" && item.addScore !== undefined && (
                          <Tag color="success" style={{ margin: 0 }}>
                            {t("board.metrics.addScore")}:{" "}
                            {item.addScore > 0 ? `+${item.addScore}` : item.addScore}
                          </Tag>
                        )}
                        {list.scoreDisplayMode === "split" && item.deductScore !== undefined && (
                          <Tag color="error" style={{ margin: 0 }}>
                            {t("board.metrics.deductScore")}: {item.deductScore}
                          </Tag>
                        )}
                        {item.rewardPoints !== undefined && (
                          <Tag color="processing" style={{ margin: 0 }}>
                            {t("board.metrics.rewardPoints")}: {item.rewardPoints}
                          </Tag>
                        )}
                        {item.weekChange !== undefined && (
                          <Tag
                            color={item.weekChange >= 0 ? "success" : "error"}
                            style={{ margin: 0 }}
                          >
                            {t("board.metrics.weekChange")}:{" "}
                            {item.weekChange > 0 ? `+${item.weekChange}` : item.weekChange}
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
                        {item.prevMetricValue !== undefined && (
                          <Tag color="blue" style={{ margin: 0 }}>
                            上期: {item.prevMetricValue}
                          </Tag>
                        )}
                        {item.metricDelta !== undefined && (
                          <Tag color={item.metricDelta >= 0 ? "success" : "error"} style={{ margin: 0 }}>
                            较上期: {item.metricDelta > 0 ? `+${item.metricDelta}` : item.metricDelta}
                          </Tag>
                        )}
                        {rankChangeText && (
                          <Tag
                            color={item.rankChange && item.rankChange > 0 ? "success" : "default"}
                            style={{ margin: 0 }}
                          >
                            排名变化: {rankChangeText}
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
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          backgroundColor: "var(--ss-card-bg)",
          border: isSelected
            ? "1px solid var(--ant-color-primary, #1677ff)"
            : "1px solid var(--ss-border-color)",
          boxShadow: isSelected ? "0 8px 18px rgba(22, 119, 255, 0.14)" : undefined,
          cursor: "pointer",
        }}
        styles={{
          body: { flex: 1, minHeight: 0, display: "flex", flexDirection: "column", padding: 12 },
        }}
        title={<span style={{ fontWeight: 600 }}>{list.name}</span>}
        extra={
          <Space size={6}>
            <Button
              size="small"
              type="text"
              shape="circle"
              onClick={() => setEditingListId(list.id)}
              icon={<EditOutlined />}
              aria-label={t("board.editList")}
              title={t("board.editList")}
            />
            <Popconfirm
              title={t("board.removeListConfirm")}
              onConfirm={() => removeList(board.id, list.id)}
              disabled={!canManage || board.lists.length <= 1}
            >
              <Button
                size="small"
                type="text"
                shape="circle"
                danger
                icon={<DeleteOutlined />}
                disabled={!canManage || board.lists.length <= 1}
                aria-label={t("board.removeList")}
                title={t("board.removeList")}
              />
            </Popconfirm>
          </Space>
        }
      >
        {errorMap[list.id] && (
          <Alert style={{ marginBottom: 12 }} type="error" message={errorMap[list.id]} showIcon />
        )}
        <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden" }}>
          {renderStudentView(list)}
        </div>
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
        <div style={{ flex: `${node.ratio} 1 0`, minWidth: 0, minHeight: 0 }}>
          {renderLayoutNode(board, node.first)}
        </div>
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
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 16,
          width: "100%",
          minHeight: 0,
          flex: 1,
        }}
      >
        <div
          style={{
            display: "flex",
            width: "100%",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <Space align="center" size={8}>
            <Typography.Title level={2} style={{ margin: 0, color: "var(--ss-text-main)" }}>
              {t("board.title")}
            </Typography.Title>
            <Tag color={canManage ? "success" : "default"}>
              {canManage ? t("board.editable") : t("board.readonly")}
            </Tag>
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
            <Button
              icon={<EditOutlined />}
              onClick={openRenameModal}
              disabled={!canManage || !activeBoard}
            >
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
          <div
            style={{
              width: "100%",
              minHeight: 0,
              flex: 1,
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
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
        <Input
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          placeholder={t("board.boardNamePlaceholder")}
        />
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
                options={presets.map((preset) => ({
                  value: preset.id,
                  label: `${preset.name} · ${preset.description}`,
                }))}
                onChange={(presetId) => applyPreset(activeBoard.id, editingList.id, presetId)}
                disabled={!canManage}
              />
              <Select
                style={{ width: 160 }}
                value={editingList.viewMode}
                onChange={(viewMode: BoardStudentViewMode) =>
                  updateList(activeBoard.id, editingList.id, { viewMode })
                }
                options={[
                  { value: "list", label: t("board.viewModes.list") },
                  { value: "card", label: t("board.viewModes.card") },
                  { value: "grid", label: t("board.viewModes.grid") },
                  { value: "largeAvatar", label: t("board.viewModes.largeAvatar") },
                ]}
                disabled={!canManage}
              />
              <Select
                style={{ width: 180 }}
                value={editingList.scoreDisplayMode}
                onChange={(scoreDisplayMode: BoardScoreDisplayMode) =>
                  updateList(activeBoard.id, editingList.id, { scoreDisplayMode })
                }
                options={[
                  { value: "total", label: t("board.scoreDisplayModes.total") },
                  { value: "split", label: t("board.scoreDisplayModes.split") },
                ]}
                disabled={!canManage}
              />
            </Space>
            <Space wrap>
              <Typography.Text>时间范围</Typography.Text>
              <Select
                style={{ width: 200 }}
                value={editingList.rule.timeRange}
                onChange={(timeRange: BoardTimeRange) =>
                  updateList(activeBoard.id, editingList.id, {
                    rule: {
                      ...editingList.rule,
                      timeRange,
                    },
                  })
                }
                options={[
                  { value: "last7d", label: "最近 7 天" },
                  { value: "last30d", label: "最近 30 天" },
                  { value: "thisWeek", label: "本周" },
                  { value: "lastWeek", label: "上周" },
                  { value: "thisMonth", label: "本月" },
                  { value: "lastMonth", label: "上月" },
                  { value: "custom", label: "自定义范围" },
                ]}
                disabled={!canManage}
              />
              {editingList.rule.timeRange === "custom" && (
                <DatePicker.RangePicker
                  value={[
                    editingList.rule.customStart ? dayjs(editingList.rule.customStart) : null,
                    editingList.rule.customEnd ? dayjs(editingList.rule.customEnd) : null,
                  ]}
                  onChange={(values) =>
                    updateList(activeBoard.id, editingList.id, {
                      rule: {
                        ...editingList.rule,
                        customStart: values?.[0] ? values[0].toISOString() : null,
                        customEnd: values?.[1] ? values[1].toISOString() : null,
                      },
                    })
                  }
                  disabled={!canManage}
                />
              )}
            </Space>
            <Space wrap>
              <Typography.Text>理由筛选</Typography.Text>
              <Select
                style={{ width: 180 }}
                value={editingList.rule.reasonMode}
                onChange={(reasonMode: BoardReasonMode) =>
                  updateList(activeBoard.id, editingList.id, {
                    rule: {
                      ...editingList.rule,
                      reasonMode,
                    },
                  })
                }
                options={[
                  { value: "all", label: "全部理由" },
                  { value: "selected", label: "选择理由" },
                  { value: "keyword", label: "关键词匹配" },
                ]}
                disabled={!canManage}
              />
              {editingList.rule.reasonMode === "selected" && (
                <Select
                  mode="multiple"
                  allowClear
                  showSearch
                  style={{ width: 380 }}
                  placeholder="选择一个或多个理由"
                  value={editingList.rule.reasonValues}
                  options={reasonOptions.map((reason) => ({ value: reason, label: reason }))}
                  onChange={(reasonValues: string[]) =>
                    updateList(activeBoard.id, editingList.id, {
                      rule: {
                        ...editingList.rule,
                        reasonValues,
                      },
                    })
                  }
                  disabled={!canManage}
                />
              )}
              {editingList.rule.reasonMode === "keyword" && (
                <Input
                  style={{ width: 380 }}
                  placeholder="输入关键词，使用逗号分隔，例如：积极举手,主动发言"
                  value={editingList.rule.reasonValues.join(",")}
                  onChange={(e) =>
                    updateList(activeBoard.id, editingList.id, {
                      rule: {
                        ...editingList.rule,
                        reasonValues: e.target.value
                          .split(/[,\n，]/)
                          .map((item) => item.trim())
                          .filter(Boolean),
                      },
                    })
                  }
                  disabled={!canManage}
                />
              )}
            </Space>
            <Space wrap>
              <Typography.Text>积分方向</Typography.Text>
              <Select
                style={{ width: 150 }}
                value={editingList.rule.scoreDirection}
                onChange={(scoreDirection: BoardScoreDirection) =>
                  updateList(activeBoard.id, editingList.id, {
                    rule: {
                      ...editingList.rule,
                      scoreDirection,
                    },
                  })
                }
                options={[
                  { value: "all", label: "加分+扣分" },
                  { value: "add", label: "仅加分" },
                  { value: "deduct", label: "仅扣分" },
                ]}
                disabled={!canManage}
              />
              <Typography.Text>排行指标</Typography.Text>
              <Select
                style={{ width: 170 }}
                value={editingList.rule.metric}
                onChange={(metric: BoardMetric) =>
                  updateList(activeBoard.id, editingList.id, {
                    rule: {
                      ...editingList.rule,
                      metric,
                    },
                  })
                }
                options={[
                  { value: "addScore", label: "加分总和" },
                  { value: "deductScore", label: "扣分总和" },
                  { value: "netChange", label: "净变化" },
                  { value: "addCount", label: "加分次数" },
                  { value: "eventCount", label: "事件次数" },
                ]}
                disabled={!canManage}
              />
              <Typography.Text>排序</Typography.Text>
              <Select
                style={{ width: 120 }}
                value={editingList.rule.sortDirection}
                onChange={(sortDirection: BoardSortDirection) =>
                  updateList(activeBoard.id, editingList.id, {
                    rule: {
                      ...editingList.rule,
                      sortDirection,
                    },
                  })
                }
                options={[
                  { value: "desc", label: "从高到低" },
                  { value: "asc", label: "从低到高" },
                ]}
                disabled={!canManage}
              />
              <Typography.Text>TopN</Typography.Text>
              <InputNumber
                min={1}
                max={500}
                value={editingList.rule.topN}
                onChange={(topN) =>
                  updateList(activeBoard.id, editingList.id, {
                    rule: {
                      ...editingList.rule,
                      topN: clampTopN(topN),
                    },
                  })
                }
                disabled={!canManage}
              />
              <Typography.Text>对比上期</Typography.Text>
              <Switch
                checked={editingList.rule.comparePreviousPeriod}
                onChange={(comparePreviousPeriod) =>
                  updateList(activeBoard.id, editingList.id, {
                    rule: {
                      ...editingList.rule,
                      comparePreviousPeriod,
                    },
                  })
                }
                disabled={!canManage}
              />
            </Space>
            <Space wrap>
              <Typography.Text>最小指标值</Typography.Text>
              <InputNumber
                value={editingList.rule.minMetric}
                onChange={(minMetric) =>
                  updateList(activeBoard.id, editingList.id, {
                    rule: {
                      ...editingList.rule,
                      minMetric: typeof minMetric === "number" ? minMetric : null,
                    },
                  })
                }
                placeholder="可选"
                disabled={!canManage}
              />
              <Typography.Text>最大指标值</Typography.Text>
              <InputNumber
                value={editingList.rule.maxMetric}
                onChange={(maxMetric) =>
                  updateList(activeBoard.id, editingList.id, {
                    rule: {
                      ...editingList.rule,
                      maxMetric: typeof maxMetric === "number" ? maxMetric : null,
                    },
                  })
                }
                placeholder="可选"
                disabled={!canManage}
              />
              <Typography.Text>最低加分总和</Typography.Text>
              <InputNumber
                value={editingList.rule.minAddScore}
                onChange={(minAddScore) =>
                  updateList(activeBoard.id, editingList.id, {
                    rule: {
                      ...editingList.rule,
                      minAddScore: typeof minAddScore === "number" ? minAddScore : null,
                    },
                  })
                }
                placeholder="可选"
                disabled={!canManage}
              />
              <Typography.Text>最高扣分总和</Typography.Text>
              <InputNumber
                value={editingList.rule.maxDeductScore}
                onChange={(maxDeductScore) =>
                  updateList(activeBoard.id, editingList.id, {
                    rule: {
                      ...editingList.rule,
                      maxDeductScore: typeof maxDeductScore === "number" ? maxDeductScore : null,
                    },
                  })
                }
                placeholder="可选"
                disabled={!canManage}
              />
              <Typography.Text>最少事件次数</Typography.Text>
              <InputNumber
                min={0}
                value={editingList.rule.minEventCount}
                onChange={(minEventCount) =>
                  updateList(activeBoard.id, editingList.id, {
                    rule: {
                      ...editingList.rule,
                      minEventCount: typeof minEventCount === "number" ? minEventCount : null,
                    },
                  })
                }
                placeholder="可选"
                disabled={!canManage}
              />
            </Space>
            <Space wrap>
              <Typography.Text>高亮阈值（预警）</Typography.Text>
              <InputNumber
                value={editingList.rule.warnThreshold}
                onChange={(warnThreshold) =>
                  updateList(activeBoard.id, editingList.id, {
                    rule: {
                      ...editingList.rule,
                      warnThreshold: typeof warnThreshold === "number" ? warnThreshold : null,
                    },
                  })
                }
                placeholder="可选"
                disabled={!canManage}
              />
              <Typography.Text>高亮阈值（危险）</Typography.Text>
              <InputNumber
                value={editingList.rule.dangerThreshold}
                onChange={(dangerThreshold) =>
                  updateList(activeBoard.id, editingList.id, {
                    rule: {
                      ...editingList.rule,
                      dangerThreshold: typeof dangerThreshold === "number" ? dangerThreshold : null,
                    },
                  })
                }
                placeholder="可选"
                disabled={!canManage}
              />
              <Typography.Text>学生名包含</Typography.Text>
              <Input
                style={{ width: 220 }}
                value={editingList.rule.studentNameKeyword}
                onChange={(e) =>
                  updateList(activeBoard.id, editingList.id, {
                    rule: {
                      ...editingList.rule,
                      studentNameKeyword: e.target.value,
                    },
                  })
                }
                placeholder="可选"
                disabled={!canManage}
              />
            </Space>
            <Typography.Text type="secondary">
              当前为图形化规则配置，不需要手写 SQL。下面是系统自动生成的查询预览。
            </Typography.Text>
            <Input.TextArea
              value={buildSqlFromRule(editingList.rule) || ""}
              autoSize={{ minRows: 8, maxRows: 16 }}
              readOnly
              spellCheck={false}
              style={{
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
              }}
            />
          </Space>
        )}
      </Modal>
    </div>
  )
}
