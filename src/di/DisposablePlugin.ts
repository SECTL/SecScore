import { Context, disposer } from "../shared/kernel"

/**
 * 可逆插件系统基础类
 * 基于 Koishi 的 Disposable 设计理念
 *
 * 特性：
 * - 可组合性：插件可拆卸
 * - 可靠性：资源安全，可追踪
 * - 可访问性：热重载支持
 */
export abstract class DisposablePlugin extends Context {
  private _pluginName: string
  private _pluginDisposables: Set<disposer> = new Set()
  private _initialized = false

  constructor(name: string) {
    super()
    this._pluginName = name
  }

  /**
   * 插件名称
   */
  get name(): string {
    return this._pluginName
  }

  /**
   * 是否已初始化
   */
  get initialized(): boolean {
    return this._initialized
  }

  /**
   * 注册可逆操作
   * @param fn 清理函数
   */
  protected registerDisposer(fn: disposer): void {
    this._pluginDisposables.add(fn)
    this.effect(() => {
      this._pluginDisposables.delete(fn)
    })
  }

  /**
   * 初始化插件
   * 子类应重写此方法实现具体逻辑
   */
  async initialize(): Promise<void> {
    if (this._initialized) return

    try {
      await this.onInitialize()
      this._initialized = true
      this.emit("initialized")
    } catch (error) {
      this.emit("error", error)
      throw error
    }
  }

  /**
   * 插件初始化逻辑
   * 子类应重写此方法
   */
  protected abstract onInitialize(): Promise<void>

  /**
   * 卸载插件
   */
  async dispose(): Promise<void> {
    this.emit("disposing")

    // 执行所有清理函数
    const disposers = [...this._pluginDisposables]
    this._pluginDisposables.clear()

    for (const disposer of disposers) {
      try {
        await disposer()
      } catch (error) {
        this.emit("error", error)
      }
    }

    // 调用父类的 dispose
    super.dispose()
    this._initialized = false
    this.emit("disposed")
  }

  /**
   * 热重载插件
   */
  async reload(): Promise<void> {
    await this.dispose()
    this._pluginDisposables.clear()
    await this.initialize()
  }

  /**
   * 监听初始化完成
   */
  onInitialized(fn: () => void): void {
    this.once("initialized", fn)
  }

  /**
   * 监听卸载开始
   */
  onDisposing(fn: () => void): void {
    this.once("disposing", fn)
  }

  /**
   * 监听卸载完成
   */
  onDisposed(fn: () => void): void {
    this.once("disposed", fn)
  }

  /**
   * 监听错误
   */
  onError(fn: (error: Error) => void): void {
    this.on("error", fn)
  }
}

/**
 * 插件工厂函数类型
 */
export type PluginFactory<T extends DisposablePlugin = DisposablePlugin> = () => T | Promise<T>

/**
 * 创建插件
 * @param factory 插件工厂函数
 */
export function createPlugin<T extends DisposablePlugin>(
  factory: PluginFactory<T>
): PluginFactory<T> {
  return factory
}

/**
 * 插件管理器
 * 管理所有插件的生命周期
 */
export class PluginManager extends Context {
  private plugins: Map<string, DisposablePlugin> = new Map()

  /**
   * 注册插件
   */
  async registerPlugin(plugin: DisposablePlugin): Promise<void> {
    if (this.plugins.has(plugin.name)) {
      throw new Error(`Plugin "${plugin.name}" already registered`)
    }

    this.plugins.set(plugin.name, plugin)

    plugin.on("error", (error) => {
      this.emit("plugin-error", { plugin: plugin.name, error })
    })

    try {
      await plugin.initialize()
      this.emit("plugin-registered", plugin.name)
    } catch (error) {
      this.plugins.delete(plugin.name)
      throw error
    }
  }

  /**
   * 卸载插件
   */
  async unregisterPlugin(name: string): Promise<void> {
    const plugin = this.plugins.get(name)
    if (!plugin) return

    await plugin.dispose()
    this.plugins.delete(name)
    this.emit("plugin-unregistered", name)
  }

  /**
   * 获取插件
   */
  getPlugin<T extends DisposablePlugin>(name: string): T | undefined {
    return this.plugins.get(name) as T
  }

  /**
   * 检查插件是否存在
   */
  hasPlugin(name: string): boolean {
    return this.plugins.has(name)
  }

  /**
   * 获取所有插件
   */
  getAllPlugins(): Map<string, DisposablePlugin> {
    return new Map(this.plugins)
  }

  /**
   * 热重载插件
   */
  async reloadPlugin(name: string): Promise<void> {
    const plugin = this.plugins.get(name)
    if (!plugin) throw new Error(`Plugin "${name}" not found`)

    await plugin.reload()
    this.emit("plugin-reloaded", name)
  }

  /**
   * 监听插件注册
   */
  onPluginRegistered(fn: (name: string) => void): void {
    this.on("plugin-registered", fn)
  }

  /**
   * 监听插件卸载
   */
  onPluginUnregistered(fn: (name: string) => void): void {
    this.on("plugin-unregistered", fn)
  }

  /**
   * 监听插件重载
   */
  onPluginReloaded(fn: (name: string) => void): void {
    this.on("plugin-reloaded", fn)
  }

  /**
   * 监听插件错误
   */
  onPluginError(fn: (data: { plugin: string; error: Error }) => void): void {
    this.on("plugin-error", fn)
  }
}

// 导出全局插件管理器实例
export const globalPluginManager = new PluginManager()
