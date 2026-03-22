import { formatQuery, QueryBuilder, RuleGroupType } from "react-querybuilder"
import { useState, useEffect } from "react"
import { useTranslation } from "react-i18next"
import { QueryBuilderDnD } from "@react-querybuilder/dnd"
import * as ReactDnD from "react-dnd"
import { QueryBuilderAntD } from "@react-querybuilder/antd"
import * as ReactDndHtml5Backend from "react-dnd-html5-backend"
import * as ReactDndTouchBackend from "react-dnd-touch-backend"
import {
  getFields,
  defaultQuery,
  autoScoreRuleToQuery,
  queryToAutoScoreRule,
  type AutoScoreRuleData,
} from "./ruleBuilderUtils"
import { Card } from "antd"

import "./ruleBuilderOverride.css"

interface RuleComponentProps {
  initialData?: AutoScoreRuleData
  onChange?: (data: AutoScoreRuleData) => void
}

export const RuleComponent: React.FC<RuleComponentProps> = ({ initialData, onChange }) => {
  const { t } = useTranslation()
  const [query, setQuery] = useState<RuleGroupType>(
    initialData ? autoScoreRuleToQuery(initialData) : defaultQuery
  )

  useEffect(() => {
    if (initialData) {
      setQuery(autoScoreRuleToQuery(initialData))
    }
  }, [initialData])

  const handleQueryChange = (newQuery: RuleGroupType) => {
    setQuery(newQuery)
    if (onChange) {
      const ruleData = queryToAutoScoreRule()
      onChange(ruleData)
    }
  }

  return (
    <div>
      <Card
        title={t("autoScore.triggerCondition")}
        style={{ marginBottom: "24px", backgroundColor: "var(--ss-card-bg)" }}
      >
        <QueryBuilderDnD dnd={{ ...ReactDnD, ...ReactDndHtml5Backend, ...ReactDndTouchBackend }}>
          <QueryBuilderAntD>
            <QueryBuilder fields={getFields(t)} query={query} onQueryChange={handleQueryChange} />
          </QueryBuilderAntD>
        </QueryBuilderDnD>
        <div style={{ marginTop: "8px" }}>
          <pre style={{ fontSize: "12px", color: "#999" }}>{formatQuery(query, "json")}</pre>
        </div>
      </Card>
    </div>
  )
}

export default RuleComponent
