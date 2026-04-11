import React from "react"
import { InputNumber } from "antd"
import type { WidgetProps } from "@react-awesome-query-builder/antd"
import { useTranslation } from "react-i18next"
import {
  getDefaultIntervalValue,
  parseIntervalTriggerValue,
  stringifyIntervalTriggerValue,
  type IntervalValue,
} from "./IntervalValueCodec"

export { parseIntervalTriggerValue, stringifyIntervalTriggerValue } from "./IntervalValueCodec"
export type { IntervalValue, IntervalUnit } from "./IntervalValueCodec"

const buildNextIntervalValue = (
  currentValue: IntervalValue | null,
  patch: Partial<IntervalValue>
): IntervalValue => {
  const base = currentValue ?? getDefaultIntervalValue()
  return {
    days: patch.days ?? base.days,
    hours: patch.hours ?? base.hours,
    minutes: patch.minutes ?? base.minutes,
  }
}

const getDisplayValue = (value: number | undefined, fallback = 0) =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback

export const IntervalValueWidget: React.FC<WidgetProps> = ({ value, setValue, readonly }) => {
  const { t } = useTranslation()
  const parsedValue = parseIntervalTriggerValue(value)

  const updateValue = (patch: Partial<IntervalValue>) => {
    const nextValue = buildNextIntervalValue(parsedValue, patch)
    const serialized = stringifyIntervalTriggerValue(nextValue)
    setValue(serialized)
  }

  return (
    <div style={{ display: "flex", gap: 12, minWidth: 360 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 96 }}>
        <span style={{ fontSize: 12, color: "var(--ss-text-secondary)" }}>
          {t("autoScore.intervalPartDay")}
        </span>
        <InputNumber
          min={0}
          precision={0}
          disabled={readonly}
          value={getDisplayValue(parsedValue?.days)}
          onChange={(next) => updateValue({ days: Math.max(0, Number(next ?? 0)) })}
          style={{ width: "100%" }}
        />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 96 }}>
        <span style={{ fontSize: 12, color: "var(--ss-text-secondary)" }}>
          {t("autoScore.intervalPartHour")}
        </span>
        <InputNumber
          min={0}
          precision={0}
          disabled={readonly}
          value={getDisplayValue(parsedValue?.hours)}
          onChange={(next) => updateValue({ hours: Math.max(0, Number(next ?? 0)) })}
          style={{ width: "100%" }}
        />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 96 }}>
        <span style={{ fontSize: 12, color: "var(--ss-text-secondary)" }}>
          {t("autoScore.intervalPartMinute")}
        </span>
        <InputNumber
          min={0}
          precision={0}
          disabled={readonly}
          value={getDisplayValue(parsedValue?.minutes)}
          onChange={(next) => updateValue({ minutes: Math.max(0, Number(next ?? 0)) })}
          style={{ width: "100%" }}
        />
      </div>
    </div>
  )
}

export default IntervalValueWidget
