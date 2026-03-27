import type { Config, JsonGroup } from "@react-awesome-query-builder/antd"
import { Utils as QbUtils, AntdConfig } from "@react-awesome-query-builder/antd"

const InitialConfig = AntdConfig

export interface AutoScoreRuleConfig {
  id: string
  name: string
  description: string
  type: "interval_time" | "student_tag"
  config: Config
  defaultQuery: JsonGroup
}

export const intervalTimeConfig: Config = {
  ...InitialConfig,
  ctx: InitialConfig.ctx,
  fields: {
    interval_minutes: {
      label: "间隔时间(分钟)",
      type: "number",
      fieldSettings: {
        min: 1,
        max: 1440,
      },
      valueSources: ["value"],
      preferWidgets: ["number"],
    },
    score_value: {
      label: "加分数值",
      type: "number",
      fieldSettings: {
        min: -100,
        max: 100,
      },
      valueSources: ["value"],
      preferWidgets: ["number"],
    },
  },
}

export const studentTagConfig: Config = {
  ...InitialConfig,
  ctx: InitialConfig.ctx,
  fields: {
    tag_name: {
      label: "学生标签",
      type: "select",
      valueSources: ["value"],
      fieldSettings: {
        listValues: [
          { value: "优秀", title: "优秀" },
          { value: "进步", title: "进步" },
          { value: "活跃", title: "活跃" },
          { value: "负责", title: "负责" },
          { value: "需关注", title: "需关注" },
        ],
      },
    },
    score_value: {
      label: "加分数值",
      type: "number",
      fieldSettings: {
        min: -100,
        max: 100,
      },
      valueSources: ["value"],
      preferWidgets: ["number"],
    },
  },
}

export const defaultIntervalTimeQuery: JsonGroup = {
  id: QbUtils.uuid(),
  type: "group",
  children1: [
    {
      id: QbUtils.uuid(),
      type: "rule",
      properties: {
        field: "interval_minutes",
        operator: "greater",
        value: [30],
        valueSrc: ["value"],
        valueType: ["number"],
      },
    },
  ],
}

export const defaultStudentTagQuery: JsonGroup = {
  id: QbUtils.uuid(),
  type: "group",
  children1: [
    {
      id: QbUtils.uuid(),
      type: "rule",
      properties: {
        field: "tag_name",
        operator: "select_equals",
        value: ["优秀"],
        valueSrc: ["value"],
        valueType: ["select"],
      },
    },
  ],
}

export const ruleConfigs: AutoScoreRuleConfig[] = [
  {
    id: "interval_time_rule",
    name: "间隔时间加分",
    description: "根据学生上次加分后的间隔时间自动加分",
    type: "interval_time",
    config: intervalTimeConfig,
    defaultQuery: defaultIntervalTimeQuery,
  },
  {
    id: "student_tag_rule",
    name: "学生标签加分",
    description: "根据学生拥有的标签自动加分",
    type: "student_tag",
    config: studentTagConfig,
    defaultQuery: defaultStudentTagQuery,
  },
]

export const getRuleConfig = (
  type: "interval_time" | "student_tag"
): AutoScoreRuleConfig | undefined => {
  return ruleConfigs.find((r) => r.type === type)
}

export const validateQuery = (tree: any, config: Config): boolean => {
  try {
    return QbUtils.isValidTree(tree, config)
  } catch {
    return false
  }
}

export const exportQueryToJsonLogic = (tree: any, config: Config): string => {
  try {
    const result = QbUtils.jsonLogicFormat(tree, config)
    return JSON.stringify(result.logic, null, 2)
  } catch {
    return "{}"
  }
}
