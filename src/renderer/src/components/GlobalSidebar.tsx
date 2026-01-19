import React, { useState } from 'react'
import { Button, Tooltip } from 'tdesign-react'
import {
  HomeIcon,
  ViewListIcon,
  UserAddIcon,
  ChevronRightIcon,
  ChevronLeftIcon,
  SettingIcon
} from 'tdesign-icons-react'

export const GlobalSidebar: React.FC = () => {
  const [expanded, setExpanded] = useState(false)
  const [showToggle, setShowToggle] = useState(true)

  const handleExpand = () => {
    // 1. 先隐藏三角
    setShowToggle(false)

    // 2. 稍后扩大窗口
    setTimeout(() => {
      if ((window as any).api) {
        ;(window as any).api.windowResize(84, 300)
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
        ;(window as any).api.windowResize(24, 300)
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
        width: '84px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-end',
        overflow: 'hidden',
        background: 'transparent'
      }}
    >
      {/* 日常展示的三角 */}
      <div
        onClick={handleExpand}
        className={`global-sidebar-toggle ${!showToggle ? 'hidden' : ''}`}
        style={{ willChange: 'opacity, transform' }}
      >
        <ChevronLeftIcon />
      </div>

      {/* 侧边栏内容 */}
      <div
        className={`sidebar-content-area ${expanded ? 'visible' : 'hidden'}`}
        style={{
          backgroundColor: 'var(--ss-card-bg)',
          height: 'fit-content',
          willChange: 'opacity, transform'
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

        <Tooltip content="主界面" placement="left">
          <Button shape="circle" variant="text" onClick={openMain}>
            <HomeIcon size="24px" />
          </Button>
        </Tooltip>

        <Tooltip content="积分操作" placement="left">
          <Button shape="circle" variant="text" onClick={() => openMain()}>
            <UserAddIcon size="24px" />
          </Button>
        </Tooltip>

        <Tooltip content="排行榜" placement="left">
          <Button
            shape="circle"
            variant="text"
            onClick={() => (window as any).api.openWindow({ key: 'main', route: '/leaderboard' })}
          >
            <ViewListIcon size="24px" />
          </Button>
        </Tooltip>

        <Tooltip content="设置" placement="left">
          <Button
            shape="circle"
            variant="text"
            onClick={() => (window as any).api.openWindow({ key: 'main', route: '/settings' })}
          >
            <SettingIcon size="24px" />
          </Button>
        </Tooltip>
      </div>
    </div>
  )
}
