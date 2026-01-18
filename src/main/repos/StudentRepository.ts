import { Service } from '../../shared/kernel'
import { MainContext } from '../context'
import { ScoreEventEntity, StudentEntity } from '../db/entities'

export interface student {
  id: number
  name: string
  score: number
  extra_json?: string
}

declare module '../../shared/kernel' {
  interface Context {
    students: StudentRepository
  }
}

export class StudentRepository extends Service {
  constructor(ctx: MainContext) {
    super(ctx, 'students')
    this.registerIpc()
  }

  private get mainCtx() {
    return this.ctx as MainContext
  }

  private registerIpc() {
    this.mainCtx.handle('db:student:query', async () => ({
      success: true,
      data: await this.findAll()
    }))
    this.mainCtx.handle('db:student:create', async (event, data) => {
      if (!this.mainCtx.permissions.requirePermission(event, 'admin'))
        return { success: false, message: 'Permission denied' }
      return { success: true, data: await this.create(data) }
    })
    this.mainCtx.handle('db:student:update', async (event, id, data) => {
      if (!this.mainCtx.permissions.requirePermission(event, 'admin'))
        return { success: false, message: 'Permission denied' }
      await this.update(id, data)
      return { success: true }
    })
    this.mainCtx.handle('db:student:delete', async (event, id) => {
      if (!this.mainCtx.permissions.requirePermission(event, 'admin'))
        return { success: false, message: 'Permission denied' }
      await this.delete(id)
      return { success: true }
    })

    this.mainCtx.handle('db:student:importFromSecRandom', async (event) => {
      if (!this.mainCtx.permissions.requirePermission(event, 'admin'))
        return { success: false, message: 'Permission denied' }
      return {
        success: false,
        message: 'SecRandom IPC 导入已禁用（后续再做）'
      }
    })

    this.mainCtx.handle('db:student:importFromXlsx', async (event, input: any) => {
      if (!this.mainCtx.permissions.requirePermission(event, 'admin'))
        return { success: false, message: 'Permission denied' }

      const rawNames = Array.isArray(input?.names) ? input.names : []
      const names = rawNames.map((n: any) => String(n ?? '').trim()).filter((n: string) => n)
      if (!names.length) return { success: false, message: '名单为空' }

      const result = await this.importRosterMerge(
        names.map((name) => ({ name, secrandomId: null }))
      )
      return { success: true, data: result }
    })
  }

  async findAll(): Promise<student[]> {
    const repo = this.ctx.db.dataSource.getRepository(StudentEntity)
    return (await repo.find({ order: { score: 'DESC', name: 'ASC' } })) as any
  }

  async create(student: { name: string }): Promise<number> {
    const repo = this.ctx.db.dataSource.getRepository(StudentEntity)
    const created = repo.create({
      name: String(student?.name ?? '').trim(),
      score: 0,
      extra_json: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    const saved = await repo.save(created)
    return saved.id
  }

  async update(id: number, student: Partial<student>): Promise<void> {
    const next: any = {}
    for (const [key, val] of Object.entries(student)) {
      if (key === 'id') continue
      next[key] = val
    }
    next.updated_at = new Date().toISOString()
    await this.ctx.db.dataSource.getRepository(StudentEntity).update(id, next)
  }

  async delete(id: number): Promise<void> {
    const ds = this.ctx.db.dataSource
    await ds.transaction(async (manager) => {
      const studentsRepo = manager.getRepository(StudentEntity)
      const studentRow = await studentsRepo.findOne({ where: { id } })
      if (!studentRow) return
      await manager.getRepository(ScoreEventEntity).delete({ student_name: studentRow.name })
      await studentsRepo.delete({ id })
    })
  }

  private async importRosterMerge(items: Array<{ name: string; secrandomId: number | null }>) {
    const cleaned = Array.from(
      new Map(
        items
          .map((i) => ({
            name: String(i?.name ?? '').trim(),
            secrandomId: Number.isFinite(i?.secrandomId as any) ? Number(i.secrandomId) : null
          }))
          .filter((i) => i.name && i.name.length <= 64)
          .map((i) => [i.name, i] as const)
      ).values()
    )
    if (!cleaned.length) return { inserted: 0, skipped: 0, total: 0 }

    const ds = this.ctx.db.dataSource
    return await ds.transaction(async (manager) => {
      const repo = manager.getRepository(StudentEntity)
      const existing = await repo.find({ select: ['name'] as any })
      const existingSet = new Set(existing.map((r: any) => String(r?.name ?? '').trim()))

      const toInsert = cleaned.filter((i) => !existingSet.has(i.name))
      const now = new Date().toISOString()
      if (toInsert.length) {
        await repo.insert(
          toInsert.map((i) => ({
            name: i.name,
            score: 0,
            extra_json:
              typeof i.secrandomId === 'number'
                ? JSON.stringify({ secrandom_id: i.secrandomId })
                : null,
            created_at: now,
            updated_at: now
          }))
        )
      }

      return {
        inserted: toInsert.length,
        skipped: cleaned.length - toInsert.length,
        total: cleaned.length
      }
    })
  }
}
