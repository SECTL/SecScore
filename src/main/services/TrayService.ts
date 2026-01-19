import { Service } from '../../shared/kernel'
import { MainContext } from '../context'
import { Tray, Menu, app, nativeImage } from 'electron'
import type { windowManagerOptions } from './WindowManager'

export class TrayService extends Service {
  private tray: Tray | null = null

  constructor(
    ctx: MainContext,
    private readonly opts: windowManagerOptions
  ) {
    super(ctx, 'tray')
  }

  private get mainCtx() {
    return this.ctx as MainContext
  }

  public initialize() {
    const icon = nativeImage.createFromPath(this.opts.icon)
    this.tray = new Tray(icon)

    const contextMenu = Menu.buildFromTemplate([
      {
        label: '显示主窗口',
        click: () => {
          this.showMainWindow()
        }
      },
      { type: 'separator' },
      {
        label: '退出 SecScore',
        click: () => {
          app.quit()
        }
      }
    ])

    this.tray.setToolTip('SecScore 积分管理')
    this.tray.setContextMenu(contextMenu)

    this.tray.on('double-click', () => {
      this.showMainWindow()
    })
  }

  private showMainWindow() {
    const mainWin = this.mainCtx.windows.get('main')
    if (mainWin) {
      if (mainWin.isMinimized()) mainWin.restore()
      mainWin.show()
      mainWin.focus()
    } else {
      this.mainCtx.windows.open({ key: 'main', title: 'SecScore', route: '/' })
    }
  }
}
