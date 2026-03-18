use parking_lot::RwLock;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::State;

use crate::services::{
    auth::{AuthService, SetPasswordsPayload},
    SecurityService,
};
use crate::state::AppState;

use super::response::IpcResponse;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthStatusResponse {
    pub permission: String,
    pub has_admin_password: bool,
    pub has_points_password: bool,
    pub has_recovery_string: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LoginResponse {
    pub permission: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SetPasswordsResponse {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub recovery_string: Option<String>,
}

fn get_iv_hex() -> String {
    SecurityService::generate_iv_hex()
}

#[tauri::command]
pub async fn auth_get_status(
    sender_id: Option<u32>,
    state: State<'_, Arc<RwLock<AppState>>>,
) -> Result<IpcResponse<AuthStatusResponse>, String> {
    let state_guard = state.read();
    let db_conn = state_guard.db.read().clone();
    let mut settings = state_guard.settings.write();
    settings.attach_db(db_conn);
    settings.initialize().await?;
    let mut permissions = state_guard.permissions.write();

    let status = AuthService::get_status(&settings, sender_id, &mut permissions);

    let response = AuthStatusResponse {
        permission: status.permission,
        has_admin_password: status.has_admin_password,
        has_points_password: status.has_points_password,
        has_recovery_string: status.has_recovery_string,
    };

    Ok(IpcResponse::success(response))
}

#[tauri::command]
pub async fn auth_login(
    password: String,
    sender_id: Option<u32>,
    state: State<'_, Arc<RwLock<AppState>>>,
) -> Result<IpcResponse<LoginResponse>, String> {
    let sender = sender_id.unwrap_or(0);

    let iv_hex = get_iv_hex();

    let result = {
        let state_guard = state.read();
        let db_conn = state_guard.db.read().clone();
        let mut settings = state_guard.settings.write();
        settings.attach_db(db_conn);
        settings.initialize().await?;
        let security = state_guard.security.read();
        let mut permissions = state_guard.permissions.write();

        AuthService::login(
            &mut settings,
            &security,
            &mut permissions,
            sender,
            &password,
            &iv_hex,
        )
        .await
    };

    if result.success {
        Ok(IpcResponse::success(LoginResponse {
            permission: result.permission.unwrap_or_else(|| "view".to_string()),
        }))
    } else {
        Ok(IpcResponse::failure_with_type(
            &result.message.unwrap_or_else(|| "Login failed".to_string()),
        ))
    }
}

#[tauri::command]
pub async fn auth_logout(
    sender_id: Option<u32>,
    state: State<'_, Arc<RwLock<AppState>>>,
) -> Result<IpcResponse<LoginResponse>, String> {
    let default_permission = {
        let state_guard = state.read();
        let mut permissions = state_guard.permissions.write();

        if let Some(id) = sender_id {
            let level = AuthService::logout(&mut permissions, id);
            level.as_str().to_string()
        } else {
            permissions.get_default_permission().as_str().to_string()
        }
    };

    Ok(IpcResponse::success(LoginResponse {
        permission: default_permission,
    }))
}

#[tauri::command]
pub async fn auth_set_passwords(
    admin_password: Option<String>,
    points_password: Option<String>,
    sender_id: Option<u32>,
    state: State<'_, Arc<RwLock<AppState>>>,
) -> Result<IpcResponse<SetPasswordsResponse>, String> {
    let sender = sender_id.unwrap_or(0);

    let iv_hex = get_iv_hex();

    let payload = SetPasswordsPayload {
        admin_password,
        points_password,
    };

    let result = {
        let state_guard = state.read();
        let db_conn = state_guard.db.read().clone();
        let mut settings = state_guard.settings.write();
        settings.attach_db(db_conn);
        settings.initialize().await?;
        let security = state_guard.security.read();
        let mut permissions = state_guard.permissions.write();

        AuthService::set_passwords(
            &mut settings,
            &security,
            &mut permissions,
            sender,
            payload,
            &iv_hex,
        )
        .await
    };

    if result.success {
        Ok(IpcResponse::success(SetPasswordsResponse {
            recovery_string: result.recovery_string,
        }))
    } else {
        Ok(IpcResponse::failure_with_type(
            &result
                .message
                .unwrap_or_else(|| "Failed to set passwords".to_string()),
        ))
    }
}

#[tauri::command]
pub async fn auth_generate_recovery(
    sender_id: Option<u32>,
    state: State<'_, Arc<RwLock<AppState>>>,
) -> Result<IpcResponse<SetPasswordsResponse>, String> {
    let sender = sender_id.unwrap_or(0);

    let iv_hex = get_iv_hex();

    let result = {
        let state_guard = state.read();
        let db_conn = state_guard.db.read().clone();
        let mut settings = state_guard.settings.write();
        settings.attach_db(db_conn);
        settings.initialize().await?;
        let security = state_guard.security.read();
        let mut permissions = state_guard.permissions.write();

        AuthService::generate_recovery(&mut settings, &security, &mut permissions, sender, &iv_hex)
            .await
    };

    if result.success {
        Ok(IpcResponse::success(SetPasswordsResponse {
            recovery_string: result.recovery_string,
        }))
    } else {
        Ok(IpcResponse::failure_with_type(
            &result
                .message
                .unwrap_or_else(|| "Failed to generate recovery".to_string()),
        ))
    }
}

#[tauri::command]
pub async fn auth_reset_by_recovery(
    recovery_string: String,
    sender_id: Option<u32>,
    state: State<'_, Arc<RwLock<AppState>>>,
) -> Result<IpcResponse<SetPasswordsResponse>, String> {
    let sender = sender_id.unwrap_or(0);

    let iv_hex = get_iv_hex();

    let result = {
        let state_guard = state.read();
        let db_conn = state_guard.db.read().clone();
        let mut settings = state_guard.settings.write();
        settings.attach_db(db_conn);
        settings.initialize().await?;
        let security = state_guard.security.read();
        let mut permissions = state_guard.permissions.write();

        AuthService::reset_by_recovery(
            &mut settings,
            &security,
            &mut permissions,
            sender,
            &recovery_string,
            &iv_hex,
        )
        .await
    };

    if result.success {
        Ok(IpcResponse::success(SetPasswordsResponse {
            recovery_string: result.recovery_string,
        }))
    } else {
        Ok(IpcResponse::failure_with_type(
            &result
                .message
                .unwrap_or_else(|| "Recovery failed".to_string()),
        ))
    }
}

#[tauri::command]
pub async fn auth_clear_all(
    sender_id: Option<u32>,
    state: State<'_, Arc<RwLock<AppState>>>,
) -> Result<IpcResponse<()>, String> {
    let sender = sender_id.unwrap_or(0);

    let result = {
        let state_guard = state.read();
        let db_conn = state_guard.db.read().clone();
        let mut settings = state_guard.settings.write();
        settings.attach_db(db_conn);
        settings.initialize().await?;
        let mut permissions = state_guard.permissions.write();

        AuthService::clear_all(&mut settings, &mut permissions, sender).await
    };

    match result {
        Ok(()) => Ok(IpcResponse::success(())),
        Err(e) => Ok(IpcResponse::error(&e)),
    }
}
