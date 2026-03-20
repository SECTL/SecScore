use parking_lot::RwLock;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager, State};

use crate::db::connection::{create_sqlite_connection, DatabaseType};
use crate::db::migration::Migration;
use crate::services::settings::{SettingsKey, SettingsValue, SettingsService};
use crate::services::{AutoScoreService, ThemeService};
use crate::services::permission::PermissionLevel;
use crate::state::AppState;

use super::response::IpcResponse;

fn check_admin_permission(state: &Arc<RwLock<AppState>>) -> Result<(), String> {
    let state_guard = state.read();
    let mut permissions = state_guard.permissions.write();
    let sender_id = 0;
    if !permissions.require_permission(sender_id, PermissionLevel::Admin) {
        return Err("Permission denied: Admin required".to_string());
    }
    Ok(())
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
    match db_path.to_str() {
        Some(path) => Ok(path.to_owned()),
        None => Err("Invalid sqlite database path".to_string()),
    }
}

#[tauri::command]
pub async fn data_export_json(
    state: State<'_, Arc<RwLock<AppState>>>,
) -> Result<IpcResponse<String>, String> {
    check_admin_permission(&state)?;

    let state_guard = state.read();
    let settings = state_guard.settings.read();
    let settings_value = settings.get_all();
    let settings_json = serde_json::to_value(settings_value)
        .map_err(|e| format!("Failed to serialize settings: {}", e))?;

    let data_service = state_guard.data.read();
    let students: Vec<crate::services::data::StudentExport> = Vec::new();
    let events: Vec<crate::services::data::EventExport> = Vec::new();

    let export_data = data_service.export_json(settings_json, students, events);

    let json_string = serde_json::to_string_pretty(&export_data)
        .map_err(|e| format!("Failed to serialize export data: {}", e))?;

    Ok(IpcResponse::success(json_string))
}

#[tauri::command]
pub async fn data_import_json(
    json_text: String,
    state: State<'_, Arc<RwLock<AppState>>>,
) -> Result<IpcResponse<()>, String> {
    check_admin_permission(&state)?;

    let state_guard = state.read();
    let mut data_service = state_guard.data.write();
    let result = data_service.import_json(&json_text);

    if result.success {
        Ok(IpcResponse::success_empty())
    } else {
        Ok(IpcResponse::error(
            result.message.as_deref().unwrap_or("Import failed"),
        ))
    }
}

#[tauri::command]
pub async fn data_reset_all(
    app_handle: AppHandle,
    state: State<'_, Arc<RwLock<AppState>>>,
) -> Result<IpcResponse<()>, String> {
    check_admin_permission(&state)?;

    let sqlite_path = sqlite_db_path(&app_handle)?;
    let sqlite_conn = create_sqlite_connection(&sqlite_path)
        .await
        .map_err(|e| format!("Failed to open sqlite database: {}", e))?;

    let (active_conn, active_db_type) = {
        let state_guard = state.read();
        let active_conn = state_guard
            .db
            .read()
            .clone()
            .ok_or_else(|| "Database not connected".to_string())?;
        let db_type = {
            let settings = state_guard.settings.read();
            match settings.get_value(SettingsKey::PgConnectionStatus) {
                SettingsValue::Json(json) => match json.get("type").and_then(|value| value.as_str()) {
                    Some("postgresql") => DatabaseType::PostgreSQL,
                    _ => DatabaseType::SQLite,
                },
                _ => DatabaseType::SQLite,
            }
        };
        (active_conn, db_type)
    };

    if active_db_type == DatabaseType::PostgreSQL {
        Migration::reset_database(&active_conn, false)
            .await
            .map_err(|e| format!("Failed to reset PostgreSQL database: {}", e))?;
    }

    Migration::reset_database(&sqlite_conn, true)
        .await
        .map_err(|e| format!("Failed to reset SQLite database: {}", e))?;

    {
        let state_guard = state.read();

        {
            let mut db = state_guard.db.write();
            *db = Some(sqlite_conn.clone());
        }

        {
            let mut settings = state_guard.settings.write();
            *settings = SettingsService::new();
            settings.attach_db(Some(sqlite_conn.clone()));
            settings
                .initialize()
                .await
                .map_err(|e| format!("Failed to reinitialize settings: {}", e))?;
            settings
                .set_value(
                    SettingsKey::PgConnectionStatus,
                    SettingsValue::Json(serde_json::json!({
                        "connected": true,
                        "type": "sqlite"
                    })),
                )
                .await
                .map_err(|e| format!("Failed to restore sqlite status: {}", e))?;
        }

        {
            let mut permissions = state_guard.permissions.write();
            permissions.clear_all_permissions();
            permissions.update_password_status(false, false);
        }

        {
            let mut theme = state_guard.theme.write();
            *theme = ThemeService::new();
        }

        {
            let mut auto_score = state_guard.auto_score.write();
            *auto_score = AutoScoreService::new();
        }
    }

    let _ = app_handle.emit(
        "settings:changed",
        serde_json::json!({
            "key": "is_wizard_completed",
            "value": false
        }),
    );

    Ok(IpcResponse::success_empty())
}
