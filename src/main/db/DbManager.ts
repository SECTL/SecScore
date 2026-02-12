import { Context, Service } from '../../shared/kernel'
import { DataSource } from 'typeorm'
import path from 'path'
import fs from 'fs'
import { StudentEntity } from './entities/StudentEntity'
import { ReasonEntity } from './entities/ReasonEntity'
import { ScoreEventEntity } from './entities/ScoreEventEntity'
import { SettlementEntity } from './entities/SettlementEntity'
import { SettingEntity } from './entities/SettingEntity'
import { TagEntity } from './entities/TagEntity'
import { StudentTagEntity } from './entities/StudentTagEntity'
import { migrations } from './migrations'

declare module '../../shared/kernel' {
  interface Context {
    db: DbManager
  }
}

export class DbManager extends Service {
  public readonly dataSource: DataSource

  constructor(ctx: Context, dbPath: string) {
    super(ctx, 'db')
    const dbDir = path.dirname(dbPath)
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true })
    }
    this.dataSource = new DataSource({
      type: 'better-sqlite3',
      database: dbPath,
      entities: [
        StudentEntity,
        ReasonEntity,
        ScoreEventEntity,
        SettlementEntity,
        SettingEntity,
        TagEntity,
        StudentTagEntity
      ],
      migrations,
      synchronize: false,
      logging: false
    })
  }

  async initialize() {
    if (this.dataSource.isInitialized) return
    await this.dataSource.initialize()
    await this.dataSource.query('PRAGMA foreign_keys = ON')
    await this.dataSource.runMigrations()
  }

  async dispose() {
    if (!this.dataSource.isInitialized) return
    await this.dataSource.destroy()
  }
}
