import { invoke } from "@tauri-apps/api/core"

export interface ConfigChangeEvent {
  key: string
  value: any
  timestamp: number
}

export type ConfigChangeListener = (event: ConfigChangeEvent) => void

export interface ConfigSpec {
  // 应用设置
  is_wizard_completed: boolean
  log_level: "debug" | "info" | "warn" | "error"
  window_zoom: number
  search_keyboard_layout: "t9" | "qwerty26"
  disable_search_keyboard: boolean
  font_family: string
  current_theme_id: string
  themes_custom: any[]
  dashboards_config: any[]
  mobile_bottom_nav_items: string[]

  // 自动评分
  auto_score_enabled: boolean
  auto_score_rules: any[]
  auto_score_batches: any[]

  // 数据库
  pg_connection_string: string
  pg_connection_status: {
    connected: boolean
    type: "sqlite" | "postgresql"
    error?: string
  }
}

class ConfigServiceClass {
  private cache: Map<string, any> = new Map()
  private listeners: Set<ConfigChangeListener> = new Set()
  private initialized = false
  private initPromise: Promise<void> | null = null

  async initialize(): Promise<void> {
    if (this.initialized) return
    if (this.initPromise) return this.initPromise

    this.initPromise = (async () => {
      try {
        const result = await this.invokeApi("getAllSettings")
        if (result.success && result.data) {
          Object.entries(result.data).forEach(([key, value]) => {
            this.cache.set(key, value)
          })
        }
        this.setupListener()
        this.initialized = true
      } catch (error) {
        console.error("Failed to initialize config service:", error)
        throw error
      }
    })()

    return this.initPromise
  }

  async get<K extends keyof ConfigSpec>(key: K): Promise<ConfigSpec[K]> {
    await this.initialize()
    return this.cache.get(key)
  }

  async set<K extends keyof ConfigSpec>(key: K, value: ConfigSpec[K]): Promise<void> {
    await this.initialize()
    const result = await this.invokeApi("setSetting", [key, value])
    if (!result.success) {
      throw new Error(result.message || "Failed to set config")
    }
    this.cache.set(key, value)
    this.notifyListeners({ key, value, timestamp: Date.now() })
  }

  async patch(partial: Partial<ConfigSpec>): Promise<void> {
    await this.initialize()
    for (const [key, value] of Object.entries(partial)) {
      await this.set(key as keyof ConfigSpec, value)
    }
  }

  getAll(): ConfigSpec {
    const entries = Array.from(this.cache.entries())
    return Object.fromEntries(entries) as ConfigSpec
  }

  has(key: string): boolean {
    return this.cache.has(key)
  }

  onChange(listener: ConfigChangeListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private notifyListeners(event: ConfigChangeEvent): void {
    this.listeners.forEach((listener) => {
      try {
        listener(event)
      } catch (error) {
        console.error("Config listener error:", error)
      }
    })
  }

  private setupListener(): void {
    const api = (window as any).api
    if (!api?.onSettingChanged) return

    api
      .onSettingChanged((change: any) => {
        if (change?.key && change?.value) {
          this.cache.set(change.key, change.value)
          this.notifyListeners({
            key: change.key,
            value: change.value,
            timestamp: Date.now(),
          })
        }
      })
      .catch(() => void 0)
  }

  private async invokeApi<T = any>(
    command: string,
    args?: any[]
  ): Promise<{ success: boolean; data?: T; message?: string }> {
    const api = (window as any).api
    if (api?.[command]) {
      return await api[command](...(args || []))
    }

    // Fallback to invoke if API not available
    try {
      const result = await invoke(command, args ? { args } : {})
      return { success: true, data: result as T }
    } catch (error: any) {
      return { success: false, message: error.message || "Unknown error" }
    }
  }
}

export const ConfigService = new ConfigServiceClass()
