import React, { useEffect, useRef, useState } from "react"
import { Menu, Card, Form, Select, Switch, message, Layout, Button, Space } from "antd"
import {
  SettingOutlined,
  SafetyOutlined,
  UserOutlined,
  DatabaseOutlined,
  FileTextOutlined,
  LinkOutlined,
  InfoCircleOutlined,
  ApiOutlined,
  CloseOutlined,
  MinusOutlined,
  FullscreenOutlined,
  FullscreenExitOutlined,
} from "@ant-design/icons"
import { ThemeQuickSettings } from "./ThemeQuickSettings"
import { useTranslation } from "react-i18next"
import { pinyin } from "pinyin-pro"
import { changeLanguage, getCurrentLanguage, languageOptions, AppLanguage } from "../i18n"
import { useResponsive } from "../hooks/useResponsive"
import {
  buildSystemFontFamily,
  buildSystemFontValue,
  SYSTEM_FONT_STACK,
} from "../shared/fontFamily"
import { useConfig } from "../hooks/useConfig"

const { Content } = Layout

type permissionLevel = "admin" | "points" | "view"

interface FontOption {
  value: string
  label: string
  fontFamily: string
  searchText: string
}

const CHINESE_FONT_CHAR_PATTERN = /[\u3400-\u9fff]/
const CHINESE_FONT_SEGMENT_PATTERN = /[\u3400-\u9fff]+/g

const toPascalCasePinyin = (value: string): string =>
  pinyin(value, { toneType: "none" })
    .split(/\s+/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1).toLowerCase())
    .join("")

const formatFontDisplayName = (name: string): string => {
  if (!CHINESE_FONT_CHAR_PATTERN.test(name)) return name
  return name.replace(CHINESE_FONT_SEGMENT_PATTERN, (segment) => toPascalCasePinyin(segment))
}

const buildFontSearchText = (name: string, label: string): string =>
  `${name} ${label}`.toLowerCase()

const defaultFontOptions: FontOption[] = [
  {
    value: "system",
    label: "系统默认",
    fontFamily: SYSTEM_FONT_STACK,
    searchText: "系统默认 system default",
  },
]

const mergeFontOptions = (options: FontOption[]): FontOption[] => {
  const map = new Map<string, FontOption>()
  for (const option of options) {
    if (!map.has(option.value)) {
      map.set(option.value, option)
    }
  }
  return Array.from(map.values())
}

const findFontOption = (options: FontOption[], value?: string): FontOption | undefined => {
  if (!value) return options.find((item) => item.value === "system") || options[0]
  return (
    options.find((item) => item.value === value) || options.find((item) => item.value === "system")
  )
}

const applyFontFamily = (fontFamily: string) => {
  document.documentElement.style.setProperty("--ss-font-family", fontFamily)
  document.body.style.fontFamily = fontFamily
}

export const SettingsWindow: React.FC<{
  permission: permissionLevel
}> = ({ permission }) => {
  const { t } = useTranslation()
  const breakpoint = useResponsive()
  const isMobile = breakpoint === "xs" || breakpoint === "sm"
  const [activeTab, setActiveTab] = useState("appearance")
  const [currentLanguage, setCurrentLanguage] = useState<AppLanguage>(getCurrentLanguage())
  const [fontFamily, setFontFamily, fontLoading] = useConfig("font_family", "system")
  const [windowZoom, setWindowZoom] = useConfig("window_zoom", 1.0)
  const [searchKeyboardLayout, setSearchKeyboardLayout] = useConfig(
    "search_keyboard_layout",
    "qwerty26" as any
  )
  const [disableSearchKeyboard, setDisableSearchKeyboard] = useConfig(
    "disable_search_keyboard",
    false
  )

  const [fontOptions, setFontOptions] = useState<FontOption[]>(defaultFontOptions)
  const [isLoadingFonts, setIsLoadingFonts] = useState(false)
  const fontOptionsRef = useRef<FontOption[]>(defaultFontOptions)

  const canAdmin = permission === "admin"
  const [messageApi, contextHolder] = message.useMessage()

  // 窗口控制状态
  const [isMaximized, setIsMaximized] = useState(false)

  // 窗口控制函数
  const handleMinimize = async () => {
    const api = (window as any).api
    if (api?.windowMinimize) {
      await api.windowMinimize()
    }
  }

  const handleMaximize = async () => {
    const api = (window as any).api
    if (api?.windowMaximize) {
      const result = await api.windowMaximize()
      setIsMaximized(result)
    }
  }

  const handleClose = async () => {
    const api = (window as any).api
    if (api?.closeSettingsWindow) {
      await api.closeSettingsWindow()
    }
  }

  // 监听最大化状态变化
  useEffect(() => {
    const api = (window as any).api
    if (api?.onWindowMaximizedChanged) {
      api.onWindowMaximizedChanged((maximized: boolean) => {
        setIsMaximized(maximized)
      })
    }
  }, [])

  const loadSystemFonts = async (selectedFontValue?: string) => {
    setIsLoadingFonts(true)

    const applySelectedFont = (options: FontOption[]) => {
      const current = findFontOption(options, selectedFontValue || fontFamily)
      if (current) applyFontFamily(current.fontFamily)
    }

    const api = (window as any).api
    if (!api?.getSystemFonts) {
      setFontOptions(defaultFontOptions)
      applySelectedFont(defaultFontOptions)
      setIsLoadingFonts(false)
      return
    }

    try {
      const res = await api.getSystemFonts()
      if (res.success && Array.isArray(res.data)) {
        const remoteOptions = res.data
          .map((name: string) => String(name || "").trim())
          .filter((name: string) => Boolean(name))
          .map((name: string) => {
            const label = formatFontDisplayName(name)
            return {
              value: buildSystemFontValue(name),
              label,
              fontFamily: buildSystemFontFamily(name),
              searchText: buildFontSearchText(name, label),
            } satisfies FontOption
          })
          .sort((a: FontOption, b: FontOption) =>
            a.label.localeCompare(b.label, "zh-Hans-CN-u-co-pinyin")
          )

        const mergedOptions = mergeFontOptions([...defaultFontOptions, ...remoteOptions])
        setFontOptions(mergedOptions)
        applySelectedFont(mergedOptions)
      } else {
        setFontOptions(defaultFontOptions)
        applySelectedFont(defaultFontOptions)
      }
    } catch (error) {
      console.error("Failed to load system fonts:", error)
      setFontOptions(defaultFontOptions)
      applySelectedFont(defaultFontOptions)
    } finally {
      setIsLoadingFonts(false)
    }
  }

  useEffect(() => {
    fontOptionsRef.current = fontOptions
  }, [fontOptions])

  useEffect(() => {
    loadSystemFonts(fontFamily)
  }, [])

  const menuItems = [
    {
      key: "appearance",
      icon: <SettingOutlined />,
      label: t("settings.tabs.appearance"),
    },
    {
      key: "security",
      icon: <SafetyOutlined />,
      label: t("settings.tabs.security"),
    },
    {
      key: "account",
      icon: <UserOutlined />,
      label: t("settings.tabs.account"),
    },
    {
      key: "database",
      icon: <DatabaseOutlined />,
      label: t("settings.database.title"),
    },
    {
      key: "data",
      icon: <FileTextOutlined />,
      label: t("settings.data.title"),
    },
    {
      key: "url",
      icon: <LinkOutlined />,
      label: t("settings.url.title"),
    },
    {
      key: "about",
      icon: <InfoCircleOutlined />,
      label: t("settings.about.title"),
    },
    {
      key: "api",
      icon: <ApiOutlined />,
      label: t("settings.mcp.title"),
    },
  ]

  const renderContent = () => {
    switch (activeTab) {
      case "appearance":
        return (
          <Card style={{ backgroundColor: "var(--ss-card-bg)", color: "var(--ss-text-main)" }}>
            <Form layout="vertical">
              <Form.Item label={t("settings.language")}>
                <Select
                  value={currentLanguage}
                  onChange={async (v: AppLanguage) => {
                    await changeLanguage(v)
                    setCurrentLanguage(v)
                    messageApi.success(t("common.success"))
                  }}
                  style={{ width: "320px" }}
                  options={languageOptions.map((opt) => ({
                    value: opt.value,
                    label: opt.label,
                  }))}
                />
              </Form.Item>

              <ThemeQuickSettings />

              <Form.Item label={t("settings.fontFamily")}>
                <Select
                  value={fontFamily}
                  onChange={async (v) => {
                    const fontOpt = findFontOption(fontOptions, String(v))
                    if (!fontOpt) return
                    applyFontFamily(fontOpt.fontFamily)
                    await setFontFamily(String(v))
                    messageApi.success(t("settings.general.saved"))
                  }}
                  style={{ width: "320px" }}
                  loading={isLoadingFonts || fontLoading}
                  options={fontOptions.map((opt) => ({
                    value: opt.value,
                    label: opt.label,
                    searchText: opt.searchText,
                  }))}
                  showSearch
                  filterOption={(input, option) =>
                    String(option?.searchText ?? option?.label ?? "")
                      .toLowerCase()
                      .includes(input.toLowerCase())
                  }
                />
              </Form.Item>

              {!isMobile && (
                <>
                  <Form.Item label={t("settings.searchKeyboard.title")}>
                    <Select
                      value={searchKeyboardLayout}
                      onChange={async (v) => {
                        await setSearchKeyboardLayout(String(v) as any)
                        messageApi.success(t("settings.general.saved"))
                      }}
                      style={{ width: "320px" }}
                      disabled={!canAdmin}
                      options={[
                        { value: "qwerty26", label: t("settings.searchKeyboard.options.qwerty26") },
                        { value: "t9", label: t("settings.searchKeyboard.options.t9") },
                      ]}
                    />
                  </Form.Item>

                  <Form.Item label={t("settings.searchKeyboard.disableToggle")}>
                    <Switch
                      checked={disableSearchKeyboard}
                      onChange={async (checked) => {
                        await setDisableSearchKeyboard(checked)
                        messageApi.success(t("settings.general.saved"))
                      }}
                      disabled={!canAdmin}
                    />
                  </Form.Item>
                </>
              )}

              <Form.Item label={t("settings.interfaceZoom")}>
                <Select
                  value={String(windowZoom)}
                  onChange={async (v) => {
                    await setWindowZoom(Number(v))
                    messageApi.success(t("settings.general.saved"))
                  }}
                  style={{ width: "320px" }}
                  disabled={!canAdmin}
                  options={[
                    { value: "0.7", label: t("settings.zoomOptions.small70") },
                    { value: "0.8", label: "80%" },
                    { value: "0.9", label: "90%" },
                    { value: "1.0", label: t("settings.zoomOptions.default100") },
                    { value: "1.1", label: "110%" },
                    { value: "1.2", label: "120%" },
                    { value: "1.3", label: "130%" },
                    { value: "1.5", label: t("settings.zoomOptions.large150") },
                  ]}
                />
              </Form.Item>
            </Form>
          </Card>
        )
      default:
        return (
          <Card style={{ backgroundColor: "var(--ss-card-bg)", color: "var(--ss-text-main)" }}>
            <div
              style={{ textAlign: "center", padding: "40px", color: "var(--ss-text-secondary)" }}
            >
              {t("common.comingSoon")}
            </div>
          </Card>
        )
    }
  }

  return (
    <Layout style={{ minHeight: "100vh", background: "var(--ss-bg)" }}>
      {contextHolder}
      {!isMobile && (
        <Layout.Sider
          width={240}
          style={{
            background: "var(--ss-card-bg)",
            borderRight: "1px solid var(--ss-border)",
          }}
        >
          <div style={{ padding: "16px", color: "var(--ss-text-main)", fontWeight: 600 }}>
            {t("settings.title")}
          </div>
          <Menu
            mode="inline"
            selectedKeys={[activeTab]}
            items={menuItems}
            onClick={({ key }) => setActiveTab(key)}
            style={{ borderRight: 0 }}
          />
        </Layout.Sider>
      )}
      <Layout>
        {/* 窗口标题栏 */}
        <div
          data-tauri-drag-region
          style={{
            height: "40px",
            background: "var(--ss-card-bg)",
            borderBottom: "1px solid var(--ss-border)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 16px",
            userSelect: "none",
            // @ts-ignore - Tauri specific property
            WebkitAppRegion: "drag",
          }}
        >
          <div style={{ fontWeight: 500, color: "var(--ss-text-main)" }}>{t("settings.title")}</div>
          <Space
            size={4}
            style={{
              // @ts-ignore - Tauri specific property
              WebkitAppRegion: "no-drag",
            }}
          >
            <Button type="text" size="small" icon={<MinusOutlined />} onClick={handleMinimize} />
            <Button
              type="text"
              size="small"
              icon={isMaximized ? <FullscreenExitOutlined /> : <FullscreenOutlined />}
              onClick={handleMaximize}
            />
            <Button
              type="text"
              size="small"
              danger
              icon={<CloseOutlined />}
              onClick={handleClose}
            />
          </Space>
        </div>

        <Content style={{ padding: "24px", overflow: "auto" }}>
          <div style={{ maxWidth: "900px", margin: "0 auto" }}>{renderContent()}</div>
        </Content>
      </Layout>

      {/* Mobile bottom navigation */}
      {isMobile && (
        <div
          style={{
            position: "fixed",
            bottom: 0,
            left: 0,
            right: 0,
            background: "var(--ss-card-bg)",
            borderTop: "1px solid var(--ss-border)",
            display: "flex",
            justifyContent: "space-around",
            padding: "8px 0",
          }}
        >
          {menuItems.map((item) => (
            <div
              key={item.key}
              onClick={() => setActiveTab(item.key)}
              style={{
                textAlign: "center",
                color:
                  activeTab === item.key ? "var(--ant-color-primary)" : "var(--ss-text-secondary)",
                cursor: "pointer",
              }}
            >
              {item.icon}
              <div style={{ fontSize: "12px", marginTop: "4px" }}>{item.label}</div>
            </div>
          ))}
        </div>
      )}
    </Layout>
  )
}
