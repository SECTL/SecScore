use parking_lot::RwLock;
use serde::{Deserialize, Serialize};
use serde_json::Value as JsonValue;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, State};

use crate::services::{
    settings::{
        PermissionRequirement, SettingValueKind, SettingsKey, SettingsService, SettingsSpec,
        SettingsValue,
    },
    PermissionLevel, PermissionService,
};
use crate::state::AppState;

use super::response::IpcResponse;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SettingChange {
    pub key: String,
    pub value: JsonValue,
}

fn get_write_permission(key: SettingsKey) -> PermissionRequirement {
    let definitions = SettingsService::get_definitions();
    if let Some(def) = definitions.get(&key) {
        def.write_permission
    } else {
        PermissionRequirement::Any
    }
}

fn check_write_permission(
    permissions: &mut PermissionService,
    sender_id: Option<u32>,
    requirement: PermissionRequirement,
) -> bool {
    match requirement {
        PermissionRequirement::Any => true,
        PermissionRequirement::Admin => {
            let id = sender_id.unwrap_or(0);
            permissions.require_permission(id, PermissionLevel::Admin)
        }
        PermissionRequirement::Points => {
            let id = sender_id.unwrap_or(0);
            permissions.require_permission(id, PermissionLevel::Points)
        }
        PermissionRequirement::View => true,
    }
}

fn settings_value_to_json(value: SettingsValue) -> JsonValue {
    match value {
        SettingsValue::Boolean(b) => JsonValue::Bool(b),
        SettingsValue::String(s) => JsonValue::String(s),
        SettingsValue::Number(n) => JsonValue::Number(
            serde_json::Number::from_f64(n).unwrap_or(serde_json::Number::from(0)),
        ),
        SettingsValue::Json(j) => j,
    }
}

fn json_to_settings_value(json: JsonValue, kind: SettingValueKind) -> SettingsValue {
    match kind {
        SettingValueKind::Boolean => SettingsValue::Boolean(json.as_bool().unwrap_or(false)),
        SettingValueKind::String => SettingsValue::String(json.as_str().unwrap_or("").to_string()),
        SettingValueKind::Number => SettingsValue::Number(json.as_f64().unwrap_or(0.0)),
        SettingValueKind::Json => SettingsValue::Json(json),
    }
}

#[tauri::command]
pub async fn settings_get_all(
    state: State<'_, Arc<RwLock<AppState>>>,
) -> Result<IpcResponse<SettingsSpec>, String> {
    let state_guard = state.read();
    let settings = state_guard.settings.read();
    let all = settings.get_all();
    Ok(IpcResponse::success(all))
}

#[tauri::command]
pub async fn settings_get(
    key: String,
    state: State<'_, Arc<RwLock<AppState>>>,
) -> Result<IpcResponse<JsonValue>, String> {
    let settings_key =
        SettingsKey::from_str(&key).ok_or_else(|| format!("Unknown setting key: {}", key))?;

    let state_guard = state.read();
    let settings = state_guard.settings.read();
    let value = settings.get_value(settings_key);
    let json_value = settings_value_to_json(value);

    Ok(IpcResponse::success(json_value))
}

#[tauri::command]
pub async fn settings_set(
    key: String,
    value: JsonValue,
    sender_id: Option<u32>,
    app_handle: AppHandle,
    state: State<'_, Arc<RwLock<AppState>>>,
) -> Result<IpcResponse<()>, String> {
    let settings_key =
        SettingsKey::from_str(&key).ok_or_else(|| format!("Unknown setting key: {}", key))?;

    let write_permission = get_write_permission(settings_key);

    {
        let state_guard = state.read();
        let mut permissions = state_guard.permissions.write();
        if !check_write_permission(&mut permissions, sender_id, write_permission) {
            return Ok(IpcResponse::error("Permission denied"));
        }
    }

    let definitions = SettingsService::get_definitions();
    let kind = definitions
        .get(&settings_key)
        .map(|d| d.kind)
        .unwrap_or(SettingValueKind::String);

    let settings_value = json_to_settings_value(value.clone(), kind);

    {
        let state_guard = state.read();
        let mut settings = state_guard.settings.write();
        settings
            .set_value(settings_key, settings_value)
            .await
            .map_err(|e| e.to_string())?;
    }

    let change = SettingChange {
        key: key.clone(),
        value,
    };

    let _ = app_handle.emit("settings:changed", &change);

    Ok(IpcResponse::success(()))
}
