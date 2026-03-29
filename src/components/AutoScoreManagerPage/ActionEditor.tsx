import React, { useMemo } from "react"
import { Button, Card, Input, InputNumber, Select, Space } from "antd"
import { DeleteOutlined, PlusOutlined } from "@ant-design/icons"
import { useTranslation } from "react-i18next"
import type { ActionDraft, ActionEvent } from "./AutoScoreUtils"
import { createDefaultActionDraft } from "./AutoScoreUtils"

interface ActionEditorProps {
  value: ActionDraft[]
  canEdit: boolean
  onChange: (nextDrafts: ActionDraft[]) => void
}

export const ActionEditor: React.FC<ActionEditorProps> = ({ value, canEdit, onChange }) => {
  const { t } = useTranslation()

  const actionOptions = useMemo(
    () => [
      { value: "add_score", label: t("autoScore.actionAddScore") },
      { value: "add_tag", label: t("autoScore.actionAddTag") },
    ],
    [t]
  )

  const updateAction = (id: string, patch: Partial<Omit<ActionDraft, "id">>) => {
    onChange(value.map((item) => (item.id === id ? { ...item, ...patch } : item)))
  }

  const handleAddAction = () => {
    onChange([...value, createDefaultActionDraft()])
  }

  const handleRemoveAction = (id: string) => {
    if (value.length <= 1) return
    onChange(value.filter((item) => item.id !== id))
  }

  return (
    <Card
      style={{ marginBottom: "24px", backgroundColor: "var(--ss-card-bg)" }}
      title={t("autoScore.triggeredActions")}
    >
      <Space direction="vertical" style={{ width: "100%" }} size={12}>
        {value.map((action) => (
          <div key={action.id} style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <Select
              style={{ minWidth: 180 }}
              value={action.event}
              disabled={!canEdit}
              options={actionOptions}
              onChange={(event: ActionEvent) =>
                updateAction(action.id, {
                  event,
                  value: event === "add_score" ? "1" : "",
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
            ) : (
              <Input
                style={{ minWidth: 220 }}
                placeholder={t("autoScore.tagNamePlaceholder")}
                value={action.value}
                disabled={!canEdit}
                onChange={(event) => updateAction(action.id, { value: event.target.value })}
              />
            )}
            <Button
              danger
              icon={<DeleteOutlined />}
              disabled={!canEdit || value.length <= 1}
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
