/**
 * SecScore 内置插件系统
 * 将非核心功能作为内置插件提供，默认不安装
 */

import { DisposablePlugin } from "../../di/DisposablePlugin"

// 插件元数据接口
export interface BuiltinPluginMeta {
  id: string
  name: string
  description: string
  version: string
  author: string
  icon?: string
  category: "automation" | "visualization" | "management" | "integration"
  defaultEnabled: boolean
  requiresAdmin: boolean
}

// 内置插件注册表
export const BUILTIN_PLUGINS: BuiltinPluginMeta[] = [
  {
    id: "auto-score",
    name: "自动评分",
    description: "基于规则的自动评分系统，支持定时任务和条件触发",
    version: "1.0.0",
    author: "SecScore Team",
    category: "automation",
    defaultEnabled: false,
    requiresAdmin: true,
  },
  {
    id: "boards",
    name: "看板管理",
    description: "可视化数据看板，支持自定义布局和实时数据展示",
    version: "1.0.0",
    author: "SecScore Team",
    category: "visualization",
    defaultEnabled: false,
    requiresAdmin: true,
  },
  {
    id: "settlements",
    name: "结算历史",
    description: "积分结算记录管理，支持导出和统计分析",
    version: "1.0.0",
    author: "SecScore Team",
    category: "management",
    defaultEnabled: false,
    requiresAdmin: false,
  },
  {
    id: "reward-settings",
    name: "奖励设置",
    description: "奖励兑换系统配置，管理奖励项目和兑换规则",
    version: "1.0.0",
    author: "SecScore Team",
    category: "management",
    defaultEnabled: false,
    requiresAdmin: true,
  },
  {
    id: "cloud-sync",
    name: "云同步",
    description: "SECTL 云服务集成，支持数据云同步和跨设备访问",
    version: "1.0.0",
    author: "SecScore Team",
    category: "integration",
    defaultEnabled: false,
    requiresAdmin: true,
  },
]

// 插件状态存储键（用于 future use）
// const PLUGIN_STATE_KEY = "builtin_plugins_state"

// 插件状态接口
export interface PluginState {
  [pluginId: string]: {
    enabled: boolean
    installed: boolean
    installedAt?: number
    config?: Record<string, unknown>
  }
}

const PLUGIN_STATE_STORAGE_KEY = "secscore_builtin_plugins_state"

/**
 * 获取插件状态
 */
export async function getPluginState(): Promise<PluginState> {
  try {
    const stored = localStorage.getItem(PLUGIN_STATE_STORAGE_KEY)
    return stored ? JSON.parse(stored) : {}
  } catch {
    return {}
  }
}

/**
 * 保存插件状态
 */
export async function savePluginState(state: PluginState): Promise<void> {
  try {
    localStorage.setItem(PLUGIN_STATE_STORAGE_KEY, JSON.stringify(state))
  } catch (error) {
    console.error("Failed to save plugin state:", error)
  }
}

/**
 * 检查插件是否已安装
 */
export async function isPluginInstalled(pluginId: string): Promise<boolean> {
  const state = await getPluginState()
  return state[pluginId]?.installed || false
}

/**
 * 检查插件是否已启用
 */
export async function isPluginEnabled(pluginId: string): Promise<boolean> {
  const state = await getPluginState()
  return state[pluginId]?.enabled || false
}

/**
 * 安装插件
 */
export async function installPlugin(pluginId: string): Promise<boolean> {
  const meta = BUILTIN_PLUGINS.find((p) => p.id === pluginId)
  if (!meta) return false

  const state = await getPluginState()
  state[pluginId] = {
    enabled: meta.defaultEnabled,
    installed: true,
    installedAt: Date.now(),
    config: {},
  }
  await savePluginState(state)

  // 触发插件安装事件
  window.dispatchEvent(new CustomEvent("ss:plugin-installed", { detail: { pluginId } }))

  return true
}

/**
 * 卸载插件
 */
export async function uninstallPlugin(pluginId: string): Promise<boolean> {
  const state = await getPluginState()
  if (state[pluginId]) {
    state[pluginId].installed = false
    state[pluginId].enabled = false
    await savePluginState(state)

    // 触发插件卸载事件
    window.dispatchEvent(new CustomEvent("ss:plugin-uninstalled", { detail: { pluginId } }))
  }
  return true
}

/**
 * 启用插件
 */
export async function enablePlugin(pluginId: string): Promise<boolean> {
  const state = await getPluginState()
  if (!state[pluginId]?.installed) {
    // 如果未安装，先安装
    await installPlugin(pluginId)
  }

  state[pluginId].enabled = true
  await savePluginState(state)

  // 触发插件启用事件
  window.dispatchEvent(new CustomEvent("ss:plugin-enabled", { detail: { pluginId } }))

  return true
}

/**
 * 禁用插件
 */
export async function disablePlugin(pluginId: string): Promise<boolean> {
  const state = await getPluginState()
  if (state[pluginId]) {
    state[pluginId].enabled = false
    await savePluginState(state)

    // 触发插件禁用事件
    window.dispatchEvent(new CustomEvent("ss:plugin-disabled", { detail: { pluginId } }))
  }
  return true
}

/**
 * 获取已安装的内置插件列表
 */
export async function getInstalledPlugins(): Promise<
  Array<BuiltinPluginMeta & { enabled: boolean; installedAt?: number }>
> {
  const state = await getPluginState()
  return BUILTIN_PLUGINS.filter((p) => state[p.id]?.installed).map((p) => ({
    ...p,
    enabled: state[p.id]?.enabled || false,
    installedAt: state[p.id]?.installedAt,
  }))
}

/**
 * 获取可用的内置插件列表
 */
export async function getAvailablePlugins(): Promise<
  Array<BuiltinPluginMeta & { installed: boolean; enabled: boolean }>
> {
  const state = await getPluginState()
  return BUILTIN_PLUGINS.map((p) => ({
    ...p,
    installed: state[p.id]?.installed || false,
    enabled: state[p.id]?.enabled || false,
  }))
}

/**
 * 初始化内置插件系统
 * 在应用启动时调用
 */
export async function initBuiltinPlugins(): Promise<void> {
  // 确保状态存在
  const state = await getPluginState()

  // 为每个插件初始化默认状态
  let hasChanges = false
  for (const plugin of BUILTIN_PLUGINS) {
    if (!state[plugin.id]) {
      state[plugin.id] = {
        enabled: false,
        installed: false,
        config: {},
      }
      hasChanges = true
    }
  }

  if (hasChanges) {
    await savePluginState(state)
  }

  console.log("[BuiltinPlugins] Initialized")
}

/**
 * 内置插件管理器类
 */
export class BuiltinPluginManager extends DisposablePlugin {
  constructor() {
    super("builtin-plugin-manager")
  }

  protected async onInitialize(): Promise<void> {
    console.log("[BuiltinPluginManager] Initializing...")
    await initBuiltinPlugins()

    // 监听 localStorage 变化
    const handleStorageChange = (event: StorageEvent) => {
      if (event.key === PLUGIN_STATE_STORAGE_KEY) {
        console.log("[BuiltinPluginManager] Plugin state changed")
        window.dispatchEvent(new CustomEvent("ss:plugins-state-changed"))
      }
    }

    window.addEventListener("storage", handleStorageChange)

    this.registerDisposer(() => {
      window.removeEventListener("storage", handleStorageChange)
    })

    console.log("[BuiltinPluginManager] Initialized")
  }
}

// 导出全局实例
export const builtinPluginManager = new BuiltinPluginManager()
