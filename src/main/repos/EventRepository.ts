import { Database } from 'better-sqlite3'
import { app } from 'electron'
import { v4 as uuidv4 } from 'uuid'

export interface ScoreEvent {
  id: number
  uuid: string
  student_name: string
  reason_content: string
  delta: number
  val_prev: number
  val_curr: number
  event_time: string
  sync_state: number
  settlement_id?: number | null
  remote_id?: string
}

export class EventRepository {
  constructor(private db: Database) {}

  findAll(limit = 100) {
    return this.db
      .prepare(
        `
      SELECT * FROM score_events 
      WHERE settlement_id IS NULL
      ORDER BY event_time DESC 
      LIMIT ?
    `
      )
      .all(limit)
  }

  create(event: { student_name: string; reason_content: string; delta: number }) {
    const lastInsertRowid = this.db.transaction(() => {
      // 1. Get current score
      const student = this.db
        .prepare('SELECT score FROM students WHERE name = ?')
        .get(event.student_name) as { score: number }
      if (!student) throw new Error('Student not found')

      const val_prev = student.score
      const val_curr = val_prev + event.delta
      const uuid = uuidv4()
      const event_time = new Date().toISOString()

      // 2. Insert event
      const info = this.db
        .prepare(
          `
        INSERT INTO score_events (uuid, student_name, reason_content, delta, val_prev, val_curr, event_time, sync_state)
        VALUES (?, ?, ?, ?, ?, ?, ?, 0)
      `
        )
        .run(
          uuid,
          event.student_name,
          event.reason_content,
          event.delta,
          val_prev,
          val_curr,
          event_time
        )

      // 3. Update student score
      this.db
        .prepare('UPDATE students SET score = ?, updated_at = CURRENT_TIMESTAMP WHERE name = ?')
        .run(val_curr, event.student_name)

      return info.lastInsertRowid as number
    })()

    // 触发同步 (如果已连接)
    if (app) {
      app.emit('score-event-created')
    }

    return lastInsertRowid
  }

  getUnsynced() {
    return this.db.prepare('SELECT * FROM score_events WHERE sync_state = 0').all() as ScoreEvent[]
  }

  markSynced(uuid: string, remote_id?: string) {
    this.db
      .prepare('UPDATE score_events SET sync_state = 1, remote_id = ? WHERE uuid = ?')
      .run(remote_id, uuid)
  }

  deleteByUuid(uuid: string) {
    this.db.transaction(() => {
      // 1. Get event info
      const event = this.db
        .prepare('SELECT student_name, delta, settlement_id FROM score_events WHERE uuid = ?')
        .get(uuid) as { student_name: string; delta: number; settlement_id: number | null }
      if (!event) return
      if (event.settlement_id !== null && event.settlement_id !== undefined) {
        throw new Error('该记录已结算，无法撤销')
      }

      // 2. Revert student score
      this.db
        .prepare(
          'UPDATE students SET score = score - ?, updated_at = CURRENT_TIMESTAMP WHERE name = ?'
        )
        .run(event.delta, event.student_name)

      // 3. Delete event
      this.db.prepare('DELETE FROM score_events WHERE uuid = ?').run(uuid)
    })()
  }
}
