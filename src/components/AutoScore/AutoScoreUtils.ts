import {
  AntdConfig,
  Utils as QbUtils,
  type Config,
  type ImmutableTree,
  type JsonGroup,
  type JsonItem,
  type JsonRule,
} from "@react-awesome-query-builder/antd"
import type { TFunction } from "i18next"
import {
  IntervalValueWidget,
  parseIntervalTriggerValue,
  stringifyIntervalTriggerValue,
} from "./IntervalValueWidget"

export interface AutoScoreTrigger {
  event: string
  value?: string | null
}

export interface AutoScoreAction {
  event: string
  value?: string | null
}

export interface AutoScoreExecutionConfig {
  cooldownMinutes?: number | null
  maxRunsPerDay?: number | null
  maxScoreDeltaPerDay?: number | null
}

export interface AutoScoreExecutionBatch {
  id: string
  ruleId: number
  ruleName: string
  runAt: string
  affectedStudents: number
  affectedStudentNames: string[]
  createdEventIds: number[]
  addedStudentTagIds: number[]
  scoreDeltaTotal: number
  settled: boolean
  rolledBack: boolean
  rollbackAt?: string | null
}

export interface AutoScoreRule {
  id: number
  name: string
  enabled: boolean
  studentNames: string[]
  triggers: AutoScoreTrigger[]
  triggerTree?: JsonGroup | null
  actions: AutoScoreAction[]
  execution?: AutoScoreExecutionConfig
  lastExecuted?: string | null
}

export type ActionEvent = "add_score" | "add_tag" | "settle_score"

export interface AutoScoreTagOption {
  label: string
  value: string
}

export interface ActionDraft {
  id: string
  event: ActionEvent
  value: string | string[]
}

export type ActionDraftError = "action_required" | "score_required" | "tag_required" | null

const TRIGGER_FIELD_INTERVAL = "interval_minutes"
const TRIGGER_FIELD_TAG = "student_tag"
const TRIGGER_FIELD_SQL = "student_sql"
const TRIGGER_FIELD_SCORE = "student_score"
const TRIGGER_FIELD_SCORE_GT = "student_score_gt"
const TRIGGER_TYPE_INTERVAL = "interval_duration"
const TRIGGER_WIDGET_INTERVAL = "interval_duration"
const OP_EQUAL = "equal"
const OP_GREATER = "greater"
const OP_LESS = "less"
const OP_MULTISELECT_CONTAINS = "multiselect_contains"

const buildEmptyGroup = (): JsonGroup => ({
  id: QbUtils.uuid(),
  type: "group",
  properties: {
    conjunction: "AND",
  },
  children1: [],
})

const toFiniteNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

const toStringValue = (value: unknown): string => {
  if (value === null || value === undefined) return ""
  return String(value)
}

const normalizeTagValues = (values: unknown[]): string[] => {
  const normalized = values.map((value) => toStringValue(value).trim()).filter(Boolean)

  return Array.from(new Set(normalized))
}

const parseTagValues = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return normalizeTagValues(value)
  }

  const text = toStringValue(value).trim()
  if (!text) return []

  if (text.startsWith("[")) {
    try {
      const parsed = JSON.parse(text)
      if (Array.isArray(parsed)) {
        return normalizeTagValues(parsed)
      }
    } catch {
      void 0
    }
  }

  return [text]
}

const stringifyTagValues = (values: string[]): string | null => {
  const normalized = normalizeTagValues(values)
  if (normalized.length === 0) return null
  if (normalized.length === 1) return normalized[0]
  return JSON.stringify(normalized)
}

const ruleFromTrigger = (trigger: AutoScoreTrigger): JsonRule | null => {
  if (trigger.event === "interval_time_passed") {
    const intervalValue = parseIntervalTriggerValue(trigger.value)
    const serializedIntervalValue = intervalValue
      ? stringifyIntervalTriggerValue(intervalValue)
      : null
    if (!serializedIntervalValue) return null
    return {
      id: QbUtils.uuid(),
      type: "rule",
      properties: {
        field: TRIGGER_FIELD_INTERVAL,
        operator: OP_EQUAL,
        value: [serializedIntervalValue],
      },
    }
  }

  if (trigger.event === "student_has_tag") {
    const tagNames = parseTagValues(trigger.value)
    if (tagNames.length === 0) return null
    return {
      id: QbUtils.uuid(),
      type: "rule",
      properties: {
        field: TRIGGER_FIELD_TAG,
        operator: OP_MULTISELECT_CONTAINS,
        value: [tagNames],
      },
    }
  }

  if (
    trigger.event === "query_sql" ||
    trigger.event === "student_query_sql" ||
    trigger.event === "student_sql"
  ) {
    const sql = toStringValue(trigger.value).trim()
    if (!sql) return null
    return {
      id: QbUtils.uuid(),
      type: "rule",
      properties: {
        field: TRIGGER_FIELD_SQL,
        operator: OP_EQUAL,
        value: [sql],
      },
    }
  }

  if (trigger.event === "student_score_gt" || trigger.event === "student_score_lt") {
    const score = toFiniteNumber(trigger.value)
    if (score === null) return null
    return {
      id: QbUtils.uuid(),
      type: "rule",
      properties: {
        field: TRIGGER_FIELD_SCORE,
        operator: trigger.event === "student_score_lt" ? OP_LESS : OP_GREATER,
        value: [score],
      },
    }
  }

  return null
}

const triggerFromRule = (rule: JsonRule): AutoScoreTrigger | null => {
  const field = typeof rule.properties?.field === "string" ? rule.properties.field : ""
  const operator = typeof rule.properties?.operator === "string" ? rule.properties.operator : ""
  const value = Array.isArray(rule.properties?.value) ? rule.properties.value[0] : undefined

  if (field === TRIGGER_FIELD_INTERVAL) {
    const intervalValue = parseIntervalTriggerValue(value)
    const serializedIntervalValue = intervalValue
      ? stringifyIntervalTriggerValue(intervalValue)
      : null
    if (!serializedIntervalValue) return null
    return {
      event: "interval_time_passed",
      value: serializedIntervalValue,
    }
  }

  if (field === TRIGGER_FIELD_TAG) {
    const tagNames = parseTagValues(value)
    const serializedValue = stringifyTagValues(tagNames)
    if (!serializedValue) return null
    return {
      event: "student_has_tag",
      value: serializedValue,
    }
  }

  if (field === TRIGGER_FIELD_SQL) {
    const sql = toStringValue(value).trim()
    if (!sql) return null
    return {
      event: "query_sql",
      value: sql,
    }
  }

  if (field === TRIGGER_FIELD_SCORE || field === TRIGGER_FIELD_SCORE_GT) {
    const score = toFiniteNumber(value)
    if (score === null) return null
    return {
      event: operator === OP_LESS ? "student_score_lt" : "student_score_gt",
      value: String(score),
    }
  }

  return null
}

const collectTriggersFromItems = (items: JsonItem[] | undefined): AutoScoreTrigger[] => {
  if (!Array.isArray(items)) return []
  const collected: AutoScoreTrigger[] = []
  for (const item of items) {
    if (item.type === "rule") {
      const trigger = triggerFromRule(item)
      if (trigger) collected.push(trigger)
      continue
    }
    if (item.type === "group") {
      collected.push(...collectTriggersFromItems(item.children1))
    }
  }
  return collected
}

export const createTriggerQueryConfig = (t: TFunction, tagOptions: AutoScoreTagOption[]): Config =>
  ({
    ...AntdConfig,
    conjunctions: {
      ...AntdConfig.conjunctions,
      AND: {
        ...AntdConfig.conjunctions.AND,
        label: t("autoScore.relationAnd"),
      },
      OR: {
        ...AntdConfig.conjunctions.OR,
        label: t("autoScore.relationOr"),
      },
    },
    operators: {
      ...AntdConfig.operators,
      [OP_GREATER]: {
        ...AntdConfig.operators[OP_GREATER],
        label: ">",
        labelForFormat: ">",
      },
      [OP_LESS]: {
        ...AntdConfig.operators[OP_LESS],
        label: "<",
        labelForFormat: "<",
      },
      [OP_MULTISELECT_CONTAINS]: {
        ...AntdConfig.operators[OP_MULTISELECT_CONTAINS],
        label: t("autoScore.operatorContains"),
        labelForFormat: t("autoScore.operatorContains"),
      },
    },
    widgets: {
      ...AntdConfig.widgets,
      [TRIGGER_WIDGET_INTERVAL]: {
        ...AntdConfig.widgets.text,
        type: "text",
        jsType: "string",
        hideOperator: true,
        factory: IntervalValueWidget,
        valuePlaceholder: t("autoScore.intervalAmountPlaceholder"),
        validateValue: (value) => {
          const rawValue = toStringValue(value).trim()
          if (!rawValue) return true
          return parseIntervalTriggerValue(rawValue) !== null
        },
      },
    },
    types: {
      ...AntdConfig.types,
      [TRIGGER_TYPE_INTERVAL]: {
        ...AntdConfig.types.text,
        defaultOperator: OP_EQUAL,
        mainWidget: TRIGGER_WIDGET_INTERVAL,
        widgets: {
          [TRIGGER_WIDGET_INTERVAL]: {
            operators: [OP_EQUAL],
          },
        },
      },
    },
    fields: {
      [TRIGGER_FIELD_INTERVAL]: {
        label: t("autoScore.triggerIntervalTime"),
        type: TRIGGER_TYPE_INTERVAL,
        operators: [OP_EQUAL],
        valueSources: ["value"],
        preferWidgets: [TRIGGER_WIDGET_INTERVAL],
      },
      [TRIGGER_FIELD_TAG]: {
        label: t("autoScore.triggerStudentTag"),
        type: "multiselect",
        defaultOperator: OP_MULTISELECT_CONTAINS,
        operators: [OP_MULTISELECT_CONTAINS],
        valueSources: ["value"],
        preferWidgets: ["multiselect"],
        fieldSettings: {
          listValues: tagOptions.map((tag) => ({
            value: tag.value,
            title: tag.label,
          })),
          allowCustomValues: true,
          showSearch: true,
        },
      },
      [TRIGGER_FIELD_SQL]: {
        label: t("autoScore.triggerStudentSql"),
        type: "text",
        operators: [OP_EQUAL],
        valueSources: ["value"],
        fieldSettings: {
          placeholder: t("autoScore.triggerStudentSqlPlaceholder"),
        },
      },
      [TRIGGER_FIELD_SCORE]: {
        label: t("autoScore.triggerStudentScore"),
        type: "number",
        defaultOperator: OP_GREATER,
        operators: [OP_GREATER, OP_LESS],
        valueSources: ["value"],
      },
    },
    settings: {
      ...AntdConfig.settings,
      liteMode: false,
      compactMode: false,
      renderSize: "medium",
      showNot: true,
      notLabel: t("autoScore.relationNot"),
      forceShowConj: true,
      canLeaveEmptyGroup: false,
      canReorder: true,
      canRegroup: true,
      setOpOnChangeField: ["default"],
    },
  }) as Config

export const createEmptyTriggerTree = (config: Config): ImmutableTree =>
  QbUtils.checkTree(QbUtils.loadTree(buildEmptyGroup()), config)

export const normalizeTriggerTree = (tree: ImmutableTree, config: Config): ImmutableTree =>
  QbUtils.checkTree(tree, config)

export const triggersToQueryTree = (
  config: Config,
  triggers: AutoScoreTrigger[]
): ImmutableTree => {
  const children = triggers.map(ruleFromTrigger).filter((item): item is JsonRule => Boolean(item))
  const group: JsonGroup = {
    ...buildEmptyGroup(),
    children1: children,
  }
  return QbUtils.checkTree(QbUtils.loadTree(group), config)
}

export const queryTreeToTriggers = (tree: ImmutableTree, config: Config): AutoScoreTrigger[] => {
  const checkedTree = QbUtils.checkTree(tree, config)
  const jsonTree = QbUtils.getTree(checkedTree, false, true)
  if (!jsonTree || jsonTree.type !== "group") return []
  return collectTriggersFromItems(jsonTree.children1)
}

export const queryTreeToJson = (tree: ImmutableTree, config: Config): JsonGroup | null => {
  const checkedTree = QbUtils.checkTree(tree, config)
  const jsonTree = QbUtils.getTree(checkedTree, false, true)
  if (!jsonTree || jsonTree.type !== "group") return null
  return jsonTree as JsonGroup
}

const hydrateTriggerTreeNode = (
  node: JsonItem,
  fallbackTriggers: AutoScoreTrigger[],
  fallbackIndex: { current: number }
): JsonItem | null => {
  if (node.type === "group") {
    const children = Array.isArray(node.children1)
      ? node.children1
          .map((child) => hydrateTriggerTreeNode(child, fallbackTriggers, fallbackIndex))
          .filter((child): child is JsonItem => Boolean(child))
      : []
    return {
      ...node,
      children1: children,
    }
  }

  if (node.type !== "rule") {
    return node
  }

  const fallbackTrigger = fallbackTriggers[fallbackIndex.current]
  fallbackIndex.current += 1
  const parsed = triggerFromRule(node)
  if (parsed) {
    const normalizedRule = ruleFromTrigger(parsed)
    if (!normalizedRule) {
      return node
    }
    return {
      ...node,
      properties: normalizedRule.properties,
    }
  }

  if (!fallbackTrigger) {
    return node
  }

  const fallbackRule = ruleFromTrigger(fallbackTrigger)
  if (!fallbackRule) {
    return node
  }

  return {
    ...node,
    properties: fallbackRule.properties,
  }
}

export const triggerTreeJsonToQueryTree = (
  config: Config,
  triggerTree?: JsonGroup | null,
  fallbackTriggers: AutoScoreTrigger[] = []
): ImmutableTree => {
  if (triggerTree && triggerTree.type === "group") {
    const hydratedTree = hydrateTriggerTreeNode(triggerTree, fallbackTriggers, { current: 0 })
    if (hydratedTree && hydratedTree.type === "group") {
      return QbUtils.checkTree(QbUtils.loadTree(hydratedTree), config)
    }
  }
  return triggersToQueryTree(config, fallbackTriggers)
}

const hasUnsupportedLogicInGroup = (group: JsonGroup): boolean => {
  const conjunction =
    typeof group.properties?.conjunction === "string" ? group.properties.conjunction : "AND"
  const not = Boolean(group.properties?.not)

  if (conjunction !== "AND" || not) {
    return true
  }

  const children = Array.isArray(group.children1) ? group.children1 : []
  for (const child of children) {
    if (child.type === "group" && hasUnsupportedLogicInGroup(child)) {
      return true
    }
  }

  return false
}

export const hasUnsupportedTriggerLogic = (tree: ImmutableTree, config: Config): boolean => {
  const checkedTree = QbUtils.checkTree(tree, config)
  const jsonTree = QbUtils.getTree(checkedTree, false, true)
  if (!jsonTree || jsonTree.type !== "group") return false
  return hasUnsupportedLogicInGroup(jsonTree)
}

export const createDefaultActionDraft = (): ActionDraft => ({
  id: QbUtils.uuid(),
  event: "add_score",
  value: "1",
})

const isActionEvent = (value: unknown): value is ActionEvent =>
  value === "add_score" || value === "add_tag" || value === "settle_score"

export const normalizeActionDrafts = (drafts: ActionDraft[] | null | undefined): ActionDraft[] => {
  if (!Array.isArray(drafts) || drafts.length === 0) {
    return [createDefaultActionDraft()]
  }

  const normalized = drafts
    .map((draft) => {
      if (!draft || !isActionEvent(draft.event)) return null

      return {
        id: typeof draft.id === "string" && draft.id ? draft.id : QbUtils.uuid(),
        event: draft.event,
        value:
          draft.event === "add_tag"
            ? parseTagValues(draft.value)
            : draft.event === "settle_score"
              ? ""
              : toStringValue(Array.isArray(draft.value) ? draft.value[0] : draft.value),
      } satisfies ActionDraft
    })
    .filter((item): item is ActionDraft => Boolean(item))

  return normalized.length > 0 ? normalized : [createDefaultActionDraft()]
}

export const actionsToDrafts = (actions: AutoScoreAction[]): ActionDraft[] => {
  const mapped = actions
    .map((action) => {
      if (action.event !== "add_score" && action.event !== "add_tag" && action.event !== "settle_score") {
        return null
      }
      return {
        id: QbUtils.uuid(),
        event: action.event,
        value:
          action.event === "add_tag"
            ? parseTagValues(action.value)
            : action.event === "settle_score"
              ? ""
              : toStringValue(action.value),
      } satisfies ActionDraft
    })
    .filter((item): item is ActionDraft => Boolean(item))

  return normalizeActionDrafts(mapped)
}

export const actionDraftsToPayload = (
  drafts: ActionDraft[]
): { actions: AutoScoreAction[]; error: ActionDraftError } => {
  const normalizedDrafts = normalizeActionDrafts(drafts)
  if (normalizedDrafts.length === 0) {
    return { actions: [], error: "action_required" }
  }

  const actions: AutoScoreAction[] = []
  for (const draft of normalizedDrafts) {
    if (draft.event === "add_score") {
      const score = Array.isArray(draft.value) ? null : toFiniteNumber(draft.value)
      if (!score || score === 0) {
        return { actions: [], error: "score_required" }
      }
      actions.push({ event: draft.event, value: String(score) })
      continue
    }

    if (draft.event === "settle_score") {
      actions.push({ event: draft.event })
      continue
    }

    const serializedTagValue = stringifyTagValues(parseTagValues(draft.value))
    if (!serializedTagValue) {
      return { actions: [], error: "tag_required" }
    }
    actions.push({ event: draft.event, value: serializedTagValue })
  }

  return { actions, error: null }
}
