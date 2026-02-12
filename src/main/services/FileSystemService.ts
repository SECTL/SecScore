import { Service } from '../../shared/kernel'
import { MainContext } from '../context'
import { join } from 'path'
import fs from 'fs/promises'

declare module '../../shared/kernel' {
  interface Context {
    fileSystem: FileSystemService
  }
}

export interface ConfigFileInfo {
  name: string
  path: string
  size: number
  modified: Date
}

export interface ConfigFolderStructure {
  configRoot: string
  automatic: string
  script: string
}

export class FileSystemService extends Service {
  private configRoot: string
  private automaticDir: string
  private scriptDir: string
  private initPromise: Promise<void> | null = null

  constructor(ctx: MainContext, ConfigRoot: string) {
    super(ctx, 'fileSystem')
    this.configRoot = ConfigRoot
    this.automaticDir = join(this.configRoot, 'automatic')
    this.scriptDir = join(this.configRoot, 'script')
    this.initPromise = this.initialize()
    this.registerIpc()
  }

  private async initialize(): Promise<void> {
    await this.ensureDirectories()
  }

  private async ensureDirectories(): Promise<void> {
    try {
      await fs.mkdir(this.configRoot, { recursive: true })
      await fs.mkdir(this.automaticDir, { recursive: true })
      await fs.mkdir(this.scriptDir, { recursive: true })
    } catch (error) {
      this.ctx.logger.warn('FileSystemService: Failed to create config directories', { error })
    }
  }

  getConfigStructure(): ConfigFolderStructure {
    return {
      configRoot: this.configRoot,
      automatic: this.automaticDir,
      script: this.scriptDir
    }
  }

  async readJsonFile<T = any>(
    relativePath: string,
    folder: 'automatic' | 'script' = 'automatic'
  ): Promise<T | null> {
    await this.initPromise
    const baseDir = folder === 'automatic' ? this.automaticDir : this.scriptDir
    const filePath = join(baseDir, relativePath)

    try {
      const content = await fs.readFile(filePath, 'utf-8')
      return JSON.parse(content) as T
    } catch (error) {
      if (error instanceof Error && 'code' in error && (error as any).code === 'ENOENT') {
        return null
      }
      this.ctx.logger.warn('FileSystemService: Failed to read JSON file', { path: filePath, error })
      return null
    }
  }

  async writeJsonFile(
    relativePath: string,
    data: any,
    folder: 'automatic' | 'script' = 'automatic'
  ): Promise<boolean> {
    await this.initPromise
    const baseDir = folder === 'automatic' ? this.automaticDir : this.scriptDir
    const filePath = join(baseDir, relativePath)

    try {
      const content = JSON.stringify(data, null, 2)
      await fs.writeFile(filePath, content, 'utf-8')
      return true
    } catch (error) {
      this.ctx.logger.warn('FileSystemService: Failed to write JSON file', {
        path: filePath,
        error
      })
      return false
    }
  }

  async readTextFile(
    relativePath: string,
    folder: 'automatic' | 'script' = 'automatic'
  ): Promise<string | null> {
    await this.initPromise
    const baseDir = folder === 'automatic' ? this.automaticDir : this.scriptDir
    const filePath = join(baseDir, relativePath)

    try {
      return await fs.readFile(filePath, 'utf-8')
    } catch (error) {
      if (error instanceof Error && 'code' in error && (error as any).code === 'ENOENT') {
        return null
      }
      this.ctx.logger.warn('FileSystemService: Failed to read text file', { path: filePath, error })
      return null
    }
  }

  async writeTextFile(
    content: string,
    relativePath: string,
    folder: 'automatic' | 'script' = 'automatic'
  ): Promise<boolean> {
    await this.initPromise
    const baseDir = folder === 'automatic' ? this.automaticDir : this.scriptDir
    const filePath = join(baseDir, relativePath)

    try {
      await fs.writeFile(filePath, content, 'utf-8')
      return true
    } catch (error) {
      this.ctx.logger.warn('FileSystemService: Failed to write text file', {
        path: filePath,
        error
      })
      return false
    }
  }

  async deleteFile(
    relativePath: string,
    folder: 'automatic' | 'script' = 'automatic'
  ): Promise<boolean> {
    await this.initPromise
    const baseDir = folder === 'automatic' ? this.automaticDir : this.scriptDir
    const filePath = join(baseDir, relativePath)

    try {
      await fs.unlink(filePath)
      return true
    } catch (error) {
      if (error instanceof Error && 'code' in error && (error as any).code === 'ENOENT') {
        return false
      }
      this.ctx.logger.warn('FileSystemService: Failed to delete file', { path: filePath, error })
      return false
    }
  }

  async listFiles(folder: 'automatic' | 'script' = 'automatic'): Promise<ConfigFileInfo[]> {
    await this.initPromise
    const baseDir = folder === 'automatic' ? this.automaticDir : this.scriptDir

    try {
      const entries = await fs.readdir(baseDir, { withFileTypes: true })
      const files: ConfigFileInfo[] = []

      for (const entry of entries) {
        if (entry.isFile()) {
          const filePath = join(baseDir, entry.name)
          const stats = await fs.stat(filePath)
          files.push({
            name: entry.name,
            path: filePath,
            size: stats.size,
            modified: stats.mtime
          })
        }
      }

      return files
    } catch (error) {
      if (error instanceof Error && 'code' in error && (error as any).code === 'ENOENT') {
        return []
      }
      this.ctx.logger.warn('FileSystemService: Failed to list files', { path: baseDir, error })
      return []
    }
  }

  async fileExists(
    relativePath: string,
    folder: 'automatic' | 'script' = 'automatic'
  ): Promise<boolean> {
    await this.initPromise
    const baseDir = folder === 'automatic' ? this.automaticDir : this.scriptDir
    const filePath = join(baseDir, relativePath)

    try {
      await fs.access(filePath)
      return true
    } catch {
      return false
    }
  }

  private get mainCtx() {
    return this.ctx as MainContext
  }

  private registerIpc(): void {
    this.mainCtx.handle('fs:getConfigStructure', async () => {
      await this.initPromise
      return { success: true, data: this.getConfigStructure() }
    })

    this.mainCtx.handle(
      'fs:readJson',
      async (_event, relativePath: string, folder: 'automatic' | 'script') => {
        await this.initPromise
        const data = await this.readJsonFile(relativePath, folder)
        return { success: true, data }
      }
    )

    this.mainCtx.handle(
      'fs:writeJson',
      async (_event, relativePath: string, data: any, folder: 'automatic' | 'script') => {
        await this.initPromise
        const success = await this.writeJsonFile(relativePath, data, folder)
        return { success }
      }
    )

    this.mainCtx.handle(
      'fs:readText',
      async (_event, relativePath: string, folder: 'automatic' | 'script') => {
        await this.initPromise
        const content = await this.readTextFile(relativePath, folder)
        return { success: true, data: content }
      }
    )

    this.mainCtx.handle(
      'fs:writeText',
      async (_event, content: string, relativePath: string, folder: 'automatic' | 'script') => {
        await this.initPromise
        const success = await this.writeTextFile(content, relativePath, folder)
        return { success }
      }
    )

    this.mainCtx.handle(
      'fs:deleteFile',
      async (_event, relativePath: string, folder: 'automatic' | 'script') => {
        await this.initPromise
        const success = await this.deleteFile(relativePath, folder)
        return { success }
      }
    )

    this.mainCtx.handle('fs:listFiles', async (_event, folder: 'automatic' | 'script') => {
      await this.initPromise
      const files = await this.listFiles(folder)
      return { success: true, data: files }
    })

    this.mainCtx.handle(
      'fs:fileExists',
      async (_event, relativePath: string, folder: 'automatic' | 'script') => {
        await this.initPromise
        const exists = await this.fileExists(relativePath, folder)
        return { success: true, data: exists }
      }
    )
  }
}
