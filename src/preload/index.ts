import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import { settingChange, settingsKey, settingsSpec, themeConfig } from './types'

const api = {
  // Theme
  getThemes: () => ipcRenderer.invoke('theme:list'),
  getCurrentTheme: () => ipcRenderer.invoke('theme:current'),
  setTheme: (themeId: string) => ipcRenderer.invoke('theme:set', themeId),
  onThemeChanged: (callback: (theme: themeConfig) => void) => {
    const subscription = (_event: any, theme: themeConfig) => callback(theme)
    ipcRenderer.on('theme:updated', subscription)
    return () => ipcRenderer.removeListener('theme:updated', subscription)
  },

  // DB - Student
  queryStudents: (params: any) => ipcRenderer.invoke('db:student:query', params),
  createStudent: (data: any) => ipcRenderer.invoke('db:student:create', data),
  updateStudent: (id: number, data: any) => ipcRenderer.invoke('db:student:update', id, data),
  deleteStudent: (id: number) => ipcRenderer.invoke('db:student:delete', id),
  importStudentsFromXlsx: (params: { names: string[] }) =>
    ipcRenderer.invoke('db:student:importFromXlsx', params),

  // DB - Reason
  queryReasons: () => ipcRenderer.invoke('db:reason:query'),
  createReason: (data: any) => ipcRenderer.invoke('db:reason:create', data),
  updateReason: (id: number, data: any) => ipcRenderer.invoke('db:reason:update', id, data),
  deleteReason: (id: number) => ipcRenderer.invoke('db:reason:delete', id),

  // DB - Event
  queryEvents: (params: any) => ipcRenderer.invoke('db:event:query', params),
  createEvent: (data: any) => ipcRenderer.invoke('db:event:create', data),
  deleteEvent: (uuid: string) => ipcRenderer.invoke('db:event:delete', uuid),
  queryEventsByStudent: (params: any) => ipcRenderer.invoke('db:event:queryByStudent', params),
  queryLeaderboard: (params: any) => ipcRenderer.invoke('db:leaderboard:query', params),

  // Settlement
  querySettlements: () => ipcRenderer.invoke('db:settlement:query'),
  createSettlement: () => ipcRenderer.invoke('db:settlement:create'),
  querySettlementLeaderboard: (params: any) =>
    ipcRenderer.invoke('db:settlement:leaderboard', params),

  // Settings & Sync
  getAllSettings: () => ipcRenderer.invoke('settings:getAll'),
  getSetting: <K extends settingsKey>(key: K) => ipcRenderer.invoke('settings:get', key),
  setSetting: <K extends settingsKey>(key: K, value: settingsSpec[K]) =>
    ipcRenderer.invoke('settings:set', key, value),
  onSettingChanged: (callback: (change: settingChange) => void) => {
    const subscription = (_event: any, change: settingChange) => callback(change)
    ipcRenderer.on('settings:changed', subscription)
    return () => ipcRenderer.removeListener('settings:changed', subscription)
  },

  // Auth & Security
  authGetStatus: () => ipcRenderer.invoke('auth:getStatus'),
  authLogin: (password: string) => ipcRenderer.invoke('auth:login', password),
  authLogout: () => ipcRenderer.invoke('auth:logout'),
  authSetPasswords: (payload: { adminPassword?: string | null; pointsPassword?: string | null }) =>
    ipcRenderer.invoke('auth:setPasswords', payload),
  authGenerateRecovery: () => ipcRenderer.invoke('auth:generateRecovery'),
  authResetByRecovery: (recoveryString: string) =>
    ipcRenderer.invoke('auth:resetByRecovery', recoveryString),
  authClearAll: () => ipcRenderer.invoke('auth:clearAll'),

  // Data import/export
  exportDataJson: () => ipcRenderer.invoke('data:exportJson'),
  importDataJson: (jsonText: string) => ipcRenderer.invoke('data:importJson', jsonText),

  // Window
  openWindow: (input: { key: string; title?: string; route?: string; options?: any }) =>
    ipcRenderer.invoke('window:open', input),
  navigateWindow: (input: { key?: string; route: string }) =>
    ipcRenderer.invoke('window:navigate', input),
  windowMinimize: () => ipcRenderer.invoke('window:minimize'),
  windowMaximize: () => ipcRenderer.invoke('window:maximize'),
  windowClose: () => ipcRenderer.invoke('window:close'),
  windowIsMaximized: () => ipcRenderer.invoke('window:isMaximized'),
  onWindowMaximizedChanged: (callback: (maximized: boolean) => void) => {
    const subscription = (_event: any, maximized: boolean) => callback(maximized)
    ipcRenderer.on('window:maximized-changed', subscription)
    return () => ipcRenderer.removeListener('window:maximized-changed', subscription)
  },
  onNavigate: (callback: (route: string) => void) => {
    const subscription = (_event: any, route: string) => callback(route)
    ipcRenderer.on('app:navigate', subscription)
    return () => ipcRenderer.removeListener('app:navigate', subscription)
  },
  toggleDevTools: () => ipcRenderer.invoke('window:toggle-devtools'),
  windowResize: (width: number, height: number) => ipcRenderer.invoke('window:resize', width, height),

  // Logger
  queryLogs: (lines?: number) => ipcRenderer.invoke('log:query', lines),
  clearLogs: () => ipcRenderer.invoke('log:clear'),
  setLogLevel: (level: string) => ipcRenderer.invoke('log:setLevel', level),
  writeLog: (payload: { level: string; message: string; meta?: any }) =>
    ipcRenderer.invoke('log:write', payload)
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    try {
      ipcRenderer.invoke('log:write', {
        level: 'error',
        message: 'preload:expose failed',
        meta:
          error instanceof Error
            ? { message: error.message, stack: error.stack }
            : { error: String(error) }
      })
    } catch {
      void 0
    }
  }
} else {
  // @ts-ignore (define in dts)
  window.api = api
}
