/**
 * 内置插件示例：Wiki 插件
 * 演示如何使用 DisposablePlugin 创建可逆插件
 */
import { DisposablePlugin } from "../DisposablePlugin"
import { ConfigService } from "../../services/ConfigService"

export interface WikiPluginConfig {
  enabled: boolean
  wikiUrl?: string
  cacheEnabled: boolean
}

export class WikiPlugin extends DisposablePlugin {
  private config: WikiPluginConfig = {
    enabled: true,
    wikiUrl: undefined,
    cacheEnabled: true,
  }

  constructor() {
    super("wiki")
  }

  protected async onInitialize(): Promise<void> {
    console.log("[WikiPlugin] Initializing...")

    // 加载配置
    try {
      const enabled = await ConfigService.get("auto_score_enabled")
      this.config.enabled = enabled as boolean
    } catch (error) {
      console.error("[WikiPlugin] Failed to load config:", error)
    }

    // 注册配置变更监听
    const unsubscribe = ConfigService.onChange((event: { key: string; value: any }) => {
      if (event.key === "auto_score_enabled") {
        this.config.enabled = event.value
        console.log("[WikiPlugin] Config updated:", this.config.enabled)
      }
    })

    // 注册清理函数
    this.registerDisposer(() => {
      unsubscribe()
      console.log("[WikiPlugin] Disposed")
    })

    console.log("[WikiPlugin] Initialized successfully")
  }

  /**
   * 获取 Wiki URL
   */
  async setWikiUrl(url: string): Promise<void> {
    this.config.wikiUrl = url
    console.log("[WikiPlugin] Wiki URL set to:", url)
  }

  /**
   * 获取当前配置
   */
  getConfig(): WikiPluginConfig {
    return { ...this.config }
  }
}

/**
 * 内置插件示例：通知插件
 */
export class NotificationPlugin extends DisposablePlugin {
  private notifications: Array<{ id: string; message: string; timestamp: number }> = []

  constructor() {
    super("notification")
  }

  protected async onInitialize(): Promise<void> {
    console.log("[NotificationPlugin] Initializing...")

    // 可以在这里初始化通知系统
    this.registerDisposer(() => {
      this.notifications = []
      console.log("[NotificationPlugin] Disposed")
    })

    console.log("[NotificationPlugin] Initialized successfully")
  }

  /**
   * 发送通知
   */
  notify(message: string): string {
    const id = `notif_${Date.now()}`
    this.notifications.push({
      id,
      message,
      timestamp: Date.now(),
    })

    // 触发通知事件
    window.dispatchEvent(
      new CustomEvent("ss:notification", {
        detail: { id, message, timestamp: Date.now() },
      })
    )

    return id
  }

  /**
   * 获取所有通知
   */
  getNotifications(): typeof this.notifications {
    return [...this.notifications]
  }

  /**
   * 清除通知
   */
  clear(id?: string): void {
    if (id) {
      this.notifications = this.notifications.filter((n) => n.id !== id)
    } else {
      this.notifications = []
    }
  }
}

/**
 * 内置插件示例：数据导出插件
 */
export class DataExportPlugin extends DisposablePlugin {
  private exportHistory: Array<{ id: string; type: string; timestamp: number; filename: string }> =
    []

  constructor() {
    super("data-export")
  }

  protected async onInitialize(): Promise<void> {
    console.log("[DataExportPlugin] Initializing...")

    this.registerDisposer(() => {
      this.exportHistory = []
      console.log("[DataExportPlugin] Disposed")
    })

    console.log("[DataExportPlugin] Initialized successfully")
  }

  /**
   * 导出数据
   */
  async exportData<T>(type: string, data: T, filename: string): Promise<void> {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)

    this.exportHistory.push({
      id: `export_${Date.now()}`,
      type,
      timestamp: Date.now(),
      filename,
    })

    console.log(`[DataExportPlugin] Exported ${type} to ${filename}`)
  }

  /**
   * 获取导出历史
   */
  getHistory(): typeof this.exportHistory {
    return [...this.exportHistory]
  }
}
