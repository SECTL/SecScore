export type IntervalUnit = "minute" | "day" | "month"

export interface IntervalValue {
  amount: number
  unit: IntervalUnit
}

export const DEFAULT_INTERVAL_UNIT: IntervalUnit = "day"

const normalizePositiveInteger = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) {
    const normalized = Math.floor(value)
    return normalized > 0 ? normalized : null
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) {
      const normalized = Math.floor(parsed)
      return normalized > 0 ? normalized : null
    }
  }

  return null
}

const isIntervalUnit = (value: unknown): value is IntervalUnit =>
  value === "minute" || value === "day" || value === "month"

export const getDefaultIntervalValue = (): IntervalValue => ({
  amount: 1,
  unit: DEFAULT_INTERVAL_UNIT,
})

export const parseIntervalTriggerValue = (value: unknown): IntervalValue | null => {
  if (typeof value === "object" && value !== null) {
    const amount = normalizePositiveInteger((value as IntervalValue).amount)
    const unit = (value as IntervalValue).unit
    if (amount && isIntervalUnit(unit)) {
      return { amount, unit }
    }
  }

  const text = value === null || value === undefined ? "" : String(value).trim()
  if (!text) return null

  const legacyMinutes = normalizePositiveInteger(text)
  if (legacyMinutes !== null && !text.startsWith("{")) {
    return { amount: legacyMinutes, unit: "minute" }
  }

  try {
    const parsed = JSON.parse(text) as Partial<IntervalValue>
    const amount = normalizePositiveInteger(parsed.amount)
    if (amount && isIntervalUnit(parsed.unit)) {
      return { amount, unit: parsed.unit }
    }
  } catch {
    void 0
  }

  return null
}

export const stringifyIntervalTriggerValue = (value: IntervalValue): string | null => {
  const amount = normalizePositiveInteger(value.amount)
  if (!amount || !isIntervalUnit(value.unit)) {
    return null
  }

  if (value.unit === "minute") {
    return String(amount)
  }

  return JSON.stringify({
    amount,
    unit: value.unit,
  })
}
