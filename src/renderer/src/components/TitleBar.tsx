import { Button } from 'tdesign-react'
import { RemoveIcon, RectangleIcon, CloseIcon, FullscreenExitIcon } from 'tdesign-icons-react'
import { useEffect, useState } from 'react'
import electronLogo from '../assets/electron.svg'

interface TitleBarProps {
  children?: React.ReactNode
}

export function TitleBar({ children }: TitleBarProps): React.JSX.Element {
  const [isMaximized, setIsMaximized] = useState(false)

  useEffect(() => {
    if (!(window as any).api) return // Check initial state
    ;(window as any).api.windowIsMaximized().then((v: boolean) => setIsMaximized(v))

    // Subscribe to changes
    const cleanup = (window as any).api.onWindowMaximizedChanged((maximized: boolean) => {
      setIsMaximized(maximized)
    })
    return cleanup
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
          height: '32px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 0 0 16px',
          backgroundColor: 'var(--ss-header-bg, #ffffff)',
          borderBottom: '1px solid var(--ss-border-color, #e7e7e7)',
          WebkitAppRegion: 'drag',
          userSelect: 'none',
          zIndex: 1000,
          transition: 'background-color 0.3s, border-color 0.3s'
        } as React.CSSProperties
      }
    >
      <div
        style={{
          fontSize: '12px',
          fontWeight: 600,
          color: 'var(--ss-text-main, #000000)',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          flexShrink: 0
        }}
      >
        <img src={electronLogo} alt="logo" style={{ width: '16px', height: '16px' }} />
        <span>SecScore</span>
      </div>

      <div style={{ flex: 1 }} />

      <div
        style={
          {
            display: 'flex',
            alignItems: 'center',
            height: '100%',
            WebkitAppRegion: 'no-drag',
            paddingRight: '12px'
          } as React.CSSProperties
        }
      >
        {children}
      </div>

      <div
        style={
          {
            display: 'flex',
            alignItems: 'center',
            WebkitAppRegion: 'no-drag',
            height: '100%',
            flexShrink: 0
          } as React.CSSProperties
        }
      >
        <Button
          variant="text"
          shape="square"
          onClick={minimize}
          style={{ width: '46px', height: '32px', borderRadius: 0 }}
        >
          <RemoveIcon />
        </Button>
        <Button
          variant="text"
          shape="square"
          onClick={maximize}
          style={{ width: '46px', height: '32px', borderRadius: 0 }}
        >
          {isMaximized ? <FullscreenExitIcon /> : <RectangleIcon />}
        </Button>
        <Button
          variant="text"
          shape="square"
          onClick={close}
          className="titlebar-close-btn"
          style={{ width: '46px', height: '32px', borderRadius: 0 }}
        >
          <CloseIcon />
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
