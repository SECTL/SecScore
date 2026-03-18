import React, { Suspense, lazy, useEffect } from "react"
import { Layout, Space, Button, Tag, Spin } from "antd"
import { MenuFoldOutlined, MenuUnfoldOutlined } from "@ant-design/icons"
import { Routes, Route, Navigate } from "react-router-dom"
import { useTranslation } from "react-i18next"
import { WindowControls } from "./WindowControls"

const loadHome = () => import("./Home")
const loadStudentManager = () => import("./StudentManager")
const loadSettings = () => import("./Settings")
const loadReasonManager = () => import("./ReasonManager")
const loadScoreManager = () => import("./ScoreManager")
const loadLeaderboard = () => import("./Leaderboard")
const loadSettlementHistory = () => import("./SettlementHistory")
const loadAutoScoreManager = () => import("./AutoScoreManager")

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
  ])

const { Content } = Layout

interface ContentAreaProps {
  permission: "admin" | "points" | "view"
  hasAnyPassword: boolean
  onAuthClick: () => void
  onLogout: () => void
  isPortraitMode: boolean
  sidebarCollapsed: boolean
  floatingExpand: boolean
  floatingExpanded: boolean
  onToggleSidebar: () => void
  onToggleOrientation: () => void
}

export function ContentArea({
  permission,
  hasAnyPassword,
  onAuthClick,
  onLogout,
  isPortraitMode,
  sidebarCollapsed,
  floatingExpand,
  floatingExpanded,
  onToggleSidebar,
  onToggleOrientation,
}: ContentAreaProps): React.JSX.Element {
  const { t } = useTranslation()

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
          <Button
            type="text"
            size="small"
            onClick={onToggleSidebar}
            icon={
              floatingExpand && sidebarCollapsed
                ? floatingExpanded
                  ? <MenuFoldOutlined />
                  : <MenuUnfoldOutlined />
                : sidebarCollapsed
                  ? <MenuUnfoldOutlined />
                  : <MenuFoldOutlined />
            }
            title={sidebarCollapsed ? "展开导航栏" : "收起导航栏"}
            style={{ width: "32px", height: "32px" }}
          />
        </div>
        <div
          data-tauri-drag-region
          style={
            {
              flex: 1,
              height: "100%",
              WebkitAppRegion: "drag",
            } as React.CSSProperties
          }
        />
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
        <WindowControls
          isPortraitMode={isPortraitMode}
          onToggleOrientation={onToggleOrientation}
        />
      </div>

      <Content style={{ flex: 1, overflowY: "auto", overflowX: "hidden" }}>
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
          <Routes>
            <Route
              path="/"
              element={
                <Home
                  canEdit={permission === "admin" || permission === "points"}
                  isPortraitMode={isPortraitMode}
                />
              }
            />
            <Route path="/students" element={<StudentManager canEdit={permission === "admin"} />} />
            <Route
              path="/score"
              element={<ScoreManager canEdit={permission === "admin" || permission === "points"} />}
            />
            <Route path="/leaderboard" element={<Leaderboard />} />
            <Route path="/settlements" element={<SettlementHistory />} />
            <Route path="/reasons" element={<ReasonManager canEdit={permission === "admin"} />} />
            <Route path="/auto-score" element={<AutoScoreManager />} />
            <Route path="/settings" element={<Settings permission={permission} />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </Content>
    </Layout>
  )
}
