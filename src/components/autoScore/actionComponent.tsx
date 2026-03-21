import { Space, Input, InputNumber, Select, Button } from "antd"
import { PlusOutlined, DeleteOutlined } from "@ant-design/icons"
import { useTranslation } from "react-i18next"

const SCORE_RANGE = { MIN: -999, MAX: 999 }

const ACTION_DEFINITIONS = [
  { eventName: "add_score", labelKey: "autoScore.actionAddScore" },
  { eventName: "add_tag", labelKey: "autoScore.actionAddTag" },
]

interface ActionItem {
  id: number
  eventName: string
  value?: string
  reason?: string
}

interface ActionComponentProps {
  actions: ActionItem[]
  onAdd: () => void
  onRemove: (id: number) => void
  onChange: (id: number, field: keyof ActionItem, value: string | number) => void
}

export const ActionComponent: React.FC<ActionComponentProps> = ({
  actions,
  onAdd,
  onRemove,
  onChange,
}) => {
  const { t } = useTranslation()

  const handleActionChange = (id: number, field: keyof ActionItem, value: string | number) => {
    onChange(id, field, value)
  }

  return (
    <div>
      <Space direction="vertical" style={{ width: "100%" }}>
        {actions.map((action) => (
          <div
            key={action.id}
            style={{
              padding: "12px",
              border: "1px solid #d9d9d9",
              borderRadius: "6px",
              backgroundColor: "var(--ss-card-bg)",
            }}
          >
            <Space style={{ width: "100%" }} wrap>
              <Select
                value={action.eventName}
                onChange={(value) => handleActionChange(action.id, "eventName", value)}
                style={{ width: 150 }}
                options={ACTION_DEFINITIONS.map((d) => ({
                  label: t(d.labelKey),
                  value: d.eventName,
                }))}
              />

              {action.eventName === "add_score" && (
                <InputNumber
                  value={action.value ? parseInt(action.value) : undefined}
                  onChange={(value) => handleActionChange(action.id, "value", String(value || 0))}
                  placeholder={t("autoScore.scorePlaceholder")}
                  min={SCORE_RANGE.MIN}
                  max={SCORE_RANGE.MAX}
                  style={{ width: 120 }}
                />
              )}

              {action.eventName === "add_tag" && (
                <Input
                  value={action.value}
                  onChange={(e) => handleActionChange(action.id, "value", e.target.value)}
                  placeholder={t("autoScore.tagNamePlaceholder")}
                  style={{ width: 200 }}
                />
              )}

              <Input
                value={action.reason}
                onChange={(e) => handleActionChange(action.id, "reason", e.target.value)}
                placeholder={t("autoScore.reasonPlaceholder")}
                style={{ flex: 1, minWidth: 200 }}
              />

              <Button
                type="text"
                danger
                icon={<DeleteOutlined />}
                onClick={() => onRemove(action.id)}
              />
            </Space>
          </div>
        ))}

        <Button type="dashed" icon={<PlusOutlined />} onClick={onAdd} block>
          {t("autoScore.addAction")}
        </Button>
      </Space>
    </div>
  )
}

export default ActionComponent
