import React, { useState, useCallback } from "react"
import { Card, Tabs, Button, Space, message, Form, Input, Select } from "antd"
import { useTranslation } from "react-i18next"
import type {
  Config,
  ImmutableTree,
  BuilderProps,
  JsonGroup,
} from "@react-awesome-query-builder/antd"
import { Utils as QbUtils, Query, Builder } from "@react-awesome-query-builder/antd"
import "@react-awesome-query-builder/antd/css/styles.css"
import { ruleConfigs, getRuleConfig, exportQueryToJsonLogic } from "./BuilderUtils"

interface RuleProps {
  onRuleSubmit?: (ruleData: {
    type: string
    name: string
    query: JsonGroup
    jsonLogic: string
    studentNames: string[]
  }) => void
}

export const Rule: React.FC<RuleProps> = ({ onRuleSubmit }) => {
  const { t } = useTranslation()
  const [messageApi, contextHolder] = message.useMessage()
  const [form] = Form.useForm()
  const [activeTab, setActiveTab] = useState<string>("interval_time")
  const [students, setStudents] = useState<{ id: number; name: string }[]>([])

  const [intervalTimeState, setIntervalTimeState] = useState(() => {
    const config = getRuleConfig("interval_time")
    return {
      tree: QbUtils.loadTree(config?.defaultQuery || { id: QbUtils.uuid(), type: "group" }),
      config: config?.config || ({} as Config),
    }
  })

  const [studentTagState, setStudentTagState] = useState(() => {
    const config = getRuleConfig("student_tag")
    return {
      tree: QbUtils.loadTree(config?.defaultQuery || { id: QbUtils.uuid(), type: "group" }),
      config: config?.config || ({} as Config),
    }
  })

  const fetchStudents = useCallback(async () => {
    if (!(window as any).api) return
    try {
      const res = await (window as any).api.queryStudents({})
      if (res.success) {
        setStudents(res.data)
      }
    } catch (error) {
      console.error("Failed to fetch students:", error)
    }
  }, [])

  React.useEffect(() => {
    fetchStudents()
  }, [fetchStudents])

  const handleIntervalTimeChange = useCallback((immutableTree: ImmutableTree, config: Config) => {
    setIntervalTimeState((prev) => ({ ...prev, tree: immutableTree, config }))
  }, [])

  const handleStudentTagChange = useCallback((immutableTree: ImmutableTree, config: Config) => {
    setStudentTagState((prev) => ({ ...prev, tree: immutableTree, config }))
  }, [])

  const renderBuilder = useCallback(
    (props: BuilderProps) => (
      <div className="query-builder-container" style={{ padding: "10px" }}>
        <div className="query-builder qb-lite">
          <Builder {...props} />
        </div>
      </div>
    ),
    []
  )

  const handleSubmit = async () => {
    const values = form.getFieldsValue(true)
    if (!values.name) {
      messageApi.warning(t("autoScore.nameRequired"))
      return
    }

    const ruleConfig = getRuleConfig(activeTab as "interval_time" | "student_tag")
    if (!ruleConfig) {
      messageApi.error(t("autoScore.ruleConfigNotFound"))
      return
    }

    const currentState = activeTab === "interval_time" ? intervalTimeState : studentTagState
    const jsonLogic = exportQueryToJsonLogic(currentState.tree, currentState.config)

    if (onRuleSubmit) {
      onRuleSubmit({
        type: activeTab,
        name: values.name,
        query: QbUtils.getTree(currentState.tree) as unknown as JsonGroup,
        jsonLogic,
        studentNames: values.studentNames || [],
      })
    }

    messageApi.success(t("autoScore.ruleSaved"))
  }

  const handleReset = () => {
    form.resetFields()
    const intervalConfig = getRuleConfig("interval_time")
    const tagConfig = getRuleConfig("student_tag")

    setIntervalTimeState({
      tree: QbUtils.loadTree(intervalConfig?.defaultQuery || { id: QbUtils.uuid(), type: "group" }),
      config: intervalConfig?.config || ({} as Config),
    })

    setStudentTagState({
      tree: QbUtils.loadTree(tagConfig?.defaultQuery || { id: QbUtils.uuid(), type: "group" }),
      config: tagConfig?.config || ({} as Config),
    })
  }

  const tabItems = [
    {
      key: "interval_time",
      label: t("autoScore.intervalTimeRule"),
      children: (
        <div>
          <p style={{ marginBottom: 16, color: "var(--ss-text-secondary)" }}>
            {ruleConfigs[0].description}
          </p>
          <Query
            {...intervalTimeState.config}
            value={intervalTimeState.tree}
            onChange={handleIntervalTimeChange}
            renderBuilder={renderBuilder}
          />
        </div>
      ),
    },
    {
      key: "student_tag",
      label: t("autoScore.studentTagRule"),
      children: (
        <div>
          <p style={{ marginBottom: 16, color: "var(--ss-text-secondary)" }}>
            {ruleConfigs[1].description}
          </p>
          <Query
            {...studentTagState.config}
            value={studentTagState.tree}
            onChange={handleStudentTagChange}
            renderBuilder={renderBuilder}
          />
        </div>
      ),
    },
  ]

  return (
    <div>
      {contextHolder}
      <Card style={{ marginBottom: 24, backgroundColor: "var(--ss-card-bg)" }}>
        <Form form={form} layout="vertical">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
            <Form.Item
              label={t("autoScore.ruleName")}
              name="name"
              rules={[{ required: true, message: t("autoScore.nameRequired") }]}
            >
              <Input placeholder={t("autoScore.ruleNamePlaceholder")} />
            </Form.Item>

            <Form.Item label={t("autoScore.applicableStudents")} name="studentNames">
              <Select
                mode="multiple"
                showSearch
                placeholder={t("autoScore.studentPlaceholder")}
                options={students.map((student) => ({ label: student.name, value: student.name }))}
              />
            </Form.Item>
          </div>
        </Form>
      </Card>

      <Card style={{ marginBottom: 24, backgroundColor: "var(--ss-card-bg)" }}>
        <Tabs activeKey={activeTab} onChange={setActiveTab} items={tabItems} />
      </Card>

      <Space>
        <Button type="primary" onClick={handleSubmit}>
          {t("autoScore.saveRule")}
        </Button>
        <Button onClick={handleReset}>{t("autoScore.resetForm")}</Button>
      </Space>
    </div>
  )
}

export default Rule
