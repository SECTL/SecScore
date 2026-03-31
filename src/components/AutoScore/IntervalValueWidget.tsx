import React, { useMemo } from "react"
import { InputNumber, Select } from "antd"
import type { WidgetProps } from "@react-awesome-query-builder/antd"
import { useTranslation } from "react-i18next"

export type IntervalUnit = "month" | "day" | "minute"

export interface IntervalValue {
  amount: number
  unit: IntervalUnit
}

export const DEFAULT_INTERVAL_UNIT: IntervalUnit = "day"

export const getDefaultIntervalValue = (): IntervalValue => ({
  amount: 1,
  unit: DEFAULT_INTERVAL_UNIT,
})

export const parseIntervalTriggerValue = (value: unknown): IntervalValue | null => {
  if (value === null || value === undefined) return null

  const str = String(value).trim()
  if (!str) return null

  try {
    const parsed = JSON.parse(str)
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      typeof parsed.amount === "number" &&
      typeof parsed.unit === "string"
    ) {
      const validUnits: IntervalUnit[] = ["month", "day", "minute"]
      if (validUnits.includes(parsed.unit as IntervalUnit)) {
        return {
          amount: Math.max(1, Math.floor(parsed.amount)),
          unit: parsed.unit as IntervalUnit,
        }
      }
    }
  } catch {
    void 0
  }

  return null
}

export const stringifyIntervalTriggerValue = (value: IntervalValue): string => {
  return JSON.stringify({
    amount: value.amount,
    unit: value.unit,
  })
}

export const IntervalValueWidget: React.FC<WidgetProps> = ({
  value,
  setValue,
  readonly,
  placeholder,
}) => {
  const { t } = useTranslation()
  const parsedValue = parseIntervalTriggerValue(value)

  const unitOptions = useMemo(
    () => [
      { label: t("autoScore.intervalUnitMonth"), value: "month" },
      { label: t("autoScore.intervalUnitDay"), value: "day" },
      { label: t("autoScore.intervalUnitMinute"), value: "minute" },
    ],
    [t]
  )

  const handleAmountChange = (nextAmount: number | null) => {
    if (nextAmount === null) {
      setValue(null)
      return
    }

    const serializedValue = stringifyIntervalTriggerValue({
      amount: nextAmount,
      unit: parsedValue?.unit ?? DEFAULT_INTERVAL_UNIT,
    })
    setValue(serializedValue)
  }

  const handleUnitChange = (nextUnit: IntervalUnit) => {
    const baseValue = parsedValue ?? getDefaultIntervalValue()
    const serializedValue = stringifyIntervalTriggerValue({
      amount: baseValue.amount,
      unit: nextUnit,
    })
    setValue(serializedValue)
  }

  return (
    <div style={{ display: "flex", gap: 8, minWidth: 280 }}>
      <InputNumber
        min={1}
        precision={0}
        disabled={readonly}
        value={parsedValue?.amount}
        placeholder={placeholder || t("autoScore.intervalAmountPlaceholder")}
        onChange={handleAmountChange}
        style={{ width: 130 }}
      />
      <Select
        disabled={readonly}
        value={parsedValue?.unit ?? DEFAULT_INTERVAL_UNIT}
        options={unitOptions}
        onChange={handleUnitChange}
        style={{ width: 140 }}
      />
    </div>
  )
}

export default IntervalValueWidget
