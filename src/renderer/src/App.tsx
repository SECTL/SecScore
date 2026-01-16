import { Layout, Menu, Space, Dialog, Input, Button, Tag, MessagePlugin } from 'tdesign-react'
import { useState, useEffect } from 'react'
import { UserIcon, SettingIcon, HistoryIcon, RootListIcon, ViewListIcon } from 'tdesign-icons-react'
import { StudentManager } from './components/StudentManager'
import { Settings } from './components/Settings'
import { ReasonManager } from './components/ReasonManager'
import { ScoreManager } from './components/ScoreManager'
import { Leaderboard } from './components/Leaderboard'
import { SettlementHistory } from './components/SettlementHistory'
import { Wizard } from './components/Wizard'
import { ThemeProvider } from './contexts/ThemeContext'

const { Header, Content, Aside } = Layout

function MainContent(): React.JSX.Element {
  const [activeMenu, setActiveMenu] = useState('score')
  const [wizardVisible, setWizardVisible] = useState(false)
  const [permission, setPermission] = useState<'admin' | 'points' | 'view'>('view')
  const [hasAnyPassword, setHasAnyPassword] = useState(false)
  const [authVisible, setAuthVisible] = useState(false)
  const [authPassword, setAuthPassword] = useState('')
  const [authLoading, setAuthLoading] = useState(false)

  useEffect(() => {
    const checkWizard = async () => {
      if (!(window as any).api) return
      const res = await (window as any).api.getSettings()
      if (res.success && res.data && res.data.is_wizard_completed !== '1') {
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

  const renderContent = () => {
    switch (activeMenu) {
      case 'students':
        return <StudentManager canEdit={permission === 'admin'} />
      case 'score':
        return <ScoreManager canEdit={permission === 'admin' || permission === 'points'} />
      case 'leaderboard':
        return <Leaderboard />
      case 'settlements':
        return <SettlementHistory />
      case 'reasons':
        return <ReasonManager canEdit={permission === 'admin'} />
      case 'settings':
        return <Settings permission={permission} />
      default:
        return <ScoreManager canEdit={permission === 'admin' || permission === 'points'} />
    }
  }

  const permissionTag = (
    <Tag
      theme={permission === 'admin' ? 'success' : permission === 'points' ? 'warning' : 'default'}
      variant="light"
    >
      {permission === 'admin' ? '管理权限' : permission === 'points' ? '积分权限' : '只读'}
    </Tag>
  )

  return (
    <Layout style={{ height: '100vh', backgroundColor: 'var(--ss-bg-color)' }}>
      <Aside
        className="ss-sidebar"
        style={{
          backgroundColor: 'var(--ss-sidebar-bg)',
          borderRight: '1px solid var(--ss-border-color)'
        }}
      >
        <div style={{ padding: '24px', textAlign: 'center' }}>
          <h2 style={{ color: 'var(--ss-sidebar-text, var(--ss-text-main))', margin: 0 }}>SecScore</h2>
          <div
            style={{
              fontSize: '12px',
              color: 'var(--ss-sidebar-text, var(--ss-text-main))'
            }}
          >
            教育积分管理
          </div>
        </div>
        <Menu
          value={activeMenu}
          onChange={(v) => setActiveMenu(v as string)}
          style={{ width: '100%', border: 'none' }}
        >
          <Menu.MenuItem value="students" icon={<UserIcon />} disabled={permission !== 'admin'}>
            学生管理
          </Menu.MenuItem>
          <Menu.MenuItem value="score" icon={<HistoryIcon />}>
            积分管理
          </Menu.MenuItem>
          <Menu.MenuItem value="leaderboard" icon={<ViewListIcon />}>
            排行榜
          </Menu.MenuItem>
          <Menu.MenuItem value="settlements" icon={<HistoryIcon />}>
            结算历史
          </Menu.MenuItem>
          <Menu.MenuItem value="reasons" icon={<RootListIcon />} disabled={permission !== 'admin'}>
            理由管理
          </Menu.MenuItem>
          <Menu.MenuItem value="settings" icon={<SettingIcon />} disabled={permission !== 'admin'}>
            系统设置
          </Menu.MenuItem>
        </Menu>
      </Aside>
      <Layout>
        <Header
          style={{
            backgroundColor: 'var(--ss-header-bg)',
            borderBottom: '1px solid var(--ss-border-color)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            padding: '0 24px'
          }}
        >
          <Space>
            {permissionTag}
            {hasAnyPassword && (
              <>
                <Button size="small" variant="outline" onClick={() => setAuthVisible(true)}>
                  输入密码
                </Button>
                <Button size="small" variant="outline" theme="danger" onClick={logout}>
                  锁定
                </Button>
              </>
            )}
          </Space>
        </Header>
        <Content style={{ overflowY: 'auto' }}>{renderContent()}</Content>
      </Layout>
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
      <MainContent />
    </ThemeProvider>
  )
}

export default App
