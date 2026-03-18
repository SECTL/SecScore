import { Button } from "antd"
import {
  MinusOutlined,
  BorderOutlined,
  CloseOutlined,
  FullscreenExitOutlined,
  RotateRightOutlined,
} from "@ant-design/icons"
import { useEffect, useState } from "react"

interface WindowControlsProps {
  isPortraitMode: boolean
  onToggleOrientation: () => void
}

export function WindowControls({
  isPortraitMode,
  onToggleOrientation,
}: WindowControlsProps): React.JSX.Element {
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
        onClick={onToggleOrientation}
        title={isPortraitMode ? "切换到横屏模式" : "切换到竖屏模式"}
        style={{ width: "46px", height: "32px", borderRadius: 0 }}
      >
        <RotateRightOutlined />
      </Button>
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
          <FullscreenExitOutlined />
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
