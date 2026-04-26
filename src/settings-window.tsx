import "./assets/main.css"
import "./i18n"

import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { ConfigProvider, theme as antdTheme } from "antd"
import { Settings } from "./components/Settings"
import { ThemeProvider } from "./contexts/ThemeContext"
import { ServiceProvider } from "./contexts/ServiceContext"
import { ClientContext } from "./ClientContext"
import { api } from "./preload/types"

// 确保 API 可用
if (!(window as any).api) {
  ;(window as any).api = api
}

// 创建 ClientContext 实例
const clientContext = new ClientContext()
clientContext.initializeDI()

// 设置窗口应用
const SettingsWindowApp = () => {
  return (
    <ServiceProvider value={clientContext}>
      <ThemeProvider>
        <ConfigProvider
          theme={{
            algorithm: antdTheme.defaultAlgorithm,
          }}
        >
          <div style={{ height: "100vh", display: "flex", flexDirection: "column" }}>
            {/* 自定义标题栏 */}
            <div
              data-tauri-drag-region
              style={{
                height: "40px",
                background: "var(--ss-card-bg, #fff)",
                borderBottom: "1px solid var(--ss-border, #e8e8e8)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "0 16px",
                // @ts-ignore - Tauri specific property
                WebkitAppRegion: "drag",
                userSelect: "none",
                flexShrink: 0,
              }}
            >
              <div style={{ fontWeight: 500, color: "var(--ss-text-main, #000)" }}>
                SecScore 设置
              </div>
              <div
                style={{
                  display: "flex",
                  gap: "4px",
                  // @ts-ignore - Tauri specific property
                  WebkitAppRegion: "no-drag",
                }}
              >
                <button
                  onClick={async () => {
                    const api = (window as any).api
                    if (api?.windowMinimize) {
                      await api.windowMinimize()
                    }
                  }}
                  style={{
                    width: "32px",
                    height: "32px",
                    border: "none",
                    background: "transparent",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: "4px",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "var(--ss-hover-bg, #f5f5f5)"
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "transparent"
                  }}
                >
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                    <rect x="0" y="5" width="12" height="2" />
                  </svg>
                </button>
                <button
                  onClick={async () => {
                    const api = (window as any).api
                    if (api?.windowMaximize) {
                      await api.windowMaximize()
                    }
                  }}
                  style={{
                    width: "32px",
                    height: "32px",
                    border: "none",
                    background: "transparent",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: "4px",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "var(--ss-hover-bg, #f5f5f5)"
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "transparent"
                  }}
                >
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                    <rect
                      x="1"
                      y="1"
                      width="10"
                      height="10"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      fill="none"
                    />
                  </svg>
                </button>
                <button
                  onClick={async () => {
                    const api = (window as any).api
                    if (api?.closeSettingsWindow) {
                      await api.closeSettingsWindow()
                    }
                  }}
                  style={{
                    width: "32px",
                    height: "32px",
                    border: "none",
                    background: "transparent",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: "4px",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "#ff4d4f"
                    e.currentTarget.style.color = "#fff"
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "transparent"
                    e.currentTarget.style.color = "inherit"
                  }}
                >
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                    <path d="M1 1L11 11M1 11L11 1" stroke="currentColor" strokeWidth="1.5" />
                  </svg>
                </button>
              </div>
            </div>

            {/* 设置内容 */}
            <div style={{ flex: 1, overflow: "auto" }}>
              <Settings permission="admin" />
            </div>
          </div>
        </ConfigProvider>
      </ThemeProvider>
    </ServiceProvider>
  )
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <SettingsWindowApp />
  </StrictMode>
)
