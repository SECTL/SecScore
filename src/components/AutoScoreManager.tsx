import React, { useEffect, useMemo, useState } from "react"
import {
  Alert,
  Button,
  Card,
  Form,
  Input,
  Pagination,
  Popconfirm,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  message,
} from "antd"
import { type ImmutableTree } from "@react-awesome-query-builder/antd"
import type { ColumnsType } from "antd/es/table"
import { useTranslation } from "react-i18next"
import { fetchAllTags } from "./TagEditorDialog"
import { ActionEditor } from "./AutoScore/ActionEditor"
import { TriggerRuleBuilder } from "./AutoScore/TriggerRuleBuilder"
import {
  actionDraftsToPayload,
  actionsToDrafts,
  createDefaultActionDraft,
  createEmptyTriggerTree,
  createTriggerQueryConfig,
  hasUnsupportedTriggerLogic,
  normalizeActionDrafts,
  queryTreeToTriggers,
  triggersToQueryTree,
  type ActionDraft,
  type AutoScoreRule,
  type AutoScoreTagOption,
} from "./AutoScore/AutoScoreUtils"

interface StudentItem {
  id: number
  name: string
}

interface TagItem {
  id: number
  name: string
}

interface RuleFormValues {
  name?: string
  studentNames?: string[]
}

interface AutoScoreManagerProps {
  canEdit: boolean
}

function AutoScoreManager({ canEdit }: AutoScoreManagerProps): React.JSX.Element {
  const { t, i18n } = useTranslation()
  const [form] = Form.useForm<RuleFormValues>()
  const [messageApi, contextHolder] = message.useMessage()
  const [tags, setTags] = useState<TagItem[]>([])

  const tagOptions = useMemo<AutoScoreTagOption[]>(
    () =>
      tags.map((tag) => ({
        label: tag.name,
        value: tag.name,
      })),
    [tags]
  )

  const triggerConfig = useMemo(
    () => createTriggerQueryConfig(t, tagOptions),
    [i18n.resolvedLanguage, i18n.language, tagOptions]
  )
  const [triggerTree, setTriggerTree] = useState<ImmutableTree>(() =>
    createEmptyTriggerTree(triggerConfig)
  )
  const [actionDrafts, setActionDrafts] = useState<ActionDraft[]>([createDefaultActionDraft()])
  const [students, setStudents] = useState<StudentItem[]>([])
  const [rules, setRules] = useState<AutoScoreRule[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editingRuleId, setEditingRuleId] = useState<number | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  useEffect(() => {
    const maxPage = Math.max(1, Math.ceil(rules.length / pageSize))
    if (currentPage > maxPage) {
      setCurrentPage(maxPage)
    }
  }, [currentPage, pageSize, rules.length])

  const resetEditor = () => {
    setEditingRuleId(null)
    form.setFieldsValue({ name: "", studentNames: [] })
    setTriggerTree(createEmptyTriggerTree(triggerConfig))
    setActionDrafts([createDefaultActionDraft()])
  }

  const emitDataUpdated = () => {
    window.dispatchEvent(new CustomEvent("ss:data-updated", { detail: { category: "all" } }))
  }

  const fetchStudents = async () => {
    const api = (window as any).api
    if (!api || !canEdit) return

    try {
      const res = await api.queryStudents({})
      if (res.success && Array.isArray(res.data)) {
        setStudents(res.data)
      }
    } catch {
      void 0
    }
  }

  const fetchTags = async () => {
    if (!canEdit) return

    try {
      const tagList = await fetchAllTags()
      if (Array.isArray(tagList)) {
        setTags(tagList)
      }
    } catch {
      void 0
    }
  }

  const fetchRules = async () => {
    const api = (window as any).api
    if (!api || !canEdit) return

    setLoading(true)
    try {
      const res = await api.autoScoreGetRules()
      if (res.success && Array.isArray(res.data)) {
        setRules(res.data)
      } else {
        messageApi.error(res.message || t("autoScore.fetchFailed"))
      }
    } catch {
      messageApi.error(t("autoScore.fetchFailed"))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!canEdit) return
    fetchTags().catch(() => void 0)
    fetchStudents().catch(() => void 0)
    fetchRules().catch(() => void 0)
  }, [canEdit])

  const handleSubmit = async () => {
    const api = (window as any).api
    if (!api) return
    if (!canEdit) {
      messageApi.error(t("common.readOnly"))
      return
    }

    const values = await form.validateFields()
    const name = String(values.name || "").trim()
    const studentNames = Array.isArray(values.studentNames) ? values.studentNames : []

    if (!name) {
      messageApi.warning(t("autoScore.nameRequired"))
      return
    }

    if (hasUnsupportedTriggerLogic(triggerTree, triggerConfig)) {
      messageApi.warning(t("autoScore.unsupportedLogic"))
      return
    }

    const triggers = queryTreeToTriggers(triggerTree, triggerConfig)
    if (triggers.length === 0) {
      messageApi.warning(t("autoScore.triggerRequired"))
      return
    }

    const normalizedActionDrafts = normalizeActionDrafts(actionDrafts)
    const actionPayload = actionDraftsToPayload(normalizedActionDrafts)
    if (actionDrafts.length === 0) {
      setActionDrafts(normalizedActionDrafts)
    }
    if (actionPayload.error === "action_required") {
      messageApi.warning(t("autoScore.actionRequired"))
      return
    }
    if (actionPayload.error === "score_required") {
      messageApi.warning(t("autoScore.scorePlaceholder"))
      return
    }
    if (actionPayload.error === "tag_required") {
      messageApi.warning(t("autoScore.tagNamePlaceholder"))
      return
    }
    if (actionPayload.actions.length === 0) {
      messageApi.warning(t("autoScore.actionRequired"))
      return
    }

    setSaving(true)
    try {
      const payload = {
        name,
        enabled: true,
        studentNames,
        triggers,
        actions: actionPayload.actions,
      }
      const res =
        editingRuleId === null
          ? await api.autoScoreAddRule(payload)
          : await api.autoScoreUpdateRule({ ...payload, id: editingRuleId })

      if (res.success) {
        messageApi.success(
          editingRuleId === null ? t("autoScore.createSuccess") : t("autoScore.updateSuccess")
        )
        resetEditor()
        await fetchRules()
        emitDataUpdated()
      } else {
        messageApi.error(
          res.message ||
            (editingRuleId === null ? t("autoScore.createFailed") : t("autoScore.updateFailed"))
        )
      }
    } catch {
      messageApi.error(
        editingRuleId === null ? t("autoScore.createFailed") : t("autoScore.updateFailed")
      )
    } finally {
      setSaving(false)
    }
  }

  const handleEdit = (rule: AutoScoreRule) => {
    setEditingRuleId(rule.id)
    form.setFieldsValue({
      name: rule.name,
      studentNames: rule.studentNames || [],
    })
    setTriggerTree(triggersToQueryTree(triggerConfig, rule.triggers || []))
    setActionDrafts(actionsToDrafts(rule.actions || []))
  }

  const handleDelete = async (ruleId: number) => {
    const api = (window as any).api
    if (!api) return
    if (!canEdit) {
      messageApi.error(t("common.readOnly"))
      return
    }

    const res = await api.autoScoreDeleteRule(ruleId)
    if (res.success) {
      messageApi.success(t("autoScore.deleteSuccess"))
      if (editingRuleId === ruleId) {
        resetEditor()
      }
      await fetchRules()
      emitDataUpdated()
    } else {
      messageApi.error(res.message || t("autoScore.deleteFailed"))
    }
  }

  const handleToggle = async (ruleId: number, enabled: boolean) => {
    const api = (window as any).api
    if (!api) return
    if (!canEdit) {
      messageApi.error(t("common.readOnly"))
      return
    }

    const res = await api.autoScoreToggleRule({ ruleId, enabled })
    if (res.success) {
      setRules((prevRules) =>
        prevRules.map((rule) => (rule.id === ruleId ? { ...rule, enabled } : rule))
      )
      messageApi.success(enabled ? t("autoScore.enabled") : t("autoScore.disabled"))
      emitDataUpdated()
    } else {
      messageApi.error(
        res.message || (enabled ? t("autoScore.enableFailed") : t("autoScore.disableFailed"))
      )
    }
  }

  const formatLastExecuted = (value?: string | null) => {
    if (!value) return t("autoScore.notExecuted")
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return t("autoScore.invalidTime")
    return date.toLocaleString()
  }

  const columns: ColumnsType<AutoScoreRule> = [
    {
      title: t("autoScore.name"),
      dataIndex: "name",
      key: "name",
      ellipsis: true,
    },
    {
      title: t("autoScore.status"),
      key: "status",
      width: 96,
      render: (_, row) => (
        <Switch
          checked={row.enabled}
          disabled={!canEdit}
          onChange={(checked) => {
            handleToggle(row.id, checked).catch(() => void 0)
          }}
        />
      ),
    },
    {
      title: t("autoScore.applicableStudents"),
      key: "studentNames",
      width: 150,
      ellipsis: true,
      render: (_, row) =>
        row.studentNames.length > 0 ? (
          <Tag>{t("autoScore.studentCount", { count: row.studentNames.length })}</Tag>
        ) : (
          <Tag>{t("autoScore.allStudents")}</Tag>
        ),
    },
    {
      title: t("autoScore.triggers"),
      key: "triggers",
      width: 120,
      render: (_, row) => <Tag>{t("autoScore.triggerCount", { count: row.triggers.length })}</Tag>,
    },
    {
      title: t("autoScore.actions"),
      key: "actions",
      width: 120,
      render: (_, row) => <Tag>{t("autoScore.actionCount", { count: row.actions.length })}</Tag>,
    },
    {
      title: t("autoScore.lastExecuted"),
      dataIndex: "lastExecuted",
      key: "lastExecuted",
      width: 160,
      ellipsis: true,
      render: (value: string | null | undefined) => formatLastExecuted(value),
    },
    {
      title: t("common.operation"),
      key: "operation",
      width: 140,
      render: (_, row) => (
        <Space size={4}>
          <Button type="link" disabled={!canEdit} onClick={() => handleEdit(row)}>
            {t("common.edit")}
          </Button>
          <Popconfirm
            title={t("autoScore.deleteConfirm")}
            onConfirm={() => {
              handleDelete(row.id).catch(() => void 0)
            }}
          >
            <Button type="link" danger disabled={!canEdit}>
              {t("common.delete")}
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  const pagedRules = rules.slice((currentPage - 1) * pageSize, currentPage * pageSize)

  return (
    <div style={{ padding: "24px" }}>
      {contextHolder}
      <h2 style={{ marginBottom: "24px", color: "var(--ss-text-main)" }}>{t("autoScore.title")}</h2>

      {!canEdit && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: "16px" }}
          message={t("autoScore.adminRequired")}
        />
      )}

      <Card style={{ marginBottom: "24px", backgroundColor: "var(--ss-card-bg)" }}>
        <Form form={form} layout="vertical">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px" }}>
            <Form.Item
              label={t("autoScore.name")}
              name="name"
              rules={[{ required: true, message: t("autoScore.nameRequired") }]}
            >
              <Input placeholder={t("autoScore.namePlaceholder")} disabled={!canEdit} />
            </Form.Item>
            <Form.Item label={t("autoScore.applicableStudents")} name="studentNames">
              <Select
                mode="multiple"
                showSearch
                disabled={!canEdit}
                placeholder={t("autoScore.studentPlaceholder")}
                options={students.map((student) => ({
                  label: student.name,
                  value: student.name,
                }))}
              />
            </Form.Item>
          </div>
        </Form>
      </Card>

      <TriggerRuleBuilder
        config={triggerConfig}
        value={triggerTree}
        canEdit={canEdit}
        onChange={(nextTree) => setTriggerTree(nextTree)}
      />

      <ActionEditor
        value={actionDrafts}
        tagOptions={tagOptions}
        canEdit={canEdit}
        onChange={(nextDrafts) => setActionDrafts(normalizeActionDrafts(nextDrafts))}
      />

      <div style={{ marginBottom: "24px", display: "flex", gap: "12px" }}>
        <Button
          type="primary"
          loading={saving}
          disabled={!canEdit}
          onClick={() => handleSubmit().catch(() => void 0)}
        >
          {editingRuleId === null ? t("autoScore.addAutomation") : t("autoScore.updateAutomation")}
        </Button>
        <Button disabled={!canEdit || saving} onClick={resetEditor}>
          {editingRuleId === null ? t("autoScore.resetForm") : t("autoScore.cancelEdit")}
        </Button>
      </div>

      <Card style={{ marginBottom: "24px", backgroundColor: "var(--ss-card-bg)" }}>
        <Table
          rowKey="id"
          loading={loading}
          columns={columns}
          dataSource={pagedRules}
          pagination={false}
          tableLayout="fixed"
          scroll={{ x: 880 }}
          style={{ color: "var(--ss-text-main)" }}
        />
        <div style={{ marginTop: 16, textAlign: "right" }}>
          <Pagination
            current={currentPage}
            pageSize={pageSize}
            total={rules.length}
            showSizeChanger
            showTotal={(total) => t("common.total", { count: total })}
            onChange={(page, size) => {
              setCurrentPage(page)
              setPageSize(size)
            }}
          />
        </div>
      </Card>
    </div>
  )
}

export { AutoScoreManager }
export default AutoScoreManager
