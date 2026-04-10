/**
 * SECTL 服务统一导出
 */

export { sectlAuth, SECTL_CONFIG } from "./sectlAuth"

export type { TokenData, UserInfo } from "./sectlAuth"

export { sectlCloudStorage } from "./sectlCloudStorage"

export type { CloudFile, ShareLink, StorageUsage } from "./sectlCloudStorage"

export { sectlKVStorage } from "./sectlKVStorage"

export type { KVData } from "./sectlCloudStorage"

export { sectlNotification } from "./sectlNotification"

export type { Notification, SendNotificationParams } from "./sectlNotification"

// 积分数据同步服务
export { scoreSyncService } from "./scoreSyncService"

export type { ScoreData, ScoreEvent, SyncedData } from "./scoreSyncService"
