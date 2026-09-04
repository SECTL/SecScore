import React from "react"

/**
 * 自绘九宫格数字键盘（无第三方依赖）。
 * 用于需要输入固定位数数字（如 6 位解锁密码）的弹窗/面板。
 *
 * 特性：
 * - 上方为 length 个"密码圆点"占位，随输入填充
 * - 下方为 3 列键盘：1-9、底部「清空 / 0 / ⌫」
 * - 输入满 length 位后自动触发 onFull（可用来自动提交）
 * - disabled 时整块禁用
 */
export function PinPad(props: {
  value: string
  onChange: (value: string) => void
  onFull?: (value: string) => void
  length?: number
  disabled?: boolean
}): React.JSX.Element {
  const { value, onChange, onFull, disabled = false } = props
  const length = props.length ?? 6

  const pressDigit = (digit: string) => {
    if (disabled) return
    if (value.length >= length) return
    // 只接受纯数字，并截断到 length 位
    if (!/^\d$/.test(digit)) return
    const next = (value + digit).slice(0, length)
    onChange(next)
    if (next.length === length) {
      onFull?.(next)
    }
  }

  const pressBackspace = () => {
    if (disabled) return
    onChange(value.slice(0, -1))
  }

  const pressClear = () => {
    if (disabled) return
    onChange("")
  }

  const digits = ["1", "2", "3", "4", "5", "6", "7", "8", "9"]

  return (
    <div className="ss-pinpad" aria-disabled={disabled}>
      <div className="ss-pinpad-dots">
        {Array.from({ length }, (_, i) => (
          <span
            key={i}
            className={`ss-pinpad-dot${i < value.length ? " is-filled" : ""}`}
            style={{ transitionDelay: `${i * 20}ms` }}
          />
        ))}
      </div>

      <div className="ss-pinpad-grid">
        {digits.map((d) => (
          <button
            key={d}
            type="button"
            className="ss-pinpad-key"
            disabled={disabled}
            onClick={() => pressDigit(d)}
          >
            {d}
          </button>
        ))}
        <button
          type="button"
          className="ss-pinpad-key is-fn"
          disabled={disabled || value.length === 0}
          onClick={pressClear}
          title="清空"
        >
          清空
        </button>
        <button
          type="button"
          className="ss-pinpad-key"
          disabled={disabled}
          onClick={() => pressDigit("0")}
        >
          0
        </button>
        <button
          type="button"
          className="ss-pinpad-key is-fn"
          disabled={disabled || value.length === 0}
          onClick={pressBackspace}
          title="退格"
        >
          ⌫
        </button>
      </div>

      <style>{`
        .ss-pinpad {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 18px;
          user-select: none;
        }
        .ss-pinpad[aria-disabled='true'] {
          opacity: 0.6;
          pointer-events: none;
        }
        .ss-pinpad-dots {
          display: flex;
          gap: 12px;
          padding: 6px 0;
        }
        .ss-pinpad-dot {
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: transparent;
          border: 2px solid var(--ss-border-color, #c8c9cc);
          box-sizing: border-box;
          transition: background-color 140ms ease, border-color 140ms ease, transform 140ms ease;
        }
        .ss-pinpad-dot.is-filled {
          background: var(--ant-color-primary, #1677ff);
          border-color: var(--ant-color-primary, #1677ff);
          transform: scale(1.05);
        }
        .ss-pinpad-grid {
          display: grid;
          grid-template-columns: repeat(3, 68px);
          gap: 14px;
          justify-content: center;
        }
        .ss-pinpad-key {
          width: 68px;
          height: 52px;
          border-radius: 14px;
          border: 1px solid var(--ss-border-color, #e0e0e0);
          background: var(--ss-card-bg, #ffffff);
          color: var(--ss-text-main, #000000);
          font-size: 20px;
          font-weight: 600;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: background-color 120ms ease, transform 80ms ease, box-shadow 120ms ease;
          -webkit-tap-highlight-color: transparent;
        }
        .ss-pinpad-key:hover:not(:disabled) {
          background: color-mix(in srgb, var(--ant-color-primary, #1677ff) 8%, var(--ss-card-bg, #ffffff));
        }
        .ss-pinpad-key:active:not(:disabled) {
          background: color-mix(in srgb, var(--ant-color-primary, #1677ff) 18%, var(--ss-card-bg, #ffffff));
          transform: scale(0.96);
        }
        .ss-pinpad-key:focus {
          outline: none;
        }
        .ss-pinpad-key:disabled {
          cursor: not-allowed;
          opacity: 0.35;
        }
        .ss-pinpad-key.is-fn {
          font-size: 16px;
          font-weight: 500;
          color: var(--ss-text-secondary, #666666);
        }
      `}</style>
    </div>
  )
}

export default PinPad
