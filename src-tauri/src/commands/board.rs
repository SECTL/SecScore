use parking_lot::RwLock;
use serde::Deserialize;
use sea_orm::{ConnectionTrait, DatabaseConnection, Statement};
use serde_json::{Map, Value as JsonValue};
use sqlx::{Column, Row, SqlitePool};
use std::collections::HashSet;
use std::sync::Arc;
use tauri::{AppHandle, Manager, State};

use crate::services::settings::{SettingsKey, SettingsValue};
use crate::services::PermissionLevel;
use crate::state::AppState;

use super::response::IpcResponse;

#[derive(Debug, Clone, Deserialize)]
pub struct BoardSqlQueryParams {
    pub sql: String,
    pub limit: Option<u64>,
}

#[derive(Debug, Clone, Copy)]
enum QueryBackend {
    Sqlite,
    Postgres,
}

fn check_permission(
    state: &Arc<RwLock<AppState>>,
    sender_id: Option<u32>,
    level: PermissionLevel,
) -> bool {
    let state_guard = state.read();
    let mut permissions = state_guard.permissions.write();
    let id = sender_id.unwrap_or(0);
    permissions.require_permission(id, level)
}

fn check_view_permission(state: &Arc<RwLock<AppState>>, sender_id: Option<u32>) -> bool {
    check_permission(state, sender_id, PermissionLevel::View)
}

fn check_admin_permission(state: &Arc<RwLock<AppState>>, sender_id: Option<u32>) -> bool {
    check_permission(state, sender_id, PermissionLevel::Admin)
}

fn contains_forbidden_keyword(sql: &str) -> bool {
    let forbidden: HashSet<&str> = [
        "insert", "update", "delete", "drop", "alter", "create", "truncate", "reindex", "vacuum",
        "grant", "revoke", "commit", "rollback", "begin", "attach", "detach", "pragma", "analyze",
        "merge", "call", "execute",
    ]
    .into_iter()
    .collect();

    let mut token = String::new();
    for ch in sql.chars() {
        if ch.is_ascii_alphanumeric() || ch == '_' {
            token.push(ch);
            continue;
        }

        if !token.is_empty() {
            if forbidden.contains(token.as_str()) {
                return true;
            }
            token.clear();
        }
    }

    !token.is_empty() && forbidden.contains(token.as_str())
}

fn is_readonly_query(sql: &str) -> bool {
    let trimmed = sql.trim();
    if trimmed.is_empty() {
        return false;
    }

    if trimmed.contains(';')
        || trimmed.contains("--")
        || trimmed.contains("/*")
        || trimmed.contains("*/")
    {
        return false;
    }

    let lower = trimmed.to_ascii_lowercase();
    let starts_with_select_or_with = lower
        .split_whitespace()
        .next()
        .map(|first| first == "select" || first == "with")
        .unwrap_or(false);
    if !starts_with_select_or_with {
        return false;
    }

    !contains_forbidden_keyword(&lower)
}

fn parse_limit(limit: Option<u64>) -> u64 {
    match limit {
        Some(v) if v > 0 => v.min(500),
        _ => 200,
    }
}

fn escape_sql(value: &str) -> String {
    value.replace('\'', "''")
}

fn now_iso() -> String {
    chrono::Utc::now()
        .format("%Y-%m-%dT%H:%M:%S%.3fZ")
        .to_string()
}

fn normalize_board_configs(value: JsonValue) -> JsonValue {
    if value.is_array() {
        value
    } else {
        JsonValue::Array(vec![])
    }
}

async fn ensure_board_configs_table(conn: &DatabaseConnection) -> Result<(), String> {
    let sql = r#"
        CREATE TABLE IF NOT EXISTS board_configs (
            id INTEGER PRIMARY KEY,
            config_json TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
    "#
    .to_string();

    conn.execute(Statement::from_string(conn.get_database_backend(), sql))
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

async fn get_board_configs_raw(conn: &DatabaseConnection) -> Result<Option<String>, String> {
    let sql = "SELECT config_json FROM board_configs WHERE id = 1".to_string();
    let row = conn
        .query_one(Statement::from_string(conn.get_database_backend(), sql))
        .await
        .map_err(|e| e.to_string())?;

    match row {
        Some(r) => r
            .try_get("", "config_json")
            .map(Some)
            .map_err(|e| e.to_string()),
        None => Ok(None),
    }
}

async fn upsert_board_configs_raw(conn: &DatabaseConnection, config_json: &str) -> Result<(), String> {
    let config_escaped = escape_sql(config_json);
    let now_escaped = escape_sql(&now_iso());
    let sql = format!(
        "INSERT INTO board_configs (id, config_json, updated_at) VALUES (1, '{}', '{}') ON CONFLICT(id) DO UPDATE SET config_json = EXCLUDED.config_json, updated_at = EXCLUDED.updated_at",
        config_escaped, now_escaped
    );

    conn.execute(Statement::from_string(conn.get_database_backend(), sql))
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

async fn get_legacy_board_configs_from_settings(
    state: &Arc<RwLock<AppState>>,
    conn: Option<DatabaseConnection>,
) -> Result<JsonValue, String> {
    let state_guard = state.read();
    let mut settings = state_guard.settings.write();
    settings.attach_db(conn);
    settings.initialize().await.map_err(|e| e.to_string())?;

    let legacy = match settings.get_value(SettingsKey::DashboardsConfig) {
        SettingsValue::Json(v) => v,
        _ => JsonValue::Array(vec![]),
    };

    Ok(normalize_board_configs(legacy))
}

fn sqlite_db_path(app_handle: &AppHandle) -> Result<String, String> {
    if cfg!(all(debug_assertions, desktop)) {
        return Ok("data.sql".to_string());
    }

    let app_data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data directory: {}", e))?;
    let data_dir = app_data_dir.join("data");
    std::fs::create_dir_all(&data_dir)
        .map_err(|e| format!("Failed to create data directory: {}", e))?;
    let db_path = data_dir.join("data.sql");
    db_path
        .to_str()
        .map(|s| s.to_string())
        .ok_or_else(|| "Invalid sqlite database path".to_string())
}

fn decode_cell_sqlite(row: &sqlx::sqlite::SqliteRow, index: usize) -> JsonValue {
    if let Ok(v) = row.try_get::<Option<i64>, _>(index) {
        return v.map(JsonValue::from).unwrap_or(JsonValue::Null);
    }
    if let Ok(v) = row.try_get::<Option<i32>, _>(index) {
        return v.map(JsonValue::from).unwrap_or(JsonValue::Null);
    }
    if let Ok(v) = row.try_get::<Option<f64>, _>(index) {
        return v.map(JsonValue::from).unwrap_or(JsonValue::Null);
    }
    if let Ok(v) = row.try_get::<Option<bool>, _>(index) {
        return v.map(JsonValue::from).unwrap_or(JsonValue::Null);
    }
    if let Ok(v) = row.try_get::<Option<String>, _>(index) {
        return v.map(JsonValue::from).unwrap_or(JsonValue::Null);
    }

    JsonValue::Null
}

fn row_to_json_sqlite(row: &sqlx::sqlite::SqliteRow) -> JsonValue {
    let mut map = Map::new();
    for (index, column) in row.columns().iter().enumerate() {
        map.insert(column.name().to_string(), decode_cell_sqlite(row, index));
    }
    JsonValue::Object(map)
}

fn decode_cell_pg(row: &sqlx::postgres::PgRow, index: usize) -> JsonValue {
    if let Ok(v) = row.try_get::<Option<i64>, _>(index) {
        return v.map(JsonValue::from).unwrap_or(JsonValue::Null);
    }
    if let Ok(v) = row.try_get::<Option<i32>, _>(index) {
        return v.map(JsonValue::from).unwrap_or(JsonValue::Null);
    }
    if let Ok(v) = row.try_get::<Option<f64>, _>(index) {
        return v.map(JsonValue::from).unwrap_or(JsonValue::Null);
    }
    if let Ok(v) = row.try_get::<Option<bool>, _>(index) {
        return v.map(JsonValue::from).unwrap_or(JsonValue::Null);
    }
    if let Ok(v) = row.try_get::<Option<String>, _>(index) {
        return v.map(JsonValue::from).unwrap_or(JsonValue::Null);
    }

    JsonValue::Null
}

fn row_to_json_pg(row: &sqlx::postgres::PgRow) -> JsonValue {
    let mut map = Map::new();
    for (index, column) in row.columns().iter().enumerate() {
        map.insert(column.name().to_string(), decode_cell_pg(row, index));
    }
    JsonValue::Object(map)
}

async fn query_sqlite(sql: &str, sqlite_path: &str) -> Result<Vec<JsonValue>, String> {
    let sqlite_url = format!("sqlite://{}?mode=rwc", sqlite_path);
    let pool = SqlitePool::connect(&sqlite_url)
        .await
        .map_err(|e| format!("Failed to connect sqlite: {}", e))?;

    let rows = sqlx::query(sql)
        .fetch_all(&pool)
        .await
        .map_err(|e| format!("SQL query failed: {}", e))?;

    let data = rows.iter().map(row_to_json_sqlite).collect();
    pool.close().await;
    Ok(data)
}

async fn query_postgres(sql: &str, pg_url: &str) -> Result<Vec<JsonValue>, String> {
    let pool = sqlx::postgres::PgPoolOptions::new()
        .max_connections(1)
        .connect(pg_url)
        .await
        .map_err(|e| format!("Failed to connect PostgreSQL: {}", e))?;

    let rows = sqlx::query(sql)
        .fetch_all(&pool)
        .await
        .map_err(|e| format!("SQL query failed: {}", e))?;

    let data = rows.iter().map(row_to_json_pg).collect();
    pool.close().await;
    Ok(data)
}

#[tauri::command]
pub async fn board_get_configs(
    sender_id: Option<u32>,
    state: State<'_, Arc<RwLock<AppState>>>,
) -> Result<IpcResponse<JsonValue>, String> {
    if !check_view_permission(&state, sender_id) {
        return Ok(IpcResponse::error("Permission denied: view required"));
    }

    let db_conn = {
        let state_guard = state.read();
        let conn = state_guard.db.read().clone();
        conn
    };
    let Some(conn) = db_conn else {
        return Ok(IpcResponse::error("Database not connected"));
    };

    ensure_board_configs_table(&conn).await?;

    if let Some(raw) = get_board_configs_raw(&conn).await? {
        let parsed: JsonValue = serde_json::from_str(&raw).unwrap_or(JsonValue::Array(vec![]));
        return Ok(IpcResponse::success(normalize_board_configs(parsed)));
    }

    let legacy = get_legacy_board_configs_from_settings(&state, Some(conn.clone())).await?;
    if legacy.as_array().map(|v| !v.is_empty()).unwrap_or(false) {
        let raw = serde_json::to_string(&legacy).map_err(|e| e.to_string())?;
        upsert_board_configs_raw(&conn, &raw).await?;
    }

    Ok(IpcResponse::success(legacy))
}

#[tauri::command]
pub async fn board_save_configs(
    configs: JsonValue,
    sender_id: Option<u32>,
    state: State<'_, Arc<RwLock<AppState>>>,
) -> Result<IpcResponse<()>, String> {
    if !check_admin_permission(&state, sender_id) {
        return Ok(IpcResponse::error("Permission denied: admin required"));
    }

    let normalized = normalize_board_configs(configs);
    let raw = serde_json::to_string(&normalized).map_err(|e| e.to_string())?;

    let db_conn = {
        let state_guard = state.read();
        let conn = state_guard.db.read().clone();
        conn
    };
    let Some(conn) = db_conn else {
        return Ok(IpcResponse::error("Database not connected"));
    };

    ensure_board_configs_table(&conn).await?;
    upsert_board_configs_raw(&conn, &raw).await?;

    Ok(IpcResponse::success_empty())
}

#[tauri::command]
pub async fn board_query_sql(
    params: BoardSqlQueryParams,
    sender_id: Option<u32>,
    state: State<'_, Arc<RwLock<AppState>>>,
) -> Result<IpcResponse<Vec<JsonValue>>, String> {
    if !check_view_permission(&state, sender_id) {
        return Ok(IpcResponse::error("Permission denied: view required"));
    }

    if !is_readonly_query(&params.sql) {
        return Ok(IpcResponse::error(
            "Only single read-only SELECT/CTE query is allowed",
        ));
    }

    let limit = parse_limit(params.limit);
    let wrapped_sql = format!(
        "SELECT * FROM ({}) AS ss_board_query LIMIT {}",
        params.sql.trim(),
        limit
    );

    let (backend, sqlite_path, pg_url) = {
        let state_guard = state.read();
        let db_conn = state_guard.db.read().clone();
        let app_handle = state_guard.app_handle.clone();
        let mut settings = state_guard.settings.write();

        settings.attach_db(db_conn);
        settings.initialize().await.map_err(|e| e.to_string())?;

        let status = match settings.get_value(SettingsKey::PgConnectionStatus) {
            SettingsValue::Json(v) => v,
            _ => serde_json::json!({"connected": false, "type": "sqlite"}),
        };

        let connected = status
            .get("connected")
            .and_then(|v| v.as_bool())
            .unwrap_or(false);
        let db_type = status
            .get("type")
            .and_then(|v| v.as_str())
            .unwrap_or("sqlite");

        let backend = if connected && db_type == "postgresql" {
            QueryBackend::Postgres
        } else {
            QueryBackend::Sqlite
        };

        let pg_url = match settings.get_value(SettingsKey::PgConnectionString) {
            SettingsValue::String(s) => s,
            _ => String::new(),
        };

        let sqlite_path = sqlite_db_path(&app_handle)?;
        (backend, sqlite_path, pg_url)
    };

    let rows = match backend {
        QueryBackend::Postgres if !pg_url.trim().is_empty() => {
            query_postgres(&wrapped_sql, &pg_url).await
        }
        _ => query_sqlite(&wrapped_sql, &sqlite_path).await,
    };

    match rows {
        Ok(data) => Ok(IpcResponse::success(data)),
        Err(err) => Ok(IpcResponse::error(&err)),
    }
}
