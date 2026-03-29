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

export interface ActionDraft {
  id: string
  event: ActionEvent
  value: string
}

export type ActionDraftError = "score_required" | "tag_required" | null

const TRIGGER_FIELD_INTERVAL = "interval_minutes"
const TRIGGER_FIELD_TAG = "student_tag"
const OP_EQUAL = "equal"

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

const ruleFromTrigger = (trigger: AutoScoreTrigger): JsonRule | null => {
  if (trigger.event === "interval_time_passed") {
    const minutes = toFiniteNumber(trigger.value)
    if (!minutes || minutes <= 0) return null
    return {
      id: QbUtils.uuid(),
      type: "rule",
      properties: {
        field: TRIGGER_FIELD_INTERVAL,
        operator: OP_EQUAL,
        value: [Math.floor(minutes)],
      },
    }
  }

  if (trigger.event === "student_has_tag") {
    const tagName = toStringValue(trigger.value).trim()
    if (!tagName) return null
    return {
      id: QbUtils.uuid(),
      type: "rule",
      properties: {
        field: TRIGGER_FIELD_TAG,
        operator: OP_EQUAL,
        value: [tagName],
      },
    }
  }

  return null
}

const triggerFromRule = (rule: JsonRule): AutoScoreTrigger | null => {
  const field = typeof rule.properties?.field === "string" ? rule.properties.field : ""
  const value = Array.isArray(rule.properties?.value) ? rule.properties.value[0] : undefined

  if (field === TRIGGER_FIELD_INTERVAL) {
    const minutes = toFiniteNumber(value)
    if (!minutes || minutes <= 0) return null
    return {
      event: "interval_time_passed",
      value: String(Math.floor(minutes)),
    }
  }

  if (field === TRIGGER_FIELD_TAG) {
    const tagName = toStringValue(value).trim()
    if (!tagName) return null
    return {
      event: "student_has_tag",
      value: tagName,
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

export const createTriggerQueryConfig = (t: TFunction): Config =>
  ({
    ...AntdConfig,
    fields: {
      [TRIGGER_FIELD_INTERVAL]: {
        label: t("autoScore.triggerIntervalTime"),
        type: "number",
        operators: [OP_EQUAL],
        valueSources: ["value"],
        preferWidgets: ["number"],
        fieldSettings: { min: 1 },
      },
      [TRIGGER_FIELD_TAG]: {
        label: t("autoScore.triggerStudentTag"),
        type: "text",
        operators: [OP_EQUAL],
        valueSources: ["value"],
        preferWidgets: ["text"],
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
        value: toStringValue(action.value),
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
      const score = toFiniteNumber(draft.value)
      if (!score || score === 0) {
        return { actions: [], error: "score_required" }
      }
      actions.push({ event: draft.event, value: String(score) })
      continue
    }

    const tagName = draft.value.trim()
    if (!tagName) {
      return { actions: [], error: "tag_required" }
    }
    actions.push({ event: draft.event, value: tagName })
  }

  return { actions, error: null }
}
