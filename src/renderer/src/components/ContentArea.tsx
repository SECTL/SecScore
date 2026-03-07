import React, { Suspense, lazy } from 'react'
import { Layout, Space, Button, Tag } from 'antd'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

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
const AutoScoreManager = lazy(() =>
  import('./AutoScoreManager').then((m) => ({ default: m.AutoScoreManager }))
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
  const { t } = useTranslation()
  const permissionTag = (
    <Tag
      color={permission === 'admin' ? 'success' : permission === 'points' ? 'warning' : 'default'}
    >
      {permission === 'admin'
        ? t('permissions.admin')
        : permission === 'points'
          ? t('permissions.points')
          : t('permissions.view')}
    </Tag>
  )

  return (
    <Layout
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        background: 'var(--ss-bg-color)'
      }}
    >
      <div
        style={
          {
            height: '40px',
            display: 'flex',
            alignItems: 'center',
            background: 'var(--ss-header-bg)',
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
              paddingRight: '12px'
            } as React.CSSProperties
          }
        >
          <Space size="small">
            {permissionTag}
            {hasAnyPassword && (
              <>
                <Button size="small" onClick={onAuthClick}>
                  {t('auth.enterPassword')}
                </Button>
                <Button size="small" danger onClick={onLogout}>
                  {t('auth.lock')}
                </Button>
              </>
            )}
          </Space>
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
              <div
                style={{
                  width: '40px',
                  height: '40px',
                  border: '3px solid var(--ss-border-color)',
                  borderTopColor: 'var(--ant-color-primary)',
                  borderRadius: '50%',
                  animation: 'spin 1s linear infinite'
                }}
              />
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
            <Route path="/auto-score" element={<AutoScoreManager />} />
            <Route path="/settings" element={<Settings permission={permission} />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </Content>
    </Layout>
  )
}
