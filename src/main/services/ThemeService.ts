import { Service } from '../../shared/kernel'
import { MainContext } from '../context'
import { BrowserWindow } from 'electron'
import fs from 'fs'
import path from 'path'
import { FSWatcher, watch } from 'chokidar'

export interface themeConfig {
  name: string
  id: string
  mode: 'light' | 'dark'
  mica?: {
    effect: 'mica' | 'tabbed' | 'acrylic' | 'blur' | 'transparent' | 'none'
    theme: 'auto' | 'dark' | 'light'
    radius: 'small' | 'medium' | 'large'
  }
  config: {
    tdesign: Record<string, string>
    custom: Record<string, string>
  }
}

declare module '../../shared/kernel' {
  interface Context {
    themes: ThemeService
  }
}

export class ThemeService extends Service {
  private themeDir: string
  private watcher: FSWatcher | null = null
  private currentThemeId: string = 'light-default'

  constructor(ctx: MainContext, themeDir: string) {
    super(ctx, 'themes')
    this.themeDir = themeDir
    this.setupWatcher()
    this.registerIpc()

    ctx.effect(() => {
      if (this.watcher) this.watcher.close()
    })
  }

  private get mainCtx() {
    return this.ctx as MainContext
  }

  public init() {
    // Already inited in constructor
  }

  private setupWatcher() {
    if (this.watcher) this.watcher.close()

    this.watcher = watch(this.themeDir, {
      ignored: /(^|[/\\])\../,
      persistent: true
    })

    this.watcher.on('change', (filePath) => {
      if (filePath.endsWith('.json')) {
        this.mainCtx.logger.info('Theme file changed', { filePath })
        this.notifyThemeUpdate()
      }
    })
  }

  private registerIpc() {
    this.mainCtx.handle('theme:list', async () => {
      return { success: true, data: this.getThemeList() }
    })

    this.mainCtx.handle('theme:current', async () => {
      const theme = this.getThemeById(this.currentThemeId)
      return { success: true, data: theme }
    })

    this.mainCtx.handle('theme:set', async (event, themeId: string) => {
      const senderId = event?.sender?.id
      if (typeof senderId === 'number') {
        if (!this.mainCtx.permissions.requirePermission(event, 'admin'))
          return { success: false, message: 'Permission denied' }
      }
      this.currentThemeId = themeId
      this.applyMicaEffect(themeId)
      this.notifyThemeUpdate()
      return { success: true }
    })

    this.mainCtx.handle('theme:save', async (event, theme: themeConfig) => {
      if (!this.mainCtx.permissions.requirePermission(event, 'admin'))
        return { success: false, message: 'Permission denied' }

      try {
        const filePath = path.join(this.themeDir, `${theme.id}.json`)
        fs.writeFileSync(filePath, JSON.stringify(theme, null, 2), 'utf-8')
        this.notifyThemeUpdate()
        return { success: true }
      } catch (e) {
        return { success: false, message: String(e) }
      }
    })

    this.mainCtx.handle('theme:delete', async (event, themeId: string) => {
      if (!this.mainCtx.permissions.requirePermission(event, 'admin'))
        return { success: false, message: 'Permission denied' }

      if (themeId.startsWith('default-')) {
        return { success: false, message: 'Cannot delete default themes' }
      }

      try {
        const filePath = path.join(this.themeDir, `${themeId}.json`)
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath)
        }
        if (this.currentThemeId === themeId) {
          this.currentThemeId = 'light' // Fallback
        }
        this.notifyThemeUpdate()
        return { success: true }
      } catch (e) {
        return { success: false, message: String(e) }
      }
    })

    this.mainCtx.handle(
      'theme:set-custom',
      async (
        event,
        config: {
          effect: 'mica' | 'tabbed' | 'acrylic' | 'blur' | 'transparent' | 'none'
          theme: 'auto' | 'dark' | 'light'
          radius: 'small' | 'medium' | 'large'
        }
      ) => {
        if (!this.mainCtx.permissions.requirePermission(event, 'admin'))
          return { success: false, message: 'Permission denied' }

        this.currentThemeId = 'custom'
        this.applyMicaConfig(config)
        this.notifyThemeUpdate()
        return { success: true }
      }
    )
  }

  private applyMicaEffect(themeId: string) {
    const theme = this.getThemeById(themeId)
    if (!theme?.mica) return

    this.applyMicaConfig(theme.mica)
  }

  private applyMicaConfig(config: {
    effect: 'mica' | 'tabbed' | 'acrylic' | 'blur' | 'transparent' | 'none'
    theme: 'auto' | 'dark' | 'light'
    radius: 'small' | 'medium' | 'large'
  }) {
    const radiusMap: Record<string, 'rounded' | 'small' | 'square'> = {
      small: 'small',
      medium: 'rounded',
      large: 'rounded'
    }

    const windows = BrowserWindow.getAllWindows()
    for (const win of windows) {
      if (win.isDestroyed()) continue

      this.mainCtx.windows.setMicaEffect(win, config.effect)
      this.mainCtx.windows.setMicaTheme(win, config.theme)
      this.mainCtx.windows.setMicaCorner(win, radiusMap[config.radius] || 'rounded')
    }

    this.mainCtx.settings.setValue('window_effect', config.effect)
    this.mainCtx.settings.setValue('window_theme', config.theme)
    this.mainCtx.settings.setValue('window_radius', radiusMap[config.radius] || 'rounded')
  }

  private getThemeList(): themeConfig[] {
    try {
      if (!fs.existsSync(this.themeDir)) return []
      const files = fs.readdirSync(this.themeDir)
      return files
        .filter((f) => f.endsWith('.json'))
        .map((f) => {
          try {
            const content = fs.readFileSync(path.join(this.themeDir, f), 'utf-8')
            return JSON.parse(content) as themeConfig
          } catch {
            return null
          }
        })
        .filter((t): t is themeConfig => t !== null)
    } catch (e) {
      this.mainCtx.logger.error('Failed to read themes', {
        meta: e instanceof Error ? { message: e.message, stack: e.stack } : { e }
      })
      return []
    }
  }

  private getThemeById(id: string): themeConfig | null {
    const list = this.getThemeList()
    return list.find((t) => t.id === id) || list[0] || null
  }

  private notifyThemeUpdate() {
    const theme = this.getThemeById(this.currentThemeId)
    if (!theme) return

    const windows = BrowserWindow.getAllWindows()
    for (const win of windows) {
      win.webContents.send('theme:updated', theme)
    }
  }
}
