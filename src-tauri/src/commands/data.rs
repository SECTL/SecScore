use parking_lot::RwLock;
use std::sync::Arc;
use tauri::State;

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
