import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from "react"
import { themeConfig } from "../preload/types"
import { generateColorMap } from "../utils/color"

interface themeContextType {
  currentTheme: themeConfig | null
  setTheme: (id: string) => Promise<void>
  themes: themeConfig[]
  applyTheme: (theme: themeConfig) => void
}

const ThemeContext = createContext<themeContextType | undefined>(undefined)

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentTheme, setCurrentTheme] = useState<themeConfig | null>(null)
  const [themes, setThemes] = useState<themeConfig[]>([])
  const appliedStyleKeysRef = useRef<string[]>([])
  const currentThemeRef = useRef<themeConfig | null>(null)

  const applyThemeConfig = useCallback((theme: themeConfig) => {
    if (!theme) return
    const tdesign = theme.config?.tdesign || {}
    const custom = theme.config?.custom || {}
    const root = document.documentElement
    const prevKeys = appliedStyleKeysRef.current
    for (const k of prevKeys) root.style.removeProperty(k)
    const nextKeys: string[] = []

    root.setAttribute("theme-mode", theme.mode || "light")

    const brandColor = tdesign.brandColor || "#1677FF"
    const hex = brandColor.replace("#", "")
    const r = parseInt(hex.substring(0, 2), 16)
    const g = parseInt(hex.substring(2, 4), 16)
    const b = parseInt(hex.substring(4, 6), 16)

    root.style.setProperty("--ss-primary-color", brandColor)
    root.style.setProperty("--ss-primary-rgb", `${r}, ${g}, ${b}`)
    nextKeys.push("--ss-primary-color")
    nextKeys.push("--ss-primary-rgb")

    if (brandColor) {
      const colorMap = generateColorMap(brandColor, theme.mode || "light")
      Object.entries(colorMap).forEach(([key, value]) => {
        root.style.setProperty(key, value)
        nextKeys.push(key)
      })

      root.style.setProperty("--ant-color-primary", brandColor)
      nextKeys.push("--ant-color-primary")

      root.style.setProperty("--ant-color-primary-hover", `rgba(${r}, ${g}, ${b}, 0.85)`)
      root.style.setProperty("--ant-color-primary-active", `rgba(${r}, ${g}, ${b}, 0.7)`)
      root.style.setProperty("--ant-color-primary-bg", `rgba(${r}, ${g}, ${b}, 0.1)`)
      root.style.setProperty("--ant-color-primary-bg-hover", `rgba(${r}, ${g}, ${b}, 0.2)`)
      root.style.setProperty("--ant-color-primary-border", `rgba(${r}, ${g}, ${b}, 0.3)`)

      nextKeys.push("--ant-color-primary-hover")
      nextKeys.push("--ant-color-primary-active")
      nextKeys.push("--ant-color-primary-bg")
      nextKeys.push("--ant-color-primary-bg-hover")
      nextKeys.push("--ant-color-primary-border")
    }

    if (tdesign.warningColor) {
      root.style.setProperty("--ant-color-warning", tdesign.warningColor)
      nextKeys.push("--ant-color-warning")
    }
    if (tdesign.errorColor) {
      root.style.setProperty("--ant-color-error", tdesign.errorColor)
      nextKeys.push("--ant-color-error")
    }
    if (tdesign.successColor) {
      root.style.setProperty("--ant-color-success", tdesign.successColor)
      nextKeys.push("--ant-color-success")
    }

    Object.entries(custom).forEach(([key, value]) => {
      root.style.setProperty(key, String(value))
      nextKeys.push(key)
    })

    const bgLight = custom["--ss-bg-color-light"]
    const bgDark = custom["--ss-bg-color-dark"]
    if (bgLight || bgDark) {
      const resolved = theme.mode === "dark" ? bgDark || bgLight : bgLight || bgDark
      if (resolved) {
        root.style.setProperty("--ss-bg-color", resolved)
        nextKeys.push("--ss-bg-color")
      }
    }

    if (!custom["--ss-sidebar-active-bg"]) {
      const alpha = theme.mode === "dark" ? 0.22 : 0.12
      root.style.setProperty("--ss-sidebar-active-bg", `rgba(${r}, ${g}, ${b}, ${alpha})`)
      nextKeys.push("--ss-sidebar-active-bg")
    }
    if (!custom["--ss-sidebar-active-text"]) {
      root.style.setProperty("--ss-sidebar-active-text", brandColor)
      nextKeys.push("--ss-sidebar-active-text")
    }

    appliedStyleKeysRef.current = nextKeys
  }, [])

  const loadThemes = useCallback(async () => {
    if (!(window as any).api) return
    const res = await (window as any).api.getThemes()
    if (res.success && res.data) {
      setThemes(res.data)
    }
  }, [])

  const loadCurrentTheme = useCallback(async () => {
    if (!(window as any).api) return
    const res = await (window as any).api.getCurrentTheme()
    if (res.success && res.data) {
      setCurrentTheme(res.data)
      currentThemeRef.current = res.data
      applyThemeConfig(res.data)
    }
  }, [applyThemeConfig])

  useEffect(() => {
    const api = (window as any).api
    if (!api) return

    ;(async () => {
      await loadThemes()
      await loadCurrentTheme()
    })()

    let disposed = false
    let unlisten: (() => void) | null = null

    api
      .onThemeChanged((theme: themeConfig) => {
        setCurrentTheme(theme)
        currentThemeRef.current = theme
        applyThemeConfig(theme)
        loadThemes()
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
  }, [applyThemeConfig, loadCurrentTheme, loadThemes])

  const setTheme = async (id: string) => {
    const res = await (window as any).api.setTheme(id)
    if (res.success) {
      await loadCurrentTheme()
    }
  }

  const applyTheme = useCallback(
    (theme: themeConfig) => {
      applyThemeConfig(theme)
    },
    [applyThemeConfig]
  )

  return (
    <ThemeContext.Provider value={{ currentTheme, setTheme, themes, applyTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export const useTheme = () => {
  const context = useContext(ThemeContext)
  if (!context) throw new Error("useTheme must be used within ThemeProvider")
  return context
}
