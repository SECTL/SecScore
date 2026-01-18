export interface ipcResponse<T = any> {
  success: boolean
  data?: T
  message?: string
}

export type logLevel = 'info' | 'warn' | 'error' | 'debug'
export type permissionLevel = 'admin' | 'points' | 'view'

export interface themeConfig {
  name: string
  id: string
  mode: 'light' | 'dark'
  config: {
    tdesign: Record<string, string>
    custom: Record<string, string>
  }
}

export type settingsSpec = {
  is_wizard_completed: boolean
  log_level: logLevel
}

export type settingsKey = keyof settingsSpec

export type settingChange<K extends settingsKey = settingsKey> = {
  key: K
  value: settingsSpec[K]
}

export interface electronApi {
  // Theme
  getThemes: () => Promise<ipcResponse<themeConfig[]>>
  getCurrentTheme: () => Promise<ipcResponse<themeConfig>>
  setTheme: (themeId: string) => Promise<ipcResponse<void>>
  onThemeChanged: (callback: (theme: themeConfig) => void) => () => void

  // DB - Student
  queryStudents: (params?: any) => Promise<ipcResponse<any[]>>
  createStudent: (data: { name: string }) => Promise<ipcResponse<number>>
  updateStudent: (id: number, data: any) => Promise<ipcResponse<void>>
  deleteStudent: (id: number) => Promise<ipcResponse<void>>

  // DB - Reason
  queryReasons: () => Promise<ipcResponse<any[]>>
  createReason: (data: any) => Promise<ipcResponse<number>>
  updateReason: (id: number, data: any) => Promise<ipcResponse<void>>
  deleteReason: (id: number) => Promise<ipcResponse<void>>

  // DB - Event
  queryEvents: (params?: any) => Promise<ipcResponse<any[]>>
  createEvent: (data: {
    student_name: string
    reason_content: string
    delta: number
  }) => Promise<ipcResponse<number>>
  deleteEvent: (uuid: string) => Promise<ipcResponse<void>>
  queryEventsByStudent: (params: {
    student_name: string
    limit?: number
    startTime?: string | null
  }) => Promise<ipcResponse<any[]>>
  queryLeaderboard: (params: {
    range: 'today' | 'week' | 'month'
  }) => Promise<ipcResponse<{ startTime: string; rows: any[] }>>

  // Settlement
  querySettlements: () => Promise<
    ipcResponse<{ id: number; start_time: string; end_time: string; event_count: number }[]>
  >
  createSettlement: () => Promise<
    ipcResponse<{ settlementId: number; startTime: string; endTime: string; eventCount: number }>
  >
  querySettlementLeaderboard: (params: { settlement_id: number }) => Promise<
    ipcResponse<{
      settlement: { id: number; start_time: string; end_time: string }
      rows: { name: string; score: number }[]
    }>
  >

  // Settings
  getAllSettings: () => Promise<ipcResponse<settingsSpec>>
  getSetting: <K extends settingsKey>(key: K) => Promise<ipcResponse<settingsSpec[K]>>
  setSetting: <K extends settingsKey>(key: K, value: settingsSpec[K]) => Promise<ipcResponse<void>>
  onSettingChanged: (callback: (change: settingChange) => void) => () => void

  // Auth & Security
  authGetStatus: () => Promise<
    ipcResponse<{
      permission: permissionLevel
      hasAdminPassword: boolean
      hasPointsPassword: boolean
      hasRecoveryString: boolean
    }>
  >
  authLogin: (password: string) => Promise<ipcResponse<{ permission: permissionLevel }>>
  authLogout: () => Promise<ipcResponse<{ permission: permissionLevel }>>
  authSetPasswords: (payload: {
    adminPassword?: string | null
    pointsPassword?: string | null
  }) => Promise<ipcResponse<{ recoveryString?: string }>>
  authGenerateRecovery: () => Promise<ipcResponse<{ recoveryString: string }>>
  authResetByRecovery: (recoveryString: string) => Promise<ipcResponse<{ recoveryString: string }>>
  authClearAll: () => Promise<ipcResponse<void>>

  // Data import/export
  exportDataJson: () => Promise<ipcResponse<string>>
  importDataJson: (jsonText: string) => Promise<ipcResponse<void>>

  // Window
  openWindow: (input: {
    key: string
    title?: string
    route?: string
    options?: any
  }) => Promise<ipcResponse<void>>
  navigateWindow: (input: { key?: string; route: string }) => Promise<ipcResponse<void>>
  windowMinimize: () => Promise<void>
  windowMaximize: () => Promise<boolean>
  windowClose: () => Promise<void>
  windowIsMaximized: () => Promise<boolean>
  onWindowMaximizedChanged: (callback: (maximized: boolean) => void) => () => void
  toggleDevTools: () => Promise<void>

  // Logger
  queryLogs: (lines?: number) => Promise<ipcResponse<string[]>>
  clearLogs: () => Promise<ipcResponse<void>>
  setLogLevel: (level: logLevel) => Promise<ipcResponse<void>>
  writeLog: (payload: {
    level: logLevel
    message: string
    meta?: any
  }) => Promise<ipcResponse<void>>
}
