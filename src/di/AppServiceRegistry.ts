import { ServiceCollection, ServiceProvider } from "../copying/hosting/serviceCollection"
import { PluginRuntimeContext, ServiceToken } from "../copying/hosting/types"
import { ConfigService } from "../services/ConfigService"

/**
 * SecScore 应用服务注册表
 * 统一管理所有应用级服务的注册和访问
 */
export class AppServiceRegistry {
  private static instance: AppServiceRegistry
  private serviceCollection: ServiceCollection | null = null
  private serviceProvider: ServiceProvider | null = null
  private initialized = false

  private constructor() {}

  static getInstance(): AppServiceRegistry {
    if (!AppServiceRegistry.instance) {
      AppServiceRegistry.instance = new AppServiceRegistry()
    }
    return AppServiceRegistry.instance
  }

  /**
   * 初始化服务集合
   * @param ctx 运行时上下文
   */
  initialize(ctx: PluginRuntimeContext): void {
    if (this.initialized) return

    this.serviceCollection = new ServiceCollection(ctx)
    this.registerCoreServices(ctx)
    this.serviceProvider = this.serviceCollection.buildServiceProvider()
    this.initialized = true
  }

  /**
   * 注册核心服务
   */
  private registerCoreServices(ctx: PluginRuntimeContext): void {
    if (!this.serviceCollection) return

    // 注册配置服务
    this.serviceCollection.addSingleton("ConfigService", ConfigService)

    // 注册运行时上下文
    this.serviceCollection.addSingleton("PluginContext", ctx)
  }

  /**
   * 获取服务提供者
   */
  getServiceProvider(): ServiceProvider {
    if (!this.serviceProvider) {
      throw new Error("Service registry not initialized. Call initialize() first.")
    }
    return this.serviceProvider
  }

  /**
   * 获取服务实例
   */
  getService<T>(token: ServiceToken<T>): T {
    return this.getServiceProvider().get(token)
  }

  /**
   * 检查服务是否已注册
   */
  hasService(token: ServiceToken): boolean {
    if (!this.serviceCollection) return false
    return this.serviceCollection.has(token)
  }

  /**
   * 注册服务
   */
  registerService<T>(
    token: ServiceToken<T>,
    impl: any,
    lifetime: "singleton" | "scoped" | "transient" = "singleton"
  ): void {
    if (!this.serviceCollection) {
      throw new Error("Service collection not initialized")
    }

    switch (lifetime) {
      case "singleton":
        this.serviceCollection.addSingleton(token, impl)
        break
      case "scoped":
        this.serviceCollection.addScoped(token, impl)
        break
      case "transient":
        this.serviceCollection.addTransient(token, impl)
        break
    }
  }

  /**
   * 是否已初始化
   */
  isInitialized(): boolean {
    return this.initialized
  }
}

// 导出单例实例
export const appRegistry = AppServiceRegistry.getInstance()
