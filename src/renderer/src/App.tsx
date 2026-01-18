import { Layout, Dialog, Input, MessagePlugin } from 'tdesign-react'
import { useEffect, useMemo, useState } from 'react'
import { HashRouter, useLocation, useNavigate } from 'react-router-dom'
import { Sidebar } from './components/Sidebar'
import { ContentArea } from './components/ContentArea'
import { Wizard } from './components/Wizard'
import { ThemeProvider } from './contexts/ThemeContext'

function MainContent(): React.JSX.Element {
  const navigate = useNavigate()
  const location = useLocation()

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
      MessagePlugin.success('权限已解锁')
    } else {
      MessagePlugin.error(res.message || '密码错误')
    }
  }

  const logout = async () => {
    if (!(window as any).api) return
    const res = await (window as any).api.authLogout()
    if (res?.success && res.data) {
      setPermission(res.data.permission)
      MessagePlugin.success('已切换为只读')
    }
  }

  const onMenuChange = (v: string | number) => {
    const key = String(v)
    if (key === 'home') navigate('/')
    if (key === 'students') navigate('/students')
    if (key === 'score') navigate('/score')
    if (key === 'leaderboard') navigate('/leaderboard')
    if (key === 'settlements') navigate('/settlements')
    if (key === 'reasons') navigate('/reasons')
    if (key === 'settings') navigate('/settings')
  }

  return (
    <Layout style={{ height: '100vh', flexDirection: 'row', overflow: 'hidden' }}>
      <Sidebar activeMenu={activeMenu} permission={permission} onMenuChange={onMenuChange} />
      <ContentArea
        permission={permission}
        hasAnyPassword={hasAnyPassword}
        onAuthClick={() => setAuthVisible(true)}
        onLogout={logout}
      />

      <Wizard visible={wizardVisible} onComplete={() => setWizardVisible(false)} />

      <Dialog
        header="权限解锁"
        visible={authVisible}
        onClose={() => setAuthVisible(false)}
        onConfirm={login}
        confirmBtn={{ content: '解锁', loading: authLoading }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ color: 'var(--ss-text-secondary)', fontSize: '12px' }}>
            输入 6 位数字密码：管理密码=全功能，积分密码=仅积分操作。
          </div>
          <Input
            value={authPassword}
            onChange={(v) => setAuthPassword(v)}
            placeholder="例如 123456"
            maxlength={6}
          />
        </div>
      </Dialog>
    </Layout>
  )
}

function App(): React.JSX.Element {
  return (
    <ThemeProvider>
      <HashRouter>
        <MainContent />
      </HashRouter>
    </ThemeProvider>
  )
}

export default App
