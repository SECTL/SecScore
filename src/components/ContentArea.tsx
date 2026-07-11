import React, { Suspense, lazy, useCallback, useEffect, useRef, useState } from "react"
import { Layout, Space, Button, Tag, Spin, Avatar, Popover, Progress, Input, QRCode } from "antd"
import {
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  LeftOutlined,
  SettingOutlined,
  LinkOutlined,
  CopyOutlined,
} from "@ant-design/icons"
import { Routes, Route, Navigate, useLocation, useNavigate } from "react-router-dom"
import { useTranslation } from "react-i18next"
import { WindowControls } from "./WindowControls"
import appLogo from "../assets/logoHD.svg"

const loadHome = () => import("./Home")
const loadStudentManager = () => import("./StudentManager")
const loadSettings = () => import("./Settings")
const loadReasonManager = () => import("./ReasonManager")
const loadScoreManager = () => import("./ScoreManager")
const loadAutoScoreManager = () => import("./AutoScoreManager")
const loadLeaderboard = () => import("./Leaderboard")
const loadSettlementHistory = () => import("./SettlementHistory")
const loadRewardSettings = () => import("./RewardSettings")
const loadBoardManager = () => import("./BoardManager")
const loadPluginManager = () => import("./PluginManager")

const Home = lazy(() => loadHome().then((m) => ({ default: m.Home })))
const StudentManager = lazy(() => loadStudentManager().then((m) => ({ default: m.StudentManager })))
const Settings = lazy(() => loadSettings().then((m) => ({ default: m.Settings })))
const ReasonManager = lazy(() => loadReasonManager().then((m) => ({ default: m.ReasonManager })))
const ScoreManager = lazy(() => loadScoreManager().then((m) => ({ default: m.ScoreManager })))
const AutoScoreManager = lazy(loadAutoScoreManager)
const Leaderboard = lazy(() => loadLeaderboard().then((m) => ({ default: m.Leaderboard })))
const SettlementHistory = lazy(() =>
  loadSettlementHistory().then((m) => ({ default: m.SettlementHistory }))
)
const RewardSettings = lazy(() => loadRewardSettings().then((m) => ({ default: m.RewardSettings })))
const BoardManager = lazy(() => loadBoardManager().then((m) => ({ default: m.BoardManager })))
const PluginManager = lazy(() => loadPluginManager().then((m) => ({ default: m.PluginManager })))

const warmupRouteChunks = () =>
  Promise.allSettled([
    loadHome(),
    loadStudentManager(),
    loadSettings(),
    loadReasonManager(),
    loadScoreManager(),
    loadAutoScoreManager(),
    loadLeaderboard(),
    loadSettlementHistory(),
    loadRewardSettings(),
    loadBoardManager(),
    loadPluginManager(),
  ])

const { Content } = Layout

interface ContentAreaProps {
  permission: "admin" | "points" | "view"
  oauthUserName?: string | null
  onOAuthLogout?: () => Promise<void> | void
  hasAnyPassword: boolean
  onAuthClick: () => void
  onLogout: () => void
  showWindowControls: boolean
  isPortraitMode: boolean
  isMobileDevice: boolean
  sidebarCollapsed: boolean
  floatingExpand: boolean
  floatingExpanded: boolean
  onToggleSidebar: () => void
  immersiveMode: boolean
  isHomePage: boolean
  onOpenManagementWindow?: () => Promise<void> | void
  showSidebarToggle?: boolean
  showHomeRoute?: boolean
  fallbackRoute?: string
  bottomInset?: number
}

interface HeaderStorageUsage {
  used_storage_formatted: string
  total_storage_formatted: string
  percentage: number
  file_count: number
}

interface LanShareUrl {
  ip: string
  url: string
  is_private?: boolean
  is_192_168?: boolean
}

export function ContentArea({
  permission,
  oauthUserName,
  onOAuthLogout,
  hasAnyPassword,
  onAuthClick,
  onLogout,
  showWindowControls,
  isPortraitMode,
  isMobileDevice,
  sidebarCollapsed,
  floatingExpand,
  floatingExpanded,
  onToggleSidebar,
  immersiveMode,
  isHomePage,
  onOpenManagementWindow,
  showSidebarToggle = true,
  showHomeRoute = true,
  fallbackRoute = "/",
  bottomInset = 0,
}: ContentAreaProps): React.JSX.Element {
  const { t } = useTranslation()
  const isLanBrowser = Boolean((window as any).__SECSCORE_LAN__)
  const isMacOS =
    typeof navigator !== "undefined" &&
    /mac/i.test(navigator.userAgent) &&
    !/iphone|ipad|ipod|android/i.test(navigator.userAgent)
  // macOS 使用原生红绿灯，侧栏隐藏（沉浸/竖屏）时顶部左侧需为红绿灯留白
  const macTrafficLightsInset = !isLanBrowser && isMacOS && (isPortraitMode || immersiveMode)
  const location = useLocation()
  const navigate = useNavigate()
  const isSubPage = location.pathname !== "/" && !location.pathname.startsWith("/home")
  const shouldAnimateSubPage = isPortraitMode && isSubPage
  const normalizedPath = location.pathname === "/" ? "/home" : location.pathname
  const isBoardPage = normalizedPath.startsWith("/boards")
  const isMobileHeaderMode = isPortraitMode && isMobileDevice && !immersiveMode
  const isPrimaryMobilePage =
    (showHomeRoute && normalizedPath.startsWith("/home")) || normalizedPath.startsWith("/settings")
  const showMobileBack = isMobileHeaderMode && !isPrimaryMobilePage
  const mobilePageTitle = (() => {
    if (normalizedPath.startsWith("/home")) return t("sidebar.home")
    if (normalizedPath.startsWith("/students")) return t("sidebar.students")
    if (normalizedPath.startsWith("/score")) return t("sidebar.score")
    if (normalizedPath.startsWith("/auto-score")) return t("sidebar.autoScore")
    if (normalizedPath.startsWith("/boards")) return t("sidebar.boards")
    if (normalizedPath.startsWith("/leaderboard")) return t("sidebar.leaderboard")
    if (normalizedPath.startsWith("/settlements")) return t("sidebar.settlements")
    if (normalizedPath.startsWith("/reasons")) return t("sidebar.reasons")
    if (normalizedPath.startsWith("/reward-settings")) return t("sidebar.rewardSettings")
    if (normalizedPath.startsWith("/plugins")) return t("sidebar.plugins")
    if (normalizedPath.startsWith("/settings")) return t("sidebar.settings")
    return "SecScore"
  })()

  const handleMobileBack = () => {
    if (window.history.length > 1) {
      navigate(-1)
      return
    }
    navigate("/settings")
  }

  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined

    const runWarmup = () => {
      if (cancelled) return
      warmupRouteChunks().catch(() => void 0)
    }

    if ("requestIdleCallback" in window) {
      ;(window as any).requestIdleCallback(runWarmup, { timeout: 1500 })
    } else {
      timer = setTimeout(runWarmup, 300)
    }

    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [])

  const permissionTag = (
    <Tag
      color={permission === "admin" ? "success" : permission === "points" ? "warning" : "default"}
    >
      {permission === "admin"
        ? t("permissions.admin")
        : permission === "points"
          ? t("permissions.points")
          : t("permissions.view")}
    </Tag>
  )
  const fallbackDisplayName =
    permission === "admin"
      ? t("permissions.admin")
      : permission === "points"
        ? t("permissions.points")
        : t("permissions.view")
  const userDisplayName = (oauthUserName || fallbackDisplayName).trim()
  const avatarText = userDisplayName.slice(0, 1).toUpperCase()
  const [profilePopoverOpen, setProfilePopoverOpen] = useState(false)
  const [storageUsageLoading, setStorageUsageLoading] = useState(false)
  const [storageUsageError, setStorageUsageError] = useState<string | null>(null)
  const [storageUsage, setStorageUsage] = useState<HeaderStorageUsage | null>(null)
  const [oauthUserId, setOAuthUserId] = useState<string | null>(null)
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(() => {
    try {
      return localStorage.getItem("ss_last_sync_time")
    } catch {
      return null
    }
  })
  const [copiedUserId, setCopiedUserId] = useState(false)
  const [logoutLoading, setLogoutLoading] = useState(false)
  const [lanPopoverOpen, setLanPopoverOpen] = useState(false)
  const [lanLoading, setLanLoading] = useState(false)
  const [lanCopied, setLanCopied] = useState(false)
  const [selectedLanShareUrl, setSelectedLanShareUrl] = useState<string | null>(null)
  const [lanStatus, setLanStatus] = useState<{
    is_running: boolean
    url?: string | null
    api_url?: string | null
    share_url?: string | null
    share_urls?: LanShareUrl[]
    token?: string | null
    config?: any
  } | null>(null)
  const copyResetTimerRef = useRef<number | null>(null)
  const lanCopyResetTimerRef = useRef<number | null>(null)
  const hasOAuthSession = Boolean(oauthUserName && oauthUserName.trim())
  const formattedLastSyncTime = (() => {
    if (!lastSyncTime) return "暂无"
    const date = new Date(lastSyncTime)
    if (Number.isNaN(date.getTime())) return "暂无"
    return date.toLocaleString("zh-CN", { hour12: false })
  })()

  const loadStorageUsage = useCallback(async () => {
    setStorageUsageLoading(true)
    setStorageUsageError(null)

    try {
      const api = (window as any).api
      if (!api?.oauthLoadLoginState || !api?.oauthGetStorageUsage) {
        setStorageUsage(null)
        setStorageUsageError("当前环境不支持云用量查询")
        return
      }

      const oauthStateRes = await api.oauthLoadLoginState()
      const oauthState = oauthStateRes?.success ? oauthStateRes.data : null
      if (!oauthState?.access_token || !oauthState?.user_id) {
        setOAuthUserId(null)
        setStorageUsage(null)
        setStorageUsageError("当前未登录云账号")
        return
      }
      setOAuthUserId(String(oauthState.user_id))

      const platformId = import.meta.env.VITE_OAUTH_PLATFORM_ID
      if (!platformId) {
        setStorageUsage(null)
        setStorageUsageError("未配置平台 ID")
        return
      }

      const usageRes = await api.oauthGetStorageUsage(
        oauthState.access_token,
        platformId,
        oauthState.user_id
      )
      if (!usageRes?.success || !usageRes.data) {
        throw new Error(usageRes?.message || "获取云空间用量失败")
      }

      setStorageUsage({
        used_storage_formatted: String(usageRes.data.used_storage_formatted || "0 B"),
        total_storage_formatted: String(usageRes.data.total_storage_formatted || "0 B"),
        percentage: Number.isFinite(usageRes.data.percentage)
          ? Number(usageRes.data.percentage)
          : 0,
        file_count: Number.isFinite(usageRes.data.file_count)
          ? Number(usageRes.data.file_count)
          : 0,
      })
    } catch (error: any) {
      setStorageUsage(null)
      setStorageUsageError(error?.message || "获取云空间用量失败")
    } finally {
      setStorageUsageLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!profilePopoverOpen) return
    void loadStorageUsage()
  }, [loadStorageUsage, profilePopoverOpen])

  useEffect(() => {
    const handleDataUpdated = (event: Event) => {
      const customEvent = event as CustomEvent<{ source?: string }>
      if (customEvent?.detail?.source !== "sync") return
      const now = new Date().toISOString()
      setLastSyncTime(now)
      try {
        localStorage.setItem("ss_last_sync_time", now)
      } catch {
        void 0
      }
    }

    window.addEventListener("ss:data-updated", handleDataUpdated as EventListener)
    return () => {
      window.removeEventListener("ss:data-updated", handleDataUpdated as EventListener)
      if (copyResetTimerRef.current) {
        window.clearTimeout(copyResetTimerRef.current)
        copyResetTimerRef.current = null
      }
      if (lanCopyResetTimerRef.current) {
        window.clearTimeout(lanCopyResetTimerRef.current)
        lanCopyResetTimerRef.current = null
      }
    }
  }, [])

  const handleCopyUserId = async () => {
    if (!oauthUserId) return
    try {
      await navigator.clipboard.writeText(oauthUserId)
      setCopiedUserId(true)
      if (copyResetTimerRef.current) {
        window.clearTimeout(copyResetTimerRef.current)
      }
      copyResetTimerRef.current = window.setTimeout(() => {
        setCopiedUserId(false)
        copyResetTimerRef.current = null
      }, 1500)
    } catch {
      setCopiedUserId(false)
    }
  }

  const handleOAuthLogoutClick = async () => {
    if (logoutLoading) return
    setLogoutLoading(true)
    try {
      if (onOAuthLogout) {
        await onOAuthLogout()
      } else {
        const api = (window as any).api
        if (api?.oauthClearLoginState) {
          await api.oauthClearLoginState()
          window.dispatchEvent(new CustomEvent("ss:oauth-user-updated", { detail: { user: null } }))
        }
      }
      setProfilePopoverOpen(false)
    } finally {
      setLogoutLoading(false)
    }
  }

  const normalizeLanStatus = (data: any) => {
    if (!data) return null
    const shareUrls: LanShareUrl[] = Array.isArray(data.share_urls || data.shareUrls)
      ? (data.share_urls || data.shareUrls)
          .map((item: any) => ({
            ip: String(item.ip || ""),
            url: String(item.url || ""),
            is_private: Boolean(item.is_private ?? item.isPrivate),
            is_192_168: Boolean(item.is_192_168 ?? item.is192168),
          }))
          .filter((item: LanShareUrl) => item.ip && item.url)
      : []
    const primaryShareUrl = data.share_url || data.shareUrl || shareUrls[0]?.url || null
    return {
      is_running: Boolean(data.is_running ?? data.isRunning),
      url: data.url || null,
      api_url: data.api_url || data.apiUrl || null,
      share_url: primaryShareUrl,
      share_urls:
        shareUrls.length > 0
          ? shareUrls
          : primaryShareUrl
            ? [{ ip: "", url: primaryShareUrl }]
            : [],
      token: data.token || null,
      config: data.config,
    }
  }

  const applyLanStatus = (nextStatus: ReturnType<typeof normalizeLanStatus>) => {
    setLanStatus(nextStatus)
    setSelectedLanShareUrl((prev) => {
      const urls = nextStatus?.share_urls || []
      if (prev && urls.some((item) => item.url === prev)) return prev
      return urls[0]?.url || nextStatus?.share_url || null
    })
  }

  const refreshLanStatus = useCallback(async (refreshToken: boolean) => {
    const api = (window as any).api
    if (!api?.httpServerStatus) return
    setLanLoading(true)
    try {
      const statusRes = await api.httpServerStatus()
      const status = normalizeLanStatus(statusRes?.data)
      if (refreshToken && status?.is_running && api.httpServerRefreshToken) {
        const refreshRes = await api.httpServerRefreshToken()
        if (refreshRes?.success) {
          applyLanStatus(normalizeLanStatus({ ...refreshRes.data, is_running: true }))
          return
        }
      }
      applyLanStatus(status)
    } finally {
      setLanLoading(false)
    }
  }, [])

  const handleLanPopoverOpenChange = (open: boolean) => {
    setLanPopoverOpen(open)
    if (open) {
      void refreshLanStatus(true)
    }
  }

  const startLanAccess = async () => {
    const api = (window as any).api
    if (!api?.httpServerStart) return
    setLanLoading(true)
    try {
      const res = await api.httpServerStart({
        host: "0.0.0.0",
        port: 45739,
        api_port: 45740,
      })
      if (res?.success) {
        if (api.setSetting) {
          await api.setSetting("lan_access_enabled", true)
        }
        applyLanStatus(normalizeLanStatus({ ...res.data, is_running: true }))
      }
    } finally {
      setLanLoading(false)
    }
  }

  const stopLanAccess = async () => {
    const api = (window as any).api
    if (!api?.httpServerStop) return
    setLanLoading(true)
    try {
      const res = await api.httpServerStop()
      if (res?.success) {
        if (api.setSetting) {
          await api.setSetting("lan_access_enabled", false)
        }
        setLanStatus((prev) => ({ ...(prev || { is_running: false }), is_running: false }))
        setSelectedLanShareUrl(null)
      }
    } finally {
      setLanLoading(false)
    }
  }

  const copyLanLink = async (link = selectedLanShareUrl || lanStatus?.share_url || "") => {
    if (!link) return
    await navigator.clipboard.writeText(link)
    setLanCopied(true)
    if (lanCopyResetTimerRef.current) {
      window.clearTimeout(lanCopyResetTimerRef.current)
    }
    lanCopyResetTimerRef.current = window.setTimeout(() => {
      setLanCopied(false)
      lanCopyResetTimerRef.current = null
    }, 1500)
  }

  const lanShareUrls = lanStatus?.share_urls || []
  const activeLanShareUrl =
    selectedLanShareUrl || lanStatus?.share_url || lanShareUrls[0]?.url || ""

  const profilePopoverContent = (
    <div style={{ width: "260px", display: "flex", flexDirection: "column", gap: "10px" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "8px",
        }}
      >
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: "12px", color: "var(--ss-text-secondary)" }}>账号 ID</div>
          <div
            style={{
              fontSize: "12px",
              color: "var(--ss-text-main)",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
            title={oauthUserId || ""}
          >
            {oauthUserId || "未登录"}
          </div>
        </div>
        <Button size="small" onClick={handleCopyUserId} disabled={!oauthUserId}>
          {copiedUserId ? "已复制" : "复制"}
        </Button>
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "8px",
        }}
      >
        <div style={{ fontSize: "12px", color: "var(--ss-text-secondary)" }}>最近同步时间</div>
        <div style={{ fontSize: "12px", color: "var(--ss-text-main)" }}>
          {formattedLastSyncTime}
        </div>
      </div>
      <div style={{ fontSize: "13px", color: "var(--ss-text-secondary)" }}>云空间用量</div>
      {storageUsageLoading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: "10px 0" }}>
          <Spin size="small" />
        </div>
      ) : storageUsage ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          <div style={{ fontSize: "13px", color: "var(--ss-text-main)" }}>
            已用：{storageUsage.used_storage_formatted} / {storageUsage.total_storage_formatted}
          </div>
          <Progress
            percent={Math.max(0, Math.min(100, Math.round(storageUsage.percentage)))}
            size="small"
            status={storageUsage.percentage > 90 ? "exception" : "active"}
          />
          <div style={{ fontSize: "12px", color: "var(--ss-text-secondary)" }}>
            文件数量：{storageUsage.file_count}
          </div>
        </div>
      ) : (
        <div style={{ fontSize: "12px", color: "var(--ant-color-error, #ff4d4f)" }}>
          {storageUsageError || "暂无云空间数据"}
        </div>
      )}
      <Button
        danger
        block
        size="small"
        onClick={handleOAuthLogoutClick}
        loading={logoutLoading}
        disabled={!hasOAuthSession}
      >
        退出登录
      </Button>
    </div>
  )

  const lanPopoverContent = (
    <div style={{ width: "300px", display: "flex", flexDirection: "column", gap: "12px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--ss-text-main)" }}>
          局域网访问
        </span>
        <Tag color={lanStatus?.is_running ? "success" : "default"}>
          {lanStatus?.is_running ? "已启用" : "未启用"}
        </Tag>
      </div>

      {!lanStatus?.is_running ? (
        <Button
          type="primary"
          block
          icon={<LinkOutlined />}
          loading={lanLoading}
          disabled={permission !== "admin"}
          onClick={startLanAccess}
        >
          启用局域网访问
        </Button>
      ) : (
        <>
          <Input
            readOnly
            value={activeLanShareUrl}
            suffix={
              <Button
                type="text"
                size="small"
                icon={<CopyOutlined />}
                onClick={() => copyLanLink()}
                disabled={!activeLanShareUrl}
              >
                {lanCopied ? "已复制" : "复制"}
              </Button>
            }
          />
          {activeLanShareUrl && (
            <div style={{ display: "flex", justifyContent: "center" }}>
              <QRCode value={activeLanShareUrl} size={180} />
            </div>
          )}
          {lanShareUrls.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {lanShareUrls.map((item, index) => {
                const selected = item.url === activeLanShareUrl
                return (
                  <div
                    key={`${item.ip}-${item.url}`}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr auto auto",
                      alignItems: "center",
                      gap: "6px",
                      padding: "6px 8px",
                      border: selected
                        ? "1px solid var(--ant-color-primary)"
                        : "1px solid var(--ss-border-color)",
                      borderRadius: "8px",
                      background: selected
                        ? "color-mix(in srgb, var(--ant-color-primary) 8%, transparent)"
                        : "transparent",
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: "12px",
                          fontWeight: 600,
                          color: "var(--ss-text-main)",
                        }}
                      >
                        {item.ip || `地址 ${index + 1}`}
                        {index === 0 && (
                          <Tag color="blue" style={{ marginLeft: "6px" }}>
                            默认
                          </Tag>
                        )}
                        {item.is_192_168 && (
                          <Tag color="green" style={{ marginLeft: "4px" }}>
                            192.168
                          </Tag>
                        )}
                      </div>
                      <div
                        title={item.url}
                        style={{
                          fontSize: "11px",
                          color: "var(--ss-text-secondary)",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {item.url}
                      </div>
                    </div>
                    <Button size="small" onClick={() => setSelectedLanShareUrl(item.url)}>
                      二维码
                    </Button>
                    <Button
                      size="small"
                      icon={<CopyOutlined />}
                      onClick={() => copyLanLink(item.url)}
                    />
                  </div>
                )
              })}
            </div>
          )}
          <div style={{ fontSize: "12px", color: "var(--ss-text-secondary)" }}>
            每次打开此弹窗都会刷新 token，之前复制的链接会失效。
          </div>
          <Space>
            <Button size="small" loading={lanLoading} onClick={() => refreshLanStatus(true)}>
              刷新链接
            </Button>
            <Button size="small" danger loading={lanLoading} onClick={stopLanAccess}>
              停用
            </Button>
          </Space>
        </>
      )}
    </div>
  )

  return (
    <Layout
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        background: "var(--ss-bg-color)",
      }}
    >
      <div
        style={
          {
            height: "40px",
            display: "flex",
            alignItems: "center",
            background: "var(--ss-header-bg)",
            borderBottom: "1px solid var(--ss-border-color)",
            flexShrink: 0,
            paddingLeft: macTrafficLightsInset ? "80px" : 0,
            WebkitAppRegion: "drag",
            position: "relative",
          } as React.CSSProperties
        }
      >
        <div
          style={
            {
              paddingLeft: "8px",
              display: "flex",
              alignItems: "center",
              height: "100%",
              WebkitAppRegion: "no-drag",
              flexShrink: 0,
              position: "relative",
              zIndex: floatingExpand && sidebarCollapsed && floatingExpanded ? 1301 : 1,
            } as React.CSSProperties
          }
        >
          {isMobileHeaderMode ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                minWidth: 0,
                gap: "6px",
              }}
            >
              {showMobileBack && (
                <Button
                  type="text"
                  size="small"
                  onClick={handleMobileBack}
                  icon={<LeftOutlined />}
                  title={t("settlements.back")}
                  style={{ width: "32px", height: "32px" }}
                />
              )}
              <div
                style={{
                  color: "var(--ss-text-main)",
                  fontSize: "14px",
                  fontWeight: 600,
                  userSelect: "none",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  maxWidth: "40vw",
                }}
              >
                {mobilePageTitle}
              </div>
            </div>
          ) : (
            !immersiveMode &&
            showSidebarToggle && (
              <Button
                type="text"
                size="small"
                onClick={onToggleSidebar}
                icon={
                  floatingExpand && sidebarCollapsed ? (
                    floatingExpanded ? (
                      <MenuFoldOutlined />
                    ) : (
                      <MenuUnfoldOutlined />
                    )
                  ) : sidebarCollapsed ? (
                    <MenuUnfoldOutlined />
                  ) : (
                    <MenuFoldOutlined />
                  )
                }
                title={sidebarCollapsed ? "展开导航栏" : "收起导航栏"}
                style={{ width: "32px", height: "32px" }}
              />
            )
          )}
        </div>
        <div
          data-tauri-drag-region
          style={
            {
              flex: 1,
              height: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "flex-start",
              paddingLeft: "8px",
              WebkitAppRegion: "drag",
            } as React.CSSProperties
          }
        >
          {immersiveMode && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                color: "var(--ss-text-main)",
                fontSize: "14px",
                fontWeight: 600,
                userSelect: "none",
              }}
            >
              <img src={appLogo} alt="SecScore" style={{ width: "18px", height: "18px" }} />
              <span>SecScore</span>
            </div>
          )}
        </div>
        <div
          style={
            {
              display: "flex",
              alignItems: "center",
              paddingRight: "8px",
              WebkitAppRegion: "no-drag",
            } as React.CSSProperties
          }
        >
          <Space size="small">
            {!isLanBrowser && (
              <Popover
                trigger="click"
                placement="bottomRight"
                open={lanPopoverOpen}
                onOpenChange={handleLanPopoverOpenChange}
                content={lanPopoverContent}
              >
                <Button
                  size="small"
                  icon={<LinkOutlined />}
                  title="局域网访问"
                  disabled={permission !== "admin"}
                />
              </Popover>
            )}
            {!isLanBrowser && (immersiveMode || (isHomePage && !isMobileDevice)) && (
              <Button
                size="small"
                icon={<SettingOutlined />}
                onClick={onOpenManagementWindow}
                title="管理"
              />
            )}
            <Popover
              trigger="click"
              placement="bottomRight"
              open={profilePopoverOpen}
              onOpenChange={setProfilePopoverOpen}
              content={profilePopoverContent}
            >
              <button
                type="button"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "8px",
                  border: "1px solid var(--ss-border-color)",
                  borderRadius: "999px",
                  padding: "2px 10px 2px 2px",
                  background: "var(--ss-bg-color)",
                  minWidth: "92px",
                  maxWidth: "180px",
                  height: "30px",
                  cursor: "pointer",
                }}
                title={userDisplayName}
              >
                <Avatar
                  size={24}
                  style={{
                    backgroundColor: "var(--ant-color-primary, #1677ff)",
                    color: "#fff",
                    fontSize: "12px",
                    flexShrink: 0,
                  }}
                >
                  {avatarText || "U"}
                </Avatar>
                <span
                  style={{
                    color: "var(--ss-text-main)",
                    fontSize: "13px",
                    fontWeight: 600,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {userDisplayName}
                </span>
              </button>
            </Popover>
            {permissionTag}
            {hasAnyPassword && (
              <>
                <Button size="small" onClick={onAuthClick}>
                  {t("auth.enterPassword")}
                </Button>
                <Button size="small" danger onClick={onLogout}>
                  {t("auth.lock")}
                </Button>
              </>
            )}
          </Space>
        </div>
        {showWindowControls && <WindowControls />}
      </div>

      <Content
        className="ss-content-scroll-container"
        style={{
          flex: 1,
          overflowY: isBoardPage ? "hidden" : "auto",
          overflowX: "hidden",
          background: "var(--ss-bg-color)",
          paddingBottom: bottomInset ? `${bottomInset}px` : 0,
        }}
      >
        <Suspense
          fallback={
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                height: "100%",
                flexDirection: "column",
                gap: 16,
              }}
            >
              <Spin size="large" />
            </div>
          }
        >
          <div
            key={location.pathname}
            className={`ss-route-page${shouldAnimateSubPage ? " is-subpage-enter" : ""}${isBoardPage ? " is-board-page" : ""}`}
          >
            <Routes>
              {showHomeRoute && (
                <Route
                  path="/"
                  element={
                    <Home
                      canEdit={permission === "admin" || permission === "points"}
                      isPortraitMode={isPortraitMode}
                      immersiveMode={immersiveMode}
                    />
                  }
                />
              )}
              <Route
                path="/students"
                element={<StudentManager canEdit={permission === "admin"} />}
              />
              <Route
                path="/score"
                element={
                  <ScoreManager canEdit={permission === "admin" || permission === "points"} />
                }
              />
              <Route
                path="/auto-score"
                element={<AutoScoreManager canEdit={permission === "admin"} />}
              />
              <Route path="/boards" element={<BoardManager canManage={permission === "admin"} />} />
              <Route path="/leaderboard" element={<Leaderboard />} />
              <Route path="/settlements" element={<SettlementHistory />} />
              <Route path="/reasons" element={<ReasonManager canEdit={permission === "admin"} />} />
              <Route
                path="/reward-settings"
                element={<RewardSettings canEdit={permission === "admin"} />}
              />
              <Route path="/plugins" element={<PluginManager canEdit={permission === "admin"} />} />
              <Route path="/settings" element={<Settings permission={permission} />} />
              <Route path="*" element={<Navigate to={fallbackRoute} replace />} />
            </Routes>
          </div>
        </Suspense>
      </Content>
    </Layout>
  )
}
