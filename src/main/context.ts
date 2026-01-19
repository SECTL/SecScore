import { Context as BaseContext } from '../shared/kernel'
import { ipcMain } from 'electron'

export class MainContext extends BaseContext {
  public isQuitting = false

  constructor() {
    super()
  }

  handle(
    channel: string,
    listener: (event: Electron.IpcMainInvokeEvent, ...args: any[]) => Promise<any> | any
  ) {
    ipcMain.handle(channel, listener)
    this.effect(() => ipcMain.removeHandler(channel))
  }

  ipcOn(channel: string, listener: (event: Electron.IpcMainEvent, ...args: any[]) => void) {
    ipcMain.on(channel, listener)
    this.effect(() => ipcMain.removeListener(channel, listener))
  }
}
