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

  // 指针按下即输入，而不是等浏览器合成 click。
  // 触屏上 click 要等完整的按下+抬起才派发，快速连点时第二次点击容易在
  // React 重渲染/手势判定之间被吞掉（"点快了点不上"）；pointerdown 在手指
  // 落下的瞬间就触发，最"跟手"且不会丢键。preventDefault 顺带抑制合成 click
  // 与双击缩放等手势，避免重复输入。
  const onKeyPointerDown = (
    e: React.PointerEvent<HTMLButtonElement>,
    press: () => void,
  ) => {
    if (e.button !== 0) return // 只响应主键（左键/触屏）
    e.preventDefault()
    press()
  }

  // 保留键盘可达性：聚焦后用 回车/空格 也能触发（不依赖 click）
  const onKeyKeyDown = (
    e: React.KeyboardEvent<HTMLButtonElement>,
    press: () => void,
  ) => {
    if (e.key !== "Enter" && e.key !== " ") return
    e.preventDefault()
    press()
  }

  type KeyDef = {
    id: string
    label: string
    title?: string
    fn?: boolean
    disabled: boolean
    press: () => void
  }
  const keys: KeyDef[] = [
    ...Array.from({ length: 9 }, (_, i) => String(i + 1)).map((d) => ({
      id: `digit-${d}`,
      label: d,
      disabled: false,
      press: () => pressDigit(d),
    })),
    {
      id: "clear",
      label: "清空",
      title: "清空",
      fn: true,
      disabled: value.length === 0,
      press: pressClear,
    },
    {
      id: "digit-0",
      label: "0",
      disabled: false,
      press: () => pressDigit("0"),
    },
    {
      id: "back",
      label: "⌫",
      title: "退格",
      fn: true,
      disabled: value.length === 0,
      press: pressBackspace,
    },
  ]

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

      <div className="ss-pinpad-grid" onContextMenu={(e) => e.preventDefault()}>
        {keys.map((k) => (
          <button
            key={k.id}
            type="button"
            title={k.title}
            className={`ss-pinpad-key${k.fn ? " is-fn" : ""}`}
            disabled={disabled || k.disabled}
            onPointerDown={(e) => onKeyPointerDown(e, k.press)}
            onKeyDown={(e) => onKeyKeyDown(e, k.press)}
          >
            {k.label}
          </button>
        ))}
      </div>

      <style>{`
        .ss-pinpad {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 18px;
          user-select: none;
          -webkit-user-select: none;
          -webkit-touch-callout: none;
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
          touch-action: manipulation;
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
