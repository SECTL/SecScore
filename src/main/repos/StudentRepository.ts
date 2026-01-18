import { Service } from '../../shared/kernel'
import { MainContext } from '../context'
import { ScoreEventEntity, StudentEntity } from '../db/entities'
import net from 'net'

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

    this.mainCtx.handle('db:student:importFromSecRandom', async (event, input: any) => {
      if (!this.mainCtx.permissions.requirePermission(event, 'admin'))
        return { success: false, message: 'Permission denied' }

      const ipcName =
        typeof input?.ipcName === 'string' && input.ipcName.trim()
          ? input.ipcName.trim()
          : 'SecRandom.secrandom'
      const timeoutMs =
        typeof input?.timeoutMs === 'number' &&
        Number.isFinite(input.timeoutMs) &&
        input.timeoutMs > 0
          ? Math.floor(input.timeoutMs)
          : 5000

      let resp: any
      try {
        resp = await sendSecRandomIpcJson(
          {
            type: 'url',
            payload: { url: 'SecRandom://secscore/importRoster' }
          },
          { ipcName, timeoutMs }
        )
      } catch (e: any) {
        const socketPath = getSecRandomIpcPath(ipcName)
        const detail = e instanceof Error ? e.message : String(e)
        return {
          success: false,
          message: `SecRandom IPC 连接失败：${detail}（${socketPath}）`,
          data: { error: detail, socketPath, ipcName }
        }
      }
      if (!resp?.success) {
        return {
          success: false,
          message: resp?.message ? String(resp.message) : 'SecRandom IPC 返回失败',
          data: { raw: resp }
        }
      }

      const roster = parseSecRandomRoster(resp)
      if (!roster.items.length) {
        return {
          success: false,
          message: roster.message || '未在 SecRandom 返回中解析到名单',
          data: { raw: resp }
        }
      }

      const result = await this.importRosterMerge(roster.items)
      return {
        success: true,
        data: {
          className: roster.className,
          sourceMessage: roster.message,
          ...result,
          raw: resp
        }
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

function getSecRandomIpcPath(ipcName: string) {
  if (process.platform === 'win32') return `\\\\.\\pipe\\${ipcName}`
  return `/tmp/${ipcName}.sock`
}

async function connectSocket(path: string, timeoutMs: number) {
  return await new Promise<net.Socket>((resolve, reject) => {
    const socket = net.connect(path)
    const onError = (err: any) => {
      cleanup()
      reject(err)
    }
    const onConnect = () => {
      cleanup()
      resolve(socket)
    }
    const timer = setTimeout(() => {
      cleanup()
      try {
        socket.destroy(new Error('connect timeout'))
      } catch {
        void 0
      }
      reject(new Error('connect timeout'))
    }, timeoutMs)

    const cleanup = () => {
      clearTimeout(timer)
      socket.removeListener('error', onError)
      socket.removeListener('connect', onConnect)
    }

    socket.once('error', onError)
    socket.once('connect', onConnect)
  })
}

async function recvJsonLine(socket: net.Socket, timeoutMs: number) {
  return await new Promise<any>((resolve, reject) => {
    let acc = ''
    let settled = false
    const maxChars = 2_000_000

    const timer = setTimeout(() => {
      cleanup()
      reject(new Error('read timeout'))
    }, timeoutMs)

    const cleanup = () => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      socket.removeListener('data', onData)
      socket.removeListener('error', onError)
      socket.removeListener('end', onEnd)
      socket.removeListener('close', onClose)
    }

    const tryParse = (s: string) => {
      const trimmed = s.trim()
      if (!trimmed) return null
      try {
        return JSON.parse(trimmed)
      } catch {
        return null
      }
    }

    const finishIfParsed = (raw: string) => {
      const parsed = tryParse(raw)
      if (parsed == null) return false
      cleanup()
      resolve(parsed)
      return true
    }

    const onData = (chunk: Buffer) => {
      acc += chunk.toString('utf8')
      if (acc.length > maxChars) {
        cleanup()
        reject(new Error('response too large'))
        return
      }
      const newlineIdx = acc.indexOf('\n')
      if (newlineIdx >= 0) {
        const line = acc.slice(0, newlineIdx)
        if (finishIfParsed(line)) return
      }
      finishIfParsed(acc)
    }

    const onError = (err: any) => {
      cleanup()
      reject(err)
    }

    const onEnd = () => {
      if (finishIfParsed(acc)) return
      cleanup()
      reject(new Error('connection closed without response'))
    }

    const onClose = () => {
      if (settled) return
      if (finishIfParsed(acc)) return
      cleanup()
      reject(new Error('connection closed without response'))
    }

    socket.on('data', onData)
    socket.once('error', onError)
    socket.once('end', onEnd)
    socket.once('close', onClose)
  })
}

async function sendSecRandomIpcJson(message: any, opts: { ipcName: string; timeoutMs: number }) {
  const socketPath = getSecRandomIpcPath(opts.ipcName)
  const socket = await connectSocket(socketPath, opts.timeoutMs)
  try {
    socket.write(JSON.stringify(message) + '\n')
    return await recvJsonLine(socket, opts.timeoutMs)
  } finally {
    socket.end()
  }
}

function parseSecRandomRoster(resp: any) {
  const className = String(resp?.result?.class_name ?? '').trim()
  const message = String(resp?.result?.message ?? '').trim()
  const data = resp?.result?.data

  const items: Array<{ name: string; secrandomId: number | null }> = []
  if (Array.isArray(data)) {
    for (const row of data) {
      if (!row || typeof row !== 'object') continue
      if (row.exist !== true) continue
      const name = String((row as any).name ?? '').trim()
      if (!name) continue
      const idRaw = (row as any).id
      const secrandomId = Number.isFinite(idRaw) ? Number(idRaw) : null
      items.push({ name, secrandomId })
    }
  }

  return { className, message, items }
}
