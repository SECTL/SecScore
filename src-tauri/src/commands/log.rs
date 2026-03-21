use parking_lot::RwLock;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::State;

use crate::services::logger::LogLevel;
use crate::services::permission::PermissionLevel;
use crate::state::AppState;

use super::response::IpcResponse;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LogWritePayload {
    pub level: String,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub meta: Option<serde_json::Value>,
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
pub async fn log_query(
    lines: Option<i32>,
    state: State<'_, Arc<RwLock<AppState>>>,
) -> Result<IpcResponse<Vec<String>>, String> {
    let lines = lines.unwrap_or(100) as usize;
    let state_guard = state.read();
    let logger = state_guard.logger.read();
    let logs = logger.read_logs(lines);

    Ok(IpcResponse::success(logs))
}

#[tauri::command]
pub async fn log_clear(state: State<'_, Arc<RwLock<AppState>>>) -> Result<IpcResponse<()>, String> {
    check_admin_permission(&state)?;

    let state_guard = state.read();
    let logger = state_guard.logger.read();
    logger.clear_logs().map_err(|e| e.to_string())?;

    Ok(IpcResponse::success_empty())
}

#[tauri::command]
pub async fn log_set_level(
    level: String,
    state: State<'_, Arc<RwLock<AppState>>>,
) -> Result<IpcResponse<()>, String> {
    check_admin_permission(&state)?;

    let log_level =
        LogLevel::from_str(&level).ok_or_else(|| format!("Invalid log level: {}", level))?;

    let state_guard = state.read();
    let mut logger = state_guard.logger.write();
    logger.set_level(log_level);

    Ok(IpcResponse::success_empty())
}

#[tauri::command]
pub async fn log_write(
    payload: LogWritePayload,
    state: State<'_, Arc<RwLock<AppState>>>,
) -> Result<IpcResponse<()>, String> {
    let log_level = LogLevel::from_str(&payload.level)
        .ok_or_else(|| format!("Invalid log level: {}", payload.level))?;

    let state_guard = state.read();
    let logger = state_guard.logger.read();
    logger.log(log_level, &payload.message, None, payload.meta);

    Ok(IpcResponse::success_empty())
}
