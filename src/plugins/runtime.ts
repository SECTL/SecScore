import type { pluginRuntimeModule } from "../preload/types"

type PluginHostEvent = "data-updated" | "route-changed" | "plugins-updated"
type PluginCleanup = (() => void | Promise<void>) | void
type PluginSetup = (context: PluginContext) => PluginCleanup | Promise<PluginCleanup>

interface PluginEntryModule {
  setup?: PluginSetup
}

interface LoadedPlugin {
  id: string
  moduleUrl: string
  cleanup?: () => void | Promise<void>
  disposers: Array<() => void>
}

const PLUGIN_EVENT_MAP: Record<PluginHostEvent, string> = {
  "data-updated": "ss:data-updated",
  "route-changed": "ss:route-changed",
  "plugins-updated": "ss:plugins-updated",
}

export interface PluginContext {
  id: string
  name: string
  version: string
  permissions: string[]
  api: any
  on: (event: PluginHostEvent, handler: (detail: any) => void) => () => void
  log: (message: string, meta?: unknown) => void
}

export class PluginRuntime {
  private loadedPlugins: LoadedPlugin[] = []
  private started = false
  private loading = false

  async start(): Promise<void> {
    if (this.started) return
    this.started = true
    await this.reload()
  }

  async stop(): Promise<void> {
    this.started = false
    await this.unloadAllPlugins()
  }

  async reload(): Promise<void> {
    if (this.loading) return
    this.loading = true
    try {
      await this.unloadAllPlugins()
      if (!this.started) return
      await this.loadEnabledPlugins()
    } finally {
      this.loading = false
    }
  }

  private async loadEnabledPlugins(): Promise<void> {
    const api = (window as any).api
    if (!api?.pluginGetRuntimeModules) return

    let response:
      | {
          success: boolean
          data?: pluginRuntimeModule[]
          message?: string
        }
      | undefined
    try {
      response = await api.pluginGetRuntimeModules()
    } catch (error) {
      console.error("Failed to fetch runtime plugins:", error)
      return
    }
    if (!response?.success || !Array.isArray(response.data)) {
      if (response?.message) {
        console.warn("Plugin runtime response failed:", response.message)
      }
      return
    }

    for (const runtimeModule of response.data) {
      await this.loadSinglePlugin(runtimeModule)
    }
  }

  private async loadSinglePlugin(runtimeModule: pluginRuntimeModule): Promise<void> {
    const sourceWithTrace = `${runtimeModule.code}\n//# sourceURL=secscore-plugin:${runtimeModule.id}/${runtimeModule.main}\n`
    const moduleUrl = URL.createObjectURL(
      new Blob([sourceWithTrace], {
        type: "text/javascript",
      })
    )
    const disposers: Array<() => void> = []
    let cleanup: (() => void | Promise<void>) | undefined

    try {
      const importedModule = await import(/* @vite-ignore */ moduleUrl)
      const pluginModule = this.normalizeModule(importedModule)
      if (!pluginModule?.setup) {
        console.warn(`Plugin ${runtimeModule.id} has no setup() and was skipped`)
        URL.revokeObjectURL(moduleUrl)
        return
      }

      const context = this.createContext(runtimeModule, disposers)
      const setupResult = await pluginModule.setup(context)
      if (typeof setupResult === "function") {
        cleanup = setupResult
      }

      this.loadedPlugins.push({
        id: runtimeModule.id,
        moduleUrl,
        cleanup,
        disposers,
      })
      console.info(`Plugin loaded: ${runtimeModule.id}@${runtimeModule.version}`)
    } catch (error) {
      for (const dispose of [...disposers].reverse()) {
        try {
          dispose()
        } catch {
          void 0
        }
      }
      URL.revokeObjectURL(moduleUrl)
      console.error(`Failed to load plugin ${runtimeModule.id}:`, error)
    }
  }

  private normalizeModule(moduleValue: unknown): PluginEntryModule | null {
    if (!moduleValue || typeof moduleValue !== "object") return null
    const moduleRecord = moduleValue as Record<string, unknown>

    if (typeof moduleRecord.setup === "function") {
      return { setup: moduleRecord.setup as PluginSetup }
    }

    const defaultExport = moduleRecord.default as unknown
    if (typeof defaultExport === "function") {
      return { setup: defaultExport as PluginSetup }
    }
    if (
      defaultExport &&
      typeof defaultExport === "object" &&
      typeof (defaultExport as Record<string, unknown>).setup === "function"
    ) {
      return {
        setup: ((defaultExport as Record<string, unknown>).setup as PluginSetup).bind(
          defaultExport
        ),
      }
    }

    const pluginExport = moduleRecord.plugin as unknown
    if (
      pluginExport &&
      typeof pluginExport === "object" &&
      typeof (pluginExport as Record<string, unknown>).setup === "function"
    ) {
      return {
        setup: ((pluginExport as Record<string, unknown>).setup as PluginSetup).bind(pluginExport),
      }
    }

    return null
  }

  private createContext(
    runtimeModule: pluginRuntimeModule,
    disposers: Array<() => void>
  ): PluginContext {
    const registerEvent = (
      event: PluginHostEvent,
      handler: (detail: any) => void
    ): (() => void) => {
      const eventName = PLUGIN_EVENT_MAP[event]
      const listener = (nativeEvent: Event) => {
        handler((nativeEvent as CustomEvent<any>)?.detail)
      }
      window.addEventListener(eventName, listener)
      const dispose = () => {
        window.removeEventListener(eventName, listener)
      }
      disposers.push(dispose)
      return () => {
        dispose()
        const index = disposers.indexOf(dispose)
        if (index >= 0) {
          disposers.splice(index, 1)
        }
      }
    }

    return {
      id: runtimeModule.id,
      name: runtimeModule.name,
      version: runtimeModule.version,
      permissions: runtimeModule.permissions || [],
      api: (window as any).api,
      on: registerEvent,
      log: (message: string, meta?: unknown) => {
        if (meta === undefined) {
          console.log(`[Plugin:${runtimeModule.id}] ${message}`)
          return
        }
        console.log(`[Plugin:${runtimeModule.id}] ${message}`, meta)
      },
    }
  }

  private async unloadAllPlugins(): Promise<void> {
    for (const plugin of [...this.loadedPlugins].reverse()) {
      if (plugin.cleanup) {
        try {
          await plugin.cleanup()
        } catch (error) {
          console.error(`Plugin cleanup failed: ${plugin.id}`, error)
        }
      }

      for (const dispose of [...plugin.disposers].reverse()) {
        try {
          dispose()
        } catch {
          void 0
        }
      }

      URL.revokeObjectURL(plugin.moduleUrl)
    }

    this.loadedPlugins = []
  }
}

let runtimeInstance: PluginRuntime | null = null

export const getPluginRuntime = (): PluginRuntime => {
  if (!runtimeInstance) {
    runtimeInstance = new PluginRuntime()
  }
  return runtimeInstance
}
