import React, { useMemo } from "react"
import { Card } from "antd"
import {
  Builder,
  Query,
  type BuilderProps,
  type Config,
  type ImmutableTree,
} from "@react-awesome-query-builder/antd"
import { useTranslation } from "react-i18next"
import "@react-awesome-query-builder/antd/css/styles.css"

interface TriggerRuleBuilderProps {
  config: Config
  value: ImmutableTree
  canEdit: boolean
  onChange: (nextTree: ImmutableTree, config: Config) => void
}

export const TriggerRuleBuilder: React.FC<TriggerRuleBuilderProps> = ({
  config,
  value,
  canEdit,
  onChange,
}) => {
  const { t } = useTranslation()

  const queryConfig = useMemo<Config>(() => {
    if (canEdit) return config
    return {
      ...config,
      settings: {
        ...config.settings,
        canReorder: false,
        canRegroup: false,
        immutableGroupsMode: true,
        immutableFieldsMode: true,
        immutableOpsMode: true,
        immutableValuesMode: true,
      },
    } as Config
  }, [config, canEdit])

  return (
    <Card
      style={{ marginBottom: "24px", backgroundColor: "var(--ss-card-bg)" }}
      title={t("autoScore.whenTriggered")}
    >
      <div
        className="query-builder-container"
        style={{
          overflowX: "auto",
          pointerEvents: canEdit ? "auto" : "none",
          opacity: canEdit ? 1 : 0.7,
        }}
      >
        <Query
          {...queryConfig}
          value={value}
          onChange={(immutableTree, config) => onChange(immutableTree, config)}
          renderBuilder={(props: BuilderProps) => (
            <div className="query-builder" style={{ minWidth: 680 }}>
              <Builder {...props} />
            </div>
          )}
        />
      </div>
    </Card>
  )
}
