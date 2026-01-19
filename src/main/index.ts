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
import { WindowManager, type windowManagerOptions } from './services/WindowManager'
import { TrayService } from './services/TrayService'
import { StudentRepository } from './repos/StudentRepository'
import { ReasonRepository } from './repos/ReasonRepository'
import { EventRepository } from './repos/EventRepository'
import { SettlementRepository } from './repos/SettlementRepository'
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
  ThemeServiceToken,
  WindowManagerToken,
  TrayServiceToken
} from './hosting'

type mainAppConfig = {
  isDev: boolean
  appRoot: string
  dataRoot: string
  logDir: string
  themeDir: string
  dbPath: string
  window: windowManagerOptions
}

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('com.electron')

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
  const themeDir = is.dev
    ? join(process.cwd(), 'themes')
    : ensureWritableDir(join(appRoot, 'themes'), join(dataRoot, 'themes'))
  const dbPath = is.dev ? join(process.cwd(), 'db.sqlite') : join(dataRoot, 'db.sqlite')

  const config: mainAppConfig = {
    isDev: is.dev,
    appRoot,
    dataRoot,
    logDir,
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
      services.addSingleton(DataService, (p) => new DataService(p.get(MainContext)))

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
    })
    .configure(async (_builderContext, appCtx) => {
      const services = appCtx.services
      const ctx = services.get(MainContext)
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
      services.get(ThemeServiceToken)
      services.get(WindowManagerToken)
      const tray = services.get(TrayServiceToken) as TrayService
      tray.initialize()

      // Open Global Sidebar on startup
      ctx.windows.open({
        key: 'global-sidebar',
        title: 'SecScore Sidebar',
        route: '/global-sidebar',
        options: {
          transparent: true,
          alwaysOnTop: true,
          hasShadow: false,
          type: 'toolbar'
        }
      })
    })

  const host = await builder.build()
  const ctx = host.services.get(MainContext) as MainContext
  await host.start()

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
