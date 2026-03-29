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
import { IntervalValueWidget, parseIntervalTriggerValue, stringifyIntervalTriggerValue } from "./IntervalValueWidget"

export interface AutoScoreTrigger {
  event: string
  value?: string | null
}

export interface AutoScoreAction {
  event: string
  value?: string | null
}

export interface AutoScoreRule {
  id: number
  name: string
  enabled: boolean
  studentNames: string[]
  triggers: AutoScoreTrigger[]
  actions: AutoScoreAction[]
  lastExecuted?: string | null
}

export type ActionEvent = "add_score" | "add_tag"

export interface AutoScoreTagOption {
  label: string
  value: string
}

export interface ActionDraft {
  id: string
  event: ActionEvent
  value: string | string[]
}

export type ActionDraftError = "score_required" | "tag_required" | null

const TRIGGER_FIELD_INTERVAL = "interval_minutes"
const TRIGGER_FIELD_TAG = "student_tag"
const TRIGGER_TYPE_INTERVAL = "interval_duration"
const TRIGGER_WIDGET_INTERVAL = "interval_duration"
const OP_EQUAL = "equal"
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
  const normalized = values
    .map((value) => toStringValue(value).trim())
    .filter(Boolean)

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

  return null
}

const triggerFromRule = (rule: JsonRule): AutoScoreTrigger | null => {
  const field = typeof rule.properties?.field === "string" ? rule.properties.field : ""
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
    },
    settings: {
      ...AntdConfig.settings,
      liteMode: false,
      compactMode: false,
      renderSize: "medium",
      showNot: true,
      forceShowConj: true,
      canLeaveEmptyGroup: false,
      canReorder: true,
      canRegroup: true,
    },
  }) as Config

export const createEmptyTriggerTree = (config: Config): ImmutableTree =>
  QbUtils.checkTree(QbUtils.loadTree(buildEmptyGroup()), config)

export const triggersToQueryTree = (config: Config, triggers: AutoScoreTrigger[]): ImmutableTree => {
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

const hasUnsupportedLogicInGroup = (group: JsonGroup): boolean => {
  const conjunction = typeof group.properties?.conjunction === "string" ? group.properties.conjunction : "AND"
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

export const actionsToDrafts = (actions: AutoScoreAction[]): ActionDraft[] => {
  const mapped = actions
    .map((action) => {
      if (action.event !== "add_score" && action.event !== "add_tag") return null
      return {
        id: QbUtils.uuid(),
        event: action.event,
        value:
          action.event === "add_tag" ? parseTagValues(action.value) : toStringValue(action.value),
      } satisfies ActionDraft
    })
    .filter((item): item is ActionDraft => Boolean(item))

  return mapped.length > 0 ? mapped : [createDefaultActionDraft()]
}

export const actionDraftsToPayload = (
  drafts: ActionDraft[]
): { actions: AutoScoreAction[]; error: ActionDraftError } => {
  const actions: AutoScoreAction[] = []
  for (const draft of drafts) {
    if (draft.event === "add_score") {
      const score = Array.isArray(draft.value) ? null : toFiniteNumber(draft.value)
      if (!score || score === 0) {
        return { actions: [], error: "score_required" }
      }
      actions.push({ event: draft.event, value: String(score) })
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
