import { Service } from '../../shared/kernel'
import { MainContext } from '../context'
import express, { type Express, type Request, type Response, type NextFunction } from 'express'
import { StudentEntity } from '../db/entities'
import net from 'net'

declare module '../../shared/kernel' {
  interface Context {
    httpServer: HttpServerService
  }
}

export interface HttpServerConfig {
  port: number
  host: string
  corsOrigin?: string
}

export class HttpServerService extends Service {
  private app: Express | null = null
  private server: any = null
  private config: HttpServerConfig = {
    port: 3000,
    host: 'localhost',
    corsOrigin: '*' // 默认允许所有跨域请求
  }

  constructor(ctx: MainContext) {
    super(ctx, 'httpServer')
    this.registerIpc()
  }

  private get mainCtx() {
    return this.ctx as MainContext
  }

  private get permissions() {
    return this.ctx.permissions
  }

  private registerIpc() {
    // 启动HTTP服务器
    this.mainCtx.handle('http:server:start', async (event, config?: Partial<HttpServerConfig>) => {
      if (!this.permissions.requirePermission(event, 'admin')) {
        return { success: false, message: 'Permission denied' }
      }

      try {
        await this.start(config)
        return {
          success: true,
          data: {
            url: `http://${this.config.host}:${this.config.port}`,
            config: this.config
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error'
        return { success: false, message: `Failed to start HTTP server: ${message}` }
      }
    })

    // 停止HTTP服务器
    this.mainCtx.handle('http:server:stop', async (event) => {
      if (!this.permissions.requirePermission(event, 'admin')) {
        return { success: false, message: 'Permission denied' }
      }

      try {
        await this.stop()
        return { success: true }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error'
        return { success: false, message: `Failed to stop HTTP server: ${message}` }
      }
    })

    // 获取HTTP服务器状态
    this.mainCtx.handle('http:server:status', async (event) => {
      if (!this.permissions.requirePermission(event, 'admin')) {
        return { success: false, message: 'Permission denied' }
      }

      return {
        success: true,
        data: {
          isRunning: this.isRunning(),
          config: this.config,
          url: this.isRunning() ? `http://${this.config.host}:${this.config.port}` : null
        }
      }
    })
  }

  async start(config?: Partial<HttpServerConfig>): Promise<void> {
    if (this.isRunning()) {
      throw new Error('HTTP server is already running')
    }

    // 合并配置
    this.config = { ...this.config, ...config }

    // 检查端口是否可用，如果不可用则自动寻找可用端口
    const originalPort = this.config.port
    let attempts = 0
    const maxAttempts = 100 // 最多尝试100个端口

    while (attempts < maxAttempts) {
      if (await this.isPortAvailable(this.config.port)) {
        break
      }

      // 端口被占用，尝试下一个端口
      this.config.port++
      attempts++
    }

    if (attempts === maxAttempts) {
      throw new Error(
        `Could not find available port after ${maxAttempts} attempts starting from ${originalPort}`
      )
    }

    if (attempts > 0) {
      this.mainCtx.logger.warn(
        `Original port ${originalPort} was unavailable. Using port ${this.config.port} instead.`
      )
    }

    // 创建Express应用
    this.app = express()

    // 配置中间件
    this.app.use(express.json())
    this.app.use(express.urlencoded({ extended: true }))

    // 简单的CORS处理
    this.app.use((_: Request, res: Response, next: NextFunction) => {
      res.header('Access-Control-Allow-Origin', this.config.corsOrigin || '*')
      res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept')
      res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
      next()
    })

    // 设置路由
    this.setupRoutes()

    // 启动服务器
    return new Promise((resolve, reject) => {
      this.server = this.app!.listen(this.config.port, this.config.host, () => {
        this.mainCtx.logger.info(
          `HTTP server started at http://${this.config.host}:${this.config.port}`
        )
        resolve()
      })

      this.server.on('error', (error: Error) => {
        this.mainCtx.logger.error(`HTTP server error: ${error.message}`)
        reject(error)
      })
    })
  }

  async stop(): Promise<void> {
    if (!this.isRunning()) {
      return
    }

    return new Promise((resolve, reject) => {
      this.server!.close((error?: Error) => {
        if (error) {
          this.mainCtx.logger.error(`Failed to stop HTTP server: ${error.message}`)
          reject(error)
        } else {
          this.mainCtx.logger.info('HTTP server stopped')
          this.server = null
          this.app = null
          resolve()
        }
      })
    })
  }

  isRunning(): boolean {
    return this.server !== null && this.app !== null
  }

  private async isPortAvailable(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const server = net.createServer()
      server.listen(port, '127.0.0.1')
      server.on('error', () => {
        resolve(false)
      })
      server.on('listening', () => {
        server.close(() => {
          resolve(true)
        })
      })
    })
  }

  private setupRoutes() {
    if (!this.app) return

    // 健康检查端点
    this.app.get('/health', (_, res: Response) => {
      res.json({ status: 'ok', timestamp: new Date().toISOString() })
    })

    // 获取所有学生分数
    this.app.get('/api/students/scores', async (_req: Request, res: Response) => {
      try {
        const studentRepo = this.mainCtx.db.dataSource.getRepository(StudentEntity)
        const students = await studentRepo.find({
          select: ['id', 'name', 'score'],
          order: { score: 'DESC', name: 'ASC' }
        })

        res.json({
          success: true,
          data: students.map((student) => ({
            id: student.id,
            name: student.name,
            score: student.score
          }))
        })
      } catch (error) {
        this.mainCtx.logger.error(`Failed to fetch student scores: ${error}`)
        res.status(500).json({
          success: false,
          message: 'Failed to fetch student scores'
        })
      }
    })

    // 获取单个学生分数
    this.app.get('/api/students/:id/score', async (_req: Request, res: Response) => {
      try {
        const id = parseInt(_req.params.id)
        if (isNaN(id)) {
          return res.status(400).json({
            success: false,
            message: 'Invalid student ID'
          })
        }

        const studentRepo = this.mainCtx.db.dataSource.getRepository(StudentEntity)
        const student = await studentRepo.findOne({
          where: { id },
          select: ['id', 'name', 'score']
        })

        if (!student) {
          return res.status(404).json({
            success: false,
            message: 'Student not found'
          })
        }

        res.json({
          success: true,
          data: {
            id: student.id,
            name: student.name,
            score: student.score
          }
        })
      } catch (error) {
        this.mainCtx.logger.error(`Failed to fetch student score: ${error}`)
        res.status(500).json({
          success: false,
          message: 'Failed to fetch student score'
        })
      }
    })

    // 按姓名搜索学生分数
    this.app.get('/api/students/search', async (req: Request, res: Response) => {
      try {
        const name = req.query.name as string
        if (!name || name.trim() === '') {
          return res.status(400).json({
            success: false,
            message: 'Name parameter is required'
          })
        }

        const studentRepo = this.mainCtx.db.dataSource.getRepository(StudentEntity)
        const students = await studentRepo.find({
          where: { name },
          select: ['id', 'name', 'score']
        })

        res.json({
          success: true,
          data: students.map((student) => ({
            id: student.id,
            name: student.name,
            score: student.score
          }))
        })
      } catch (error) {
        this.mainCtx.logger.error(`Failed to search student: ${error}`)
        res.status(500).json({
          success: false,
          message: 'Failed to search student'
        })
      }
    })

    // 获取排行榜（前N名学生）
    this.app.get('/api/leaderboard', async (req: Request, res: Response) => {
      try {
        const limit = parseInt(req.query.limit as string) || 10
        const studentRepo = this.mainCtx.db.dataSource.getRepository(StudentEntity)
        const students = await studentRepo.find({
          select: ['id', 'name', 'score'],
          order: { score: 'DESC', name: 'ASC' },
          take: limit
        })

        res.json({
          success: true,
          data: students.map((student) => ({
            id: student.id,
            name: student.name,
            score: student.score
          }))
        })
      } catch (error) {
        this.mainCtx.logger.error(`Failed to fetch leaderboard: ${error}`)
        res.status(500).json({
          success: false,
          message: 'Failed to fetch leaderboard'
        })
      }
    })

    // 404处理
    this.app.use((_, res: Response) => {
      res.status(404).json({
        success: false,
        message: 'Endpoint not found'
      })
    })

    // 错误处理中间件
    this.app.use((error: Error, _: Request, res: Response, __: NextFunction) => {
      this.mainCtx.logger.error(`HTTP server error: ${error.message}`)
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      })
    })
  }
}
