use parking_lot::RwLock;
use serde_json::Value;
use std::sync::Arc;
use tauri::{Emitter, State};

use crate::services::WorkspaceState;
use crate::state::AppState;

use super::response::IpcResponse;

fn mask_identifier(value: &str) -> String {
    let chars: Vec<char> = value.chars().collect();
    if chars.len() <= 8 {
        return "***".to_string();
    }
    format!(
        "{}…{}",
        chars[..4].iter().collect::<String>(),
        chars[chars.len() - 4..].iter().collect::<String>()
    )
}

fn workspace_log(state: &Arc<RwLock<AppState>>, event: &str, meta: Value) {
    let state_guard = state.read();
    state_guard
        .logger
        .read()
        .info_with_meta(&format!("[workspace] {}", event), meta);
}

async fn emit_workspace_changed(state: &Arc<RwLock<AppState>>) -> Result<WorkspaceState, String> {
    let (next, app_handle) = {
        let state_guard = state.read();
        let workspace = state_guard
            .workspace
            .write()
            .clone()
            .ok_or_else(|| "工作空间尚未初始化".to_string())?;
        let next = workspace.list_state().await?;
        (next, state_guard.app_handle.clone())
    };
    workspace_log(
        state,
        "state_changed",
        serde_json::json!({
            "account_count": next.accounts.len(),
            "class_count": next.classes.len(),
            "current_account_id": mask_identifier(&next.current_account_id),
            "current_class_id": mask_identifier(&next.current_class_id),
        }),
    );
    app_handle
        .emit("workspace:changed", &next)
        .map_err(|e| e.to_string())?;
    Ok(next)
}

fn replace_active_connection(
    state: &Arc<RwLock<AppState>>,
    connection: sea_orm::DatabaseConnection,
) {
    let state_guard = state.read();
    *state_guard.local_sqlite.write() = Some(connection.clone());
    *state_guard.db.write() = Some(connection.clone());
    state_guard.settings.write().attach_db(Some(connection));
    state_guard.logger.read().info_with_meta(
        "[workspace] active_class_database_replaced",
        serde_json::json!({ "message": "已切换当前班级数据库连接" }),
    );
}

#[tauri::command]
pub async fn workspace_get_state(
    state: State<'_, Arc<RwLock<AppState>>>,
) -> Result<IpcResponse<WorkspaceState>, String> {
    workspace_log(state.inner(), "get_state_requested", serde_json::json!({}));
    let state_guard = state.read();
    let workspace = state_guard
        .workspace
        .write()
        .clone()
        .ok_or_else(|| "工作空间尚未初始化".to_string())?;
    Ok(IpcResponse::success(workspace.list_state().await?))
}

#[tauri::command]
pub async fn workspace_create_local_class(
    name: String,
    state: State<'_, Arc<RwLock<AppState>>>,
) -> Result<IpcResponse<WorkspaceState>, String> {
    let state_arc = state.inner().clone();
    workspace_log(
        &state_arc,
        "create_local_class_requested",
        serde_json::json!({ "name_length": name.trim().chars().count() }),
    );
    let connection = {
        let state_guard = state_arc.read();
        let mut workspace = state_guard
            .workspace
            .write()
            .take()
            .ok_or_else(|| "工作空间尚未初始化".to_string())?;
        let result = workspace.create_local_class(name).await;
        *state_guard.workspace.write() = Some(workspace);
        result?
    };
    replace_active_connection(&state_arc, connection);
    Ok(IpcResponse::success(
        emit_workspace_changed(&state_arc).await?,
    ))
}

#[tauri::command]
pub async fn workspace_switch_class(
    class_id: String,
    state: State<'_, Arc<RwLock<AppState>>>,
) -> Result<IpcResponse<WorkspaceState>, String> {
    let state_arc = state.inner().clone();
    workspace_log(
        &state_arc,
        "switch_class_requested",
        serde_json::json!({ "class_id": mask_identifier(&class_id) }),
    );
    let connection = {
        let state_guard = state_arc.read();
        let mut workspace = state_guard
            .workspace
            .write()
            .take()
            .ok_or_else(|| "工作空间尚未初始化".to_string())?;
        let result = workspace.open_class(&class_id).await;
        *state_guard.workspace.write() = Some(workspace);
        result?
    };
    replace_active_connection(&state_arc, connection);
    Ok(IpcResponse::success(
        emit_workspace_changed(&state_arc).await?,
    ))
}

#[tauri::command]
pub async fn workspace_switch_account(
    account_id: String,
    state: State<'_, Arc<RwLock<AppState>>>,
) -> Result<IpcResponse<WorkspaceState>, String> {
    let state_arc = state.inner().clone();
    workspace_log(
        &state_arc,
        "switch_account_requested",
        serde_json::json!({ "account_id": mask_identifier(&account_id) }),
    );
    let connection = {
        let state_guard = state_arc.read();
        let mut workspace = state_guard
            .workspace
            .write()
            .take()
            .ok_or_else(|| "工作空间尚未初始化".to_string())?;
        let result = workspace.switch_account(&account_id).await;
        *state_guard.workspace.write() = Some(workspace);
        result?
    };
    replace_active_connection(&state_arc, connection);
    Ok(IpcResponse::success(
        emit_workspace_changed(&state_arc).await?,
    ))
}

#[tauri::command]
pub async fn workspace_upsert_sectl_account(
    user_id: String,
    name: String,
    email: Option<String>,
    state: State<'_, Arc<RwLock<AppState>>>,
) -> Result<IpcResponse<WorkspaceState>, String> {
    let state_arc = state.inner().clone();
    workspace_log(
        &state_arc,
        "upsert_sectl_account_requested",
        serde_json::json!({ "user_id": mask_identifier(&user_id) }),
    );
    let connection = {
        let state_guard = state_arc.read();
        let mut workspace = state_guard
            .workspace
            .write()
            .take()
            .ok_or_else(|| "工作空间尚未初始化".to_string())?;
        let result = workspace.upsert_sectl_account(user_id, name, email).await;
        *state_guard.workspace.write() = Some(workspace);
        result?
    };
    replace_active_connection(&state_arc, connection);
    Ok(IpcResponse::success(
        emit_workspace_changed(&state_arc).await?,
    ))
}

#[tauri::command]
pub async fn workspace_remove_account(
    account_id: String,
    state: State<'_, Arc<RwLock<AppState>>>,
) -> Result<IpcResponse<WorkspaceState>, String> {
    workspace_log(
        state.inner(),
        "remove_account_requested",
        serde_json::json!({ "account_id": mask_identifier(&account_id) }),
    );
    let state_guard = state.read();
    let mut workspace = state_guard
        .workspace
        .write()
        .take()
        .ok_or_else(|| "工作空间尚未初始化".to_string())?;
    workspace.remove_account(&account_id).await?;
    *state_guard.workspace.write() = Some(workspace);
    drop(state_guard);
    Ok(IpcResponse::success(
        emit_workspace_changed(state.inner()).await?,
    ))
}

#[tauri::command]
pub async fn workspace_add_online_class(
    name: String,
    remote_id: String,
    join_code: String,
    state: State<'_, Arc<RwLock<AppState>>>,
) -> Result<IpcResponse<WorkspaceState>, String> {
    let state_arc = state.inner().clone();
    workspace_log(
        &state_arc,
        "add_online_class_requested",
        serde_json::json!({ "remote_id": mask_identifier(&remote_id) }),
    );
    let connection = {
        let state_guard = state_arc.read();
        let mut workspace = state_guard
            .workspace
            .write()
            .take()
            .ok_or_else(|| "工作空间尚未初始化".to_string())?;
        let result = workspace.add_online_class(name, remote_id, join_code).await;
        *state_guard.workspace.write() = Some(workspace);
        result?
    };
    replace_active_connection(&state_arc, connection);
    Ok(IpcResponse::success(
        emit_workspace_changed(&state_arc).await?,
    ))
}

#[tauri::command]
pub async fn workspace_upsert_online_class(
    name: String,
    remote_id: String,
    join_code: String,
    status: String,
    state: State<'_, Arc<RwLock<AppState>>>,
) -> Result<IpcResponse<WorkspaceState>, String> {
    let state_arc = state.inner().clone();
    workspace_log(
        &state_arc,
        "upsert_online_class_requested",
        serde_json::json!({
            "remote_id": mask_identifier(&remote_id),
            "status": status,
        }),
    );
    let next = {
        let state_guard = state_arc.read();
        let mut workspace = state_guard
            .workspace
            .write()
            .take()
            .ok_or_else(|| "工作空间尚未初始化".to_string())?;
        let next = match workspace
            .upsert_online_class(name, remote_id, join_code, status)
            .await
        {
            Ok(_) => workspace.list_state().await,
            Err(error) => Err(error),
        };
        *state_guard.workspace.write() = Some(workspace);
        next?
    };
    let app_handle = state_arc.read().app_handle.clone();
    app_handle
        .emit("workspace:changed", &next)
        .map_err(|e| e.to_string())?;
    workspace_log(
        &state_arc,
        "upsert_online_class_complete",
        serde_json::json!({
            "class_count": next.classes.len(),
            "current_class_id": mask_identifier(&next.current_class_id),
        }),
    );
    Ok(IpcResponse::success(next))
}

#[tauri::command]
pub async fn workspace_mark_class_online(
    class_id: String,
    remote_id: String,
    join_code: String,
    state: State<'_, Arc<RwLock<AppState>>>,
) -> Result<IpcResponse<WorkspaceState>, String> {
    let state_arc = state.inner().clone();
    workspace_log(
        &state_arc,
        "mark_class_online_requested",
        serde_json::json!({ "class_id": mask_identifier(&class_id), "remote_id": mask_identifier(&remote_id) }),
    );
    let connection = {
        let state_guard = state_arc.read();
        let mut workspace = state_guard
            .workspace
            .write()
            .take()
            .ok_or_else(|| "工作空间尚未初始化".to_string())?;
        let result = workspace
            .mark_class_online(class_id, remote_id, join_code)
            .await;
        *state_guard.workspace.write() = Some(workspace);
        result?
    };
    replace_active_connection(&state_arc, connection);
    Ok(IpcResponse::success(
        emit_workspace_changed(&state_arc).await?,
    ))
}

#[tauri::command]
pub async fn workspace_rename_class(
    class_id: String,
    name: String,
    state: State<'_, Arc<RwLock<AppState>>>,
) -> Result<IpcResponse<WorkspaceState>, String> {
    workspace_log(
        state.inner(),
        "rename_class_requested",
        serde_json::json!({ "class_id": mask_identifier(&class_id), "name_length": name.trim().chars().count() }),
    );
    let state_guard = state.read();
    let mut workspace = state_guard
        .workspace
        .write()
        .take()
        .ok_or_else(|| "工作空间尚未初始化".to_string())?;
    let result = workspace.rename_class(class_id, name).await;
    *state_guard.workspace.write() = Some(workspace);
    Ok(IpcResponse::success(result?))
}

#[tauri::command]
pub async fn workspace_update_class_code(
    class_id: String,
    join_code: String,
    state: State<'_, Arc<RwLock<AppState>>>,
) -> Result<IpcResponse<WorkspaceState>, String> {
    workspace_log(
        state.inner(),
        "update_class_code_requested",
        serde_json::json!({ "class_id": mask_identifier(&class_id) }),
    );
    let state_guard = state.read();
    let mut workspace = state_guard
        .workspace
        .write()
        .take()
        .ok_or_else(|| "工作空间尚未初始化".to_string())?;
    let result = workspace.update_class_code(class_id, join_code).await;
    *state_guard.workspace.write() = Some(workspace);
    Ok(IpcResponse::success(result?))
}

#[tauri::command]
pub async fn workspace_mark_class_deleted(
    class_id: String,
    state: State<'_, Arc<RwLock<AppState>>>,
) -> Result<IpcResponse<WorkspaceState>, String> {
    workspace_log(
        state.inner(),
        "mark_class_deleted_requested",
        serde_json::json!({ "class_id": mask_identifier(&class_id) }),
    );
    let state_guard = state.read();
    let mut workspace = state_guard
        .workspace
        .write()
        .take()
        .ok_or_else(|| "工作空间尚未初始化".to_string())?;
    let result = workspace.mark_class_deleted(class_id).await;
    *state_guard.workspace.write() = Some(workspace);
    Ok(IpcResponse::success(result?))
}

#[tauri::command]
pub async fn workspace_leave_class(
    class_id: String,
    state: State<'_, Arc<RwLock<AppState>>>,
) -> Result<IpcResponse<WorkspaceState>, String> {
    workspace_log(
        state.inner(),
        "leave_class_requested",
        serde_json::json!({ "class_id": mask_identifier(&class_id) }),
    );
    let state_arc = state.inner().clone();
    let connection = {
        let state_guard = state_arc.read();
        let mut workspace = state_guard
            .workspace
            .write()
            .take()
            .ok_or_else(|| "工作空间尚未初始化".to_string())?;
        let result = workspace.leave_class(class_id).await;
        *state_guard.workspace.write() = Some(workspace);
        result?
    };
    replace_active_connection(&state_arc, connection);
    Ok(IpcResponse::success(
        emit_workspace_changed(&state_arc).await?,
    ))
}
