use parking_lot::RwLock;
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, State};

use crate::db::connection::{create_postgres_connection, create_sqlite_connection};
use crate::db::connection::DatabaseType;
use crate::db::migration::run_migration;
use crate::services::permission::PermissionLevel;
use crate::services::settings::{SettingsKey, SettingsValue};
use crate::state::AppState;

use super::response::IpcResponse;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TestConnectionResult {
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SwitchConnectionResult {
    #[serde(rename = "type")]
    pub db_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DatabaseStatus {
    #[serde(rename = "type")]
    pub db_type: String,
    pub connected: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncResult {
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct SettingChange {
    pub key: String,
    pub value: serde_json::Value,
}

fn check_admin_permission(state: &Arc<RwLock<AppState>>) -> Result<(), String> {
    let state_guard = state.read();
    let mut permissions = state_guard.permissions.write();
    let sender_id = 0;
    if !permissions.require_permission(sender_id, PermissionLevel::Admin) {
        return Err("Permission denied: Admin required".to_string());
    }
    Ok(())
}

#[tauri::command]
pub async fn db_test_connection(
    connection_string: String,
    _state: State<'_, Arc<RwLock<AppState>>>,
) -> Result<IpcResponse<TestConnectionResult>, String> {
    let result = if connection_string.starts_with("sqlite://") {
        let path = connection_string
            .strip_prefix("sqlite://")
            .unwrap_or(&connection_string);
        match create_sqlite_connection(path).await {
            Ok(conn) => {
                let _ = conn.close().await;
                TestConnectionResult {
                    success: true,
                    error: None,
                }
            }
            Err(e) => TestConnectionResult {
                success: false,
                error: Some(e.to_string()),
            },
        }
    } else if connection_string.starts_with("postgres://")
        || connection_string.starts_with("postgresql://")
    {
        match create_postgres_connection(&connection_string).await {
            Ok(conn) => {
                let _ = conn.close().await;
                TestConnectionResult {
                    success: true,
                    error: None,
                }
            }
            Err(e) => TestConnectionResult {
                success: false,
                error: Some(e.to_string()),
            },
        }
    } else {
        let path = connection_string.as_str();
        match create_sqlite_connection(path).await {
            Ok(conn) => {
                let _ = conn.close().await;
                TestConnectionResult {
                    success: true,
                    error: None,
                }
            }
            Err(e) => TestConnectionResult {
                success: false,
                error: Some(e.to_string()),
            },
        }
    };

    Ok(IpcResponse::success(result))
}

#[tauri::command]
pub async fn db_switch_connection(
    connection_string: String,
    app_handle: AppHandle,
    state: State<'_, Arc<RwLock<AppState>>>,
) -> Result<IpcResponse<SwitchConnectionResult>, String> {
    check_admin_permission(&state)?;

    let (db_type, saved_connection_string, saved_status, conn) = if connection_string.starts_with("postgres://")
        || connection_string.starts_with("postgresql://")
    {
        let conn = create_postgres_connection(&connection_string)
            .await
            .map_err(|e| e.to_string())?;
        run_migration(&conn, DatabaseType::PostgreSQL)
            .await
            .map_err(|e| e.to_string())?;

        (
            "postgresql".to_string(),
            connection_string.clone(),
            json!({ "connected": true, "type": "postgresql" }),
            conn,
        )
    } else {
        let path = if connection_string.starts_with("sqlite://") {
            connection_string
                .strip_prefix("sqlite://")
                .unwrap_or(&connection_string)
                .to_string()
        } else {
            connection_string
        };

        let conn = create_sqlite_connection(&path)
            .await
            .map_err(|e| e.to_string())?;
        run_migration(&conn, DatabaseType::SQLite)
            .await
            .map_err(|e| e.to_string())?;

        (
            "sqlite".to_string(),
            String::new(),
            json!({ "connected": true, "type": "sqlite" }),
            conn,
        )
    };

    {
        let state_guard = state.read();
        {
            let mut db_guard = state_guard.db.write();
            *db_guard = Some(conn.clone());
        }

        let mut settings = state_guard.settings.write();
        settings.attach_db(Some(conn));
        settings.initialize().await.map_err(|e| e.to_string())?;
        settings
            .set_value(
                SettingsKey::PgConnectionString,
                SettingsValue::String(saved_connection_string.clone()),
            )
            .await
            .map_err(|e| e.to_string())?;
        settings
            .set_value(
                SettingsKey::PgConnectionStatus,
                SettingsValue::Json(saved_status.clone()),
            )
            .await
            .map_err(|e| e.to_string())?;
    }

    let _ = app_handle.emit(
        "settings:changed",
        &SettingChange {
            key: "pg_connection_string".to_string(),
            value: serde_json::Value::String(saved_connection_string),
        },
    );
    let _ = app_handle.emit(
        "settings:changed",
        &SettingChange {
            key: "pg_connection_status".to_string(),
            value: saved_status,
        },
    );

    Ok(IpcResponse::success(SwitchConnectionResult { db_type }))
}

#[tauri::command]
pub async fn db_get_status(
    state: State<'_, Arc<RwLock<AppState>>>,
) -> Result<IpcResponse<DatabaseStatus>, String> {
    let state_guard = state.read();
    let db_guard = state_guard.db.read();
    let connected = db_guard.is_some();

    let db_type = if connected {
        let settings = state_guard.settings.read();
        let status_json =
            settings.get_value(crate::services::settings::SettingsKey::PgConnectionStatus);
        match status_json {
            crate::services::settings::SettingsValue::Json(json) => json
                .get("type")
                .and_then(|t| t.as_str())
                .map(|s| s.to_string())
                .unwrap_or_else(|| "sqlite".to_string()),
            _ => "sqlite".to_string(),
        }
    } else {
        "sqlite".to_string()
    };

    Ok(IpcResponse::success(DatabaseStatus {
        db_type,
        connected,
        error: None,
    }))
}

#[tauri::command]
pub async fn db_sync(
    state: State<'_, Arc<RwLock<AppState>>>,
) -> Result<IpcResponse<SyncResult>, String> {
    check_admin_permission(&state)?;

    let state_guard = state.read();
    let db_guard = state_guard.db.read();
    if let Some(conn) = db_guard.as_ref() {
        let settings = state_guard.settings.read();
        let status_json = settings.get_value(crate::services::settings::SettingsKey::PgConnectionStatus);
        let db_type = match status_json {
            crate::services::settings::SettingsValue::Json(json) => json
                .get("type")
                .and_then(|t| t.as_str())
                .map(|s| s.to_string())
                .unwrap_or_else(|| "sqlite".to_string()),
            _ => "sqlite".to_string(),
        };

        let migration_result = if db_type == "postgresql" {
            run_migration(conn, DatabaseType::PostgreSQL).await
        } else {
            run_migration(conn, DatabaseType::SQLite).await
        };

        match migration_result {
            Ok(_) => Ok(IpcResponse::success(SyncResult {
                success: true,
                message: Some("Database synchronized successfully".to_string()),
            })),
            Err(e) => Ok(IpcResponse::success(SyncResult {
                success: false,
                message: Some(format!("Sync failed: {}", e)),
            })),
        }
    } else {
        Ok(IpcResponse::success(SyncResult {
            success: false,
            message: Some("No database connection".to_string()),
        }))
    }
}
