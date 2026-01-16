import { Database } from 'better-sqlite3'

export interface SettlementSummary {
  id: number
  start_time: string
  end_time: string
  event_count: number
}

export interface SettlementLeaderboardRow {
  name: string
  score: number
}

export class SettlementRepository {
  constructor(private db: Database) {}

  findAll(): SettlementSummary[] {
    const rows = this.db
      .prepare(
        `
      SELECT
        s.id as id,
        s.start_time as start_time,
        s.end_time as end_time,
        (
          SELECT COUNT(1)
          FROM score_events e
          WHERE e.settlement_id = s.id
        ) as event_count
      FROM settlements s
      ORDER BY julianday(s.end_time) DESC
    `
      )
      .all() as SettlementSummary[]
    return rows
  }

  settleNow() {
    return this.db.transaction(() => {
      const unassigned = this.db
        .prepare(`SELECT COUNT(1) as count FROM score_events WHERE settlement_id IS NULL`)
        .get() as { count: number }

      const eventCount = Number(unassigned?.count ?? 0)
      if (eventCount <= 0) {
        throw new Error('暂无可结算记录')
      }

      const endTime = new Date().toISOString()
      const lastSettlement = this.db
        .prepare(`SELECT end_time FROM settlements ORDER BY julianday(end_time) DESC LIMIT 1`)
        .get() as { end_time: string } | undefined

      const minEvent = this.db
        .prepare(`SELECT MIN(event_time) as min_time FROM score_events WHERE settlement_id IS NULL`)
        .get() as { min_time: string } | undefined

      const startTime = lastSettlement?.end_time || minEvent?.min_time || endTime

      const info = this.db
        .prepare(`INSERT INTO settlements (start_time, end_time) VALUES (?, ?)`)
        .run(startTime, endTime)
      const settlementId = info.lastInsertRowid as number

      this.db
        .prepare(`UPDATE score_events SET settlement_id = ? WHERE settlement_id IS NULL`)
        .run(settlementId)

      this.db.prepare(`UPDATE students SET score = 0, updated_at = CURRENT_TIMESTAMP`).run()

      return { settlementId, startTime, endTime, eventCount }
    })()
  }

  getLeaderboard(settlementId: number) {
    const settlement = this.db
      .prepare(`SELECT id, start_time, end_time FROM settlements WHERE id = ?`)
      .get(settlementId) as { id: number; start_time: string; end_time: string } | undefined

    if (!settlement) {
      throw new Error('结算记录不存在')
    }

    const rows = this.db
      .prepare(
        `
      SELECT
        e.student_name as name,
        COALESCE(SUM(e.delta), 0) as score
      FROM score_events e
      WHERE e.settlement_id = ?
      GROUP BY e.student_name
      ORDER BY score DESC, name ASC
    `
      )
      .all(settlementId) as SettlementLeaderboardRow[]

    return { settlement, rows }
  }
}

