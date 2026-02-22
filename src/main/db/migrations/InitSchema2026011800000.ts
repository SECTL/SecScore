import type { MigrationInterface, QueryRunner } from 'typeorm'

export class InitSchema2026011800000 implements MigrationInterface {
  name = 'InitSchema2026011800000'

  async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('students'))) {
      await queryRunner.query(`
        CREATE TABLE "students" (
          "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
          "name" text NOT NULL,
          "score" integer NOT NULL DEFAULT (0),
          "extra_json" text,
          "tags" text NOT NULL DEFAULT '[]',
          "created_at" text NOT NULL DEFAULT (CURRENT_TIMESTAMP),
          "updated_at" text NOT NULL DEFAULT (CURRENT_TIMESTAMP)
        )
      `)
    }

    if (!(await queryRunner.hasTable('reasons'))) {
      await queryRunner.query(`
        CREATE TABLE "reasons" (
          "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
          "content" text NOT NULL,
          "category" text NOT NULL DEFAULT ('其他'),
          "delta" integer NOT NULL,
          "is_system" integer NOT NULL DEFAULT (0),
          "updated_at" text NOT NULL DEFAULT (CURRENT_TIMESTAMP),
          CONSTRAINT "UQ_reasons_content" UNIQUE ("content")
        )
      `)
    }

    if (!(await queryRunner.hasTable('settlements'))) {
      await queryRunner.query(`
        CREATE TABLE "settlements" (
          "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
          "start_time" text NOT NULL,
          "end_time" text NOT NULL,
          "created_at" text NOT NULL DEFAULT (CURRENT_TIMESTAMP)
        )
      `)
    }

    if (!(await queryRunner.hasTable('score_events'))) {
      await queryRunner.query(`
        CREATE TABLE "score_events" (
          "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
          "uuid" text NOT NULL,
          "student_name" text NOT NULL,
          "reason_content" text NOT NULL,
          "delta" integer NOT NULL,
          "val_prev" integer NOT NULL,
          "val_curr" integer NOT NULL,
          "event_time" text NOT NULL DEFAULT (CURRENT_TIMESTAMP),
          "settlement_id" integer,
          CONSTRAINT "UQ_score_events_uuid" UNIQUE ("uuid")
        )
      `)
    }
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_score_events_settlement_id" ON "score_events" ("settlement_id")`
    )

    if (!(await queryRunner.hasTable('settings'))) {
      await queryRunner.query(`
        CREATE TABLE "settings" (
          "key" text PRIMARY KEY NOT NULL,
          "value" text
        )
      `)
    }

    await queryRunner.query(`
      INSERT OR IGNORE INTO "reasons" ("content","category","delta","is_system","updated_at") VALUES
      ('上课发言','课堂表现',1,1,CURRENT_TIMESTAMP),
      ('作业优秀','作业情况',2,1,CURRENT_TIMESTAMP),
      ('纪律良好','纪律',1,1,CURRENT_TIMESTAMP),
      ('帮助同学','品德',2,1,CURRENT_TIMESTAMP),
      ('迟到','纪律',-1,1,CURRENT_TIMESTAMP),
      ('未交作业','作业情况',-2,1,CURRENT_TIMESTAMP)
    `)

    if (!(await queryRunner.hasTable('tags'))) {
      await queryRunner.query(`
        CREATE TABLE "tags" (
          "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
          "name" text NOT NULL UNIQUE,
          "created_at" text NOT NULL DEFAULT (CURRENT_TIMESTAMP),
          "updated_at" text NOT NULL DEFAULT (CURRENT_TIMESTAMP)
        )
      `)
    }

    if (!(await queryRunner.hasTable('student_tags'))) {
      await queryRunner.query(`
        CREATE TABLE "student_tags" (
          "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
          "student_id" integer NOT NULL,
          "tag_id" integer NOT NULL,
          "created_at" text NOT NULL DEFAULT (CURRENT_TIMESTAMP),
          FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE,
          FOREIGN KEY ("tag_id") REFERENCES "tags"("id") ON DELETE CASCADE,
          UNIQUE("student_id", "tag_id")
        )
      `)
    }

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_student_tags_student_id" ON "student_tags" ("student_id")`
    )
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_student_tags_tag_id" ON "student_tags" ("tag_id")`
    )

    await queryRunner.query(`
      INSERT OR IGNORE INTO "tags" ("name") VALUES
      ('优秀生'),
      ('班干部'),
      ('勤奋'),
      ('活跃'),
      ('进步快')
    `)
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "score_events"`)
    await queryRunner.query(`DROP TABLE IF EXISTS "settlements"`)
    await queryRunner.query(`DROP TABLE IF EXISTS "students"`)
    await queryRunner.query(`DROP TABLE IF EXISTS "reasons"`)
    await queryRunner.query(`DROP TABLE IF EXISTS "settings"`)
    await queryRunner.query(`DROP TABLE IF EXISTS "student_tags"`)
    await queryRunner.query(`DROP TABLE IF EXISTS "tags"`)
  }
}
