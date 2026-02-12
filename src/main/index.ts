import 'reflect-metadata'
import { app } from 'electron'
import { join, dirname } from 'path'
import fs from 'fs'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/SecScore_logo.ico?asset'
import { MainContext } from './context'
import { DbManager } from './db/DbManager'
import { LoggerService } from './services/LoggerService'
import { SettingsService } from './services/SettingsService'
import { SecurityService } from './services/SecurityService'
import { PermissionService } from './services/PermissionService'
import { AuthService } from './services/AuthService'
import { DataService } from './services/DataService'
import { ThemeService } from './services/ThemeService'
import { HttpServerService } from './services/HttpServerService'
import { WindowManager, type windowManagerOptions } from './services/WindowManager'
import { TrayService } from './services/TrayService'
import { AutoScoreService } from './services/AutoScoreService'
import { FileSystemService } from './services/FileSystemService'
import { StudentRepository } from './repos/StudentRepository'
import { ReasonRepository } from './repos/ReasonRepository'
import { EventRepository } from './repos/EventRepository'
import { SettlementRepository } from './repos/SettlementRepository'
import { TagRepository } from './repos/TagRepository'
import {
  AppConfigToken,
  createHostBuilder,
  DbManagerToken,
  EventRepositoryToken,
  LoggerToken,
  PermissionServiceToken,
  ReasonRepositoryToken,
  SecurityServiceToken,
  SettlementRepositoryToken,
  SettingsStoreToken,
  StudentRepositoryToken,
  TagRepositoryToken,
  ThemeServiceToken,
  WindowManagerToken,
  TrayServiceToken,
  AutoScoreServiceToken,
  HttpServerServiceToken,
  FileSystemServiceToken
} from './hosting'

type mainAppConfig = {
  isDev: boolean
  appRoot: string
  dataRoot: string
  configDir: string
  logDir: string
  themeDir: string
  dbPath: string
  window: windowManagerOptions
}

const PROTOCOL_SCHEME = 'secscore'

let mainCtxRef: MainContext | null = null
let pendingProtocolUrl: string | null = null

const extractProtocolUrl = (argv: string[]): string | null => {
  const prefix = `${PROTOCOL_SCHEME}://`
  const lowerPrefix = prefix.toLowerCase()
  for (const arg of argv) {
    if (typeof arg !== 'string') continue
    const v = arg.trim()
    if (!v) continue
    const lower = v.toLowerCase()
    if (lower.startsWith(lowerPrefix)) return v
  }
  return null
}

const openMainRoute = (ctx: MainContext, route: string) => {
  ctx.windows.open({
    key: 'main',
    title: 'SecScore',
    route
  })
}

const handleProtocolUrl = (rawUrl: string, ctx: MainContext) => {
  if (!rawUrl) return
  let s = rawUrl.trim()
  if (!s) return
  const prefix = `${PROTOCOL_SCHEME}://`
  if (s.toLowerCase().startsWith(prefix)) {
    s = s.slice(prefix.length)
  }
  s = s.replace(/^\/+/, '')
  if (!s) {
    openMainRoute(ctx, '/')
    return
  }
  const parts = s.split('/')
  const head = parts[0]?.toLowerCase() ?? ''
  if (!head) {
    openMainRoute(ctx, '/')
    return
  }
  if (head === 'home') {
    openMainRoute(ctx, '/')
    return
  }
  if (head === 'students') {
    openMainRoute(ctx, '/students')
    return
  }
  if (head === 'score') {
    openMainRoute(ctx, '/score')
    return
  }
  if (head === 'leaderboard') {
    openMainRoute(ctx, '/leaderboard')
    return
  }
  if (head === 'settlements') {
    openMainRoute(ctx, '/settlements')
    return
  }
  if (head === 'reasons') {
    openMainRoute(ctx, '/reasons')
    return
  }
  if (head === 'settings') {
    openMainRoute(ctx, '/settings')
    return
  }
}

const hasSingleInstanceLock = app.requestSingleInstanceLock()

if (!hasSingleInstanceLock) {
  app.quit()
} else {
  const initialUrl = extractProtocolUrl(process.argv)
  if (initialUrl) {
    pendingProtocolUrl = initialUrl
  }
  app.on('second-instance', (event, argv) => {
    event.preventDefault()
    const url = extractProtocolUrl(argv)
    if (!url) return
    if (mainCtxRef) {
      handleProtocolUrl(url, mainCtxRef)
    } else {
      pendingProtocolUrl = url
    }
  })
  app.on('open-url', (event, url) => {
    event.preventDefault()
    if (mainCtxRef) {
      handleProtocolUrl(url, mainCtxRef)
    } else {
      pendingProtocolUrl = url
    }
  })
}

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('com.electron')

  if (!is.dev) {
    app.setAsDefaultProtocolClient(PROTOCOL_SCHEME)
  }

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

  const logDir = is.dev ? join(process.cwd(), 'logs') : join(dataRoot, 'logs')
  const configDir = is.dev ? join(process.cwd(), 'configs') : join(dataRoot, 'configs')
  const themeDir = is.dev
    ? join(process.cwd(), 'themes')
    : ensureWritableDir(join(appRoot, 'themes'), join(dataRoot, 'themes'))
  const dbPath = is.dev ? join(process.cwd(), 'db.sqlite') : join(dataRoot, 'db.sqlite')

  const config: mainAppConfig = {
    isDev: is.dev,
    appRoot,
    dataRoot,
    logDir,
    configDir,
    themeDir,
    dbPath,
    window: {
      icon,
      preloadPath: join(__dirname, '../preload/index.js'),
      rendererHtmlPath: join(__dirname, '../renderer/index.html'),
      getRendererUrl: () => (is.dev ? process.env['ELECTRON_RENDERER_URL'] : undefined)
    }
  }

  const builder = createHostBuilder({
    logger: {
      error: (...args: any[]) => {
        try {
          process.stderr.write(`${args.map((a) => String(a)).join(' ')}\n`)
        } catch {
          return
        }
      }
    }
  })
    .configureServices(async (_builderContext, services) => {
      services.addSingleton(AppConfigToken, config)

      services.addSingleton(MainContext, () => new MainContext())

      services.addSingleton(
        LoggerToken,
        (p) => new LoggerService(p.get(MainContext), config.logDir)
      )
      services.addSingleton(DbManagerToken, (p) => new DbManager(p.get(MainContext), config.dbPath))
      services.addSingleton(SettingsStoreToken, (p) => new SettingsService(p.get(MainContext)))
      services.addSingleton(SecurityServiceToken, (p) => new SecurityService(p.get(MainContext)))
      services.addSingleton(
        PermissionServiceToken,
        (p) => new PermissionService(p.get(MainContext))
      )
      services.addSingleton(AuthService, (p) => new AuthService(p.get(MainContext)))
      services.addSingleton(
        DataService,
        (p) => new DataService(p.get(MainContext), p.get(TagRepositoryToken))
      )

      services.addSingleton(
        StudentRepositoryToken,
        (p) => new StudentRepository(p.get(MainContext))
      )
      services.addSingleton(ReasonRepositoryToken, (p) => new ReasonRepository(p.get(MainContext)))
      services.addSingleton(EventRepositoryToken, (p) => new EventRepository(p.get(MainContext)))
      services.addSingleton(
        SettlementRepositoryToken,
        (p) => new SettlementRepository(p.get(MainContext))
      )
      services.addSingleton(
        TagRepositoryToken,
        (p) => new TagRepository((p.get(DbManagerToken) as DbManager).dataSource)
      )

      services.addSingleton(
        ThemeServiceToken,
        (p) => new ThemeService(p.get(MainContext), config.themeDir)
      )
      services.addSingleton(
        WindowManagerToken,
        (p) => new WindowManager(p.get(MainContext), config.window)
      )
      services.addSingleton(
        TrayServiceToken,
        (p) => new TrayService(p.get(MainContext), config.window)
      )
      services.addSingleton(AutoScoreServiceToken, (p) => new AutoScoreService(p.get(MainContext)))
      services.addSingleton(
        HttpServerServiceToken,
        (p) => new HttpServerService(p.get(MainContext))
      )
      services.addSingleton(
        FileSystemServiceToken,
        (p) => new FileSystemService(p.get(MainContext), config.configDir)
      )
    })
    .configure(async (_builderContext, appCtx) => {
      const services = appCtx.services
      services.get(LoggerToken)
      const db = services.get(DbManagerToken) as DbManager
      await db.initialize()
      const settings = services.get(SettingsStoreToken) as SettingsService
      await settings.initialize()
      services.get(SecurityServiceToken)
      services.get(PermissionServiceToken)
      services.get(AuthService)
      services.get(DataService)
      services.get(StudentRepositoryToken)
      services.get(ReasonRepositoryToken)
      services.get(EventRepositoryToken)
      services.get(SettlementRepositoryToken)
      const theme = services.get(
        ThemeServiceToken
      ) as import('./services/ThemeService').ThemeService
      await theme.init()
      if (!process.env.HEADLESS) {
        services.get(WindowManagerToken)
        const tray = services.get(TrayServiceToken) as TrayService
        tray.initialize()
      }
      const autoScore = services.get(AutoScoreServiceToken) as AutoScoreService
      autoScore.initialize?.()
      services.get(HttpServerServiceToken)
      services.get(FileSystemServiceToken)
    })
    .configure(async (_builderContext, appCtx) => {
      const services = appCtx.services
      services.get(LoggerToken)
      const db = services.get(DbManagerToken) as DbManager
      await db.initialize()
      const settings = services.get(SettingsStoreToken) as SettingsService
      await settings.initialize()
      services.get(SecurityServiceToken)
      services.get(PermissionServiceToken)
      services.get(AuthService)
      services.get(DataService)
      services.get(StudentRepositoryToken)
      services.get(ReasonRepositoryToken)
      services.get(EventRepositoryToken)
      services.get(SettlementRepositoryToken)
      const theme = services.get(
        ThemeServiceToken
      ) as import('./services/ThemeService').ThemeService
      await theme.init()
      if (!process.env.HEADLESS) {
        services.get(WindowManagerToken)
        const tray = services.get(TrayServiceToken) as TrayService
        tray.initialize()
      }
      services.get(FileSystemServiceToken)
    })

  const host = await builder.build()
  const ctx = host.services.get(MainContext) as MainContext
  mainCtxRef = ctx

  ctx.handle('app:register-url-protocol', async () => {
    if (is.dev) {
      return { success: false, message: '仅在打包后的应用中可用' }
    }
    try {
      const ok = app.setAsDefaultProtocolClient(PROTOCOL_SCHEME)
      if (ok) {
        return { success: true, data: { registered: true } }
      }
      return { success: false, data: { registered: false }, message: '系统未接受协议注册' }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : typeof error === 'string' ? error : 'Unknown error'
      return { success: false, message: `注册失败: ${message}` }
    }
  })

  await host.start()

  if (pendingProtocolUrl) {
    handleProtocolUrl(pendingProtocolUrl, ctx)
    pendingProtocolUrl = null
  } else {
    openMainRoute(ctx, '/')
  }

  let disposing = false
  const beforeQuitHandler = () => {
    if (disposing) return
    disposing = true
    ctx.isQuitting = true
    app.removeListener('before-quit', beforeQuitHandler)
    void host.dispose()
  }
  app.on('before-quit', beforeQuitHandler)
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
