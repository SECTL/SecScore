import { Button } from "antd"
import {
  MinusOutlined,
  BorderOutlined,
  CloseOutlined,
  FullscreenExitOutlined,
} from "@ant-design/icons"
import { useEffect, useState } from "react"
import electronLogo from "../assets/electron.svg"

interface TitleBarProps {
  children?: React.ReactNode
}

export function TitleBar({ children }: TitleBarProps): React.JSX.Element {
  const [isMaximized, setIsMaximized] = useState(false)

  useEffect(() => {
    const api = (window as any).api
    if (!api) return

    let disposed = false
    let unlisten: (() => void) | null = null

    api
      .windowIsMaximized()
      .then((v: boolean) => setIsMaximized(v))
      .catch(() => void 0)

    api
      .onWindowMaximizedChanged((maximized: boolean) => {
        setIsMaximized(maximized)
      })
      .then((fn: () => void) => {
        if (disposed) {
          fn()
          return
        }
        unlisten = fn
      })
      .catch(() => void 0)

    return () => {
      disposed = true
      if (unlisten) unlisten()
    }
  }, [])

  const minimize = () => {
    ;(window as any).api?.windowMinimize()
  }

  const maximize = async () => {
    if (!(window as any).api) return
    const newState = await (window as any).api.windowMaximize()
    setIsMaximized(newState)
  }

  const close = () => {
    ;(window as any).api?.windowClose()
  }

  return (
    <div
      style={
        {
          height: "32px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 0 0 16px",
          backgroundColor: "var(--ss-header-bg, #ffffff)",
          borderBottom: "1px solid var(--ss-border-color, #e7e7e7)",
          WebkitAppRegion: "drag",
          userSelect: "none",
          zIndex: 1000,
          transition: "background-color 0.3s, border-color 0.3s",
        } as React.CSSProperties
      }
    >
      <div
        style={{
          fontSize: "12px",
          fontWeight: 600,
          color: "var(--ss-text-main, #000000)",
          display: "flex",
          alignItems: "center",
          gap: "8px",
          flexShrink: 0,
        }}
      >
        <img src={electronLogo} alt="logo" style={{ width: "16px", height: "16px" }} />
        <span>SecScore</span>
      </div>

      <div style={{ flex: 1 }} />

      <div
        style={
          {
            display: "flex",
            alignItems: "center",
            height: "100%",
            WebkitAppRegion: "no-drag",
            paddingRight: "12px",
          } as React.CSSProperties
        }
      >
        {children}
      </div>

      <div
        style={
          {
            display: "flex",
            alignItems: "center",
            WebkitAppRegion: "no-drag",
            height: "100%",
            flexShrink: 0,
          } as React.CSSProperties
        }
      >
        <Button
          type="text"
          onClick={minimize}
          style={{ width: "46px", height: "32px", borderRadius: 0 }}
        >
          <MinusOutlined />
        </Button>
        <Button
          type="text"
          onClick={maximize}
          style={{ width: "46px", height: "32px", borderRadius: 0 }}
        >
          {isMaximized ? (
            <FullscreenExitOutlined style={{ transform: "scale(0.8)" }} />
          ) : (
            <BorderOutlined style={{ transform: "scale(0.8)" }} />
          )}
        </Button>
        <Button
          type="text"
          onClick={close}
          className="titlebar-close-btn"
          style={{ width: "46px", height: "32px", borderRadius: 0 }}
        >
          <CloseOutlined />
        </Button>
      </div>

      <style>
        {`
          .titlebar-close-btn:hover {
            background-color: #e34d59 !important;
            color: white !important;
          }
        `}
      </style>
    </div>
  )
}
