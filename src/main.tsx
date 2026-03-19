import "./assets/main.css"
import "./i18n"

import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import App from "./App"
import { ClientContext } from "./ClientContext"
import { StudentService } from "./services/StudentService"
import { ServiceProvider } from "./contexts/ServiceContext"
import { api } from "./preload/types"

if (!(window as any).api) {
  ;(window as any).api = api
}

const ctx = new ClientContext()
new StudentService(ctx)

const safeWriteLog = (payload: {
  level: "debug" | "info" | "warn" | "error"
  message: string
  meta?: any
}) => {
  try {
    const api = (window as any).api
    if (!api?.writeLog) return
    Promise.resolve(api.writeLog(payload)).catch(() => void 0)
  } catch {
    return
  }
}

const patchConsole = () => {
  const c = window.console as any
  const set = (name: string, fn: (...args: any[]) => void) => {
    try {
      c[name] = fn
    } catch {
      void 0
    }
  }

  set("log", (...args: any[]) =>
    safeWriteLog({ level: "info", message: String(args[0] ?? ""), meta: args.slice(1) })
  )
  set("info", (...args: any[]) =>
    safeWriteLog({ level: "info", message: String(args[0] ?? ""), meta: args.slice(1) })
  )
  set("warn", (...args: any[]) =>
    safeWriteLog({ level: "warn", message: String(args[0] ?? ""), meta: args.slice(1) })
  )
  set("debug", (...args: any[]) =>
    safeWriteLog({ level: "debug", message: String(args[0] ?? ""), meta: args.slice(1) })
  )
  set("error", (...args: any[]) => {
    const first = args[0]
    if (first instanceof Error) {
      safeWriteLog({
        level: "error",
        message: first.message,
        meta: { stack: first.stack, args: args.slice(1) },
      })
      return
    }
    safeWriteLog({ level: "error", message: String(first ?? ""), meta: args.slice(1) })
  })
  set("trace", (...args: any[]) =>
    safeWriteLog({
      level: "debug",
      message: "console.trace",
      meta: { args, stack: new Error("console.trace").stack },
    })
  )
  set("table", (...args: any[]) =>
    safeWriteLog({ level: "info", message: "console.table", meta: args })
  )
}
patchConsole()

const syncAppViewportHeight = () => {
  const rootStyle = document.documentElement.style

  const applyHeight = () => {
    const viewportHeight = window.visualViewport?.height ?? window.innerHeight
    rootStyle.setProperty("--ss-app-height", `${Math.round(viewportHeight)}px`)
  }

  applyHeight()
  window.addEventListener("resize", applyHeight)
  window.addEventListener("orientationchange", applyHeight)
  window.visualViewport?.addEventListener("resize", applyHeight)
  window.visualViewport?.addEventListener("scroll", applyHeight)
}

syncAppViewportHeight()

const disableTouchZoom = () => {
  let lastTouchEnd = 0

  // iOS Safari/WebView 手势事件，直接阻止页面缩放
  for (const type of ["gesturestart", "gesturechange", "gestureend"]) {
    document.addEventListener(
      type,
      (event) => {
        event.preventDefault()
      },
      { passive: false }
    )
  }

  // 双指触摸移动时阻止缩放
  document.addEventListener(
    "touchmove",
    (event) => {
      if (event.touches.length > 1) {
        event.preventDefault()
      }
    },
    { passive: false }
  )

  // 连续快速双击时阻止浏览器放大
  document.addEventListener(
    "touchend",
    (event) => {
      const now = Date.now()
      if (now - lastTouchEnd <= 300) {
        event.preventDefault()
      }
      lastTouchEnd = now
    },
    { passive: false }
  )

  // 部分环境下双击会触发 dblclick，补充阻止
  document.addEventListener(
    "dblclick",
    (event) => {
      event.preventDefault()
    },
    { passive: false }
  )
}
disableTouchZoom()

const platform = navigator.userAgent.toLowerCase()
const isAppleTouchDevice = platform.includes("macintosh") && navigator.maxTouchPoints > 1
const isIos = /iphone|ipad|ipod/.test(platform) || isAppleTouchDevice
const isMacDesktop = platform.includes("mac") && !isIos

if (isMacDesktop) {
  document.documentElement.classList.add("platform-macos")
}

window.addEventListener("error", (e: any) => {
  const error = e?.error
  safeWriteLog({
    level: "error",
    message: "renderer:error",
    meta: {
      message: error?.message || e?.message,
      stack: error?.stack,
      filename: e?.filename,
      lineno: e?.lineno,
      colno: e?.colno,
    },
  })
})

window.addEventListener("unhandledrejection", (e: any) => {
  const reason = e?.reason
  safeWriteLog({
    level: "error",
    message: "renderer:unhandledrejection",
    meta: reason instanceof Error ? { message: reason.message, stack: reason.stack } : { reason },
  })
})

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ServiceProvider value={ctx}>
      <App />
    </ServiceProvider>
  </StrictMode>
)
