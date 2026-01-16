import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join, dirname } from 'path'
import fs from 'fs'
import crypto from 'crypto'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/SecScore_logo.ico?asset'
import { ThemeService } from './services/ThemeService'
import { LoggerService, LogLevel } from './services/LoggerService'
import { DbManager } from './db/DbManager'
import { StudentRepository } from './repos/StudentRepository'
import { ReasonRepository } from './repos/ReasonRepository'
import { EventRepository } from './repos/EventRepository'
import { SettlementRepository } from './repos/SettlementRepository'
import { WsClient } from './services/WsClient'
import { SyncEngine } from './services/SyncEngine'

function createWindow(): void {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    title: 'SecScore',
    show: false,
    autoHideMenuBar: true,
    icon,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  const appRoot = is.dev ? process.cwd() : dirname(process.execPath)

  const ensureWritableDir = (preferred: string, fallback: string) => {
    try {
      if (!fs.existsSync(preferred)) fs.mkdirSync(preferred, { recursive: true })
      return preferred
    } catch {
      if (!fs.existsSync(fallback)) fs.mkdirSync(fallback, { recursive: true })
      return fallback
    }
  }

  const dataRoot = is.dev
    ? process.cwd()
    : ensureWritableDir(join(appRoot, 'data'), join(app.getPath('userData'), 'secscore-data'))

  // Initialize Logger
  const logDir = is.dev ? join(process.cwd(), 'logs') : join(dataRoot, 'logs')
  const logger = new LoggerService(logDir)
  logger.info('Application starting...')

  const themeDir = is.dev
    ? join(process.cwd(), 'themes')
    : ensureWritableDir(join(appRoot, 'themes'), join(dataRoot, 'themes'))

  if (!is.dev) {
    try {
      const existing = fs.readdirSync(themeDir).filter((f) => f.toLowerCase().endsWith('.json'))
      if (existing.length === 0) {
        const builtinThemeDir = join(app.getAppPath(), 'themes')
        if (fs.existsSync(builtinThemeDir)) {
          const files = fs
            .readdirSync(builtinThemeDir)
            .filter((f) => f.toLowerCase().endsWith('.json'))
          for (const f of files) {
            const src = join(builtinThemeDir, f)
            const dest = join(themeDir, f)
            try {
              fs.copyFileSync(src, dest)
            } catch (e: any) {
              logger.warn?.('Failed to copy builtin theme', {
                src,
                dest,
                message: e?.message
              })
            }
          }
        }
      }
    } catch (e: any) {
      logger.warn?.('Failed to initialize theme directory', { message: e?.message })
    }
  }

  // Initialize DB
  const dbPath = is.dev ? join(process.cwd(), 'db.sqlite') : join(dataRoot, 'db.sqlite')
  const dbManager = new DbManager(dbPath)

  // Set logger level from settings
  const logLevelSetting = dbManager
    .getDb()
    .prepare("SELECT value FROM settings WHERE key = 'log_level'")
    .get() as any
  if (logLevelSetting) {
    logger.setLevel(logLevelSetting.value as LogLevel)
  }

  process.on('uncaughtException', (err) => {
    logger.error('uncaughtException', {
      message: err?.message,
      stack: err?.stack
    })
  })

  process.on('unhandledRejection', (reason: any) => {
    if (reason instanceof Error) {
      logger.error('unhandledRejection', { message: reason.message, stack: reason.stack })
    } else {
      logger.error('unhandledRejection', reason)
    }
  })

  app.on('render-process-gone', (_, __, details) => {
    logger.error('render-process-gone', details)
  })

  app.on('child-process-gone', (_, details) => {
    logger.error('child-process-gone', details)
  })

  const studentRepo = new StudentRepository(dbManager.getDb())
  const reasonRepo = new ReasonRepository(dbManager.getDb())
  const eventRepo = new EventRepository(dbManager.getDb())
  const settlementRepo = new SettlementRepository(dbManager.getDb())

  const SETTINGS_SECURITY_ADMIN = 'security_admin_password'
  const SETTINGS_SECURITY_POINTS = 'security_points_password'
  const SETTINGS_SECURITY_RECOVERY = 'security_recovery_string'
  const SETTINGS_SECURITY_IV = 'security_crypto_iv'

  type PermissionLevel = 'admin' | 'points' | 'view'
  const permissionRank: Record<PermissionLevel, number> = { view: 0, points: 1, admin: 2 }
  const permissionsBySenderId = new Map<number, PermissionLevel>()

  const getSetting = (key: string): string => {
    const row = dbManager.getDb().prepare('SELECT value FROM settings WHERE key = ?').get(key) as
      | { value?: string }
      | undefined
    return row?.value ?? ''
  }

  const setSetting = (key: string, value: string) => {
    dbManager
      .getDb()
      .prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)')
      .run(key, value)
  }

  const hasSecret = (key: string) => {
    const v = getSetting(key)
    return typeof v === 'string' && v.trim().length > 0
  }

  const ensureSecurityIv = () => {
    let ivHex = getSetting(SETTINGS_SECURITY_IV)
    if (!ivHex) {
      ivHex = crypto.randomBytes(16).toString('hex')
      setSetting(SETTINGS_SECURITY_IV, ivHex)
    }
    return ivHex
  }

  const getCryptoKey = () => {
    return crypto.scryptSync(app.getPath('userData'), 'secscore-salt', 32)
  }

  const encryptSecret = (plainText: string) => {
    const ivHex = ensureSecurityIv()
    const key = getCryptoKey()
    const cipher = crypto.createCipheriv('aes-256-cbc', key, Buffer.from(ivHex, 'hex'))
    let encrypted = cipher.update(plainText, 'utf8', 'hex')
    encrypted += cipher.final('hex')
    return encrypted
  }

  const decryptSecret = (cipherText: string) => {
    try {
      if (!cipherText) return ''
      const ivHex = ensureSecurityIv()
      const key = getCryptoKey()
      const decipher = crypto.createDecipheriv('aes-256-cbc', key, Buffer.from(ivHex, 'hex'))
      let plain = decipher.update(cipherText, 'hex', 'utf8')
      plain += decipher.final('utf8')
      return plain
    } catch {
      return ''
    }
  }

  const shouldProtect = () =>
    hasSecret(SETTINGS_SECURITY_ADMIN) || hasSecret(SETTINGS_SECURITY_POINTS)

  const getDefaultPermission = (): PermissionLevel => {
    return shouldProtect() ? 'view' : 'admin'
  }

  const getPermission = (senderId: number): PermissionLevel => {
    const existing = permissionsBySenderId.get(senderId)
    if (existing) return existing
    const def = getDefaultPermission()
    permissionsBySenderId.set(senderId, def)
    return def
  }

  const setPermission = (senderId: number, level: PermissionLevel) => {
    permissionsBySenderId.set(senderId, level)
  }

  const requirePermission = (event: any, required: PermissionLevel) => {
    const senderId = event?.sender?.id
    if (typeof senderId !== 'number') return false
    const current = getPermission(senderId)
    return permissionRank[current] >= permissionRank[required]
  }

  const isSixDigit = (s: string) => /^\d{6}$/.test(s)

  const themeService = new ThemeService(themeDir, (senderId) => {
    return permissionRank[getPermission(senderId)] >= permissionRank['admin']
  })
  themeService.init()

  // Initialize Sync
  const wsClient = new WsClient()
  const syncEngine = new SyncEngine(wsClient, dbManager)

  const startSyncIfRemote = () => {
    const syncMode = dbManager
      .getDb()
      .prepare("SELECT value FROM settings WHERE key = 'sync_mode'")
      .get() as any
    const wsServer = dbManager
      .getDb()
      .prepare("SELECT value FROM settings WHERE key = 'ws_server'")
      .get() as any

    if (syncMode?.value === 'remote' && wsServer?.value) {
      wsClient.connect(wsServer.value)
    } else {
      wsClient.close()
    }
  }

  startSyncIfRemote()

  // 监听本地事件创建，触发同步
  app.on('score-event-created' as any, () => {
    syncEngine.startOutboxSync()
  })

  // Student IPC
  ipcMain.handle('db:student:query', async () => ({ success: true, data: studentRepo.findAll() }))
  ipcMain.handle('db:student:create', async (event, data) => {
    if (!requirePermission(event, 'admin')) return { success: false, message: 'Permission denied' }
    return { success: true, data: studentRepo.create(data) }
  })
  ipcMain.handle('db:student:update', async (event, id, data) => {
    if (!requirePermission(event, 'admin')) return { success: false, message: 'Permission denied' }
    studentRepo.update(id, data)
    return { success: true }
  })
  ipcMain.handle('db:student:delete', async (event, id) => {
    if (!requirePermission(event, 'admin')) return { success: false, message: 'Permission denied' }
    studentRepo.delete(id)
    return { success: true }
  })

  // Reason IPC
  ipcMain.handle('db:reason:query', async () => ({ success: true, data: reasonRepo.findAll() }))
  ipcMain.handle('db:reason:create', async (event, data) => {
    if (!requirePermission(event, 'admin')) return { success: false, message: 'Permission denied' }
    return { success: true, data: reasonRepo.create(data) }
  })
  ipcMain.handle('db:reason:update', async (event, id, data) => {
    if (!requirePermission(event, 'admin')) return { success: false, message: 'Permission denied' }
    reasonRepo.update(id, data)
    return { success: true }
  })
  ipcMain.handle('db:reason:delete', async (event, id) => {
    if (!requirePermission(event, 'admin')) return { success: false, message: 'Permission denied' }
    const changes = reasonRepo.delete(id)
    if (!changes) return { success: false, message: '记录不存在' }
    return { success: true, data: { changes } }
  })
  // 兼容前端 deleteReason 命名错误
  ipcMain.handle('db:deleteReason', async (event, id) => {
    if (!requirePermission(event, 'admin')) return { success: false, message: 'Permission denied' }
    const changes = reasonRepo.delete(id)
    if (!changes) return { success: false, message: '记录不存在' }
    return { success: true, data: { changes } }
  })

  // Event IPC
  ipcMain.handle('db:event:query', async (_, params) => {
    try {
      return { success: true, data: eventRepo.findAll(params?.limit) }
    } catch (err: any) {
      return { success: false, message: err.message }
    }
  })

  ipcMain.handle('db:event:delete', async (event, uuid) => {
    try {
      if (!requirePermission(event, 'points'))
        return { success: false, message: 'Permission denied' }
      eventRepo.deleteByUuid(uuid)
      return { success: true }
    } catch (err: any) {
      return { success: false, message: err.message }
    }
  })

  ipcMain.handle('db:event:create', async (event, data) => {
    try {
      if (!requirePermission(event, 'points'))
        return { success: false, message: 'Permission denied' }
      const id = eventRepo.create(data)
      return { success: true, data: id }
    } catch (e: any) {
      return { success: false, message: e.message }
    }
  })

  ipcMain.handle('db:event:queryByStudent', async (_, params) => {
    try {
      const limit = Number(params?.limit ?? 50)
      const studentName = String(params?.student_name ?? '')
      const startTime = params?.startTime ? String(params.startTime) : null
      if (!studentName) return { success: true, data: [] }

      const db = dbManager.getDb()
      let rows: any[]
      if (startTime) {
        rows = db
          .prepare(
            `SELECT * FROM score_events
           WHERE student_name = ?
             AND settlement_id IS NULL
             AND julianday(event_time) >= julianday(?)
           ORDER BY event_time DESC
           LIMIT ?`
          )
          .all(studentName, startTime, limit)
      } else {
        rows = db
          .prepare(
            `SELECT * FROM score_events
           WHERE student_name = ?
             AND settlement_id IS NULL
           ORDER BY event_time DESC
           LIMIT ?`
          )
          .all(studentName, limit)
      }
      return { success: true, data: rows }
    } catch (err: any) {
      return { success: false, message: err.message }
    }
  })

  ipcMain.handle('db:leaderboard:query', async (_, params) => {
    try {
      const range = String(params?.range ?? 'today')

      const now = new Date()
      let start = new Date(now)
      if (range === 'today') {
        start.setHours(0, 0, 0, 0)
      } else if (range === 'week') {
        const day = start.getDay()
        const diff = (day === 0 ? -6 : 1) - day
        start.setDate(start.getDate() + diff)
        start.setHours(0, 0, 0, 0)
      } else if (range === 'month') {
        start = new Date(start.getFullYear(), start.getMonth(), 1)
        start.setHours(0, 0, 0, 0)
      } else {
        start.setHours(0, 0, 0, 0)
      }
      const startTime = start.toISOString()

      const db = dbManager.getDb()
      const rows = db
        .prepare(
          `SELECT
           s.id as id,
           s.name as name,
           s.score as score,
           COALESCE(SUM(e.delta), 0) as range_change
         FROM students s
         LEFT JOIN score_events e
           ON e.student_name = s.name
          AND e.settlement_id IS NULL
          AND julianday(e.event_time) >= julianday(?)
         GROUP BY s.id, s.name, s.score
         ORDER BY s.score DESC, range_change DESC, s.name ASC`
        )
        .all(startTime)

      return { success: true, data: { startTime, rows } }
    } catch (err: any) {
      return { success: false, message: err.message }
    }
  })

  ipcMain.handle('db:settlement:query', async () => {
    try {
      return { success: true, data: settlementRepo.findAll() }
    } catch (err: any) {
      return { success: false, message: err.message }
    }
  })

  ipcMain.handle('db:settlement:create', async (event) => {
    try {
      if (!requirePermission(event, 'admin')) return { success: false, message: 'Permission denied' }
      const data = settlementRepo.settleNow()
      return { success: true, data }
    } catch (err: any) {
      return { success: false, message: err.message }
    }
  })

  ipcMain.handle('db:settlement:leaderboard', async (_, params) => {
    try {
      const settlementId = Number(params?.settlement_id)
      if (!Number.isFinite(settlementId)) return { success: false, message: 'Invalid settlement_id' }
      return { success: true, data: settlementRepo.getLeaderboard(settlementId) }
    } catch (err: any) {
      return { success: false, message: err.message }
    }
  })

  // Settings IPC
  ipcMain.handle('db:getSettings', () => {
    const rows = dbManager.getDb().prepare('SELECT key, value FROM settings').all() as {
      key: string
      value: string
    }[]
    const settings: Record<string, string> = {}
    rows.forEach((r) => (settings[r.key] = r.value))
    return { success: true, data: settings }
  })

  ipcMain.handle('db:updateSetting', (_event, key, value) => {
    if (!requirePermission(_event, 'admin')) return { success: false, message: 'Permission denied' }
    dbManager
      .getDb()
      .prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)')
      .run(key, value)
    if (key === 'sync_mode' || key === 'ws_server') {
      startSyncIfRemote()
    }
    return { success: true }
  })

  ipcMain.handle('ws:getStatus', () => {
    return {
      success: true,
      data: {
        connected: wsClient.isConnected(),
        lastSync: new Date().toISOString() // TODO: 记录真正的最后同步时间
      }
    }
  })

  ipcMain.handle('ws:triggerSync', async (event) => {
    if (!requirePermission(event, 'admin')) return { success: false, message: 'Permission denied' }
    await syncEngine.triggerFullSync()
    return { success: true }
  })

  // Logger IPC
  ipcMain.handle('log:query', (_, lines) => ({ success: true, data: logger.readLogs(lines) }))
  ipcMain.handle('log:clear', (event) => {
    if (!requirePermission(event, 'admin')) return { success: false, message: 'Permission denied' }
    logger.clearLogs()
    return { success: true }
  })
  ipcMain.handle('log:setLevel', (event, level: LogLevel) => {
    if (!requirePermission(event, 'admin')) return { success: false, message: 'Permission denied' }
    logger.setLevel(level)
    dbManager
      .getDb()
      .prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)')
      .run('log_level', level)
    return { success: true }
  })

  ipcMain.handle('log:write', (_event, payload: any) => {
    const level = String(payload?.level || 'info')
    const message = String(payload?.message || '')
    const meta = payload?.meta
    if (level === 'debug' || level === 'info' || level === 'warn' || level === 'error') {
      logger.log(level as LogLevel, message, meta)
    } else {
      logger.info(message, meta)
    }
    return { success: true }
  })

  ipcMain.handle('auth:getStatus', (event) => {
    const senderId = event?.sender?.id
    const permission =
      typeof senderId === 'number' ? getPermission(senderId) : getDefaultPermission()
    return {
      success: true,
      data: {
        permission,
        hasAdminPassword: hasSecret(SETTINGS_SECURITY_ADMIN),
        hasPointsPassword: hasSecret(SETTINGS_SECURITY_POINTS),
        hasRecoveryString: hasSecret(SETTINGS_SECURITY_RECOVERY)
      }
    }
  })

  ipcMain.handle('auth:login', (event, password: string) => {
    const senderId = event?.sender?.id
    if (typeof senderId !== 'number') return { success: false, message: 'Invalid sender' }
    if (!isSixDigit(String(password ?? ''))) {
      setPermission(senderId, getDefaultPermission())
      return { success: false, message: 'Invalid password format' }
    }

    const adminCipher = getSetting(SETTINGS_SECURITY_ADMIN)
    const pointsCipher = getSetting(SETTINGS_SECURITY_POINTS)
    const adminPlain = decryptSecret(adminCipher)
    const pointsPlain = decryptSecret(pointsCipher)

    if (adminCipher && adminPlain === password) {
      setPermission(senderId, 'admin')
      return { success: true, data: { permission: 'admin' as PermissionLevel } }
    }
    if (pointsCipher && pointsPlain === password) {
      setPermission(senderId, 'points')
      return { success: true, data: { permission: 'points' as PermissionLevel } }
    }

    setPermission(senderId, getDefaultPermission())
    return { success: false, message: 'Password incorrect' }
  })

  ipcMain.handle('auth:logout', (event) => {
    const senderId = event?.sender?.id
    if (typeof senderId === 'number') setPermission(senderId, getDefaultPermission())
    return { success: true, data: { permission: getDefaultPermission() } }
  })

  ipcMain.handle(
    'auth:setPasswords',
    (event, payload: { adminPassword?: string | null; pointsPassword?: string | null }) => {
      const alreadyHasAdmin = hasSecret(SETTINGS_SECURITY_ADMIN)
      if (alreadyHasAdmin && !requirePermission(event, 'admin'))
        return { success: false, message: 'Permission denied' }

      const adminPasswordRaw = payload?.adminPassword
      const pointsPasswordRaw = payload?.pointsPassword

      if (typeof adminPasswordRaw === 'string') {
        const trimmed = adminPasswordRaw.trim()
        if (trimmed.length === 0) setSetting(SETTINGS_SECURITY_ADMIN, '')
        else {
          if (!isSixDigit(trimmed))
            return { success: false, message: 'Admin password must be 6 digits' }
          setSetting(SETTINGS_SECURITY_ADMIN, encryptSecret(trimmed))
        }
      }

      if (typeof pointsPasswordRaw === 'string') {
        const trimmed = pointsPasswordRaw.trim()
        if (trimmed.length === 0) setSetting(SETTINGS_SECURITY_POINTS, '')
        else {
          if (!isSixDigit(trimmed))
            return { success: false, message: 'Points password must be 6 digits' }
          setSetting(SETTINGS_SECURITY_POINTS, encryptSecret(trimmed))
        }
      }

      if (!hasSecret(SETTINGS_SECURITY_RECOVERY)) {
        const recovery = crypto.randomBytes(18).toString('base64url')
        setSetting(SETTINGS_SECURITY_RECOVERY, encryptSecret(recovery))
        return { success: true, data: { recoveryString: recovery } }
      }

      return { success: true, data: {} }
    }
  )

  ipcMain.handle('auth:generateRecovery', (event) => {
    if (hasSecret(SETTINGS_SECURITY_ADMIN) && !requirePermission(event, 'admin'))
      return { success: false, message: 'Permission denied' }
    const recovery = crypto.randomBytes(18).toString('base64url')
    setSetting(SETTINGS_SECURITY_RECOVERY, encryptSecret(recovery))
    return { success: true, data: { recoveryString: recovery } }
  })

  ipcMain.handle('auth:resetByRecovery', (event, recoveryString: string) => {
    const cipher = getSetting(SETTINGS_SECURITY_RECOVERY)
    const plain = decryptSecret(cipher)
    if (!plain || plain !== String(recoveryString ?? '').trim())
      return { success: false, message: 'Recovery string incorrect' }

    setSetting(SETTINGS_SECURITY_ADMIN, '')
    setSetting(SETTINGS_SECURITY_POINTS, '')

    const newRecovery = crypto.randomBytes(18).toString('base64url')
    setSetting(SETTINGS_SECURITY_RECOVERY, encryptSecret(newRecovery))

    const senderId = event?.sender?.id
    if (typeof senderId === 'number') setPermission(senderId, getDefaultPermission())
    return { success: true, data: { recoveryString: newRecovery } }
  })

  ipcMain.handle('auth:clearAll', (event) => {
    if (!requirePermission(event, 'admin')) return { success: false, message: 'Permission denied' }
    setSetting(SETTINGS_SECURITY_ADMIN, '')
    setSetting(SETTINGS_SECURITY_POINTS, '')
    setSetting(SETTINGS_SECURITY_RECOVERY, '')
    const senderId = event?.sender?.id
    if (typeof senderId === 'number') setPermission(senderId, getDefaultPermission())
    return { success: true }
  })

  ipcMain.handle('data:exportJson', (event) => {
    if (!requirePermission(event, 'admin')) return { success: false, message: 'Permission denied' }
    const db = dbManager.getDb()
    const students = db
      .prepare('SELECT id, name, score, extra_json, created_at, updated_at FROM students')
      .all()
    const reasons = db
      .prepare(
        'SELECT id, content, category, delta, is_system, updated_at, sync_state FROM reasons'
      )
      .all()
    const events = db
      .prepare(
        'SELECT id, uuid, student_name, reason_content, delta, val_prev, val_curr, event_time, settlement_id, sync_state, remote_id FROM score_events'
      )
      .all()
    const settlements = db
      .prepare('SELECT id, start_time, end_time, created_at FROM settlements ORDER BY id ASC')
      .all()
    const settingsRows = db.prepare('SELECT key, value FROM settings').all() as {
      key: string
      value: string
    }[]
    const settings = settingsRows.filter((r) => !String(r.key).startsWith('security_'))
    return {
      success: true,
      data: JSON.stringify({ students, reasons, events, settlements, settings }, null, 2)
    }
  })

  ipcMain.handle('data:importJson', (event, jsonText: string) => {
    if (!requirePermission(event, 'admin')) return { success: false, message: 'Permission denied' }
    let parsed: any
    try {
      parsed = JSON.parse(String(jsonText ?? ''))
    } catch {
      return { success: false, message: 'Invalid JSON' }
    }

    const students = Array.isArray(parsed?.students) ? parsed.students : []
    const reasons = Array.isArray(parsed?.reasons) ? parsed.reasons : []
    const events = Array.isArray(parsed?.events) ? parsed.events : []
    const settlements = Array.isArray(parsed?.settlements) ? parsed.settlements : []
    const settings = Array.isArray(parsed?.settings) ? parsed.settings : []

    const db = dbManager.getDb()
    try {
      db.transaction(() => {
        db.prepare('DELETE FROM score_events').run()
        db.prepare('DELETE FROM settlements').run()
        db.prepare('DELETE FROM students').run()
        db.prepare('DELETE FROM reasons').run()
        db.prepare("DELETE FROM settings WHERE key NOT LIKE 'security_%'").run()

        const insertStudent = db.prepare(
          'INSERT INTO students (name, score, extra_json) VALUES (?, ?, ?)'
        )
        for (const s of students) {
          const name = String(s?.name ?? '').trim()
          if (!name) continue
          const score = Number(s?.score ?? 0)
          const extraJson = s?.extra_json != null ? String(s.extra_json) : null
          insertStudent.run(name, Number.isFinite(score) ? score : 0, extraJson)
        }

        const insertReason = db.prepare(
          'INSERT OR REPLACE INTO reasons (content, category, delta, is_system, sync_state) VALUES (?, ?, ?, ?, ?)'
        )
        for (const r of reasons) {
          const content = String(r?.content ?? '').trim()
          if (!content) continue
          const category = String(r?.category ?? '其他')
          const delta = Number(r?.delta ?? 0)
          const isSystem = Number(r?.is_system ?? 0) ? 1 : 0
          const syncState = Number(r?.sync_state ?? 0) ? 1 : 0
          insertReason.run(
            content,
            category,
            Number.isFinite(delta) ? delta : 0,
            isSystem,
            syncState
          )
        }

        const insertEvent = db.prepare(
          'INSERT INTO score_events (uuid, student_name, reason_content, delta, val_prev, val_curr, event_time, settlement_id, sync_state, remote_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        )
        const insertSettlement = db.prepare(
          'INSERT INTO settlements (id, start_time, end_time, created_at) VALUES (?, ?, ?, ?)'
        )
        for (const s of settlements) {
          const id = Number(s?.id)
          const startTime = String(s?.start_time ?? '').trim()
          const endTime = String(s?.end_time ?? '').trim()
          const createdAt = String(s?.created_at ?? new Date().toISOString())
          if (!Number.isFinite(id) || !startTime || !endTime) continue
          insertSettlement.run(id, startTime, endTime, createdAt)
        }
        for (const e of events) {
          const uuid = String(e?.uuid ?? '').trim()
          const studentName = String(e?.student_name ?? '').trim()
          const reasonContent = String(e?.reason_content ?? '').trim()
          if (!uuid || !studentName || !reasonContent) continue
          const delta = Number(e?.delta ?? 0)
          const valPrev = Number(e?.val_prev ?? 0)
          const valCurr = Number(e?.val_curr ?? 0)
          const eventTime = String(e?.event_time ?? new Date().toISOString())
          const settlementIdRaw = e?.settlement_id
          const settlementId =
            settlementIdRaw === null || settlementIdRaw === undefined
              ? null
              : Number(settlementIdRaw)
          const syncState = Number(e?.sync_state ?? 0) ? 1 : 0
          const remoteId = e?.remote_id != null ? String(e.remote_id) : null
          insertEvent.run(
            uuid,
            studentName,
            reasonContent,
            Number.isFinite(delta) ? delta : 0,
            Number.isFinite(valPrev) ? valPrev : 0,
            Number.isFinite(valCurr) ? valCurr : 0,
            eventTime,
            Number.isFinite(settlementId as any) ? settlementId : null,
            syncState,
            remoteId
          )
        }

        const insertSetting = db.prepare(
          'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)'
        )
        for (const it of settings) {
          const key = String(it?.key ?? '').trim()
          if (!key || key.startsWith('security_')) continue
          insertSetting.run(key, String(it?.value ?? ''))
        }
      })()
    } catch (e: any) {
      return { success: false, message: e?.message || 'Import failed' }
    }

    startSyncIfRemote()
    return { success: true }
  })

  createWindow()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
