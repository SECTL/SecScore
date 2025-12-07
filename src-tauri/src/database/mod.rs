use sqlx::sqlite::SqlitePoolOptions;
use sqlx::SqlitePool;
use std::path::PathBuf;
use tracing::info;

pub async fn init_db(_app_dir: PathBuf) -> anyhow::Result<SqlitePool> {
    // 使用内存数据库，确保应用能正常运行
    let db_url = "sqlite::memory:";

    info!("Initializing in-memory database");

    // 创建数据库连接池
    let pool = SqlitePoolOptions::new()
        .max_connections(10)
        .connect(db_url)
        .await?;

    // 执行数据库迁移
    migrate_db(&pool).await?;

    info!("Database initialized successfully");

    Ok(pool)
}

async fn migrate_db(pool: &SqlitePool) -> anyhow::Result<()> {
    // 创建学生表
    sqlx::query(r#"
        CREATE TABLE IF NOT EXISTS students (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            class TEXT NOT NULL,
            total_points INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    "#)
    .execute(pool)
    .await?;

    // 创建积分记录表
    sqlx::query(r#"
        CREATE TABLE IF NOT EXISTS point_records (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            student_id INTEGER NOT NULL,
            points INTEGER NOT NULL,
            reason TEXT NOT NULL,
            timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            operator TEXT NOT NULL,
            FOREIGN KEY (student_id) REFERENCES students(id)
        )
    "#)
    .execute(pool)
    .await?;

    // 创建设置表
    sqlx::query(r#"
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    "#)
    .execute(pool)
    .await?;

    // 创建备份表
    sqlx::query(r#"
        CREATE TABLE IF NOT EXISTS backups (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            filename TEXT NOT NULL,
            size INTEGER NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            hash TEXT NOT NULL
        )
    "#)
    .execute(pool)
    .await?;

    // 初始化默认主题设置
    let theme_count: Option<i64> = sqlx::query_scalar("SELECT COUNT(*) FROM settings WHERE key = 'theme'")
        .fetch_one(pool)
        .await?;

    if theme_count.unwrap_or(0) == 0 {
        sqlx::query("INSERT INTO settings (key, value) VALUES (?, ?)")
            .bind("theme")
            .bind("light")
        .execute(pool)
        .await?;
        
        info!("Set default theme to light");
    }

    // 初始化示例学生数据
    let student_count: Option<i64> = sqlx::query_scalar("SELECT COUNT(*) FROM students")
        .fetch_one(pool)
        .await?;

    if student_count.unwrap_or(0) == 0 {
        // 添加一些示例学生
        let students = vec![
            ("张三", "一年级1班"),
            ("李四", "一年级1班"),
            ("王五", "一年级2班"),
            ("赵六", "一年级2班"),
            ("孙七", "一年级3班")
        ];

        for (name, class) in students {
            sqlx::query("INSERT INTO students (name, class) VALUES (?, ?)")
                .bind(name)
                .bind(class)
            .execute(pool)
            .await?;
        }
        
        info!("Added default student data");
    }

    Ok(())
}
