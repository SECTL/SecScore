import React, { useEffect, useState } from "react"
import { MinusOutlined, PlusOutlined } from "@ant-design/icons"
import { toast } from "./data"

export function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <label className="ssm-field">
      <span className="ssm-field-label">
        {label}
        {hint && <span className="ssm-field-hint">{hint}</span>}
      </span>
      {children}
    </label>
  )
}

export function TextInput(
  props: React.InputHTMLAttributes<HTMLInputElement> & { onValue: (v: string) => void }
): React.JSX.Element {
  const { onValue, ...rest } = props
  return (
    <input
      className="ssm-input"
      autoComplete="off"
      enterKeyHint="done"
      {...rest}
      onChange={(e) => onValue(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur()
      }}
    />
  )
}

/** 已有选项的快捷选择（如小组、分类），点一下填入，再点取消。 */
export function ChoiceChips({
  options,
  value,
  onChange,
}: {
  options: string[]
  value: string
  onChange: (v: string) => void
}): React.JSX.Element | null {
  if (options.length === 0) return null
  return (
    <div className="ssm-choice-chips">
      {options.map((o) => (
        <button
          key={o}
          type="button"
          className={`ssm-choice${o === value ? " is-active" : ""}`}
          onClick={() => onChange(o === value ? "" : o)}
        >
          {o}
        </button>
      ))}
    </div>
  )
}

/** 分值步进器：大按钮便于触屏点按，中间可直接输入。 */
export function DeltaStepper({
  value,
  onChange,
}: {
  value: number
  onChange: (v: number) => void
}): React.JSX.Element {
  const [text, setText] = useState(String(value))
  useEffect(() => setText(String(value)), [value])
  const commit = (raw: string) => {
    const n = Math.trunc(Number(raw))
    if (Number.isFinite(n)) onChange(Math.max(-9999, Math.min(9999, n)))
    else setText(String(value))
  }
  return (
    <div className="ssm-stepper">
      <button type="button" aria-label="减少" onClick={() => onChange(value - 1)}>
        <MinusOutlined />
      </button>
      <input
        inputMode="numeric"
        className={`ssm-stepper-value${value < 0 ? " is-neg" : value > 0 ? " is-pos" : ""}`}
        value={text}
        onChange={(e) => setText(e.target.value.replace(/[^\d-]/g, ""))}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur()
        }}
      />
      <button type="button" aria-label="增加" onClick={() => onChange(value + 1)}>
        <PlusOutlined />
      </button>
    </div>
  )
}

/** 弹层底部的主/次操作按钮。 */
export function SheetActions({
  primary,
  primaryLabel,
  secondaryLabel = "取消",
  onSecondary,
  danger,
  busy,
  error,
}: {
  primary: () => void
  primaryLabel: string
  secondaryLabel?: string
  onSecondary: () => void
  danger?: boolean
  busy?: boolean
  error?: string | null
}): React.JSX.Element {
  return (
    <div className="ssm-sheet-actions">
      {error && <div className="ssm-form-error">{error}</div>}
      <div className="ssm-sheet-actions-row">
        <button type="button" className="ssm-btn" onClick={onSecondary} disabled={busy}>
          {secondaryLabel}
        </button>
        <button
          type="button"
          className={`ssm-btn ${danger ? "is-danger" : "is-primary"}`}
          onClick={primary}
          disabled={busy}
        >
          {busy ? "处理中…" : primaryLabel}
        </button>
      </div>
    </div>
  )
}

/** 提交编辑：失败时返回错误信息给表单显示，成功时提示并执行回调。 */
export function useSubmit(): {
  busy: boolean
  error: string | null
  setError: (e: string | null) => void
  run: (fn: () => Promise<string | null>, okText: string, onOk: () => void) => Promise<void>
} {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const run = async (fn: () => Promise<string | null>, okText: string, onOk: () => void) => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const err = await fn()
      if (err) {
        setError(err)
        return
      }
      toast(navigator.onLine ? okText : `${okText}，联网后自动同步`)
      onOk()
    } finally {
      setBusy(false)
    }
  }
  return { busy, error, setError, run }
}

export function Fab({ label, onClick }: { label: string; onClick: () => void }): React.JSX.Element {
  return (
    <button type="button" className="ssm-fab" onClick={onClick} aria-label={label}>
      <PlusOutlined />
      <span>{label}</span>
    </button>
  )
}
