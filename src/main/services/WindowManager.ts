import { Service } from '../../shared/kernel'
import { MainContext } from '../context'
import { BrowserWindow, shell, screen } from 'electron'
import type { BrowserWindowConstructorOptions } from 'electron'

let micaElectron: typeof import('mica-electron') | null = null
let MicaBrowserWindow: any = null
let IS_WINDOWS_11 = false

try {
  if (process.platform === 'win32') {
    const micaModule = require('mica-electron')
    micaElectron = micaModule
    MicaBrowserWindow = micaModule.MicaBrowserWindow
    IS_WINDOWS_11 = micaModule.IS_WINDOWS_11
  }
} catch (error) {
  console.warn('mica-electron not available:', error)
}

interface MicaWindow extends BrowserWindow {
  setMicaEffect(): void
  setMicaTabbedEffect(): void
  setMicaAcrylicEffect(): void
  setAcrylic(): void
  setBlur(): void
  setTransparent(): void
  setDarkTheme(): void
  setLightTheme(): void
  setAutoTheme(): void
  setRoundedCorner(): void
  setSmallRoundedCorner(): void
  setSquareCorner(): void
  setBorderColor(color: string | null): void
  setCaptionColor(color: string | null): void
  setTitleTextColor(color: string | null): void
}

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
        existing.webContents.send('app:navigate', input.route)
      }
      existing.show()
      existing.focus()
      return existing
    }

    const baseOptions: BrowserWindowConstructorOptions = {
      width: 900,
      height: 670,
      show: false,
      autoHideMenuBar: true,
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      icon: this.opts.icon,
      title: input.title,
      webPreferences: {
        preload: this.opts.preloadPath,
        sandbox: false
      },
      ...input.options
    }

    let win: BrowserWindow
    if (MicaBrowserWindow) {
      win = new MicaBrowserWindow(baseOptions)
      this.applyMicaEffect(win)
    } else {
      win = new BrowserWindow(baseOptions)
    }

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

    win.on('blur', () => {
      if (input.key === 'global-sidebar' || input.key === 'main') {
        this.applyMicaEffect(win)
      }
    })

    win.on('focus', () => {
      if (input.key === 'global-sidebar' || input.key === 'main') {
        this.applyMicaEffect(win)
      }
    })

    win.webContents.setWindowOpenHandler((details) => {
      shell.openExternal(details.url)
      return { action: 'deny' }
    })

    void this.loadRoute(win, input.route ?? '/')
    return win
  }

  private applyMicaEffect(win: BrowserWindow) {
    if (!micaElectron) return
    const micaWin = win as MicaWindow

    const theme = this.mainCtx.settings.getValue('window_theme')
    switch (theme) {
      case 'dark':
        micaWin.setDarkTheme()
        break
      case 'light':
        micaWin.setLightTheme()
        break
      default:
        micaWin.setAutoTheme()
    }

    const effect = this.mainCtx.settings.getValue('window_effect')
    switch (effect) {
      case 'mica':
        micaWin.setMicaEffect()
        break
      case 'tabbed':
        micaWin.setMicaTabbedEffect()
        break
      case 'acrylic':
        if (IS_WINDOWS_11) {
          micaWin.setMicaAcrylicEffect()
        } else {
          micaWin.setAcrylic()
        }
        break
      case 'blur':
        if (!IS_WINDOWS_11) {
          micaWin.setBlur()
        }
        break
      case 'transparent':
        if (!IS_WINDOWS_11) {
          micaWin.setTransparent()
        }
        break
    }

    const radius = this.mainCtx.settings.getValue('window_radius')
    switch (radius) {
      case 'small':
        micaWin.setSmallRoundedCorner()
        break
      case 'square':
        micaWin.setSquareCorner()
        break
      default:
        micaWin.setRoundedCorner()
    }
  }

  public setMicaEffect(
    win: BrowserWindow,
    effect: 'mica' | 'tabbed' | 'acrylic' | 'blur' | 'transparent' | 'none' = 'mica'
  ) {
    if (!micaElectron) return
    const micaWin = win as MicaWindow

    switch (effect) {
      case 'mica':
        micaWin.setMicaEffect()
        break
      case 'tabbed':
        micaWin.setMicaTabbedEffect()
        break
      case 'acrylic':
        if (IS_WINDOWS_11) {
          micaWin.setMicaAcrylicEffect()
        } else {
          micaWin.setAcrylic()
        }
        break
      case 'blur':
        if (!IS_WINDOWS_11) {
          micaWin.setBlur()
        }
        break
      case 'transparent':
        if (!IS_WINDOWS_11) {
          micaWin.setTransparent()
        }
        break
      case 'none':
        if (IS_WINDOWS_11) {
          micaWin.setMicaEffect()
        }
        break
    }
  }

  public setMicaTheme(win: BrowserWindow, theme: 'auto' | 'dark' | 'light' = 'auto') {
    if (!micaElectron) return
    const micaWin = win as MicaWindow

    switch (theme) {
      case 'dark':
        micaWin.setDarkTheme()
        break
      case 'light':
        micaWin.setLightTheme()
        break
      default:
        micaWin.setAutoTheme()
    }
  }

  public setMicaCorner(win: BrowserWindow, corner: 'rounded' | 'small' | 'square' = 'rounded') {
    if (!micaElectron) return
    const micaWin = win as MicaWindow

    switch (corner) {
      case 'small':
        micaWin.setSmallRoundedCorner()
        break
      case 'square':
        micaWin.setSquareCorner()
        break
      default:
        micaWin.setRoundedCorner()
    }
  }

  public setMicaBorderColor(win: BrowserWindow, color: string | null) {
    if (!micaElectron) return
    const micaWin = win as MicaWindow
    micaWin.setBorderColor(color)
  }

  public setMicaCaptionColor(win: BrowserWindow, color: string | null) {
    if (!micaElectron) return
    const micaWin = win as MicaWindow
    micaWin.setCaptionColor(color)
  }

  public setMicaTitleTextColor(win: BrowserWindow, color: string | null) {
    if (!micaElectron) return
    const micaWin = win as MicaWindow
    micaWin.setTitleTextColor(color)
  }

  public isMicaAvailable(): boolean {
    return micaElectron !== null
  }

  public isWindows11(): boolean {
    return IS_WINDOWS_11
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
        const newX = bounds.x + (bounds.width - width)
        win.setBounds({
          x: newX,
          y: bounds.y,
          width,
          height
        })
      }
    })

    this.mainCtx.handle('window:mica-effect', (_event, effect: string) => {
      const win = BrowserWindow.fromWebContents(_event.sender)
      if (win) {
        this.setMicaEffect(win, effect as any)
      }
    })

    this.mainCtx.handle('window:mica-theme', (_event, theme: string) => {
      const win = BrowserWindow.fromWebContents(_event.sender)
      if (win) {
        this.setMicaTheme(win, theme as any)
      }
    })

    this.mainCtx.handle('window:mica-corner', (_event, corner: string) => {
      const win = BrowserWindow.fromWebContents(_event.sender)
      if (win) {
        this.setMicaCorner(win, corner as any)
      }
    })

    this.mainCtx.handle('window:mica-info', () => {
      return {
        available: this.isMicaAvailable(),
        isWindows11: this.isWindows11()
      }
    })
  }
}
