import { Context } from "./shared/kernel"
import { appRegistry } from "./di/AppServiceRegistry"
import { PluginRuntimeContext } from "./di"

export class ClientContext extends Context {
  private diInitialized = false

  constructor() {
    super()
  }

  /**
   * 初始化 DI 系统
   */
  initializeDI(): void {
    if (this.diInitialized) return

    const runtimeContext: PluginRuntimeContext = {
      app: "renderer",
      logger: {
        info: (...args: any[]) => console.log("[Renderer]", ...args),
        warn: (...args: any[]) => console.warn("[Renderer]", ...args),
        error: (...args: any[]) => console.error("[Renderer]", ...args),
        debug: (...args: any[]) => console.debug("[Renderer]", ...args),
      },
      config: {},
      settings: {
        all: () => ({}),
        get: <T = unknown>(_key?: string, _def?: T) => ({}) as T,
        set: async () => {},
        patch: async () => {},
        reset: async () => {},
        onChange: () => () => {},
      },
      effect: (fn: () => void | (() => void) | Promise<void | (() => void)>) => {
        const disposer = fn()
        if (typeof disposer === "function") {
          this.effect(disposer)
        } else if (disposer && typeof (disposer as any).then === "function") {
          ;(disposer as Promise<void>).then((d) => {
            if (typeof d === "function") this.effect(d)
          })
        }
      },
      services: {
        provide: () => () => {},
        inject: <T = unknown>(_name: string, _owner?: string) => ({}) as T,
        has: () => false,
      },
      desktopApi: (window as any).api,
    }

    appRegistry.initialize(runtimeContext)
    this.diInitialized = true
  }

  /**
   * 获取服务注册表
   */
  getRegistry() {
    return appRegistry
  }
}
