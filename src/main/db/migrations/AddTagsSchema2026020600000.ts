import type { MigrationInterface, QueryRunner } from 'typeorm'

export class AddTagsSchema2026020600000 implements MigrationInterface {
  name = 'AddTagsSchema2026020600000'

  async up(queryRunner: QueryRunner): Promise<void> {
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
    await queryRunner.query(`DROP TABLE IF EXISTS "student_tags"`)
    await queryRunner.query(`DROP TABLE IF EXISTS "tags"`)
  }
}
