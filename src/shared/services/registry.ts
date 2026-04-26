/**
 * 服务注册表类型定义
 */

export interface ServiceProvideOptions {
  overwrite?: boolean
  immediate?: boolean
}

export interface ServiceWatcherMeta {
  name: string
  owner?: string
}
