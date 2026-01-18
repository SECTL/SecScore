import { Button } from 'tdesign-react'
import { RemoveIcon, RectangleIcon, CloseIcon, FullscreenExitIcon } from 'tdesign-icons-react'
import { useEffect, useState } from 'react'

export function WindowControls(): React.JSX.Element {
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
