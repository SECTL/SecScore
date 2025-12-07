use tauri::async_runtime::block_on;
use tracing::info;
use tracing_subscriber::fmt::format::FmtSpan;

mod database;
mod utils;

// 导入所有命令
#[tauri::command]
async fn get_students(pool: tauri::State<'_, sqlx::SqlitePool>) -> Result<Vec<crate::commands::Student>, String> {
    crate::commands::get_students(pool).await
}

#[tauri::command]
async fn add_student(pool: tauri::State<'_, sqlx::SqlitePool>, name: &str, class: &str) -> Result<crate::commands::Student, String> {
    crate::commands::add_student(pool, name, class).await
}

#[tauri::command]
async fn update_student(pool: tauri::State<'_, sqlx::SqlitePool>, id: i64, name: &str, class: &str) -> Result<crate::commands::Student, String> {
    crate::commands::update_student(pool, id, name, class).await
}

#[tauri::command]
async fn delete_student(pool: tauri::State<'_, sqlx::SqlitePool>, id: i64) -> Result<(), String> {
    crate::commands::delete_student(pool, id).await
}

#[tauri::command]
async fn add_point_record(
    pool: tauri::State<'_, sqlx::SqlitePool>, 
    student_id: i64, 
    points: i64, 
    reason: &str, 
    operator: &str
) -> Result<crate::commands::PointRecord, String> {
    crate::commands::add_point_record(pool, student_id, points, reason, operator).await
}

#[tauri::command]
async fn get_point_records(pool: tauri::State<'_, sqlx::SqlitePool>, student_id: Option<i64>) -> Result<Vec<crate::commands::PointRecord>, String> {
    crate::commands::get_point_records(pool, student_id).await
}

#[tauri::command]
async fn get_ranking(pool: tauri::State<'_, sqlx::SqlitePool>, time_range: &str) -> Result<Vec<crate::commands::RankingItem>, String> {
    crate::commands::get_ranking(pool, time_range).await
}

#[tauri::command]
async fn get_settings(pool: tauri::State<'_, sqlx::SqlitePool>) -> Result<crate::commands::Settings, String> {
    crate::commands::get_settings(pool).await
}

#[tauri::command]
async fn update_settings(pool: tauri::State<'_, sqlx::SqlitePool>, theme: &str, custom_background: &str) -> Result<crate::commands::Settings, String> {
    crate::commands::update_settings(pool, theme, custom_background).await
}

#[tauri::command]
async fn backup_data(pool: tauri::State<'_, sqlx::SqlitePool>) -> Result<String, String> {
    crate::commands::backup_data(pool).await
}

#[tauri::command]
async fn restore_data(pool: tauri::State<'_, sqlx::SqlitePool>, backup_path: &str) -> Result<(), String> {
    crate::commands::restore_data(pool, backup_path).await
}

mod commands {
    // 重新导出commands模块的内容
    pub use super::commands_impl::*;
}

mod commands_impl {
    // 这里是原始的commands模块内容
    use sqlx::{SqlitePool, FromRow};

    // 学生管理命令
    pub async fn get_students(pool: tauri::State<'_, SqlitePool>) -> Result<Vec<Student>, String> {
        let students = sqlx::query_as::<_, Student>(r#"
            SELECT id, name, class, total_points, 
                   datetime(created_at, 'localtime') as created_at, 
                   datetime(updated_at, 'localtime') as updated_at 
            FROM students 
            ORDER BY name ASC
        "#)
        .fetch_all(pool.inner())
        .await
        .map_err(|e| format!("Failed to get students: {}", e))?;

        Ok(students)
    }

    pub async fn add_student(pool: tauri::State<'_, SqlitePool>, name: &str, class: &str) -> Result<Student, String> {
        let student = sqlx::query_as::<_, Student>(r#"
            INSERT INTO students (name, class) 
            VALUES (?, ?) 
            RETURNING id, name, class, total_points, 
                      datetime(created_at, 'localtime') as created_at, 
                      datetime(updated_at, 'localtime') as updated_at
        "#)
        .bind(name)
        .bind(class)
        .fetch_one(pool.inner())
        .await
        .map_err(|e| format!("Failed to add student: {}", e))?;

        Ok(student)
    }

    pub async fn update_student(pool: tauri::State<'_, SqlitePool>, id: i64, name: &str, class: &str) -> Result<Student, String> {
        let student = sqlx::query_as::<_, Student>(r#"
            UPDATE students 
            SET name = ?, class = ?, updated_at = CURRENT_TIMESTAMP 
            WHERE id = ? 
            RETURNING id, name, class, total_points, 
                      datetime(created_at, 'localtime') as created_at, 
                      datetime(updated_at, 'localtime') as updated_at
        "#)
        .bind(name)
        .bind(class)
        .bind(id)
        .fetch_one(pool.inner())
        .await
        .map_err(|e| format!("Failed to update student: {}", e))?;

        Ok(student)
    }

    pub async fn delete_student(pool: tauri::State<'_, SqlitePool>, id: i64) -> Result<(), String> {
        // 先删除关联的积分记录
        sqlx::query("DELETE FROM point_records WHERE student_id = ?")
            .bind(id)
        .execute(pool.inner())
        .await
        .map_err(|e| format!("Failed to delete student records: {}", e))?;

        // 再删除学生
        sqlx::query("DELETE FROM students WHERE id = ?")
            .bind(id)
        .execute(pool.inner())
        .await
        .map_err(|e| format!("Failed to delete student: {}", e))?;

        Ok(())
    }

    // 积分管理命令
    pub async fn add_point_record(
        pool: tauri::State<'_, SqlitePool>, 
        student_id: i64, 
        points: i64, 
        reason: &str, 
        operator: &str
    ) -> Result<PointRecord, String> {
        // 开始事务
        let mut tx = pool.begin().await
            .map_err(|e| format!("Failed to begin transaction: {}", e))?;

        // 插入积分记录
        let record = sqlx::query_as::<_, PointRecord>(r#"
            INSERT INTO point_records (student_id, points, reason, operator) 
            VALUES (?, ?, ?, ?) 
            RETURNING id, student_id, points, reason, 
                      datetime(timestamp, 'localtime') as timestamp, 
                      operator
        "#)
        .bind(student_id)
        .bind(points)
        .bind(reason)
        .bind(operator)
        .fetch_one(&mut *tx)
        .await
        .map_err(|e| format!("Failed to add point record: {}", e))?;

        // 更新学生总分
        sqlx::query("UPDATE students SET total_points = total_points + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
            .bind(points)
            .bind(student_id)
        .execute(&mut *tx)
        .await
        .map_err(|e| format!("Failed to update student points: {}", e))?;

        // 提交事务
        tx.commit().await
            .map_err(|e| format!("Failed to commit transaction: {}", e))?;

        Ok(record)
    }

    pub async fn get_point_records(pool: tauri::State<'_, SqlitePool>, student_id: Option<i64>) -> Result<Vec<PointRecord>, String> {
        let records = match student_id {
            Some(id) => sqlx::query_as::<_, PointRecord>(r#"
                SELECT id, student_id, points, reason, 
                       datetime(timestamp, 'localtime') as timestamp, 
                       operator 
                FROM point_records 
                WHERE student_id = ? 
                ORDER BY timestamp DESC
            "#)
            .bind(id)
            .fetch_all(pool.inner())
            .await
            .map_err(|e| format!("Failed to get point records: {}", e))?,
            None => sqlx::query_as::<_, PointRecord>(r#"
                SELECT id, student_id, points, reason, 
                       datetime(timestamp, 'localtime') as timestamp, 
                       operator 
                FROM point_records 
                ORDER BY timestamp DESC
            "#)
            .fetch_all(pool.inner())
            .await
            .map_err(|e| format!("Failed to get point records: {}", e))?
        };

        Ok(records)
    }

    // 排行榜命令
    pub async fn get_ranking(_pool: tauri::State<'_, SqlitePool>, _time_range: &str) -> Result<Vec<RankingItem>, String> {
        // 实现获取排行榜
        Ok(vec![])
    }

    // 设置命令
    pub async fn get_settings(_pool: tauri::State<'_, SqlitePool>) -> Result<Settings, String> {
        // 实现获取设置
        Ok(Settings {
            theme: "light".to_string(),
            custom_background: "#ffffff".to_string(),
        })
    }

    pub async fn update_settings(_pool: tauri::State<'_, SqlitePool>, theme: &str, custom_background: &str) -> Result<Settings, String> {
        // 实现更新设置
        Ok(Settings {
            theme: theme.to_string(),
            custom_background: custom_background.to_string(),
        })
    }

    // 数据管理命令
    pub async fn backup_data(_pool: tauri::State<'_, SqlitePool>) -> Result<String, String> {
        // 实现数据备份
        Ok("backup_path".to_string())
    }

    pub async fn restore_data(_pool: tauri::State<'_, SqlitePool>, _backup_path: &str) -> Result<(), String> {
        // 实现数据恢复
        Ok(())
    }

    // 数据模型
    #[derive(Debug, serde::Serialize, serde::Deserialize, FromRow)]
    pub struct Student {
        pub id: i64,
        pub name: String,
        pub class: String,
        pub total_points: i64,
        pub created_at: String,
        pub updated_at: String,
    }

    #[derive(Debug, serde::Serialize, serde::Deserialize, FromRow)]
    pub struct PointRecord {
        pub id: i64,
        pub student_id: i64,
        pub points: i64,
        pub reason: String,
        pub timestamp: String,
        pub operator: String,
    }

    #[derive(Debug, serde::Serialize, serde::Deserialize, FromRow)]
    pub struct RankingItem {
        pub rank: i64,
        pub student_id: i64,
        pub name: String,
        pub class: String,
        pub total_points: i64,
        pub today_change: i64,
    }

    #[derive(Debug, serde::Serialize, serde::Deserialize, FromRow)]
    pub struct Settings {
        pub theme: String,
        pub custom_background: String,
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // 设置tracing日志
    tracing_subscriber::fmt()
        .with_max_level(tracing::Level::INFO)
        .with_span_events(FmtSpan::CLOSE)
        .init();

    info!("Starting Education Points System...");

    // 初始化内存数据库
    let pool = block_on(database::init_db(std::path::PathBuf::new()))
        .expect("Failed to initialize database");

    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            get_students,
            add_student,
            update_student,
            delete_student,
            add_point_record,
            get_point_records,
            get_ranking,
            get_settings,
            update_settings,
            backup_data,
            restore_data,
        ])
        .manage(pool)
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}