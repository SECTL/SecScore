// iOS Safari 非独立模式下，引导用户“添加到主屏幕”。竖屏：底部抽屉，箭头指向底部中间；
// 横屏：右上角气泡，箭头指向右上角偏左。可勾选“不再提示”。
import { useEffect, useState } from "react"

const NEVER_KEY = "ssw_install_prompt_never"

const isIosSafari = () => {
  const ua = navigator.userAgent
  const iPadOs = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1
  const ios = /iPhone|iPad|iPod/.test(ua) || iPadOs
  if (!ios) return false
  // 排除 iOS 上的第三方浏览器与内嵌 WebView，它们的“添加到主屏幕”入口不同。
  return !/CriOS|FxiOS|EdgiOS|OPiOS|MicroMessenger|QQ\/|Weibo|DingTalk/.test(ua)
}

const isStandalone = () =>
  (navigator as any).standalone === true || window.matchMedia("(display-mode: standalone)").matches

const safeGet = (s: Storage, k: string) => {
  try {
    return s.getItem(k)
  } catch {
    return null
  }
}

const ShareIcon = ({ size = 20 }: { size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="#1677ff"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{ verticalAlign: "-4px", margin: "0 2px" }}
    aria-label="分享"
  >
    <path d="M12 15V3" />
    <path d="M8 7l4-4 4 4" />
    <path d="M7 10H6a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2h-1" />
  </svg>
)

const AddIcon = ({ size = 20 }: { size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="#1677ff"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{ verticalAlign: "-4px", margin: "0 2px" }}
    aria-label="添加到主屏幕"
  >
    <rect x="3" y="3" width="18" height="18" rx="4" />
    <path d="M12 8v8M8 12h8" />
  </svg>
)

const steps = [
  <>
    点击浏览器工具栏里的分享图标 <ShareIcon />
  </>,
  <>
    在菜单中向下滑动，选择“添加到主屏幕” <AddIcon />
  </>,
  <>点击右上角“添加”，之后从主屏幕打开即可全屏使用</>,
]

export function InstallPrompt(): React.JSX.Element | null {
  const [visible, setVisible] = useState(false)
  const [never, setNever] = useState(false)
  const [portrait, setPortrait] = useState(() => window.innerWidth < 440)

  useEffect(() => {
    if (!isIosSafari() || isStandalone()) return
    if (safeGet(localStorage, NEVER_KEY)) return
    const timer = window.setTimeout(() => setVisible(true), 1500)
    return () => window.clearTimeout(timer)
  }, [])

  useEffect(() => {
    // Safari 窗口窄到一定程度会切换为底部工具栏（iPhone 竖屏、iPad 窄窗口），按宽度判断。
    const onChange = () => setPortrait(window.innerWidth < 440)
    window.addEventListener("resize", onChange)
    return () => window.removeEventListener("resize", onChange)
  }, [])

  if (!visible) return null

  const close = () => {
    try {
      if (never) localStorage.setItem(NEVER_KEY, "1")
    } catch {
      /* 存储不可用时仅本次关闭 */
    }
    setVisible(false)
  }

  const arrowBase: React.CSSProperties = {
    position: "absolute",
    width: 16,
    height: 16,
    background: "#fff",
    transform: "rotate(45deg)",
  }

  // iPad Safari 的工具栏始终在顶部（含分屏/台前调度的窄窗口），一律按顶部布局；
  // iPhone 才按横竖屏区分。
  const bottomLayout = portrait

  const container: React.CSSProperties = bottomLayout
    ? {
        left: 12,
        right: 12,
        bottom: "calc(env(safe-area-inset-bottom) + 10px)",
        maxWidth: 460,
        margin: "0 auto",
      }
    : {
        top: "calc(env(safe-area-inset-top) + 10px)",
        right: 16,
        width: 340,
      }

  const arrow: React.CSSProperties = bottomLayout
    ? { ...arrowBase, bottom: -8, left: "calc(50% - 8px)", boxShadow: "3px 3px 6px rgba(0,0,0,0.08)" }
    : { ...arrowBase, top: -8, right: 96, boxShadow: "-3px -3px 6px rgba(0,0,0,0.06)" }

  return (
    <div
      role="dialog"
      aria-label="添加到主屏幕"
      style={{
        position: "fixed",
        zIndex: 2000,
        background: "#fff",
        color: "#1f2329",
        borderRadius: 16,
        padding: "16px 16px 12px",
        boxShadow: "0 8px 30px rgba(0,0,0,0.18)",
        fontSize: 14,
        lineHeight: 1.6,
        ...container,
      }}
    >
      <div style={arrow} />
      <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 8 }}>添加到主屏幕，像 App 一样使用</div>
      <ol style={{ margin: 0, padding: 0, listStyle: "none" }}>
        {steps.map((content, i) => (
          <li key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 6 }}>
            <span
              style={{
                flex: "none",
                width: 20,
                height: 20,
                marginTop: 2,
                borderRadius: "50%",
                background: "#1677ff",
                color: "#fff",
                fontSize: 12,
                textAlign: "center",
                lineHeight: "20px",
              }}
            >
              {i + 1}
            </span>
            <span>{content}</span>
          </li>
        ))}
      </ol>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 8 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 6, color: "#6b7280", fontSize: 13 }}>
          <input type="checkbox" checked={never} onChange={(e) => setNever(e.target.checked)} />
          不再提示
        </label>
        <button
          type="button"
          onClick={close}
          style={{
            border: 0,
            borderRadius: 999,
            background: "#1677ff",
            color: "#fff",
            padding: "6px 18px",
            fontSize: 14,
          }}
        >
          知道了
        </button>
      </div>
    </div>
  )
}
