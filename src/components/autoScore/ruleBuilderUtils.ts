import type { RuleGroupType, Field, RuleType } from "react-querybuilder"
import { defaultOperators } from "react-querybuilder"
import { fetchAllTags } from "../TagEditorDialog"

const tags = await fetchAllTags()

export interface AutoScoreTrigger {
  event: string
  value?: string
  relation?: "AND" | "OR"
}

export interface AutoScoreAction {
  event: string
  value?: string
  reason?: string
}

export interface AutoScoreRuleData {
  triggers: AutoScoreTrigger[]
  actions: AutoScoreAction[]
}

export const validator = (r: RuleType) => !!r.value

export const getFields = (t: (key: string) => string): Field[] => [
  {
    name: "student_has_tag",
    label: t("triggers.studentTag.label"),
    placeholder: t("triggers.studentTag.placeholder"),
    valueEditorType: "multiselect",
    values: tags.map((tag: { id: number; name: string }) => tag.name),
    defaultValue: tags.length > 0 ? [tags[0].name] : [],
    operators: defaultOperators.filter((op) => op.name === "in"),
  },
  {
    name: "interval_time_passed",
    label: t("triggers.intervalTime.label"),
    matchModes: ["all"],
    subproperties: [
      {
        name: "month",
        label: t("triggers.intervalTime.monthLabel"),
        inputType: "number",
        datatype: "month",
        operators: ["="],
      },
      /*       { name: 'week', label: t('triggers.intervalTime.weekLabel'), inputType: 'week', datatype: 'week', operators: ['='] },
       */ {
        name: "time",
        label: t("triggers.intervalTime.timeLabel"),
        inputType: "time",
        datatype: "time",
        operators: ["="],
      },
    ],
  },
]

export const defaultQuery: RuleGroupType = {
  combinator: "and",
  rules: [{ field: "interval_time_passed", operator: "=", value: "1440" }],
}

export function queryToAutoScoreRule(_query: RuleGroupType): AutoScoreRuleData {
  const triggers: AutoScoreTrigger[] = []

  /*   const processRuleGroup = (group: RuleGroupType, relation: 'AND' | 'OR' = 'AND') => {
    group.rules.forEach((rule, index) => {
      if ('rules' in rule) {
        processRuleGroup(rule, group.combinator === 'and' ? 'AND' : 'OR')
      } else {
        const trigger: AutoScoreTrigger = {
          event: rule.field,
          value: rule.value as string
        }

        if (index > 0) {
          trigger.relation = relation
        }

        triggers.push(trigger)
      }
    })
  } */

  /* processRuleGroup(query) */

  return {
    triggers,
    actions: [],
  }
}

export function autoScoreRuleToQuery(ruleData: AutoScoreRuleData): RuleGroupType {
  const rules: any[] = []
  let currentCombinator: "and" | "or" = "and"

  ruleData.triggers.forEach((trigger, index) => {
    if (index === 0) {
      currentCombinator = "and"
    } else if (trigger.relation === "OR") {
      currentCombinator = "or"
    }

    rules.push({
      field: trigger.event,
      operator: "=",
      value: trigger.value || "",
    })
  })

  return {
    combinator: currentCombinator,
    rules: rules.length > 0 ? rules : defaultQuery.rules,
  }
}
