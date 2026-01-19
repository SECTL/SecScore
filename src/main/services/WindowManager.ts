import { Service } from '../../shared/kernel'
import { MainContext } from '../context'
import { BrowserWindow, shell, screen } from 'electron'
import type { BrowserWindowConstructorOptions } from 'electron'

export type windowOpenInput = {
  key: string
  title?: string
  route?: string
  options?: BrowserWindowConstructorOptions
}

export type windowManagerOptions = {
  icon: any
  preloadPath: string
  rendererHtmlPath: string
  getRendererUrl: () => string | undefined
}

declare module '../../shared/kernel' {
  interface Context {
    windows: WindowManager
  }
}

export class WindowManager extends Service {
  private readonly windows = new Map<string, BrowserWindow>()

  constructor(
    ctx: MainContext,
    private readonly opts: windowManagerOptions
  ) {
    super(ctx, 'windows')
    this.registerIpc()
  }

  private get mainCtx() {
    return this.ctx as MainContext
  }

  public get(key: string) {
    const existing = this.windows.get(key)
    if (!existing) return null
    if (existing.isDestroyed()) {
      this.windows.delete(key)
      return null
    }
    return existing
  }

  public open(input: windowOpenInput) {
    const existing = this.get(input.key)
    if (existing) {
      if (input.route) {
        // Use soft navigation if window exists to prevent reload
        existing.webContents.send('app:navigate', input.route)
      }
      existing.show()
      existing.focus()
      return existing
    }

    const win = new BrowserWindow({
      width: 900,
      height: 670,
      show: false,
      autoHideMenuBar: true,
      frame: false, // Custom title bar
      icon: this.opts.icon,
      title: input.title,
      webPreferences: {
        preload: this.opts.preloadPath,
        sandbox: false
      },
      ...input.options
    })

    // Special positioning for global sidebar
    if (input.key === 'global-sidebar') {
      const primaryDisplay = screen.getPrimaryDisplay()
      const { width, height } = primaryDisplay.workAreaSize
      const winWidth = 84
      const winHeight = 300
      win.setBounds({
        x: width - winWidth,
        y: Math.floor(height / 2 - winHeight / 2),
        width: winWidth,
        height: winHeight
      })
      win.setAlwaysOnTop(true, 'screen-saver')
      win.setVisibleOnAllWorkspaces(true)
      win.setSkipTaskbar(true)
      win.setResizable(false)
    }

    const zoom = Number(this.mainCtx.settings.getValue('window_zoom')) || 1.0
    win.webContents.setZoomFactor(zoom)

    this.windows.set(input.key, win)

    win.on('close', (event) => {
      if (!this.mainCtx.isQuitting && input.key === 'main') {
        event.preventDefault()
        win.hide()
      }
    })

    win.on('closed', () => {
      this.windows.delete(input.key)
    })

    win.on('ready-to-show', () => {
      win.show()
    })

    // Notify renderer about maximize state changes
    win.on('maximize', () => {
      win.webContents.send('window:maximized-changed', true)
    })
    win.on('unmaximize', () => {
      win.webContents.send('window:maximized-changed', false)
    })

    win.webContents.setWindowOpenHandler((details) => {
      shell.openExternal(details.url)
      return { action: 'deny' }
    })

    void this.loadRoute(win, input.route ?? '/')
    return win
  }

  public navigate(key: string, route: string) {
    const win = this.get(key)
    if (!win) return false
    win.webContents.send('app:navigate', route)
    return true
  }

  public navigateWindow(win: BrowserWindow, route: string) {
    if (win.isDestroyed()) return false
    win.webContents.send('app:navigate', route)
    return true
  }

  private async loadRoute(win: BrowserWindow, route: string) {
    const normalizedRoute = route.startsWith('/') ? route : `/${route}`
    const rendererUrl = this.opts.getRendererUrl()

    if (rendererUrl) {
      await win.loadURL(`${rendererUrl}#${normalizedRoute}`)
      return
    }

    await win.loadFile(this.opts.rendererHtmlPath, { hash: normalizedRoute })
  }

  private registerIpc() {
    this.mainCtx.handle('window:open', async (_event, input: any) => {
      const key = String(input?.key ?? '').trim()
      if (!key) return { success: false, message: 'Missing key' }
      this.open({
        key,
        title: input?.title ? String(input.title) : undefined,
        route: input?.route ? String(input.route) : undefined,
        options: input?.options
      })
      return { success: true }
    })

    this.mainCtx.handle('window:navigate', async (event, input: any) => {
      const route = String(input?.route ?? '').trim()
      if (!route) return { success: false, message: 'Missing route' }

      const key = input?.key ? String(input.key).trim() : ''
      if (key) {
        const ok = this.navigate(key, route)
        return ok ? { success: true } : { success: false, message: 'Window not found' }
      }

      const win = BrowserWindow.fromWebContents(event.sender)
      if (!win) return { success: false, message: 'Window not found' }
      const ok = this.navigateWindow(win, route)
      return ok ? { success: true } : { success: false, message: 'Window not found' }
    })

    // Window controls
    this.mainCtx.handle('window:minimize', (event) => {
      const win = BrowserWindow.fromWebContents(event.sender)
      if (win) win.minimize()
    })

    this.mainCtx.handle('window:maximize', (event) => {
      const win = BrowserWindow.fromWebContents(event.sender)
      if (win) {
        if (win.isMaximized()) {
          win.unmaximize()
          return false
        } else {
          win.maximize()
          return true
        }
      }
      return false
    })

    this.mainCtx.handle('window:close', (event) => {
      const win = BrowserWindow.fromWebContents(event.sender)
      if (win) win.close()
    })

    this.mainCtx.handle('window:isMaximized', (event) => {
      const win = BrowserWindow.fromWebContents(event.sender)
      return win ? win.isMaximized() : false
    })

    this.mainCtx.handle('window:set-zoom', (event, zoom: number) => {
      const win = BrowserWindow.fromWebContents(event.sender)
      if (win && zoom >= 0.5 && zoom <= 2.0) {
        win.webContents.setZoomFactor(zoom)
      }
    })

    this.mainCtx.handle('window:toggle-devtools', (event) => {
      const win = BrowserWindow.fromWebContents(event.sender)
      if (win) {
        if (win.webContents.isDevToolsOpened()) {
          win.webContents.closeDevTools()
        } else {
          win.webContents.openDevTools()
        }
      }
    })

    this.mainCtx.handle('window:resize', (event, width: number, height: number) => {
      const win = BrowserWindow.fromWebContents(event.sender)
      if (win) {
        const bounds = win.getBounds()
        // Keep right side pinned
        const newX = bounds.x + (bounds.width - width)
        win.setBounds({
          x: newX,
          y: bounds.y,
          width,
          height
        })
      }
    })
  }
}
