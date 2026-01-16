export interface IpcResponse<T = any> {
  success: boolean
  data?: T
  message?: string
}

export interface ThemeConfig {
  name: string
  id: string
  mode: 'light' | 'dark'
  config: {
    tdesign: Record<string, string>
    custom: Record<string, string>
  }
}

export interface ElectronApi {
  // Theme
  getThemes: () => Promise<IpcResponse<ThemeConfig[]>>
  getCurrentTheme: () => Promise<IpcResponse<ThemeConfig>>
  setTheme: (themeId: string) => Promise<IpcResponse<void>>
  onThemeChanged: (callback: (theme: ThemeConfig) => void) => () => void

  // DB - Student
  queryStudents: (params?: any) => Promise<IpcResponse<any[]>>
  createStudent: (data: { name: string }) => Promise<IpcResponse<number>>
  updateStudent: (id: number, data: any) => Promise<IpcResponse<void>>
  deleteStudent: (id: number) => Promise<IpcResponse<void>>

  // DB - Reason
  queryReasons: () => Promise<IpcResponse<any[]>>
  createReason: (data: any) => Promise<IpcResponse<number>>
  updateReason: (id: number, data: any) => Promise<IpcResponse<void>>
  deleteReason: (id: number) => Promise<IpcResponse<void>>

  // DB - Event
  queryEvents: (params?: any) => Promise<IpcResponse<any[]>>
  createEvent: (data: {
    student_name: string
    reason_content: string
    delta: number
  }) => Promise<IpcResponse<number>>
  deleteEvent: (uuid: string) => Promise<IpcResponse<void>>
  queryEventsByStudent: (params: {
    student_name: string
    limit?: number
    startTime?: string | null
  }) => Promise<IpcResponse<any[]>>
  queryLeaderboard: (params: {
    range: 'today' | 'week' | 'month'
  }) => Promise<IpcResponse<{ startTime: string; rows: any[] }>>

  // Settlement
  querySettlements: () =>
    Promise<IpcResponse<{ id: number; start_time: string; end_time: string; event_count: number }[]>>
  createSettlement: () =>
    Promise<IpcResponse<{ settlementId: number; startTime: string; endTime: string; eventCount: number }>>
  querySettlementLeaderboard: (params: { settlement_id: number }) => Promise<
    IpcResponse<{
      settlement: { id: number; start_time: string; end_time: string }
      rows: { name: string; score: number }[]
    }>
  >

  // Settings & Sync
  getSettings: () => Promise<IpcResponse<Record<string, string>>>
  updateSetting: (key: string, value: string) => Promise<IpcResponse<void>>
  getSyncStatus: () => Promise<IpcResponse<{ connected: boolean; lastSync?: string }>>
  triggerSync: () => Promise<IpcResponse<void>>

  // Auth & Security
  authGetStatus: () => Promise<
    IpcResponse<{
      permission: 'admin' | 'points' | 'view'
      hasAdminPassword: boolean
      hasPointsPassword: boolean
      hasRecoveryString: boolean
    }>
  >
  authLogin: (password: string) => Promise<IpcResponse<{ permission: 'admin' | 'points' | 'view' }>>
  authLogout: () => Promise<IpcResponse<{ permission: 'admin' | 'points' | 'view' }>>
  authSetPasswords: (payload: {
    adminPassword?: string | null
    pointsPassword?: string | null
  }) => Promise<IpcResponse<{ recoveryString?: string }>>
  authGenerateRecovery: () => Promise<IpcResponse<{ recoveryString: string }>>
  authResetByRecovery: (recoveryString: string) => Promise<IpcResponse<{ recoveryString: string }>>
  authClearAll: () => Promise<IpcResponse<void>>

  // Data import/export
  exportDataJson: () => Promise<IpcResponse<string>>
  importDataJson: (jsonText: string) => Promise<IpcResponse<void>>

  // Logger
  queryLogs: (lines?: number) => Promise<IpcResponse<string[]>>
  clearLogs: () => Promise<IpcResponse<void>>
  setLogLevel: (level: 'debug' | 'info' | 'warn' | 'error') => Promise<IpcResponse<void>>
  writeLog: (payload: {
    level: 'debug' | 'info' | 'warn' | 'error'
    message: string
    meta?: any
  }) => Promise<IpcResponse<void>>
}
