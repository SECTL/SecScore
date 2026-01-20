import React, { useState, useEffect } from 'react'
import { Button, Tooltip } from 'tdesign-react'
import {
  HomeIcon,
  ViewListIcon,
  UserAddIcon,
  ChevronRightIcon,
  ChevronLeftIcon,
  SettingIcon,
  CodeIcon
} from 'tdesign-icons-react'

export const GlobalSidebar: React.FC = () => {
  const [expanded, setExpanded] = useState(false)
  const [showToggle, setShowToggle] = useState(true)
  const [zoom, setZoom] = useState(1.0)

  useEffect(() => {
    if (!(window as any).api) return

    // 加载初始缩放值
    const loadZoom = async () => {
      const res = await (window as any).api.getSetting('window_zoom')
      if (res.success && res.data) {
        setZoom(res.data)
      }
    }
    loadZoom()

    // 监听缩放变化
    const unsubscribe = (window as any).api.onSettingChanged((change: any) => {
      if (change?.key === 'window_zoom') {
        setZoom(change.value)
        // 缩放变化时，重新应用当前展开/收缩状态的窗口大小
        if ((window as any).api) {
          if (expanded) {
            const width = Math.round(84 * change.value)
            const height = Math.round(300 * change.value)
            ;(window as any).api.windowResize(width, height)
          } else {
            const width = Math.round(24 * change.value)
            const height = Math.round(300 * change.value)
            ;(window as any).api.windowResize(width, height)
          }
        }
      }
    })

    return () => {
      if (typeof unsubscribe === 'function') unsubscribe()
    }
  }, [expanded])

  const handleExpand = () => {
    // 1. 先隐藏三角
    setShowToggle(false)

    // 2. 稍后扩大窗口
    setTimeout(() => {
      if ((window as any).api) {
        const width = Math.round(60 * zoom)
        const height = Math.round(300 * zoom)
        ;(window as any).api.windowResize(width, height)
      }
      // 3. 最后显示侧边栏内容
      setTimeout(() => {
        setExpanded(true)
      }, 20)
    }, 100)
  }

  const handleCollapse = () => {
    // 1. 先隐藏侧边栏内容
    setExpanded(false)

    // 2. 稍后缩小窗口
    setTimeout(() => {
      if ((window as any).api) {
        const width = Math.round(24 * zoom)
        const height = Math.round(58 * zoom)
        ;(window as any).api.windowResize(width, height)
      }
      // 3. 最后重新显示三角（等待透明度动画完成）
      setTimeout(() => {
        setShowToggle(true)
      }, 150)
    }, 150)
  }

  const openMain = () => {
    if (!(window as any).api) return
    ;(window as any).api.openWindow({ key: 'main', route: '/' })
  }

  return (
    <div
      style={{
        height: '100vh',
        width: `84px`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-start',
        overflow: 'hidden',
        background: 'transparent'
      }}
    >
      {/* 日常展示的三角 */}
      <div
        onClick={handleExpand}
        className={`global-sidebar-toggle ${!showToggle ? 'hidden' : ''}`}
        style={{
          willChange: 'opacity, transform',
          width: `${!expanded ? '100vw' : '0px'}`,
          height: `100vh`
        }}
        hidden={!expanded}
      >
        <ChevronLeftIcon />
      </div>

      {/* 侧边栏内容 */}
      <div
        className={`sidebar-content-area ${expanded ? 'visible' : 'hidden'}`}
        style={{
          backgroundColor: 'var(--ss-bg-color)',
          height: 'fit-content',
          willChange: 'opacity, transform',
          width: `60px`,
          gap: `12px`
        }}
      >
        {/* 顶部的关闭/收起按钮 */}
        <Button
          shape="circle"
          variant="text"
          onClick={handleCollapse}
          style={{ marginBottom: '8px', color: 'var(--td-brand-color)' }}
        >
          <ChevronRightIcon size="20px" />
        </Button>

        <Tooltip content="主界面" placement="top">
          <Button shape="circle" variant="text" onClick={openMain}>
            <HomeIcon size="24px" />
          </Button>
        </Tooltip>

        <Tooltip content="积分操作" placement="top">
          <Button shape="circle" variant="text" onClick={() => openMain()}>
            <UserAddIcon size="24px" />
          </Button>
        </Tooltip>

        <Tooltip content="排行榜" placement="top">
          <Button
            shape="circle"
            variant="text"
            onClick={() => (window as any).api.openWindow({ key: 'main', route: '/leaderboard' })}
          >
            <ViewListIcon size="24px" />
          </Button>
        </Tooltip>

        <Tooltip content="设置" placement="top">
          <Button
            shape="circle"
            variant="text"
            onClick={() => (window as any).api.openWindow({ key: 'main', route: '/settings' })}
          >
            <SettingIcon size="24px" />
          </Button>
        </Tooltip>

        {import.meta.env.DEV && (
          <Tooltip content="开发者工具" placement="top">
            <Button
              shape="circle"
              variant="text"
              onClick={() => (window as any).api?.toggleDevTools()}
            >
              <CodeIcon size="24px" />
            </Button>
          </Tooltip>
        )}
      </div>
    </div>
  )
}
