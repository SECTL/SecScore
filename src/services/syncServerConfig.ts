const configuredSyncServerUrl = (import.meta as any).env?.VITE_SYNC_SERVER_URL?.trim()

export const DEFAULT_SYNC_SERVER_URL = (
  configuredSyncServerUrl || "https://secscore-api.sectl.cn"
).replace(/\/+$/, "")
