export type IntervalUnit = "minute" | "day" | "month"

export interface IntervalValue {
  days: number
  hours: number
  minutes: number
}

interface LegacyIntervalValue {
  amount: number
  unit: IntervalUnit
}

const normalizeNonNegativeInteger = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) {
    const normalized = Math.floor(value)
    return normalized >= 0 ? normalized : null
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) {
      const normalized = Math.floor(parsed)
      return normalized >= 0 ? normalized : null
    }
  }

  return null
}

const normalizePositiveInteger = (value: unknown): number | null => {
  const normalized = normalizeNonNegativeInteger(value)
  if (normalized === null || normalized <= 0) return null
  return normalized
}

const isIntervalUnit = (value: unknown): value is IntervalUnit =>
  value === "minute" || value === "day" || value === "month"

export const getDefaultIntervalValue = (): IntervalValue => ({
  days: 1,
  hours: 0,
  minutes: 0,
})

const fromTotalMinutes = (totalMinutes: number): IntervalValue => {
  const normalized = Math.max(0, Math.floor(totalMinutes))
  const days = Math.floor(normalized / (24 * 60))
  const hours = Math.floor((normalized % (24 * 60)) / 60)
  const minutes = normalized % 60
  return { days, hours, minutes }
}

const toTotalMinutes = (value: IntervalValue): number =>
  value.days * 24 * 60 + value.hours * 60 + value.minutes

const normalizeCompositeValue = (value: Partial<IntervalValue>): IntervalValue | null => {
  const days = normalizeNonNegativeInteger(value.days) ?? 0
  const hours = normalizeNonNegativeInteger(value.hours) ?? 0
  const minutes = normalizeNonNegativeInteger(value.minutes) ?? 0

  const totalMinutes = days * 24 * 60 + hours * 60 + minutes
  if (totalMinutes <= 0) return null
  return fromTotalMinutes(totalMinutes)
}

const legacyToComposite = (value: Partial<LegacyIntervalValue>): IntervalValue | null => {
  const amount = normalizePositiveInteger(value.amount)
  if (!amount || !isIntervalUnit(value.unit)) return null

  if (value.unit === "minute") return fromTotalMinutes(amount)
  if (value.unit === "day") return fromTotalMinutes(amount * 24 * 60)

  // Legacy month values are approximated as 30 days in the editor.
  return fromTotalMinutes(amount * 30 * 24 * 60)
}

export const parseIntervalTriggerValue = (value: unknown): IntervalValue | null => {
  if (typeof value === "object" && value !== null) {
    const composite = normalizeCompositeValue(value as Partial<IntervalValue>)
    if (composite) return composite

    const legacy = legacyToComposite(value as Partial<LegacyIntervalValue>)
    if (legacy) return legacy
  }

  const text = value === null || value === undefined ? "" : String(value).trim()
  if (!text) return null

  const legacyMinutes = normalizePositiveInteger(text)
  if (legacyMinutes !== null && !text.startsWith("{")) {
    return fromTotalMinutes(legacyMinutes)
  }

  try {
    const parsed = JSON.parse(text) as Partial<IntervalValue & LegacyIntervalValue>
    const composite = normalizeCompositeValue(parsed)
    if (composite) return composite

    const legacy = legacyToComposite(parsed)
    if (legacy) return legacy
  } catch {
    void 0
  }

  return null
}

export const stringifyIntervalTriggerValue = (value: IntervalValue): string | null => {
  const normalized = normalizeCompositeValue(value)
  if (!normalized) return null

  const totalMinutes = toTotalMinutes(normalized)
  if (totalMinutes <= 0) return null

  return JSON.stringify({
    days: normalized.days,
    hours: normalized.hours,
    minutes: normalized.minutes,
  })
}
