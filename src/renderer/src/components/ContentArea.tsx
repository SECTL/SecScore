import React, { Suspense, lazy } from 'react'
import { Layout, Space, Button, Tag, Loading } from 'tdesign-react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { WindowControls } from './WindowControls'
import { ThemeEditor } from './ThemeEditor'

const Home = lazy(() => import('./Home').then((m) => ({ default: m.Home })))
const StudentManager = lazy(() =>
  import('./StudentManager').then((m) => ({ default: m.StudentManager }))
)
const Settings = lazy(() => import('./Settings').then((m) => ({ default: m.Settings })))
const ReasonManager = lazy(() =>
  import('./ReasonManager').then((m) => ({ default: m.ReasonManager }))
)
const ScoreManager = lazy(() => import('./ScoreManager').then((m) => ({ default: m.ScoreManager })))
const Leaderboard = lazy(() => import('./Leaderboard').then((m) => ({ default: m.Leaderboard })))
const SettlementHistory = lazy(() =>
  import('./SettlementHistory').then((m) => ({ default: m.SettlementHistory }))
)

const { Content } = Layout

interface ContentAreaProps {
  permission: 'admin' | 'points' | 'view'
  hasAnyPassword: boolean
  onAuthClick: () => void
  onLogout: () => void
}

export function ContentArea({
  permission,
  hasAnyPassword,
  onAuthClick,
  onLogout
}: ContentAreaProps): React.JSX.Element {
  const permissionTag = (
    <Tag
      theme={permission === 'admin' ? 'success' : permission === 'points' ? 'warning' : 'default'}
      variant="light"
    >
      {permission === 'admin' ? '管理权限' : permission === 'points' ? '积分权限' : '只读'}
    </Tag>
  )

  return (
    <Layout
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        backgroundColor: 'var(--ss-bg-color)'
      }}
    >
      <div
        style={
          {
            height: '32px',
            WebkitAppRegion: 'drag',
            display: 'flex',
            alignItems: 'center',
            backgroundColor: 'var(--ss-header-bg)',
            borderBottom: '1px solid var(--ss-border-color)',
            flexShrink: 0
          } as React.CSSProperties
        }
      >
        <div style={{ flex: 1 }} />
        <div
          style={
            {
              display: 'flex',
              alignItems: 'center',
              paddingRight: '0px',
              WebkitAppRegion: 'no-drag'
            } as React.CSSProperties
          }
        >
          <Space size="small" style={{ marginRight: '12px' }}>
            {permissionTag}
            {hasAnyPassword && (
              <>
                <Button size="small" variant="outline" onClick={onAuthClick}>
                  输入密码
                </Button>
                <Button size="small" variant="outline" theme="danger" onClick={onLogout}>
                  锁定
                </Button>
              </>
            )}
          </Space>
          <WindowControls />
        </div>
      </div>

      <Content style={{ flex: 1, overflowY: 'auto' }}>
        <Suspense
          fallback={
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100%'
              }}
            >
              <Loading text="正在载入页面..." />
            </div>
          }
        >
          <Routes>
            <Route
              path="/"
              element={<Home canEdit={permission === 'admin' || permission === 'points'} />}
            />
            <Route path="/students" element={<StudentManager canEdit={permission === 'admin'} />} />
            <Route
              path="/score"
              element={<ScoreManager canEdit={permission === 'admin' || permission === 'points'} />}
            />
            <Route path="/leaderboard" element={<Leaderboard />} />
            <Route path="/settlements" element={<SettlementHistory />} />
            <Route path="/reasons" element={<ReasonManager canEdit={permission === 'admin'} />} />
            <Route path="/settings" element={<Settings permission={permission} />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </Content>
      <ThemeEditor />
    </Layout>
  )
}
