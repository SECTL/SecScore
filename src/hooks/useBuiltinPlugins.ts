import { useEffect, useState, useCallback } from "react"
import {
  BuiltinPluginMeta,
  getAvailablePlugins,
  getInstalledPlugins,
  installPlugin,
  uninstallPlugin,
  enablePlugin,
  disablePlugin,
  isPluginEnabled,
} from "../plugins/builtin"

/**
 * React Hook: 使用内置插件系统
 */
export function useBuiltinPlugins() {
  const [plugins, setPlugins] = useState<
    Array<BuiltinPluginMeta & { installed: boolean; enabled: boolean }>
  >([])
  const [installedPlugins, setInstalledPlugins] = useState<
    Array<BuiltinPluginMeta & { enabled: boolean; installedAt?: number }>
  >([])
  const [loading, setLoading] = useState(true)

  const refreshPlugins = useCallback(async () => {
    setLoading(true)
    try {
      const [available, installed] = await Promise.all([
        getAvailablePlugins(),
        getInstalledPlugins(),
      ])
      setPlugins(available)
      setInstalledPlugins(installed)
    } catch (error) {
      console.error("Failed to refresh plugins:", error)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refreshPlugins()

    // 监听插件状态变化
    const handleStateChanged = () => {
      refreshPlugins()
    }

    window.addEventListener("ss:plugins-state-changed", handleStateChanged)
    window.addEventListener("ss:plugin-installed", handleStateChanged)
    window.addEventListener("ss:plugin-uninstalled", handleStateChanged)
    window.addEventListener("ss:plugin-enabled", handleStateChanged)
    window.addEventListener("ss:plugin-disabled", handleStateChanged)

    return () => {
      window.removeEventListener("ss:plugins-state-changed", handleStateChanged)
      window.removeEventListener("ss:plugin-installed", handleStateChanged)
      window.removeEventListener("ss:plugin-uninstalled", handleStateChanged)
      window.removeEventListener("ss:plugin-enabled", handleStateChanged)
      window.removeEventListener("ss:plugin-disabled", handleStateChanged)
    }
  }, [refreshPlugins])

  const install = useCallback(
    async (pluginId: string) => {
      const result = await installPlugin(pluginId)
      if (result) {
        await refreshPlugins()
      }
      return result
    },
    [refreshPlugins]
  )

  const uninstall = useCallback(
    async (pluginId: string) => {
      const result = await uninstallPlugin(pluginId)
      if (result) {
        await refreshPlugins()
      }
      return result
    },
    [refreshPlugins]
  )

  const enable = useCallback(
    async (pluginId: string) => {
      const result = await enablePlugin(pluginId)
      if (result) {
        await refreshPlugins()
      }
      return result
    },
    [refreshPlugins]
  )

  const disable = useCallback(
    async (pluginId: string) => {
      const result = await disablePlugin(pluginId)
      if (result) {
        await refreshPlugins()
      }
      return result
    },
    [refreshPlugins]
  )

  const isEnabled = useCallback(async (pluginId: string) => {
    return await isPluginEnabled(pluginId)
  }, [])

  return {
    plugins,
    installedPlugins,
    loading,
    refreshPlugins,
    install,
    uninstall,
    enable,
    disable,
    isEnabled,
  }
}

/**
 * React Hook: 检查特定插件是否启用
 */
export function usePluginEnabled(pluginId: string): boolean {
  const [enabled, setEnabled] = useState(false)

  useEffect(() => {
    let mounted = true

    const checkEnabled = async () => {
      try {
        const result = await isPluginEnabled(pluginId)
        if (mounted) {
          setEnabled(result)
        }
      } catch (error) {
        console.error(`Failed to check plugin ${pluginId} state:`, error)
      }
    }

    checkEnabled()

    const handleStateChanged = () => {
      checkEnabled()
    }

    window.addEventListener("ss:plugins-state-changed", handleStateChanged)
    window.addEventListener("ss:plugin-enabled", handleStateChanged)
    window.addEventListener("ss:plugin-disabled", handleStateChanged)

    return () => {
      mounted = false
      window.removeEventListener("ss:plugins-state-changed", handleStateChanged)
      window.removeEventListener("ss:plugin-enabled", handleStateChanged)
      window.removeEventListener("ss:plugin-disabled", handleStateChanged)
    }
  }, [pluginId])

  return enabled
}
