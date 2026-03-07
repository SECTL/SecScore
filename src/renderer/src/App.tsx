import { Layout, Modal, Input, message, ConfigProvider, theme as antTheme } from 'antd'
import { useEffect, useMemo, useState } from 'react'
import { HashRouter, useLocation, useNavigate, Routes, Route } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Sidebar } from './components/Sidebar'
import { ContentArea } from './components/ContentArea'
import { OOBE } from './components/OOBE'
import { ThemeProvider, useTheme } from './contexts/ThemeContext'

function MainContent(): React.JSX.Element {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const { currentTheme } = useTheme()
  const [messageApi, contextHolder] = message.useMessage()

  useEffect(() => {
    if (!(window as any).api) return
    const unlisten = (window as any).api.onNavigate((route: string) => {
      const currentPath = location.pathname === '/' ? '/home' : location.pathname
      const targetPath = route === '/' ? '/home' : route

      if (currentPath !== targetPath) {
        navigate(route)
      }
    })
    return () => unlisten()
  }, [navigate, location.pathname])

  const [wizardVisible, setWizardVisible] = useState(false)
  const [permission, setPermission] = useState<'admin' | 'points' | 'view'>('view')
  const [hasAnyPassword, setHasAnyPassword] = useState(false)
  const [authVisible, setAuthVisible] = useState(false)
  const [authPassword, setAuthPassword] = useState('')
  const [authLoading, setAuthLoading] = useState(false)

  const activeMenu = useMemo(() => {
    const p = location.pathname
    if (p === '/' || p.startsWith('/home')) return 'home'
    if (p.startsWith('/students')) return 'students'
    if (p.startsWith('/score')) return 'score'
    if (p.startsWith('/leaderboard')) return 'leaderboard'
    if (p.startsWith('/settlements')) return 'settlements'
    if (p.startsWith('/reasons')) return 'reasons'
    if (p.startsWith('/auto-score')) return 'auto-score'
    if (p.startsWith('/settings')) return 'settings'
    return 'home'
  }, [location.pathname])

  useEffect(() => {
    const checkWizard = async () => {
      if (!(window as any).api) return
      const res = await (window as any).api.getAllSettings()
      if (res.success && res.data && !res.data.is_wizard_completed) {
        setWizardVisible(true)
      }
    }
    checkWizard()
  }, [])

  useEffect(() => {
    const loadAuthAndSettings = async () => {
      if (!(window as any).api) return
      const authRes = await (window as any).api.authGetStatus()
      if (authRes?.success && authRes.data) {
        setPermission(authRes.data.permission)
        const anyPwd = Boolean(authRes.data.hasAdminPassword || authRes.data.hasPointsPassword)
        setHasAnyPassword(anyPwd)
        if (anyPwd && authRes.data.permission === 'view') setAuthVisible(true)
      }
    }

    loadAuthAndSettings()
  }, [])

  const login = async () => {
    if (!(window as any).api) return
    setAuthLoading(true)
    const res = await (window as any).api.authLogin(authPassword)
    setAuthLoading(false)
    if (res.success && res.data) {
      setPermission(res.data.permission)
      setAuthVisible(false)
      setAuthPassword('')
      messageApi.success(t('auth.unlocked'))
    } else {
      messageApi.error(res.message || t('common.error'))
    }
  }

  const logout = async () => {
    if (!(window as any).api) return
    const res = await (window as any).api.authLogout()
    if (res?.success && res.data) {
      setPermission(res.data.permission)
      messageApi.success(t('auth.logout'))
    }
  }

  const onMenuChange = (v: string) => {
    const key = String(v)
    if (key === 'home') navigate('/')
    if (key === 'students') navigate('/students')
    if (key === 'score') navigate('/score')
    if (key === 'leaderboard') navigate('/leaderboard')
    if (key === 'settlements') navigate('/settlements')
    if (key === 'reasons') navigate('/reasons')
    if (key === 'auto-score') navigate('/auto-score')
    if (key === 'settings') navigate('/settings')
  }

  const isDark = currentTheme?.mode === 'dark'
  const brandColor = currentTheme?.config?.tdesign?.brandColor || '#0052D9'

  return (
    <ConfigProvider
      theme={{
        algorithm: isDark ? antTheme.darkAlgorithm : antTheme.defaultAlgorithm,
        token: {
          colorPrimary: brandColor
        }
      }}
    >
      {contextHolder}
      <Layout style={{ height: '100vh', flexDirection: 'row', overflow: 'hidden' }}>
        <Sidebar activeMenu={activeMenu} permission={permission} onMenuChange={onMenuChange} />
        <ContentArea
          permission={permission}
          hasAnyPassword={hasAnyPassword}
          onAuthClick={() => setAuthVisible(true)}
          onLogout={logout}
        />

        <OOBE visible={wizardVisible} onComplete={() => setWizardVisible(false)} />

        <Modal
          title={t('auth.unlock')}
          open={authVisible}
          onCancel={() => setAuthVisible(false)}
          onOk={login}
          confirmLoading={authLoading}
          okText={t('auth.unlockButton')}
          cancelText={t('common.cancel')}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ color: 'var(--ss-text-secondary)', fontSize: '12px' }}>
              {t('auth.unlockHint')}
            </div>
            <Input
              value={authPassword}
              onChange={(e) => setAuthPassword(e.target.value)}
              placeholder={t('auth.passwordPlaceholder')}
              maxLength={6}
            />
          </div>
        </Modal>

        {import.meta.env.DEV ? (
          <div
            style={{
              position: 'fixed',
              display: 'flex',
              bottom: '2px',
              left: '20px',
              opacity: 0.6,
              zIndex: 9999
            }}
          >
            <p
              style={{
                color: '#df0000',
                fontWeight: 'bold',
                fontSize: '14px',
                pointerEvents: 'none'
              }}
            >
              开发中画面,不代表最终品质
            </p>
            <p
              style={{
                color: currentTheme?.mode === 'dark' ? '#fff' : '#44474b',
                fontWeight: 'bold',
                fontSize: '13px',
                paddingLeft: '5px'
              }}
            >
              SecScore Dev ({getPlatform()}-{getArchitecture()})
            </p>
          </div>
        ) : null}
      </Layout>
    </ConfigProvider>
  )
}

function getArchitecture(): string {
  const userAgent = navigator.userAgent.toLowerCase()

  if (userAgent.includes('arm64') || userAgent.includes('aarch64')) {
    return 'ARM64'
  } else if (userAgent.includes('x64') || userAgent.includes('amd64')) {
    return 'x64'
  } else if (userAgent.includes('i386') || userAgent.includes('i686')) {
    return 'x86'
  }

  return userAgent
}

function getPlatform(): string {
  const userAgent = navigator.userAgent.toLowerCase()

  if (userAgent.includes('windows')) {
    return 'Windows'
  } else if (userAgent.includes('mac')) {
    return 'Mac'
  } else if (userAgent.includes('linux')) {
    return 'Linux'
  }

  return 'Unknown'
}
function App(): React.JSX.Element {
  return (
    <ThemeProvider>
      <HashRouter>
        <Routes>
          <Route path="/*" element={<MainContent />} />
        </Routes>
      </HashRouter>
    </ThemeProvider>
  )
}

export default App
