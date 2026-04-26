/**
 * SecScore 依赖注入系统
 * 基于 ExamAware 项目的 DI 实现进行适配
 * 参照 Koishi 的 Disposable 设计理念
 */

// DI 核心
export {
  ExamAwareHostBuilder,
  PluginHost,
  createPluginHostBuilder,
  Host,
  defineExamAwarePlugin,
} from "../copying/hosting/hostBuilder"
export { ServiceCollection, ServiceProvider } from "../copying/hosting/serviceCollection"
export {
  PluginContextToken,
  PluginLoggerToken,
  PluginSettingsToken,
  DesktopApiToken,
  HostApplicationLifetimeToken,
} from "../copying/hosting/tokens"
export type {
  PluginRuntimeContext,
  PluginLogger,
  PluginSettingsAPI,
  ServiceAPI,
  HostedService,
  PluginMiddleware,
  HostBuilderSettings,
  HostBuilderContext,
  PluginHostApplicationLifetime,
  ConfigureServicesDelegate,
  ConfigureHostDelegate,
  PluginHostApplicationContext,
  ServiceToken,
} from "../copying/hosting/types"

// 可逆插件系统
export {
  DisposablePlugin,
  PluginManager,
  globalPluginManager,
  createPlugin,
  type PluginFactory,
} from "./DisposablePlugin"

// 应用服务注册表
export { AppServiceRegistry, appRegistry } from "./AppServiceRegistry"

// 窗口管理器
export { WindowManager } from "./WindowManager"

// 内置插件
export {
  WikiPlugin,
  NotificationPlugin,
  DataExportPlugin,
  type WikiPluginConfig,
} from "./plugins/builtin"
