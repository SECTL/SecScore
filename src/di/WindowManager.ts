import { invoke } from "@tauri-apps/api/core"
import { UnlistenFn } from "@tauri-apps/api/event"

export interface WindowConfig {
  label: string
  title: string
  width?: number
  height?: number
  resizable?: boolean
  maximized?: boolean
  decorations?: boolean
  alwaysOnTop?: boolean
  center?: boolean
}

export interface WindowState {
  label: string
  visible: boolean
  maximized: boolean
  minimized: boolean
  focused: boolean
}

/**
 * SecScore 窗口管理器
 * 统一管理所有应用窗口
 */
class WindowManagerClass {
  private windows: Map<string, WindowConfig> = new Map()
  private currentWindow: string | null = null
  private unlistenFns: UnlistenFn[] = []

  constructor() {
    this.setupWindowListeners()
  }

  /**
   * 注册窗口配置
   */
  registerWindow(config: WindowConfig): void {
    this.windows.set(config.label, config)
  }

  /**
   * 获取窗口配置
   */
  getWindowConfig(label: string): WindowConfig | undefined {
    return this.windows.get(label)
  }

  /**
   * 设置当前窗口
   */
  setCurrentWindow(label: string): void {
    this.currentWindow = label
  }

  /**
   * 获取当前窗口标签
   */
  getCurrentWindow(): string | null {
    return this.currentWindow
  }

  /**
   * 最小化窗口
   */
  async minimizeWindow(): Promise<void> {
    const api = (window as any).api
    if (api?.windowMinimize) {
      await api.windowMinimize()
    } else {
      await invoke("window_minimize")
    }
  }

  /**
   * 最大化/还原窗口
   */
  async toggleMaximize(): Promise<void> {
    const api = (window as any).api
    if (api?.windowMaximize) {
      const isMaximized = await api.windowIsMaximized()
      if (isMaximized) {
        // 还原窗口逻辑需要 Rust 端支持
        await this.minimizeWindow()
      } else {
        await api.windowMaximize()
      }
    } else {
      await invoke("window_maximize")
    }
  }

  /**
   * 关闭窗口
   */
  async closeWindow(): Promise<void> {
    const api = (window as any).api
    if (api?.windowClose) {
      await api.windowClose()
    } else {
      await invoke("window_close")
    }
  }

  /**
   * 检查窗口是否最大化
   */
  async isMaximized(): Promise<boolean> {
    const api = (window as any).api
    if (api?.windowIsMaximized) {
      return await api.windowIsMaximized()
    }
    return await invoke("window_is_maximized")
  }

  /**
   * 开始拖动窗口
   */
  async startDragging(): Promise<void> {
    const api = (window as any).api
    if (api?.startDraggingWindow) {
      await api.startDraggingWindow()
    }
  }

  /**
   * 切换开发者工具
   */
  async toggleDevTools(): Promise<void> {
    const api = (window as any).api
    if (api?.toggleDevTools) {
      await api.toggleDevTools()
    } else {
      await invoke("toggle_devtools")
    }
  }

  /**
   * 调整窗口大小
   */
  async resizeWindow(width: number, height: number): Promise<void> {
    const api = (window as any).api
    if (api?.windowResize) {
      await api.windowResize(width, height)
    } else {
      await invoke("window_resize", { width, height })
    }
  }

  /**
   * 设置窗口是否可调整大小
   */
  async setResizable(resizable: boolean): Promise<void> {
    const api = (window as any).api
    if (api?.windowSetResizable) {
      await api.windowSetResizable(resizable)
    } else {
      await invoke("window_set_resizable", { resizable })
    }
  }

  /**
   * 监听窗口最大化变化
   */
  onWindowMaximizedChanged(callback: (maximized: boolean) => void): void {
    const api = (window as any).api
    if (api?.onWindowMaximizedChanged) {
      api.onWindowMaximizedChanged(callback).then((unlisten: UnlistenFn) => {
        this.unlistenFns.push(unlisten)
      })
    }
  }

  /**
   * 监听导航事件
   */
  onNavigate(callback: (route: string) => void): void {
    const api = (window as any).api
    if (api?.onNavigate) {
      api.onNavigate(callback).then((unlisten: UnlistenFn) => {
        this.unlistenFns.push(unlisten)
      })
    }
  }

  /**
   * 设置窗口标题
   */
  async setTitle(title: string): Promise<void> {
    document.title = title
  }

  /**
   * 获取所有注册窗口
   */
  getAllWindows(): Map<string, WindowConfig> {
    return new Map(this.windows)
  }

  /**
   * 清理监听器
   */
  dispose(): void {
    this.unlistenFns.forEach((unlisten) => unlisten())
    this.unlistenFns = []
    this.windows.clear()
    this.currentWindow = null
  }

  private setupWindowListeners(): void {
    // 监听最大化变化
    this.onWindowMaximizedChanged((maximized) => {
      console.log("Window maximized changed:", maximized)
    })

    // 监听导航事件
    this.onNavigate((route) => {
      console.log("Navigate to:", route)
    })
  }
}

export const WindowManager = new WindowManagerClass()
