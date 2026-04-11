import React, { useEffect, useMemo, useState } from "react"
import {
  Alert,
  Button,
  Card,
  DatePicker,
  Form,
  Input,
  InputNumber,
  Modal,
  Pagination,
  Popconfirm,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Tooltip,
  message,
} from "antd"
import { type ImmutableTree } from "@react-awesome-query-builder/antd"
import type { ColumnsType } from "antd/es/table"
import dayjs from "dayjs"
import { useTranslation } from "react-i18next"
import { fetchAllTags } from "./TagEditorDialog"
import { ActionEditor } from "./AutoScore/ActionEditor"
import { parseIntervalTriggerValue } from "./AutoScore/IntervalValueCodec"
import { TriggerRuleBuilder } from "./AutoScore/TriggerRuleBuilder"
import {
  actionDraftsToPayload,
  actionsToDrafts,
  createDefaultActionDraft,
  createEmptyTriggerTree,
  createTriggerQueryConfig,
  normalizeTriggerTree,
  queryTreeToJson,
  normalizeActionDrafts,
  queryTreeToTriggers,
  triggerTreeJsonToQueryTree,
  type ActionDraft,
  type AutoScoreExecutionBatch,
  type AutoScoreExecutionConfig,
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
  execution?: AutoScoreExecutionConfig
}

interface AutoScoreManagerProps {
  canEdit: boolean
}

const getRuleFileRelativePath = (ruleId: number) => `auto-score/rule-${ruleId}.json`
const AUTO_SCORE_BACKFILL_MAX_RUNS_PER_RULE = 500

interface BackfillPlanItem {
  ruleId: number
  runs: number
  ruleName: string
}

const buildOfflineBackfillPlan = (rules: AutoScoreRule[]): {
  items: BackfillPlanItem[]
  totalRuns: number
  from: dayjs.Dayjs | null
  to: dayjs.Dayjs
  truncatedRules: number
} => {
  const now = dayjs()
  const items: BackfillPlanItem[] = []
  let from: dayjs.Dayjs | null = null
  let truncatedRules = 0

  for (const rule of rules) {
    if (!rule.enabled) continue
    const intervalTrigger = rule.triggers.find((trigger) => trigger.event === "interval_time_passed")
    if (!intervalTrigger) continue

    const intervalValue = parseIntervalTriggerValue(intervalTrigger.value)
    if (!intervalValue) continue
    const intervalMinutes = intervalValue.days * 24 * 60 + intervalValue.hours * 60 + intervalValue.minutes
    if (intervalMinutes <= 0) continue

    const startAt = rule.execution?.startAt ? dayjs(rule.execution.startAt) : null
    const lastExecuted = rule.lastExecuted ? dayjs(rule.lastExecuted) : null
    const validStartAt = startAt && startAt.isValid() ? startAt : null
    const validLastExecuted = lastExecuted && lastExecuted.isValid() ? lastExecuted : null

    const baseTime =
      validStartAt && validLastExecuted
        ? validStartAt.isAfter(validLastExecuted)
          ? validStartAt
          : validLastExecuted
        : validStartAt || validLastExecuted

    if (!baseTime) continue
    if (!now.isAfter(baseTime)) continue

    const elapsedMinutes = now.diff(baseTime, "minute")
    if (elapsedMinutes < intervalMinutes) continue

    const rawRuns = Math.floor(elapsedMinutes / intervalMinutes)
    if (rawRuns <= 0) continue

    const runs = Math.min(rawRuns, AUTO_SCORE_BACKFILL_MAX_RUNS_PER_RULE)
    if (runs < rawRuns) {
      truncatedRules += 1
    }

    items.push({
      ruleId: rule.id,
      ruleName: rule.name,
      runs,
    })

    if (!from || baseTime.isBefore(from)) {
      from = baseTime
    }
  }

  return {
    items,
    totalRuns: items.reduce((sum, item) => sum + item.runs, 0),
    from,
    to: now,
    truncatedRules,
  }
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
  const [batches, setBatches] = useState<AutoScoreExecutionBatch[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [rollingBackBatchId, setRollingBackBatchId] = useState<string | null>(null)
  const [editingRuleId, setEditingRuleId] = useState<number | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [batchCurrentPage, setBatchCurrentPage] = useState(1)
  const [batchPageSize, setBatchPageSize] = useState(10)
  const [executionStartAt, setExecutionStartAt] = useState<string | null>(null)
  const [backfillPrompted, setBackfillPrompted] = useState(false)

  useEffect(() => {
    const maxPage = Math.max(1, Math.ceil(rules.length / pageSize))
    if (currentPage > maxPage) {
      setCurrentPage(maxPage)
    }
  }, [currentPage, pageSize, rules.length])

  useEffect(() => {
    const maxPage = Math.max(1, Math.ceil(batches.length / batchPageSize))
    if (batchCurrentPage > maxPage) {
      setBatchCurrentPage(maxPage)
    }
  }, [batchCurrentPage, batchPageSize, batches.length])

  useEffect(() => {
    setTriggerTree((prevTree) => normalizeTriggerTree(prevTree, triggerConfig))
  }, [triggerConfig])

  const intervalElapsedHint = useMemo(() => {
    if (!executionStartAt) {
      return t("autoScore.startAtHint")
    }

    const startAt = dayjs(executionStartAt)
    if (!startAt.isValid()) {
      return t("autoScore.startAtHint")
    }

    const intervalTrigger = queryTreeToTriggers(triggerTree, triggerConfig).find(
      (trigger) => trigger.event === "interval_time_passed"
    )
    if (!intervalTrigger) {
      return t("autoScore.startAtHint")
    }

    const intervalValue = parseIntervalTriggerValue(intervalTrigger.value)
    if (!intervalValue) {
      return t("autoScore.startAtHint")
    }

    const intervalMinutes = intervalValue.days * 24 * 60 + intervalValue.hours * 60 + intervalValue.minutes
    if (intervalMinutes <= 0) {
      return t("autoScore.startAtHint")
    }

    const now = dayjs()
    if (now.isBefore(startAt)) {
      return t("autoScore.startAtWaitHint", { minutes: startAt.diff(now, "minute") })
    }

    const elapsedMinutes = now.diff(startAt, "minute")
    const remainder = elapsedMinutes % intervalMinutes
    const remainMinutes =
      elapsedMinutes < intervalMinutes
        ? intervalMinutes - elapsedMinutes
        : remainder === 0
          ? 0
          : intervalMinutes - remainder
    return t("autoScore.startAtElapsedHint", {
      elapsed: elapsedMinutes,
      remain: remainMinutes,
    })
  }, [executionStartAt, t, triggerConfig, triggerTree])

  const resetEditor = () => {
    setEditingRuleId(null)
    form.setFieldsValue({ name: "", studentNames: [], execution: {} })
    setTriggerTree(createEmptyTriggerTree(triggerConfig))
    setActionDrafts([createDefaultActionDraft()])
    setExecutionStartAt(null)
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

  const fetchBatches = async () => {
    const api = (window as any).api
    if (!api || !canEdit) return
    try {
      const res = await api.autoScoreQueryBatches()
      if (res.success && Array.isArray(res.data)) {
        setBatches(res.data)
      }
    } catch {
      void 0
    }
  }

  useEffect(() => {
    if (!canEdit) return
    fetchTags().catch(() => void 0)
    fetchStudents().catch(() => void 0)
    fetchRules().catch(() => void 0)
    fetchBatches().catch(() => void 0)
  }, [canEdit])

  useEffect(() => {
    const api = (window as any).api
    if (!canEdit || !api || backfillPrompted || rules.length === 0) return

    const plan = buildOfflineBackfillPlan(rules)
    setBackfillPrompted(true)
    if (plan.items.length === 0 || plan.totalRuns <= 0) return

    const fromText = plan.from ? plan.from.format("YYYY-MM-DD HH:mm:ss") : "-"
    const toText = plan.to.format("YYYY-MM-DD HH:mm:ss")
    const previewLines = plan.items
      .slice(0, 5)
      .map((item) => t("autoScore.backfillPreviewLine", { name: item.ruleName, runs: item.runs }))
      .join("\n")

    Modal.confirm({
      title: t("autoScore.backfillConfirmTitle"),
      content: (
        <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.6 }}>
          {t("autoScore.backfillConfirmSummary", {
            from: fromText,
            to: toText,
            runs: plan.totalRuns,
            rules: plan.items.length,
          })}
          {previewLines ? `\n${previewLines}` : ""}
          {plan.items.length > 5
            ? `\n${t("autoScore.backfillPreviewMore", { count: plan.items.length - 5 })}`
            : ""}
          {plan.truncatedRules > 0
            ? `\n${t("autoScore.backfillPreviewTruncated", {
                count: plan.truncatedRules,
                max: AUTO_SCORE_BACKFILL_MAX_RUNS_PER_RULE,
              })}`
            : ""}
        </div>
      ),
      onOk: async () => {
        try {
          const res = await api.autoScoreApplyBackfill({
            items: plan.items.map((item) => ({ ruleId: item.ruleId, runs: item.runs })),
          })
          if (!res?.success) {
            messageApi.error(res?.message || t("autoScore.backfillApplyFailed"))
            return
          }

          const result = res.data
          messageApi.success(
            t("autoScore.backfillApplySuccess", {
              runs: result?.appliedRuns ?? 0,
              events: result?.createdEvents ?? 0,
            })
          )
          await fetchRules()
          await fetchBatches()
          emitDataUpdated()
        } catch {
          messageApi.error(t("autoScore.backfillApplyFailed"))
        }
      },
    })
  }, [backfillPrompted, canEdit, messageApi, rules, t])

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
    const executionFromForm = values.execution || {}
    const execution: AutoScoreExecutionConfig = {
      ...executionFromForm,
      startAt:
        executionStartAt && dayjs(executionStartAt).isValid()
          ? dayjs(executionStartAt).toISOString()
          : null,
    }

    if (!name) {
      messageApi.warning(t("autoScore.nameRequired"))
      return
    }

    const triggers = queryTreeToTriggers(triggerTree, triggerConfig)
    const triggerTreeJson = queryTreeToJson(triggerTree, triggerConfig)
    if (triggers.length === 0) {
      messageApi.warning(t("autoScore.triggerRequired"))
      return
    }
    if (!triggers.some((trigger) => trigger.event === "interval_time_passed")) {
      messageApi.warning(t("autoScore.intervalTriggerRequired"))
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
        triggerTree: triggerTreeJson,
        actions: actionPayload.actions,
        execution,
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
        await fetchBatches()
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
    const { startAt, ...executionWithoutStartAt } = rule.execution || {}
    setEditingRuleId(rule.id)
    form.setFieldsValue({
      name: rule.name,
      studentNames: rule.studentNames || [],
      execution: executionWithoutStartAt,
    })
    setExecutionStartAt(startAt ?? null)
    setTriggerTree(triggerTreeJsonToQueryTree(triggerConfig, rule.triggerTree, rule.triggers || []))
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
      await api.fsDeleteFile(getRuleFileRelativePath(ruleId), "automatic").catch(() => void 0)
      messageApi.success(t("autoScore.deleteSuccess"))
      if (editingRuleId === ruleId) {
        resetEditor()
      }
      await fetchRules()
      await fetchBatches()
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

  const handleOpenRuleFile = async (rule: AutoScoreRule) => {
    const api = (window as any).api
    if (!api) return

    try {
      const relativePath = getRuleFileRelativePath(rule.id)
      const fileContent = {
        id: rule.id,
        name: rule.name,
        enabled: rule.enabled,
        studentNames: rule.studentNames,
        triggers: rule.triggers,
        triggerTree: rule.triggerTree ?? null,
        actions: rule.actions,
        execution: rule.execution || {},
        lastExecuted: rule.lastExecuted ?? null,
        exportedAt: new Date().toISOString(),
      }

      const writeRes = await api.fsWriteJson(relativePath, fileContent, "automatic")

      if (!writeRes?.success) {
        throw new Error("prepare rule file failed")
      }

      const openRes = await api.fsOpenPath(relativePath, "automatic")
      if (!openRes?.success) {
        throw new Error(openRes?.message || "open rule file failed")
      }
    } catch {
      messageApi.error(t("autoScore.openFileFailed"))
    }
  }

  const formatLastExecuted = (value?: string | null) => {
    if (!value) return t("autoScore.notExecuted")
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return t("autoScore.invalidTime")
    return date.toLocaleString()
  }

  const formatTriggerSummary = (trigger: AutoScoreRule["triggers"][number]) => {
    if (trigger.event === "interval_time_passed") {
      const intervalValue = parseIntervalTriggerValue(trigger.value)
      if (!intervalValue) {
        return `${t("autoScore.triggerIntervalTime")}: -`
      }
      return `${t("autoScore.triggerIntervalTime")}: ${intervalValue.days}${t(
        "autoScore.intervalPartDay"
      )} ${intervalValue.hours}${t("autoScore.intervalPartHour")} ${intervalValue.minutes}${t(
        "autoScore.intervalPartMinute"
      )}`
    }
    if (trigger.event === "student_has_tag") {
      return `${t("autoScore.triggerStudentTag")}: ${String(trigger.value || "").trim() || "-"}`
    }
    if (
      trigger.event === "query_sql" ||
      trigger.event === "student_query_sql" ||
      trigger.event === "student_sql"
    ) {
      return `${t("autoScore.triggerStudentSql")}: ${String(trigger.value || "").trim() || "-"}`
    }
    return `${trigger.event}: ${String(trigger.value || "").trim() || "-"}`
  }

  const formatActionSummary = (action: AutoScoreRule["actions"][number]) => {
    if (action.event === "add_score") {
      return `${t("autoScore.actionAddScore")}: ${String(action.value || "").trim() || "-"}`
    }
    if (action.event === "add_tag") {
      return `${t("autoScore.actionAddTag")}: ${String(action.value || "").trim() || "-"}`
    }
    if (action.event === "settle_score") {
      return `${t("autoScore.actionSettleScore")}: ${t("autoScore.actionSettleScoreHint")}`
    }
    return `${action.event}: ${String(action.value || "").trim() || "-"}`
  }

  const handleRollbackBatch = async (batchId: string) => {
    const api = (window as any).api
    if (!api || !canEdit) return
    Modal.confirm({
      title: t("autoScore.batchRollbackConfirm"),
      onOk: async () => {
        setRollingBackBatchId(batchId)
        try {
          const res = await api.autoScoreRollbackBatch({ batchId })
          if (res.success) {
            messageApi.success(t("autoScore.batchRollbackSuccess"))
            await fetchBatches()
            emitDataUpdated()
          } else {
            messageApi.error(res.message || t("autoScore.batchRollbackFailed"))
          }
        } catch {
          messageApi.error(t("autoScore.batchRollbackFailed"))
        } finally {
          setRollingBackBatchId(null)
        }
      }
    })
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
          <Tooltip title={row.studentNames.join("、")}>
            <Tag>{t("autoScore.studentCount", { count: row.studentNames.length })}</Tag>
          </Tooltip>
        ) : (
          <Tag>{t("autoScore.allStudents")}</Tag>
        ),
    },
    {
      title: t("autoScore.triggers"),
      key: "triggers",
      width: 120,
      render: (_, row) => (
        <Tooltip title={row.triggers.map(formatTriggerSummary).join("\n") || "-"}>
          <Tag>{t("autoScore.triggerCount", { count: row.triggers.length })}</Tag>
        </Tooltip>
      ),
    },
    {
      title: t("autoScore.actions"),
      key: "actions",
      width: 120,
      render: (_, row) => (
        <Tooltip title={row.actions.map(formatActionSummary).join("\n") || "-"}>
          <Tag>{t("autoScore.actionCount", { count: row.actions.length })}</Tag>
        </Tooltip>
      ),
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
      width: 220,
      render: (_, row) => (
        <Space size={4}>
          <Button type="link" disabled={!canEdit} onClick={() => handleEdit(row)}>
            {t("common.edit")}
          </Button>
          <Button type="link" onClick={() => handleOpenRuleFile(row).catch(() => void 0)}>
            {t("autoScore.openFile")}
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

  const batchColumns: ColumnsType<AutoScoreExecutionBatch> = [
    {
      title: t("autoScore.batchId"),
      dataIndex: "id",
      key: "id",
      ellipsis: true,
      width: 220,
      render: (value: string) => value.slice(0, 8),
    },
    {
      title: t("autoScore.name"),
      dataIndex: "ruleName",
      key: "ruleName",
      ellipsis: true,
    },
    {
      title: t("autoScore.lastExecuted"),
      dataIndex: "runAt",
      key: "runAt",
      width: 180,
      render: (value: string) => formatLastExecuted(value),
    },
    {
      title: t("autoScore.applicableStudents"),
      dataIndex: "affectedStudents",
      key: "affectedStudents",
      width: 100,
      render: (value: number) => value,
    },
    {
      title: t("autoScore.actionAddScore"),
      dataIndex: "scoreDeltaTotal",
      key: "scoreDeltaTotal",
      width: 120,
      render: (value: number) => value,
    },
    {
      title: t("common.operation"),
      key: "operation",
      width: 180,
      render: (_, row) =>
        row.rolledBack ? (
          <Tag>{t("autoScore.batchRolledBack")}</Tag>
        ) : (
          <Button
            danger
            size="small"
            loading={rollingBackBatchId === row.id}
            disabled={row.settled || !canEdit}
            onClick={() => handleRollbackBatch(row.id).catch(() => void 0)}
          >
            {t("autoScore.batchRollback")}
          </Button>
        ),
    },
  ]

  const pagedRules = rules.slice((currentPage - 1) * pageSize, currentPage * pageSize)
  const pagedBatches = batches.slice(
    (batchCurrentPage - 1) * batchPageSize,
    batchCurrentPage * batchPageSize
  )

  return (
    <div style={{ padding: "24px" }}>
      {contextHolder}
      <h2 style={{ marginBottom: "24px", color: "var(--ss-text-main)" }}>{t("autoScore.title")}</h2>

      {!canEdit && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: "16px" }}
          title={t("autoScore.adminRequired")}
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
              <Input placeholder={t("autoScore.namePlaceholder")} disabled={!canEdit} autoComplete="off"/>
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

          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "12px" }}>
            <Form.Item label={t("autoScore.cooldownMinutes")} name={["execution", "cooldownMinutes"]}>
              <InputNumber min={1} style={{ width: "100%" }} disabled={!canEdit} />
            </Form.Item>
            <Form.Item label={t("autoScore.maxRunsPerDay")} name={["execution", "maxRunsPerDay"]}>
              <InputNumber min={1} style={{ width: "100%" }} disabled={!canEdit} />
            </Form.Item>
            <Form.Item
              label={t("autoScore.maxScoreDeltaPerDay")}
              name={["execution", "maxScoreDeltaPerDay"]}
            >
              <InputNumber min={1} style={{ width: "100%" }} disabled={!canEdit} />
            </Form.Item>
            <Form.Item label={t("autoScore.startAt")} extra={intervalElapsedHint}>
              <DatePicker
                showTime
                allowClear
                format="YYYY-MM-DD HH:mm:ss"
                placeholder={t("autoScore.startAtPlaceholder")}
                disabled={!canEdit}
                style={{ width: "100%" }}
                value={
                  executionStartAt && dayjs(executionStartAt).isValid()
                    ? dayjs(executionStartAt)
                    : null
                }
                onChange={(value) => {
                  setExecutionStartAt(value ? value.toISOString() : null)
                }}
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

      <Card
        title={t("autoScore.batchLogs")}
        style={{ marginBottom: "24px", backgroundColor: "var(--ss-card-bg)" }}
      >
        <Table
          rowKey="id"
          columns={batchColumns}
          dataSource={pagedBatches}
          pagination={false}
          tableLayout="fixed"
          scroll={{ x: 860 }}
        />
        <div style={{ marginTop: 16, textAlign: "right" }}>
          <Pagination
            current={batchCurrentPage}
            pageSize={batchPageSize}
            total={batches.length}
            showSizeChanger
            showTotal={(total) => t("common.total", { count: total })}
            onChange={(page, size) => {
              setBatchCurrentPage(page)
              setBatchPageSize(size)
            }}
          />
        </div>
      </Card>
    </div>
  )
}

export { AutoScoreManager }
export default AutoScoreManager
