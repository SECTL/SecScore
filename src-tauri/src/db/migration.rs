use sea_orm::{ConnectionTrait, DbBackend, DbErr, Statement};
use tracing::{info, warn};

use super::connection::DatabaseType;
use super::schema::*;

pub struct Migration;

impl Migration {
    pub async fn run(conn: &impl ConnectionTrait, db_type: DatabaseType) -> Result<(), DbErr> {
        info!("Starting database migration for {:?}", db_type);

        let is_sqlite = db_type == DatabaseType::SQLite;

        Self::create_students_table(conn, is_sqlite).await?;
        Self::create_reasons_table(conn, is_sqlite).await?;
        Self::create_score_events_table(conn, is_sqlite).await?;
        Self::create_settlements_table(conn, is_sqlite).await?;
        Self::create_settings_table(conn, is_sqlite).await?;
        Self::create_board_configs_table(conn, is_sqlite).await?;
        Self::create_tags_table(conn, is_sqlite).await?;
        Self::create_student_tags_table(conn, is_sqlite).await?;
        Self::create_reward_settings_table(conn, is_sqlite).await?;
        Self::create_reward_redemptions_table(conn, is_sqlite).await?;
        Self::ensure_students_reward_points_column(conn, is_sqlite).await?;
        Self::ensure_students_group_name_column(conn, is_sqlite).await?;

        Self::create_indexes(conn, is_sqlite).await?;

        Self::insert_default_data(conn, is_sqlite).await?;

        info!("Database migration completed successfully");
        Ok(())
    }

    async fn create_students_table(conn: &impl ConnectionTrait, sqlite: bool) -> Result<(), DbErr> {
        let sql = get_create_students_table_sql(sqlite);
        conn.execute(Statement::from_string(Self::get_db_backend(sqlite), sql))
            .await?;
        info!("Created students table");
        Ok(())
    }

    async fn create_reasons_table(conn: &impl ConnectionTrait, sqlite: bool) -> Result<(), DbErr> {
        let sql = get_create_reasons_table_sql(sqlite);
        conn.execute(Statement::from_string(Self::get_db_backend(sqlite), sql))
            .await?;
        info!("Created reasons table");
        Ok(())
    }

    async fn create_score_events_table(
        conn: &impl ConnectionTrait,
        sqlite: bool,
    ) -> Result<(), DbErr> {
        let sql = get_create_score_events_table_sql(sqlite);
        conn.execute(Statement::from_string(Self::get_db_backend(sqlite), sql))
            .await?;
        info!("Created score_events table");
        Ok(())
    }

    async fn create_settlements_table(
        conn: &impl ConnectionTrait,
        sqlite: bool,
    ) -> Result<(), DbErr> {
        let sql = get_create_settlements_table_sql(sqlite);
        conn.execute(Statement::from_string(Self::get_db_backend(sqlite), sql))
            .await?;
        info!("Created settlements table");
        Ok(())
    }

    async fn create_settings_table(conn: &impl ConnectionTrait, sqlite: bool) -> Result<(), DbErr> {
        let sql = get_create_settings_table_sql(sqlite);
        conn.execute(Statement::from_string(Self::get_db_backend(sqlite), sql))
            .await?;
        info!("Created settings table");
        Ok(())
    }

    async fn create_board_configs_table(
        conn: &impl ConnectionTrait,
        sqlite: bool,
    ) -> Result<(), DbErr> {
        let sql = get_create_board_configs_table_sql(sqlite);
        conn.execute(Statement::from_string(Self::get_db_backend(sqlite), sql))
            .await?;
        info!("Created board_configs table");
        Ok(())
    }

    async fn create_tags_table(conn: &impl ConnectionTrait, sqlite: bool) -> Result<(), DbErr> {
        let sql = get_create_tags_table_sql(sqlite);
        conn.execute(Statement::from_string(Self::get_db_backend(sqlite), sql))
            .await?;
        info!("Created tags table");
        Ok(())
    }

    async fn create_student_tags_table(
        conn: &impl ConnectionTrait,
        sqlite: bool,
    ) -> Result<(), DbErr> {
        let sql = get_create_student_tags_table_sql(sqlite);
        conn.execute(Statement::from_string(Self::get_db_backend(sqlite), sql))
            .await?;
        info!("Created student_tags table");
        Ok(())
    }

    async fn create_reward_settings_table(
        conn: &impl ConnectionTrait,
        sqlite: bool,
    ) -> Result<(), DbErr> {
        let sql = get_create_reward_settings_table_sql(sqlite);
        conn.execute(Statement::from_string(Self::get_db_backend(sqlite), sql))
            .await?;
        info!("Created reward_settings table");
        Ok(())
    }

    async fn create_reward_redemptions_table(
        conn: &impl ConnectionTrait,
        sqlite: bool,
    ) -> Result<(), DbErr> {
        let sql = get_create_reward_redemptions_table_sql(sqlite);
        conn.execute(Statement::from_string(Self::get_db_backend(sqlite), sql))
            .await?;
        info!("Created reward_redemptions table");
        Ok(())
    }

    async fn ensure_students_reward_points_column(
        conn: &impl ConnectionTrait,
        sqlite: bool,
    ) -> Result<(), DbErr> {
        let db_backend = Self::get_db_backend(sqlite);
        let alter_sql = "ALTER TABLE students ADD COLUMN reward_points INTEGER DEFAULT 0";
        let result = conn
            .execute(Statement::from_string(
                db_backend.clone(),
                alter_sql.to_string(),
            ))
            .await;

        match result {
            Ok(_) => {
                info!("Added students.reward_points column");
            }
            Err(e) => {
                let msg = e.to_string().to_lowercase();
                let already_exists = msg.contains("duplicate column")
                    || msg.contains("already exists")
                    || msg.contains("duplicate");
                if already_exists {
                    info!("students.reward_points already exists, skip alter");
                } else {
                    return Err(e);
                }
            }
        }

        Ok(())
    }

    async fn ensure_students_group_name_column(
        conn: &impl ConnectionTrait,
        sqlite: bool,
    ) -> Result<(), DbErr> {
        let db_backend = Self::get_db_backend(sqlite);
        let alter_sql = "ALTER TABLE students ADD COLUMN group_name TEXT";
        let result = conn
            .execute(Statement::from_string(
                db_backend.clone(),
                alter_sql.to_string(),
            ))
            .await;

        match result {
            Ok(_) => {
                info!("Added students.group_name column");
            }
            Err(e) => {
                let msg = e.to_string().to_lowercase();
                let already_exists = msg.contains("duplicate column")
                    || msg.contains("already exists")
                    || msg.contains("duplicate");
                if already_exists {
                    info!("students.group_name already exists, skip alter");
                } else {
                    return Err(e);
                }
            }
        }

        Ok(())
    }

    async fn create_indexes(conn: &impl ConnectionTrait, sqlite: bool) -> Result<(), DbErr> {
        let indexes = vec![
            get_create_index_score_events_settlement_id_sql(sqlite),
            get_create_index_score_events_student_name_sql(sqlite),
            get_create_index_reasons_content_sql(sqlite),
            get_create_index_reward_settings_name_sql(sqlite),
            get_create_index_reward_redemptions_student_name_sql(sqlite),
            get_create_index_reward_redemptions_reward_id_sql(sqlite),
        ];

        for index_sql in indexes {
            conn.execute(Statement::from_string(
                Self::get_db_backend(sqlite),
                index_sql,
            ))
            .await?;
        }

        info!("Created indexes");
        Ok(())
    }

    async fn insert_default_data(conn: &impl ConnectionTrait, sqlite: bool) -> Result<(), DbErr> {
        Self::insert_default_reasons(conn, sqlite).await?;
        Self::insert_default_tags(conn, sqlite).await?;
        Ok(())
    }

    async fn insert_default_reasons(
        conn: &impl ConnectionTrait,
        sqlite: bool,
    ) -> Result<(), DbErr> {
        let default_reasons = vec![
            ("课堂表现优秀", "课堂表现", 5, 1),
            ("作业完成优秀", "作业", 3, 1),
            ("帮助同学", "行为", 2, 1),
            ("违反纪律", "行为", -3, 1),
            ("作业未完成", "作业", -2, 1),
            ("迟到", "考勤", -1, 1),
            ("早退", "考勤", -1, 1),
            ("旷课", "考勤", -5, 1),
            ("考试作弊", "考试", -10, 1),
            ("其他", "其他", 0, 1),
        ];

        let db_backend = Self::get_db_backend(sqlite);

        for (content, category, delta, is_system) in default_reasons {
            let check_sql = format!(
                "SELECT COUNT(*) as count FROM reasons WHERE content = '{}'",
                content.replace("'", "''")
            );

            let result = conn
                .query_one(Statement::from_string(db_backend.clone(), check_sql))
                .await?;

            let exists = if let Some(row) = result {
                let count: i64 = row.try_get("", "count")?;
                count > 0
            } else {
                false
            };

            if !exists {
                let insert_sql = format!(
                    "INSERT INTO reasons (content, category, delta, is_system) VALUES ('{}', '{}', {}, {})",
                    content.replace("'", "''"),
                    category.replace("'", "''"),
                    delta,
                    is_system
                );

                conn.execute(Statement::from_string(db_backend.clone(), insert_sql))
                    .await?;
                info!("Inserted default reason: {}", content);
            }
        }

        Ok(())
    }

    async fn insert_default_tags(conn: &impl ConnectionTrait, sqlite: bool) -> Result<(), DbErr> {
        let default_tags = vec!["优秀", "良好", "待进步"];

        let db_backend = Self::get_db_backend(sqlite);

        for tag_name in default_tags {
            let check_sql = format!(
                "SELECT COUNT(*) as count FROM tags WHERE name = '{}'",
                tag_name.replace("'", "''")
            );

            let result = conn
                .query_one(Statement::from_string(db_backend.clone(), check_sql))
                .await?;

            let exists = if let Some(row) = result {
                let count: i64 = row.try_get("", "count")?;
                count > 0
            } else {
                false
            };

            if !exists {
                let insert_sql = format!(
                    "INSERT INTO tags (name) VALUES ('{}')",
                    tag_name.replace("'", "''")
                );

                conn.execute(Statement::from_string(db_backend.clone(), insert_sql))
                    .await?;
                info!("Inserted default tag: {}", tag_name);
            }
        }

        Ok(())
    }

    fn get_db_backend(sqlite: bool) -> DbBackend {
        if sqlite {
            DbBackend::Sqlite
        } else {
            DbBackend::Postgres
        }
    }

    pub async fn check_table_exists(
        conn: &impl ConnectionTrait,
        table_name: &str,
        sqlite: bool,
    ) -> Result<bool, DbErr> {
        let sql = if sqlite {
            format!(
                "SELECT name FROM sqlite_master WHERE type='table' AND name='{}'",
                table_name
            )
        } else {
            format!(
                "SELECT table_name FROM information_schema.tables WHERE table_name = '{}'",
                table_name
            )
        };

        let result = conn
            .query_one(Statement::from_string(Self::get_db_backend(sqlite), sql))
            .await?;

        Ok(result.is_some())
    }

    pub async fn drop_all_tables(conn: &impl ConnectionTrait, sqlite: bool) -> Result<(), DbErr> {
        warn!("Dropping all tables...");

        let tables = vec![
            TABLE_STUDENT_TAGS,
            TABLE_SCORE_EVENTS,
            TABLE_SETTLEMENTS,
            TABLE_REASONS,
            TABLE_TAGS,
            TABLE_STUDENTS,
            TABLE_REWARD_REDEMPTIONS,
            TABLE_REWARD_SETTINGS,
            TABLE_SETTINGS,
            TABLE_BOARD_CONFIGS,
        ];

        let db_backend = Self::get_db_backend(sqlite);

        for table in tables {
            let sql = format!("DROP TABLE IF EXISTS {}", table);
            conn.execute(Statement::from_string(db_backend.clone(), sql))
                .await?;
            info!("Dropped table: {}", table);
        }

        info!("All tables dropped successfully");
        Ok(())
    }

    pub async fn reset_database(conn: &impl ConnectionTrait, sqlite: bool) -> Result<(), DbErr> {
        warn!("Resetting database...");
        Self::drop_all_tables(conn, sqlite).await?;
        Self::run(
            conn,
            if sqlite {
                DatabaseType::SQLite
            } else {
                DatabaseType::PostgreSQL
            },
        )
        .await?;
        info!("Database reset completed");
        Ok(())
    }
}

pub async fn run_migration(
    conn: &impl ConnectionTrait,
    db_type: DatabaseType,
) -> Result<(), DbErr> {
    Migration::run(conn, db_type).await
}

pub async fn check_migration_status(
    conn: &impl ConnectionTrait,
    db_type: DatabaseType,
) -> Result<MigrationStatus, DbErr> {
    let sqlite = db_type == DatabaseType::SQLite;

    let tables = vec![
        TABLE_STUDENTS,
        TABLE_REASONS,
        TABLE_SCORE_EVENTS,
        TABLE_SETTLEMENTS,
        TABLE_SETTINGS,
        TABLE_TAGS,
        TABLE_STUDENT_TAGS,
    ];

    let mut existing_tables = Vec::new();
    let mut missing_tables = Vec::new();

    for table in tables {
        if Migration::check_table_exists(conn, table, sqlite).await? {
            existing_tables.push(table.to_string());
        } else {
            missing_tables.push(table.to_string());
        }
    }

    Ok(MigrationStatus {
        is_complete: missing_tables.is_empty(),
        existing_tables,
        missing_tables,
    })
}

#[derive(Debug, Clone)]
pub struct MigrationStatus {
    pub is_complete: bool,
    pub existing_tables: Vec<String>,
    pub missing_tables: Vec<String>,
}
