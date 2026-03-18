use parking_lot::RwLock;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, State};

use crate::services::{PermissionLevel, SettingsKey, SettingsValue, ThemeConfig};
use crate::state::AppState;

use super::response::IpcResponse;

fn check_admin_permission(
    permissions: &mut crate::services::PermissionService,
    sender_id: Option<u32>,
) -> bool {
    let id = sender_id.unwrap_or(0);
    permissions.require_permission(id, PermissionLevel::Admin)
}

#[tauri::command]
pub async fn theme_list(
    state: State<'_, Arc<RwLock<AppState>>>,
) -> Result<IpcResponse<Vec<ThemeConfig>>, String> {
    let state_guard = state.read();
    let theme_service = state_guard.theme.read();
    let themes = theme_service.get_theme_list();
    Ok(IpcResponse::success(themes))
}

#[tauri::command]
pub async fn theme_current(
    state: State<'_, Arc<RwLock<AppState>>>,
) -> Result<IpcResponse<ThemeConfig>, String> {
    let state_guard = state.read();
    let theme_service = state_guard.theme.read();
    match theme_service.get_current_theme() {
        Some(theme) => Ok(IpcResponse::success(theme)),
        None => Ok(IpcResponse::error("No current theme found")),
    }
}

#[tauri::command]
pub async fn theme_set(
    theme_id: String,
    sender_id: Option<u32>,
    app_handle: AppHandle,
    state: State<'_, Arc<RwLock<AppState>>>,
) -> Result<IpcResponse<()>, String> {
    {
        let state_guard = state.read();
        let mut permissions = state_guard.permissions.write();
        if !check_admin_permission(&mut permissions, sender_id) {
            return Ok(IpcResponse::error("Permission denied: admin required"));
        }
    }

    let current_theme = {
        let state_guard = state.read();
        let mut theme_service = state_guard.theme.write();
        let mut settings = state_guard.settings.write();

        if theme_service.set_current_theme(&theme_id) {
            let _ = settings
                .set_value(
                    SettingsKey::CurrentThemeId,
                    SettingsValue::String(theme_id.clone()),
                )
                .await;
            theme_service.get_current_theme()
        } else {
            return Ok(IpcResponse::error("Theme not found"));
        }
    };

    if let Some(theme) = current_theme {
        let _ = app_handle.emit("theme:updated", &theme);
    }

    Ok(IpcResponse::success(()))
}

#[tauri::command]
pub async fn theme_save(
    theme: ThemeConfig,
    sender_id: Option<u32>,
    app_handle: AppHandle,
    state: State<'_, Arc<RwLock<AppState>>>,
) -> Result<IpcResponse<()>, String> {
    {
        let state_guard = state.read();
        let mut permissions = state_guard.permissions.write();
        if !check_admin_permission(&mut permissions, sender_id) {
            return Ok(IpcResponse::error("Permission denied: admin required"));
        }
    }

    let current_theme = {
        let state_guard = state.read();
        let mut theme_service = state_guard.theme.write();
        let mut settings = state_guard.settings.write();

        match theme_service.save_theme(theme) {
            Ok(()) => {
                let custom_themes_json = theme_service.get_custom_themes_json();
                let _ = settings
                    .set_value(
                        SettingsKey::ThemesCustom,
                        SettingsValue::Json(custom_themes_json),
                    )
                    .await;
                theme_service.get_current_theme()
            }
            Err(e) => return Ok(IpcResponse::error(&e)),
        }
    };

    if let Some(theme) = current_theme {
        let _ = app_handle.emit("theme:updated", &theme);
    }

    Ok(IpcResponse::success(()))
}

#[tauri::command]
pub async fn theme_delete(
    theme_id: String,
    sender_id: Option<u32>,
    app_handle: AppHandle,
    state: State<'_, Arc<RwLock<AppState>>>,
) -> Result<IpcResponse<()>, String> {
    {
        let state_guard = state.read();
        let mut permissions = state_guard.permissions.write();
        if !check_admin_permission(&mut permissions, sender_id) {
            return Ok(IpcResponse::error("Permission denied: admin required"));
        }
    }

    let current_theme = {
        let state_guard = state.read();
        let mut theme_service = state_guard.theme.write();
        let mut settings = state_guard.settings.write();

        match theme_service.delete_theme(&theme_id) {
            Ok(()) => {
                let custom_themes_json = theme_service.get_custom_themes_json();
                let _ = settings
                    .set_value(
                        SettingsKey::ThemesCustom,
                        SettingsValue::Json(custom_themes_json),
                    )
                    .await;

                let current_theme_id = theme_service.get_current_theme_id().to_string();
                let _ = settings
                    .set_value(
                        SettingsKey::CurrentThemeId,
                        SettingsValue::String(current_theme_id),
                    )
                    .await;
                theme_service.get_current_theme()
            }
            Err(e) => return Ok(IpcResponse::error(&e)),
        }
    };

    if let Some(theme) = current_theme {
        let _ = app_handle.emit("theme:updated", &theme);
    }

    Ok(IpcResponse::success(()))
}
