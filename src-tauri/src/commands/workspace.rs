use parking_lot::RwLock;
use std::sync::Arc;
use tauri::{Emitter, State};

use crate::services::WorkspaceState;
use crate::state::AppState;

use super::response::IpcResponse;

async fn emit_workspace_changed(state: &Arc<RwLock<AppState>>) -> Result<WorkspaceState, String> {
    let state_guard = state.read();
    let workspace = state_guard
        .workspace
        .write()
        .clone()
        .ok_or_else(|| "工作空间尚未初始化".to_string())?;
    let next = workspace.list_state().await?;
    state_guard
        .app_handle
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
}

#[tauri::command]
pub async fn workspace_get_state(
    state: State<'_, Arc<RwLock<AppState>>>,
) -> Result<IpcResponse<WorkspaceState>, String> {
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
pub async fn workspace_mark_class_online(
    class_id: String,
    remote_id: String,
    join_code: String,
    state: State<'_, Arc<RwLock<AppState>>>,
) -> Result<IpcResponse<WorkspaceState>, String> {
    let state_arc = state.inner().clone();
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
