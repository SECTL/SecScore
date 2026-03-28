import React, { Suspense, lazy, useEffect } from "react"
import { Layout, Space, Button, Tag, Spin } from "antd"
import {
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  FullscreenOutlined,
  FullscreenExitOutlined,
  LeftOutlined,
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
const loadLeaderboard = () => import("./Leaderboard")
const loadSettlementHistory = () => import("./SettlementHistory")
const loadAutoScoreManager = () => import("./AutoScoreManager")
const loadRewardSettings = () => import("./RewardSettings")
const loadBoardManager = () => import("./BoardManager")

const Home = lazy(() => loadHome().then((m) => ({ default: m.Home })))
const StudentManager = lazy(() => loadStudentManager().then((m) => ({ default: m.StudentManager })))
const Settings = lazy(() => loadSettings().then((m) => ({ default: m.Settings })))
const ReasonManager = lazy(() => loadReasonManager().then((m) => ({ default: m.ReasonManager })))
const ScoreManager = lazy(() => loadScoreManager().then((m) => ({ default: m.ScoreManager })))
const Leaderboard = lazy(() => loadLeaderboard().then((m) => ({ default: m.Leaderboard })))
const SettlementHistory = lazy(() =>
  loadSettlementHistory().then((m) => ({ default: m.SettlementHistory }))
)
const AutoScoreManager = lazy(() =>
  loadAutoScoreManager().then((m) => ({ default: m.AutoScoreManager }))
)
const RewardSettings = lazy(() => loadRewardSettings().then((m) => ({ default: m.RewardSettings })))
const BoardManager = lazy(() => loadBoardManager().then((m) => ({ default: m.BoardManager })))

const warmupRouteChunks = () =>
  Promise.allSettled([
    loadHome(),
    loadStudentManager(),
    loadSettings(),
    loadReasonManager(),
    loadScoreManager(),
    loadLeaderboard(),
    loadSettlementHistory(),
    loadAutoScoreManager(),
    loadRewardSettings(),
    loadBoardManager(),
  ])

const { Content } = Layout

interface ContentAreaProps {
  permission: "admin" | "points" | "view"
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
  onToggleImmersiveMode: () => void
  showSidebarToggle?: boolean
  bottomInset?: number
}

export function ContentArea({
  permission,
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
  onToggleImmersiveMode,
  showSidebarToggle = true,
  bottomInset = 0,
}: ContentAreaProps): React.JSX.Element {
  const { t } = useTranslation()
  const location = useLocation()
  const navigate = useNavigate()
  const isSubPage = location.pathname !== "/" && !location.pathname.startsWith("/home")
  const shouldAnimateSubPage = isPortraitMode && isSubPage
  const normalizedPath = location.pathname === "/" ? "/home" : location.pathname
  const isMobileHeaderMode = isPortraitMode && isMobileDevice && !immersiveMode
  const isPrimaryMobilePage =
    normalizedPath.startsWith("/home") || normalizedPath.startsWith("/settings")
  const showMobileBack = isMobileHeaderMode && !isPrimaryMobilePage
  const mobilePageTitle = (() => {
    if (normalizedPath.startsWith("/home")) return t("sidebar.home")
    if (normalizedPath.startsWith("/students")) return t("sidebar.students")
    if (normalizedPath.startsWith("/score")) return t("sidebar.score")
    if (normalizedPath.startsWith("/boards")) return t("sidebar.boards")
    if (normalizedPath.startsWith("/leaderboard")) return t("sidebar.leaderboard")
    if (normalizedPath.startsWith("/settlements")) return t("sidebar.settlements")
    if (normalizedPath.startsWith("/reasons")) return t("sidebar.reasons")
    if (normalizedPath.startsWith("/auto-score")) return t("sidebar.autoScore")
    if (normalizedPath.startsWith("/reward-settings")) return t("sidebar.rewardSettings")
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
            {(immersiveMode || (isHomePage && !isMobileDevice)) && (
              <Button
                size="small"
                type={immersiveMode ? "primary" : "default"}
                icon={immersiveMode ? <FullscreenExitOutlined /> : <FullscreenOutlined />}
                onClick={onToggleImmersiveMode}
                title={immersiveMode ? "退出沉浸模式" : "进入沉浸模式"}
              />
            )}
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
        style={{
          flex: 1,
          overflowY: "auto",
          overflowX: "hidden",
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
            className={`ss-route-page${shouldAnimateSubPage ? " is-subpage-enter" : ""}`}
          >
            <Routes>
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
              <Route path="/boards" element={<BoardManager canManage={permission === "admin"} />} />
              <Route path="/leaderboard" element={<Leaderboard />} />
              <Route path="/settlements" element={<SettlementHistory />} />
              <Route path="/reasons" element={<ReasonManager canEdit={permission === "admin"} />} />
              <Route path="/auto-score" element={<AutoScoreManager />} />
              <Route
                path="/reward-settings"
                element={<RewardSettings canEdit={permission === "admin"} />}
              />
              <Route
                path="/settings"
                element={<Settings permission={permission} />}
              />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </div>
        </Suspense>
      </Content>
    </Layout>
  )
}
