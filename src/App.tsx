import { Layout, Modal, Input, message, ConfigProvider, theme as antTheme } from "antd"
import { HomeOutlined, SettingOutlined } from "@ant-design/icons"
import { useEffect, useMemo, useRef, useState } from "react"
import { HashRouter, useLocation, useNavigate, Routes, Route } from "react-router-dom"
import { useTranslation } from "react-i18next"
import { Sidebar } from "./components/Sidebar"
import { ContentArea } from "./components/ContentArea"
import { OOBE } from "./components/OOBE/OOBE"
import { ThemeProvider, useTheme } from "./contexts/ThemeContext"

function MainContent(): React.JSX.Element {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const { currentTheme } = useTheme()
  const [messageApi, contextHolder] = message.useMessage()
  const { isIosDevice, isAndroidDevice, defaultPortraitMode } = useMemo(getMobileDeviceInfo, [])
  const [immersiveMode, setImmersiveMode] = useState(false)

  useEffect(() => {
    const api = (window as any).api
    if (!api) return

    let disposed = false
    let unlisten: (() => void) | null = null

    api
      .onNavigate((route: string) => {
        const currentPath = location.pathname === "/" ? "/home" : location.pathname
        const targetPath = route === "/" ? "/home" : route

        if (immersiveMode && !targetPath.startsWith("/home")) {
          navigate("/", { replace: true })
          return
        }

        if (currentPath !== targetPath) {
          navigate(route)
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
  }, [navigate, location.pathname, immersiveMode])

  const [wizardVisible, setWizardVisible] = useState(false)
  const [permission, setPermission] = useState<"admin" | "points" | "view">("view")
  const [hasAnyPassword, setHasAnyPassword] = useState(false)
  const [authVisible, setAuthVisible] = useState(false)
  const [authPassword, setAuthPassword] = useState("")
  const [authLoading, setAuthLoading] = useState(false)
  const [isPortraitMode] = useState(defaultPortraitMode)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(defaultPortraitMode)
  const [floatingSidebarExpanded, setFloatingSidebarExpanded] = useState(false)
  const [syncConflictVisible, setSyncConflictVisible] = useState(false)
  const [syncConflicts, setSyncConflicts] = useState<
    Array<{ table: string; key: string; local_summary: string; remote_summary: string }>
  >([])
  const [syncApplyLoading, setSyncApplyLoading] = useState(false)
  const syncCheckingRef = useRef(false)
  const syncApplyLoadingRef = useRef(false)
  const lastLocalMutationAtRef = useRef(0)

  const activeMenu = useMemo(() => {
    const p = location.pathname
    if (p === "/" || p.startsWith("/home")) return "home"
    if (p.startsWith("/students")) return "students"
    if (p.startsWith("/score")) return "score"
    if (p.startsWith("/boards")) return "boards"
    if (p.startsWith("/leaderboard")) return "leaderboard"
    if (p.startsWith("/settlements")) return "settlements"
    if (p.startsWith("/reasons")) return "reasons"
    if (p.startsWith("/auto-score")) return "auto-score"
    if (p.startsWith("/reward-settings")) return "reward-settings"
    if (p.startsWith("/settings")) return "settings"
    return "home"
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
        if (anyPwd && authRes.data.permission === "view") setAuthVisible(true)
      }
    }

    loadAuthAndSettings()
  }, [])

  useEffect(() => {
    const api = (window as any).api
    if (!api || !isIosDevice) return

    const fitIosWindow = async () => {
      try {
        await api.windowMaximize()
      } catch {
        void 0
      }

      try {
        await api.windowSetResizable(false)
      } catch {
        void 0
      }

      try {
        // 传入远大于设备尺寸的物理像素，交由系统裁剪为可用全屏区域
        await api.windowResize(10000, 10000)
      } catch {
        void 0
      }
    }

    fitIosWindow().catch(() => void 0)
    const timer = window.setTimeout(() => {
      fitIosWindow().catch(() => void 0)
    }, 300)

    return () => {
      window.clearTimeout(timer)
    }
  }, [isIosDevice])

  useEffect(() => {
    const api = (window as any).api
    if (!api || typeof api.onDataUpdated !== "function") return

    let disposed = false
    let unlisten: (() => void) | null = null

    api
      .onDataUpdated((payload: { category?: string; source?: string }) => {
        const detail = {
          category: payload?.category || "all",
          source: payload?.source || "tauri",
        }
        window.dispatchEvent(new CustomEvent("ss:data-updated", { detail }))
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

  const applySyncStrategy = async (strategy: "keep_local" | "keep_remote") => {
    const api = (window as any).api
    if (!api) return
    setSyncApplyLoading(true)
    syncApplyLoadingRef.current = true
    try {
      const res = await api.dbSyncApply(strategy)
      if (res?.success && res?.data?.success) {
        messageApi.success(
          res.data.message ||
            `同步完成（同步 ${res.data.synced_records} 条，解决冲突 ${res.data.resolved_conflicts} 条）`
        )
        window.dispatchEvent(
          new CustomEvent("ss:data-updated", { detail: { category: "all", source: "sync" } })
        )
      } else {
        messageApi.error(res?.data?.message || res?.message || "同步失败")
      }
    } catch (error: any) {
      messageApi.error(error?.message || "同步失败")
    } finally {
      setSyncApplyLoading(false)
      syncApplyLoadingRef.current = false
      setSyncConflictVisible(false)
      setSyncConflicts([])
    }
  }

  useEffect(() => {
    const api = (window as any).api
    if (!api) return
    let disposed = false

    const checkAndSync = async () => {
      if (disposed || syncCheckingRef.current || syncApplyLoadingRef.current) return
      if (permission !== "admin") return
      try {
        syncCheckingRef.current = true
        const statusRes = await api.dbGetStatus()
        if (
          !statusRes?.success ||
          statusRes?.data?.type !== "postgresql" ||
          !statusRes?.data?.connected
        ) {
          return
        }

        const previewRes = await api.dbSyncPreview()
        if (!previewRes?.success || !previewRes?.data?.can_sync || !previewRes?.data?.need_sync) {
          return
        }

        const conflicts = previewRes.data.conflicts || []
        if (conflicts.length > 0) {
          const recentLocalMutation = Date.now() - lastLocalMutationAtRef.current < 15000
          if (recentLocalMutation) {
            const autoApplyRes = await api.dbSyncApply("keep_remote")
            if (
              autoApplyRes?.success &&
              autoApplyRes?.data?.success &&
              autoApplyRes?.data?.synced_records > 0
            ) {
              window.dispatchEvent(
                new CustomEvent("ss:data-updated", { detail: { category: "all", source: "sync" } })
              )
            }
            return
          }
          setSyncConflicts(conflicts)
          setSyncConflictVisible(true)
          return
        }

        const applyRes = await api.dbSyncApply("keep_remote")
        if (applyRes?.success && applyRes?.data?.success && applyRes?.data?.synced_records > 0) {
          window.dispatchEvent(
            new CustomEvent("ss:data-updated", { detail: { category: "all", source: "sync" } })
          )
        }
      } catch (error) {
        console.error("Auto sync failed:", error)
      } finally {
        syncCheckingRef.current = false
      }
    }

    checkAndSync()
    const timer = window.setInterval(checkAndSync, 30000)
    const onDataUpdated = (e: Event) => {
      const customEvent = e as CustomEvent<{ source?: string }>
      if (customEvent?.detail?.source !== "sync") {
        lastLocalMutationAtRef.current = Date.now()
      }
      window.setTimeout(() => {
        checkAndSync().catch(() => void 0)
      }, 1200)
    }
    window.addEventListener("ss:data-updated", onDataUpdated)

    return () => {
      disposed = true
      window.clearInterval(timer)
      window.removeEventListener("ss:data-updated", onDataUpdated)
    }
  }, [permission])

  const login = async () => {
    if (!(window as any).api) return
    setAuthLoading(true)
    const res = await (window as any).api.authLogin(authPassword)
    setAuthLoading(false)
    if (res.success && res.data) {
      setPermission(res.data.permission)
      setAuthVisible(false)
      setAuthPassword("")
      messageApi.success(t("auth.unlocked"))
    } else {
      messageApi.error(res.message || t("common.error"))
    }
  }

  const logout = async () => {
    if (!(window as any).api) return
    const res = await (window as any).api.authLogout()
    if (res?.success && res.data) {
      setPermission(res.data.permission)
      messageApi.success(t("auth.logout"))
    }
  }

  const onMenuChange = (v: string) => {
    const key = String(v)
    if (immersiveMode && key !== "home") return
    if (key === "home") navigate("/")
    if (key === "students") navigate("/students")
    if (key === "score") navigate("/score")
    if (key === "boards") navigate("/boards")
    if (key === "leaderboard") navigate("/leaderboard")
    if (key === "settlements") navigate("/settlements")
    if (key === "reasons") navigate("/reasons")
    if (key === "auto-score") navigate("/auto-score")
    if (key === "reward-settings") navigate("/reward-settings")
    if (key === "settings") navigate("/settings")
  }

  const toggleSidebar = () => {
    if (immersiveMode) return
    if (isPortraitMode && sidebarCollapsed) {
      setFloatingSidebarExpanded((prev) => !prev)
      return
    }
    setSidebarCollapsed((prev) => !prev)
  }

  useEffect(() => {
    if (!immersiveMode) return
    if (location.pathname !== "/" && !location.pathname.startsWith("/home")) {
      navigate("/", { replace: true })
    }
  }, [immersiveMode, location.pathname, navigate])

  const toggleImmersiveMode = () => {
    setImmersiveMode((prev) => {
      const next = !prev
      if (next) {
        setFloatingSidebarExpanded(false)
        if (location.pathname !== "/" && !location.pathname.startsWith("/home")) {
          navigate("/", { replace: true })
        }
      }
      return next
    })
  }

  const isDark = currentTheme?.mode === "dark"
  const brandColor = currentTheme?.config?.tdesign?.brandColor || "#0052D9"
  const showMobileBottomNav = isPortraitMode && !immersiveMode

  return (
    <ConfigProvider
      theme={{
        algorithm: isDark ? antTheme.darkAlgorithm : antTheme.defaultAlgorithm,
        token: {
          colorPrimary: brandColor,
          fontFamily:
            '"PingFang SC", "Hiragino Sans GB", "Heiti SC", "Noto Sans SC", "Noto Sans CJK SC", "Microsoft YaHei", "微软雅黑", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji"',
        },
      }}
    >
      {contextHolder}
      <Layout style={{ height: "100%", flexDirection: "row", overflow: "hidden", position: "relative" }}>
        {!isPortraitMode && (
          <div
            className={`ss-immersive-sidebar ${immersiveMode ? "is-hidden" : "is-visible"}`}
            style={
              {
                "--ss-sidebar-width": `${sidebarCollapsed ? 64 : 200}px`,
              } as React.CSSProperties
            }
          >
            <Sidebar
              activeMenu={activeMenu}
              permission={permission}
              onMenuChange={onMenuChange}
              collapsed={sidebarCollapsed}
              floatingExpand={isPortraitMode}
              floatingExpanded={floatingSidebarExpanded}
              onFloatingExpandedChange={setFloatingSidebarExpanded}
            />
          </div>
        )}
        <ContentArea
          permission={permission}
          hasAnyPassword={hasAnyPassword}
          onAuthClick={() => setAuthVisible(true)}
          onLogout={logout}
          showWindowControls={!isIosDevice && !isAndroidDevice}
          isPortraitMode={isPortraitMode}
          sidebarCollapsed={sidebarCollapsed}
          floatingExpand={isPortraitMode}
          floatingExpanded={floatingSidebarExpanded}
          onToggleSidebar={toggleSidebar}
          immersiveMode={immersiveMode}
          isHomePage={activeMenu === "home"}
          onToggleImmersiveMode={toggleImmersiveMode}
          showSidebarToggle={!isPortraitMode}
          bottomInset={showMobileBottomNav ? 84 : 0}
        />
        {showMobileBottomNav && (
          <div
            style={{
              position: "fixed",
              left: 0,
              right: 0,
              bottom: 0,
              background: "var(--ss-header-bg)",
              borderTop: "1px solid var(--ss-border-color)",
              zIndex: 1400,
              paddingBottom: "env(safe-area-inset-bottom, 0px)",
            }}
          >
            <div style={{ display: "flex", height: "60px" }}>
              <button
                type="button"
                onClick={() => onMenuChange("home")}
                style={{
                  flex: 1,
                  border: "none",
                  background: "transparent",
                  color:
                    activeMenu === "home"
                      ? "var(--ant-color-primary)"
                      : "var(--ss-text-secondary, var(--ss-text-main))",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "2px",
                  fontSize: "12px",
                }}
              >
                <HomeOutlined style={{ fontSize: "18px" }} />
                <span>{t("sidebar.home")}</span>
              </button>
              <button
                type="button"
                onClick={() => onMenuChange("settings")}
                style={{
                  flex: 1,
                  border: "none",
                  background: "transparent",
                  color:
                    activeMenu === "home"
                      ? "var(--ss-text-secondary, var(--ss-text-main))"
                      : "var(--ant-color-primary)",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "2px",
                  fontSize: "12px",
                }}
              >
                <SettingOutlined style={{ fontSize: "18px" }} />
                <span>{t("sidebar.settings")}</span>
              </button>
            </div>
          </div>
        )}

        <OOBE visible={wizardVisible} onComplete={() => setWizardVisible(false)} />

        <Modal
          title={t("auth.unlock")}
          open={authVisible}
          onCancel={() => setAuthVisible(false)}
          onOk={login}
          confirmLoading={authLoading}
          okText={t("auth.unlockButton")}
          cancelText={t("common.cancel")}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <div style={{ color: "var(--ss-text-secondary)", fontSize: "12px" }}>
              {t("auth.unlockHint")}
            </div>
            <Input
              value={authPassword}
              onChange={(e) => setAuthPassword(e.target.value)}
              placeholder={t("auth.passwordPlaceholder")}
              maxLength={6}
            />
          </div>
        </Modal>

        <Modal
          title="检测到本地与远程数据冲突"
          open={syncConflictVisible}
          onCancel={() => {
            if (syncApplyLoading) return
            setSyncConflictVisible(false)
          }}
          footer={null}
          closable={!syncApplyLoading}
          maskClosable={false}
          destroyOnClose
        >
          <div
            style={{ marginBottom: "10px", color: "var(--ss-text-secondary)", fontSize: "12px" }}
          >
            自动同步发现冲突，请选择冲突时优先保留哪一侧的数据。
          </div>
          <div
            style={{
              maxHeight: "280px",
              overflow: "auto",
              border: "1px solid var(--ss-border-color)",
              borderRadius: "6px",
              padding: "8px",
              marginBottom: "12px",
              fontSize: "12px",
            }}
          >
            {syncConflicts.slice(0, 30).map((item) => (
              <div key={`${item.table}-${item.key}`} style={{ marginBottom: "8px" }}>
                <div>
                  <b>{item.table}</b> / <b>{item.key}</b>
                </div>
                <div>本地: {item.local_summary}</div>
                <div>远程: {item.remote_summary}</div>
              </div>
            ))}
            {syncConflicts.length > 30 && <div>仅显示前 30 条冲突...</div>}
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
            <button
              style={{ padding: "6px 10px", cursor: syncApplyLoading ? "not-allowed" : "pointer" }}
              disabled={syncApplyLoading}
              onClick={() => applySyncStrategy("keep_remote")}
            >
              保留远程
            </button>
            <button
              style={{ padding: "6px 10px", cursor: syncApplyLoading ? "not-allowed" : "pointer" }}
              disabled={syncApplyLoading}
              onClick={() => applySyncStrategy("keep_local")}
            >
              保留本地
            </button>
          </div>
        </Modal>

        {import.meta.env.DEV ? (
          <div
            style={{
              position: "fixed",
              display: "flex",
              bottom: "2px",
              left: "20px",
              opacity: 0.6,
              zIndex: 9999,
              pointerEvents: "none",
            }}
          >
            <p
              style={{
                color: "#df0000",
                fontWeight: "bold",
                fontSize: "14px",
                pointerEvents: "none",
              }}
            >
              开发中画面,不代表最终品质
            </p>
            <p
              style={{
                color: currentTheme?.mode === "dark" ? "#fff" : "#44474b",
                fontWeight: "bold",
                fontSize: "13px",
                paddingLeft: "5px",
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

  if (userAgent.includes("arm64") || userAgent.includes("aarch64")) {
    return "ARM64"
  } else if (
    userAgent.includes("x64") ||
    userAgent.includes("amd64") ||
    userAgent.includes("x86_64") ||
    userAgent.includes("intel")
  ) {
    return "x64"
  } else if (userAgent.includes("i386") || userAgent.includes("i686")) {
    return "x86"
  }

  return "Unknown"
}

function getPlatform(): string {
  const userAgent = navigator.userAgent.toLowerCase()

  if (userAgent.includes("iphone") || userAgent.includes("ipad") || userAgent.includes("ipod")) {
    return "iOS"
  } else if (userAgent.includes("android")) {
    return "Android"
  }

  if (userAgent.includes("windows")) {
    return "Windows"
  } else if (userAgent.includes("mac")) {
    return "Mac"
  } else if (userAgent.includes("linux")) {
    return "Linux"
  }

  return "Unknown"
}

function getIosDeviceInfo(): { isIosDevice: boolean; isIosPhone: boolean } {
  const userAgent = navigator.userAgent.toLowerCase()
  const isIosDevice = /iphone|ipad|ipod/.test(userAgent)
  const isIosTablet = userAgent.includes("ipad")
  return {
    isIosDevice,
    isIosPhone: isIosDevice && !isIosTablet,
  }
}

function getMobileDeviceInfo(): {
  isIosDevice: boolean
  isAndroidDevice: boolean
  defaultPortraitMode: boolean
} {
  const { isIosDevice, isIosPhone } = getIosDeviceInfo()
  const isAndroidDevice = navigator.userAgent.toLowerCase().includes("android")
  return {
    isIosDevice,
    isAndroidDevice,
    defaultPortraitMode: isIosPhone || isAndroidDevice,
  }
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
