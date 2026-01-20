import { Service } from '../../shared/kernel'
import { MainContext } from '../context'
import { BrowserWindow, webContents, screen } from 'electron'
import type { IpcMainInvokeEvent } from 'electron'
import type { settingsKey, settingsSpec, settingChange } from '../../preload/types'
import type { permissionLevel } from './PermissionService'
import { SettingEntity } from '../db/entities'

declare module '../../shared/kernel' {
  interface Context {
    settings: SettingsService
  }
}

type settingValueKind = 'string' | 'boolean' | 'number' | 'json'

type settingDefinition = {
  kind: settingValueKind
  defaultValue: unknown
  readPermission?: permissionLevel | 'any'
  writePermission?: permissionLevel | 'any'
  validate?: (value: unknown) => boolean
  normalize?: (value: unknown) => unknown
  onChanged?: (ctx: MainContext, next: unknown, prev: unknown) => void
}

export class SettingsService extends Service {
  constructor(ctx: MainContext) {
    super(ctx, 'settings')
    this.registerIpc()
  }

  private get mainCtx() {
    return this.ctx as MainContext
  }

  private definitions: Record<settingsKey, settingDefinition> = {
    is_wizard_completed: {
      kind: 'boolean',
      defaultValue: false,
      writePermission: 'any'
    },
    log_level: {
      kind: 'string',
      defaultValue: 'info',
      writePermission: 'admin',
      validate: (v) => v === 'debug' || v === 'info' || v === 'warn' || v === 'error',
      onChanged: (ctx, next) => {
        ctx.logger.setLevel(next as any)
      }
    },
    window_zoom: {
      kind: 'number',
      defaultValue: 1.0,
      writePermission: 'admin',
      onChanged: (_ctx, next) => {
        const zoom = Number(next) || 1.0
        webContents.getAllWebContents().forEach((wc: any) => {
          wc.setZoomFactor(zoom)
        })

        const sidebarWindow = BrowserWindow.getAllWindows().find((win) => {
          try {
            return win.webContents.getURL().includes('#global-sidebar')
          } catch {
            return false
          }
        })

        if (sidebarWindow && !sidebarWindow.isDestroyed()) {
          const primaryDisplay = screen.getPrimaryDisplay()
          const { width, height } = primaryDisplay.workAreaSize
          const bounds = sidebarWindow.getBounds()

          sidebarWindow.setBounds({
            x: width - bounds.width,
            y: Math.floor(height / 2 - bounds.height / 2),
            width: bounds.width,
            height: bounds.height
          })
        }
      }
    },
    window_theme: {
      kind: 'string',
      defaultValue: 'auto',
      writePermission: 'admin',
      validate: (v) => v === 'auto' || v === 'dark' || v === 'light'
    },
    window_effect: {
      kind: 'string',
      defaultValue: 'mica',
      writePermission: 'admin',
      validate: (v) =>
        ['mica', 'tabbed', 'acrylic', 'blur', 'transparent', 'none'].includes(v as string)
    },
    window_radius: {
      kind: 'string',
      defaultValue: 'rounded',
      writePermission: 'admin',
      validate: (v) => v === 'rounded' || v === 'small' || v === 'square'
    }
  }

  private cache = new Map<string, string>()
  private initPromise: Promise<void> | null = null

  async initialize(): Promise<void> {
    if (this.initPromise) return this.initPromise
    this.initPromise = (async () => {
      await this.loadCache()
      await this.ensureDefaults()
    })()
    return this.initPromise
  }

  private async loadCache() {
    const repo = this.ctx.db.dataSource.getRepository(SettingEntity)
    const rows = await repo.find()
    this.cache.clear()
    for (const r of rows) this.cache.set(r.key, String(r.value ?? ''))
  }

  private async ensureDefaults() {
    const repo = this.ctx.db.dataSource.getRepository(SettingEntity)
    for (const key of Object.keys(this.definitions) as settingsKey[]) {
      if (this.cache.has(key)) continue
      const def = this.definitions[key]
      const raw = this.serializeValue(key, def.defaultValue)
      await repo
        .createQueryBuilder()
        .insert()
        .into(SettingEntity)
        .values({ key, value: raw })
        .orIgnore()
        .execute()
      this.cache.set(key, raw)
    }
  }

  private serializeValue(key: settingsKey, value: unknown): string {
    const def = this.definitions[key]
    switch (def.kind) {
      case 'boolean':
        return value ? '1' : '0'
      case 'number':
        return String(value)
      case 'json':
        return JSON.stringify(value)
      case 'string':
      default:
        return String(value)
    }
  }

  private deserializeValue(key: settingsKey, raw: string): unknown {
    const def = this.definitions[key]
    switch (def.kind) {
      case 'boolean':
        return raw === '1' || raw.toLowerCase() === 'true'
      case 'number':
        return Number(raw)
      case 'json':
        try {
          return JSON.parse(raw)
        } catch {
          return def.defaultValue
        }
      case 'string':
      default:
        return raw
    }
  }

  private parseValue(key: settingsKey, raw: string | undefined): unknown {
    const def = this.definitions[key]
    if (raw == null) return def.defaultValue
    const deserialized = this.deserializeValue(key, raw)
    const normalized = def.normalize ? def.normalize(deserialized) : deserialized
    if (def.validate && !def.validate(normalized)) return def.defaultValue
    return normalized
  }

  private canWrite(event: IpcMainInvokeEvent, key: settingsKey): boolean {
    const required = this.definitions[key].writePermission
    if (!required || required === 'any') return true
    return this.mainCtx.permissions.requirePermission(event, required)
  }

  private notifyChanged(key: settingsKey, value: unknown) {
    const change: settingChange = { key, value } as any
    const windows = BrowserWindow.getAllWindows()
    for (const win of windows) {
      win.webContents.send('settings:changed', change)
    }
  }

  private registerIpc() {
    this.mainCtx.handle('settings:getAll', async () => {
      await this.initialize()
      return { success: true, data: this.getAll() }
    })
    this.mainCtx.handle('settings:get', async (_event, key: settingsKey) => {
      await this.initialize()
      return { success: true, data: this.getValue(key) }
    })
    this.mainCtx.handle('settings:set', async (event, key: settingsKey, value: any) => {
      if (!this.canWrite(event, key)) return { success: false, message: 'Permission denied' }
      await this.setValue(key, value)
      return { success: true }
    })
  }

  async reloadFromDb(options: { notify?: boolean } = {}): Promise<void> {
    await this.initialize()
    const notify = options.notify ?? true
    const prev = this.getAll()
    await this.loadCache()
    await this.ensureDefaults()
    if (!notify) return

    for (const key of Object.keys(this.definitions) as settingsKey[]) {
      const def = this.definitions[key]
      const next = this.getValue(key as any) as any
      const prevValue = prev[key]
      if (next !== prevValue) {
        def.onChanged?.(this.mainCtx, next, prevValue)
        this.notifyChanged(key, next)
      }
    }
  }

  getRaw(key: string): string {
    return this.cache.get(key) ?? ''
  }

  async setRaw(key: string, value: string): Promise<void> {
    await this.initialize()
    const prev = this.cache.get(key) ?? ''
    if (key in this.definitions) {
      const typedKey = key as settingsKey
      const def = this.definitions[typedKey]
      const nextDeserialized = this.deserializeValue(typedKey, value)
      const nextNormalized = def.normalize ? def.normalize(nextDeserialized) : nextDeserialized
      const nextRaw =
        def.validate && !def.validate(nextNormalized)
          ? this.serializeValue(typedKey, def.defaultValue)
          : this.serializeValue(typedKey, nextNormalized)

      await this.ctx.db.dataSource.getRepository(SettingEntity).save({ key, value: nextRaw })
      this.cache.set(key, nextRaw)

      const nextTyped = this.parseValue(typedKey, nextRaw)
      const prevTyped = this.parseValue(typedKey, prev)
      if (nextTyped !== prevTyped) {
        def.onChanged?.(this.mainCtx, nextTyped, prevTyped)
        this.notifyChanged(typedKey, nextTyped)
      }
      return
    }

    await this.ctx.db.dataSource.getRepository(SettingEntity).save({ key, value })
    this.cache.set(key, value)
  }

  getValue<K extends settingsKey>(key: K): settingsSpec[K] {
    return this.parseValue(key, this.cache.get(key)) as settingsSpec[K]
  }

  async setValue<K extends settingsKey>(key: K, value: settingsSpec[K]): Promise<void> {
    await this.initialize()
    const def = this.definitions[key]
    const prev = this.getValue(key)
    const normalized = def.normalize ? def.normalize(value) : value
    if (def.validate && !def.validate(normalized)) {
      throw new Error(`Invalid value for setting: ${String(key)}`)
    }
    const raw = this.serializeValue(key, normalized)
    await this.ctx.db.dataSource.getRepository(SettingEntity).save({ key, value: raw })
    this.cache.set(key, raw)
    const next = this.getValue(key)
    if (next !== prev) {
      def.onChanged?.(this.mainCtx, next, prev)
      this.notifyChanged(key, next)
    }
  }

  getAllRaw(): Record<string, string> {
    const out: Record<string, string> = {}
    for (const [k, v] of this.cache.entries()) out[k] = v
    return out
  }

  getAll(): settingsSpec {
    const out: any = {}
    for (const key of Object.keys(this.definitions) as settingsKey[]) {
      out[key] = this.getValue(key)
    }
    return out as settingsSpec
  }
}
