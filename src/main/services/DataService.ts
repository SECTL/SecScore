import { Service } from '../../shared/kernel'
import { MainContext } from '../context'
import { DataBackupRepository } from '../db/backup/DataBackupRepository'
import { TagRepository } from '../repos/TagRepository'

declare module '../../shared/kernel' {
  interface Context {
    data: DataService
  }
}

export class DataService extends Service {
  constructor(
    ctx: MainContext,
    private tagRepo: TagRepository
  ) {
    super(ctx, 'data')
    this.registerIpc()
  }

  private get mainCtx() {
    return this.ctx as MainContext
  }

  private registerIpc() {
    this.mainCtx.handle('data:exportJson', async (event) => {
      if (!this.mainCtx.permissions.requirePermission(event, 'admin'))
        return { success: false, message: 'Permission denied' }

      const backup = new DataBackupRepository(this.mainCtx.db.dataSource)
      return {
        success: true,
        data: await backup.exportJson()
      }
    })

    this.mainCtx.handle('data:importJson', async (event, jsonText: string) => {
      if (!this.mainCtx.permissions.requirePermission(event, 'admin'))
        return { success: false, message: 'Permission denied' }

      const backup = new DataBackupRepository(this.mainCtx.db.dataSource)
      const result = await backup.importJson(jsonText)
      if (!result.success) return result

      await this.mainCtx.settings.reloadFromDb()
      return { success: true }
    })

    this.mainCtx.handle('tags:getAll', async (event) => {
      if (!this.mainCtx.permissions.requirePermission(event, 'view'))
        return { success: false, message: 'Permission denied' }

      const tags = await this.tagRepo.findAll()
      return {
        success: true,
        data: tags.map((t) => ({ id: t.id, name: t.name }))
      }
    })

    this.mainCtx.handle('tags:getByStudent', async (event, studentId: number) => {
      if (!this.mainCtx.permissions.requirePermission(event, 'view'))
        return { success: false, message: 'Permission denied' }

      const tags = await this.tagRepo.findByStudent(studentId)
      return {
        success: true,
        data: tags.map((t) => ({ id: t.id, name: t.name }))
      }
    })

    this.mainCtx.handle('tags:create', async (event, name: string) => {
      if (!this.mainCtx.permissions.requirePermission(event, 'admin'))
        return { success: false, message: 'Permission denied' }

      const tag = await this.tagRepo.findOrCreate(name)
      return {
        success: true,
        data: { id: tag.id, name: tag.name }
      }
    })

    this.mainCtx.handle('tags:delete', async (event, id: number) => {
      if (!this.mainCtx.permissions.requirePermission(event, 'admin'))
        return { success: false, message: 'Permission denied' }

      const success = await this.tagRepo.delete(id)
      return {
        success,
        message: success ? '删除成功' : '删除失败'
      }
    })

    this.mainCtx.handle(
      'tags:updateStudentTags',
      async (event, studentId: number, tagIds: number[]) => {
        if (!this.mainCtx.permissions.requirePermission(event, 'admin'))
          return { success: false, message: 'Permission denied' }

        await this.tagRepo.updateStudentTags(studentId, tagIds)
        return { success: true }
      }
    )
  }
}
