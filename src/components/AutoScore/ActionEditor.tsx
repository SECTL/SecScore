import React, { useEffect, useMemo } from "react"
import { Button, Card, InputNumber, Select, Space } from "antd"
import { DeleteOutlined, PlusOutlined } from "@ant-design/icons"
import { useTranslation } from "react-i18next"
import type {
  ActionDraft,
  ActionEvent,
  AutoScoreRewardOption,
  AutoScoreTagOption,
} from "./AutoScoreUtils"
import {
  createDefaultActionDraft,
  parseRewardActionValue,
  stringifyRewardActionValue,
} from "./AutoScoreUtils"

interface ActionEditorProps {
  value: ActionDraft[]
  tagOptions: AutoScoreTagOption[]
  rewardOptions: AutoScoreRewardOption[]
  canEdit: boolean
  onChange: (nextDrafts: ActionDraft[]) => void
}

export const ActionEditor: React.FC<ActionEditorProps> = ({
  value,
  tagOptions,
  rewardOptions,
  canEdit,
  onChange,
}) => {
  const { t } = useTranslation()
  const fallbackDraft = useMemo(() => createDefaultActionDraft(), [])
  const safeValue = value.length > 0 ? value : [fallbackDraft]

  useEffect(() => {
    if (value.length === 0) {
      onChange([fallbackDraft])
    }
  }, [fallbackDraft, onChange, value.length])

  const actionOptions = useMemo(
    () => [
      { value: "add_score", label: t("autoScore.actionAddScore") },
      { value: "add_tag", label: t("autoScore.actionAddTag") },
      { value: "settle_score", label: t("autoScore.actionSettleScore") },
      { value: "reward_exchange", label: t("rewardExchange.title") },
    ],
    [t]
  )

  const mergedTagOptions = useMemo(() => {
    const optionMap = new Map(tagOptions.map((option) => [option.value, option]))

    for (const action of safeValue) {
      if (action.event !== "add_tag") continue
      const tagValues = Array.isArray(action.value)
        ? action.value
        : action.value
          ? [action.value]
          : []

      for (const tagValue of tagValues) {
        if (!optionMap.has(tagValue)) {
          optionMap.set(tagValue, { label: tagValue, value: tagValue })
        }
      }
    }

    return Array.from(optionMap.values())
  }, [safeValue, tagOptions])

  const mergedRewardOptions = useMemo(() => {
    const optionMap = new Map(rewardOptions.map((option) => [option.value, option]))

    for (const action of safeValue) {
      if (action.event !== "reward_exchange") continue
      const rewardValue = parseRewardActionValue(action.value)
      if (!rewardValue) continue

      const optionValue = String(rewardValue.rewardId)
      if (!optionMap.has(optionValue)) {
        optionMap.set(optionValue, {
          label: rewardValue.rewardName || optionValue,
          value: optionValue,
        })
      }
    }

    return Array.from(optionMap.values())
  }, [rewardOptions, safeValue])

  const buildRewardDraftValue = (rewardId: string): string => {
    const rewardOption = mergedRewardOptions.find((option) => option.value === rewardId)
    return stringifyRewardActionValue(Number(rewardId), rewardOption?.label) || ""
  }

  const updateAction = (id: string, patch: Partial<Omit<ActionDraft, "id">>) => {
    onChange(safeValue.map((item) => (item.id === id ? { ...item, ...patch } : item)))
  }

  const handleAddAction = () => {
    onChange([...safeValue, createDefaultActionDraft()])
  }

  const handleRemoveAction = (id: string) => {
    if (safeValue.length <= 1) return
    onChange(safeValue.filter((item) => item.id !== id))
  }

  return (
    <Card
      style={{ marginBottom: "24px", backgroundColor: "var(--ss-card-bg)" }}
      title={t("autoScore.triggeredActions")}
    >
      <Space direction="vertical" style={{ width: "100%" }} size={12}>
        {safeValue.map((action) => (
          <div key={action.id} style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <Select
              style={{ minWidth: 180 }}
              value={action.event}
              disabled={!canEdit}
              options={actionOptions}
              onChange={(event: ActionEvent) =>
                updateAction(action.id, {
                  event,
                  value:
                    event === "add_score"
                      ? "1"
                      : event === "add_tag"
                        ? []
                        : event === "reward_exchange" && mergedRewardOptions.length > 0
                          ? buildRewardDraftValue(mergedRewardOptions[0].value)
                          : "",
                })
              }
            />
            {action.event === "add_score" ? (
              <InputNumber
                style={{ width: 180 }}
                placeholder={t("autoScore.scorePlaceholder")}
                value={action.value ? Number(action.value) : undefined}
                disabled={!canEdit}
                onChange={(nextValue) =>
                  updateAction(action.id, { value: nextValue === null ? "" : String(nextValue) })
                }
              />
            ) : action.event === "add_tag" ? (
              <Select
                mode="multiple"
                showSearch
                allowClear
                style={{ minWidth: 260 }}
                placeholder={t("autoScore.tagNamePlaceholder")}
                value={
                  Array.isArray(action.value) ? action.value : action.value ? [action.value] : []
                }
                disabled={!canEdit}
                options={mergedTagOptions}
                onChange={(nextValue) => updateAction(action.id, { value: nextValue })}
              />
            ) : action.event === "reward_exchange" ? (
              <Select
                showSearch
                style={{ minWidth: 260 }}
                placeholder={t("rewardExchange.rewards")}
                value={(() => {
                  const rewardValue = parseRewardActionValue(action.value)
                  return rewardValue ? String(rewardValue.rewardId) : undefined
                })()}
                disabled={!canEdit}
                optionFilterProp="label"
                options={mergedRewardOptions}
                onChange={(nextValue: string) =>
                  updateAction(action.id, { value: buildRewardDraftValue(nextValue) })
                }
              />
            ) : (
              <div style={{ minWidth: 260, color: "var(--ss-text-secondary)" }}>
                {t("autoScore.actionSettleScoreHint")}
              </div>
            )}
            <Button
              danger
              icon={<DeleteOutlined />}
              disabled={!canEdit || safeValue.length <= 1}
              onClick={() => handleRemoveAction(action.id)}
            />
          </div>
        ))}
        <Button
          type="dashed"
          icon={<PlusOutlined />}
          disabled={!canEdit}
          onClick={handleAddAction}
          style={{ fontWeight: "bolder", fontSize: 15 }}
        >
          {t("autoScore.addAction")}
        </Button>
      </Space>
    </Card>
  )
}
