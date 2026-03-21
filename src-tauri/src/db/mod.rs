pub mod connection;
pub mod entities;
pub mod migration;
pub mod schema;

pub use connection::{
    create_postgres_connection, create_sqlite_connection, test_postgres_connection,
    test_sqlite_connection, ConnectionManager, DatabaseConfig, DatabaseType,
};

pub use migration::{check_migration_status, run_migration, Migration, MigrationStatus};

pub use schema::{
    get_create_index_reasons_content_sql, get_create_index_score_events_settlement_id_sql,
    get_create_index_score_events_student_name_sql, get_create_reasons_table_sql,
    get_create_score_events_table_sql, get_create_settings_table_sql,
    get_create_settlements_table_sql, get_create_student_tags_table_sql,
    get_create_students_table_sql, get_create_tags_table_sql, reasons, score_events, settings,
    settlements, student_tags, students, tags, TABLE_REASONS, TABLE_SCORE_EVENTS, TABLE_SETTINGS,
    TABLE_SETTLEMENTS, TABLE_STUDENTS, TABLE_STUDENT_TAGS, TABLE_TAGS,
};
