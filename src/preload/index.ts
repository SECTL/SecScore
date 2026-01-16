import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import { ThemeConfig } from './types'

const api = {
  // Theme
  getThemes: () => ipcRenderer.invoke('theme:list'),
  getCurrentTheme: () => ipcRenderer.invoke('theme:current'),
  setTheme: (themeId: string) => ipcRenderer.invoke('theme:set', themeId),
  onThemeChanged: (callback: (theme: ThemeConfig) => void) => {
    const subscription = (_event: any, theme: ThemeConfig) => callback(theme)
    ipcRenderer.on('theme:updated', subscription)
    return () => ipcRenderer.removeListener('theme:updated', subscription)
  },

  // DB - Student
  queryStudents: (params: any) => ipcRenderer.invoke('db:student:query', params),
  createStudent: (data: any) => ipcRenderer.invoke('db:student:create', data),
  updateStudent: (id: number, data: any) => ipcRenderer.invoke('db:student:update', id, data),
  deleteStudent: (id: number) => ipcRenderer.invoke('db:student:delete', id),

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
  getSettings: () => ipcRenderer.invoke('db:getSettings'),
  updateSetting: (key: string, value: string) => ipcRenderer.invoke('db:updateSetting', key, value),
  getSyncStatus: () => ipcRenderer.invoke('ws:getStatus'),
  triggerSync: () => ipcRenderer.invoke('ws:triggerSync'),

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
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.api = api
}
