import { Layout, Menu, Card, Tag, Button, Space, message } from "antd"
import {
  UserOutlined,
  SettingOutlined,
  HistoryOutlined,
  UnorderedListOutlined,
  HomeOutlined,
  SyncOutlined,
  FileTextOutlined,
  CloudOutlined,
  UploadOutlined,
  AppstoreAddOutlined,
  ApartmentOutlined,
  CrownOutlined,
} from "@ant-design/icons"
import { useState, useEffect } from "react"
import { useTranslation } from "react-i18next"
import appLogo from "../assets/logoHD.svg"

const { Sider } = Layout

interface SidebarProps {
  activeMenu: string
  permission: "admin" | "points" | "view"
  onMenuChange: (value: string) => void
  collapsed: boolean
  floatingExpand: boolean
  floatingExpanded: boolean
  onFloatingExpandedChange: (expanded: boolean) => void
}

interface DbStatus {
  type: "sqlite" | "postgresql"
  connected: boolean
  error?: string
}

export function Sidebar({
  activeMenu,
  permission,
  onMenuChange,
  collapsed,
  floatingExpand,
  floatingExpanded,
  onFloatingExpandedChange,
}: SidebarProps): React.JSX.Element {
  const { t } = useTranslation()
  const [dbStatus, setDbStatus] = useState<DbStatus>({ type: "sqlite", connected: true })
  const [syncLoading, setSyncLoading] = useState(false)
  const [messageApi, contextHolder] = message.useMessage()

  useEffect(() => {
    loadDbStatus()
    const handleStatusChange = () => {
      loadDbStatus()
    }
    const api = (window as any).api
    if (!api) return

    let disposed = false
    let unlisten: (() => void) | null = null

    api
      .onSettingChanged((change: { key: string; value: any }) => {
        if (change.key === "pg_connection_status") {
          handleStatusChange()
        }
      })
      .then((fn: () => void) => {
        if (disposed) {
          fn()
          return
        }
        unlisten = fn
      })
      .catch(() => void 0)

    return () => {
      disposed = true
      if (unlisten) unlisten()
    }
  }, [])

  const loadDbStatus = async () => {
    if (!(window as any).api) return
    try {
      const res = await (window as any).api.dbGetStatus()
      if (res.success && res.data) {
        setDbStatus(res.data)
      }
    } catch (e) {
      console.error("Failed to load database status:", e)
    }
  }

  const handleSync = async () => {
    if (!(window as any).api) return
    setSyncLoading(true)
    try {
      await loadDbStatus()
    } catch (e) {
      console.error("Failed to sync database status:", e)
    } finally {
      setSyncLoading(false)
    }
  }

  const [forceSyncLoading, setForceSyncLoading] = useState(false)

  useEffect(() => {
    if (!floatingExpand || !collapsed) {
      onFloatingExpandedChange(false)
    }
  }, [floatingExpand, collapsed, onFloatingExpandedChange])

  const handleForceSync = async () => {
    if (!(window as any).api) return

    const statusRes = await (window as any).api.dbGetStatus()
    if (!statusRes.success || !statusRes.data) {
      messageApi.error(t("sidebar.getDbStatusFailed"))
      return
    }

    if (statusRes.data.type !== "postgresql") {
      messageApi.error(t("sidebar.notRemoteMode"))
      return
    }

    if (!statusRes.data.connected) {
      messageApi.error(t("sidebar.dbNotConnected"))
      return
    }

    setForceSyncLoading(true)
    try {
      const res = await (window as any).api.dbSync()
      if (res.success && res.data?.success) {
        messageApi.success(t("sidebar.syncSuccess"))
      } else {
        messageApi.error(res.data?.message || res.message || t("sidebar.syncFailed"))
      }
    } catch (e: any) {
      messageApi.error(e?.message || t("sidebar.syncFailed"))
    } finally {
      setForceSyncLoading(false)
    }
  }

  const menuItems = [
    {
      key: "home",
      icon: <HomeOutlined />,
      label: t("sidebar.home"),
    },
    {
      key: "students",
      icon: <UserOutlined />,
      label: t("sidebar.students"),
      disabled: permission !== "admin",
    },
    {
      key: "score",
      icon: <HistoryOutlined />,
      label: t("sidebar.score"),
    },
    {
      key: "auto-score",
      icon: <SyncOutlined />,
      label: t("sidebar.autoScore"),
      disabled: permission !== "admin",
    },
    {
      key: "reward-settings",
      icon: <AppstoreAddOutlined />,
      label: t("sidebar.rewardSettings"),
      disabled: permission !== "admin",
    },
    {
      key: "boards",
      icon: <ApartmentOutlined />,
      label: t("sidebar.boards"),
    },
    {
      key: "leaderboard",
      icon: <UnorderedListOutlined />,
      label: t("sidebar.leaderboard"),
    },
    {
      key: "settlements",
      icon: <FileTextOutlined />,
      label: t("sidebar.settlements"),
    },
    {
      key: "reasons",
      icon: <UnorderedListOutlined />,
      label: t("sidebar.reasons"),
      disabled: permission !== "admin",
    },
    {
      key: "plugins",
      icon: <CrownOutlined />,
      label: t("sidebar.plugins"),
      disabled: permission !== "admin",
    },
    {
      key: "settings",
      icon: <SettingOutlined />,
      label: t("sidebar.settings"),
      disabled: permission !== "admin",
    },
  ]

  const showFloatingPanel = floatingExpand && collapsed && floatingExpanded

  const renderSidebarBody = (isCollapsedView: boolean, hideMenu = false) => (
    <>
      <div
        data-tauri-drag-region
        style={
          {
            padding: isCollapsedView ? "20px 8px 12px" : "24px 24px 16px",
            textAlign: "center",
            WebkitAppRegion: "drag",
            userSelect: "none",
            flexShrink: 0,
          } as React.CSSProperties
        }
      >
        <img
          src={appLogo}
          style={{
            width: isCollapsedView ? "40px" : "48px",
            height: isCollapsedView ? "40px" : "48px",
            marginBottom: isCollapsedView ? "0" : "12px",
          }}
          alt="logo"
        />
        {!isCollapsedView && (
          <>
            <h2
              style={{
                color: "var(--ss-sidebar-text, var(--ss-text-main))",
                margin: 0,
                fontSize: "20px",
              }}
            >
              SecScore
            </h2>
            <div
              style={{
                fontSize: "12px",
                color: "var(--ss-sidebar-text, var(--ss-text-main))",
                opacity: 0.8,
                marginTop: "4px",
              }}
            >
              {t("settings.about.appName")}
            </div>
          </>
        )}
      </div>

      {!hideMenu && (
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            overflowX: "hidden",
            display: "flex",
            flexDirection: "column",
            WebkitOverflowScrolling: "touch",
          }}
        >
          <Menu
            mode="inline"
            inlineCollapsed={isCollapsedView}
            selectedKeys={[activeMenu]}
            onClick={({ key }) => {
              onMenuChange(key)
              if (floatingExpand && collapsed) {
                onFloatingExpandedChange(false)
              }
            }}
            style={{
              width: "100%",
              border: "none",
              backgroundColor: "transparent",
            }}
            items={menuItems}
          />
        </div>
      )}

      {!isCollapsedView && !hideMenu && dbStatus.type === "postgresql" && (
        <Card
          size="small"
          style={{
            margin: "8px",
            backgroundColor: "var(--ss-card-bg)",
            border: "1px solid var(--ss-border-color)",
          }}
          styles={{ body: { padding: "12px" } }}
        >
          <Space orientation="vertical" size={4} style={{ width: "100%" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <Space size={4}>
                <CloudOutlined style={{ fontSize: "12px", color: "#1890ff" }} />
                <span style={{ fontSize: "12px", fontWeight: 500 }}>{t("sidebar.remoteDb")}</span>
              </Space>
              <Tag
                color={dbStatus.connected ? "success" : "error"}
                style={{ margin: 0, fontSize: "10px" }}
              >
                {dbStatus.connected
                  ? t("settings.database.connected")
                  : t("settings.database.disconnected")}
              </Tag>
            </div>
            <Button
              type="text"
              size="small"
              icon={<SyncOutlined spin={syncLoading} />}
              onClick={handleSync}
              loading={syncLoading}
              style={{
                width: "100%",
                height: "24px",
                fontSize: "12px",
                padding: "0 8px",
                color: "var(--ss-text-secondary)",
              }}
            >
              {t("sidebar.refreshStatus")}
            </Button>
            <Button
              type="primary"
              size="small"
              icon={<UploadOutlined />}
              onClick={handleForceSync}
              loading={forceSyncLoading}
              disabled={!dbStatus.connected}
              style={{
                width: "100%",
                height: "24px",
                fontSize: "12px",
                padding: "0 8px",
              }}
            >
              {t("sidebar.syncNow")}
            </Button>
          </Space>
        </Card>
      )}
    </>
  )

  return (
    <Sider
      className="ss-sidebar"
      width={200}
      collapsed={collapsed}
      collapsedWidth={64}
      style={{
        background: "var(--ss-sidebar-bg)",
        borderRight: "1px solid var(--ss-border-color)",
        display: "flex",
        flexDirection: "column",
        overflow: "visible",
        position: "relative",
      }}
      theme="light"
    >
      {contextHolder}
      {renderSidebarBody(collapsed, showFloatingPanel)}

      {showFloatingPanel && (
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            bottom: 0,
            width: "200px",
            background:
              "linear-gradient(0deg, rgba(250, 250, 250, 0.72), rgba(250, 250, 250, 0.72)), var(--ss-sidebar-bg)",
            backdropFilter: "blur(14px)",
            WebkitBackdropFilter: "blur(14px)",
            borderRight: "1px solid var(--ss-border-color)",
            boxShadow: "6px 0 18px rgba(0, 0, 0, 0.12)",
            zIndex: 1200,
            display: "flex",
            flexDirection: "column",
          }}
        >
          {renderSidebarBody(false)}
        </div>
      )}
    </Sider>
  )
}
