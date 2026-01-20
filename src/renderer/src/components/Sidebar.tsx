import { Layout, Menu } from 'tdesign-react'
import {
  UserIcon,
  SettingIcon,
  HistoryIcon,
  RootListIcon,
  ViewListIcon,
  HomeIcon
} from 'tdesign-icons-react'
import appLogo from '../assets/logoHD.svg'

const { Aside } = Layout

interface SidebarProps {
  activeMenu: string
  permission: 'admin' | 'points' | 'view'
  onMenuChange: (value: string | number) => void
}

export function Sidebar({ activeMenu, permission, onMenuChange }: SidebarProps): React.JSX.Element {
  return (
    <Aside
      className="ss-sidebar"
      style={{
        backgroundColor: 'var(--ss-sidebar-bg)',
        borderRight: '1px solid var(--ss-border-color)',
        display: 'flex',
        flexDirection: 'column'
      }}
    >
      <div
        style={
          {
            padding: '32px 24px 16px',
            textAlign: 'center',
            WebkitAppRegion: 'drag',
            userSelect: 'none',
            flexShrink: 0
          } as React.CSSProperties
        }
      >
        <img
          src={appLogo}
          style={{ width: '48px', height: '48px', marginBottom: '12px' }}
          alt="logo"
        />
        <h2
          style={{
            color: 'var(--ss-sidebar-text, var(--ss-text-main))',
            margin: 0,
            fontSize: '20px'
          }}
        >
          SecScore
        </h2>
        <div
          style={{
            fontSize: '12px',
            color: 'var(--ss-sidebar-text, var(--ss-text-main))',
            opacity: 0.8,
            marginTop: '4px'
          }}
        >
          教育积分管理
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
        <Menu value={activeMenu} onChange={onMenuChange} style={{ width: '100%', border: 'none' }}>
          <Menu.MenuItem value="home" icon={<HomeIcon />}>
            主页
          </Menu.MenuItem>
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
      </div>
    </Aside>
  )
}
