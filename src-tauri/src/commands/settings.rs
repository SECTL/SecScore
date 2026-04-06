use parking_lot::RwLock;
use serde::{Deserialize, Serialize};
use serde_json::Value as JsonValue;
use std::collections::BTreeSet;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, State};
#[cfg(any(target_os = "linux", target_os = "macos"))]
use std::process::Command;
#[cfg(target_os = "windows")]
use winreg::enums::HKEY_LOCAL_MACHINE;
#[cfg(target_os = "windows")]
use winreg::RegKey;

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
    let db_conn = state_guard.db.read().clone();
    let mut settings = state_guard.settings.write();
    settings.attach_db(db_conn);
    settings.initialize().await.map_err(|e| e.to_string())?;
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
    let db_conn = state_guard.db.read().clone();
    let mut settings = state_guard.settings.write();
    settings.attach_db(db_conn);
    settings.initialize().await.map_err(|e| e.to_string())?;
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
        let db_conn = state_guard.db.read().clone();
        let mut settings = state_guard.settings.write();
        settings.attach_db(db_conn);
        settings.initialize().await.map_err(|e| e.to_string())?;
        settings
            .set_value(settings_key, settings_value)
            .await
            .map_err(|e| e.to_string())?;
    }

    if settings_key == SettingsKey::AutoScoreRules {
        let state_guard = state.read();
        let mut auto_score = state_guard.auto_score.write();
        auto_score.load_rules(value.clone());
        let _ = app_handle.emit("auto-score:rulesChanged", auto_score.get_rules());
    }

    let change = SettingChange {
        key: key.clone(),
        value,
    };

    let _ = app_handle.emit("settings:changed", &change);

    Ok(IpcResponse::success(()))
}

fn normalize_font_name(value: &str) -> String {
    value
        .trim()
        .trim_start_matches('@')
        .replace(" (TrueType)", "")
        .replace(" (OpenType)", "")
        .replace(" (All res)", "")
        .trim()
        .to_string()
}

#[cfg(target_os = "windows")]
fn query_system_fonts() -> Vec<String> {
    let mut families = BTreeSet::new();

    let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
    let key = hklm.open_subkey(r"SOFTWARE\Microsoft\Windows NT\CurrentVersion\Fonts");
    let Ok(key) = key else {
        return Vec::new();
    };

    for (value_name, _) in key.enum_values().flatten() {
        let name = normalize_font_name(&value_name);
        if name.is_empty() {
            continue;
        }
        families.insert(name);
    }

    families.into_iter().collect()
}

#[cfg(target_os = "linux")]
fn query_system_fonts() -> Vec<String> {
    let output = Command::new("fc-list").args([":", "family"]).output();
    let Ok(output) = output else {
        return Vec::new();
    };
    if !output.status.success() {
        return Vec::new();
    }

    let mut families = BTreeSet::new();
    let stdout = String::from_utf8_lossy(&output.stdout);
    for line in stdout.lines() {
        for part in line.split(',') {
            let name = normalize_font_name(part);
            if !name.is_empty() {
                families.insert(name);
            }
        }
    }
    families.into_iter().collect()
}

#[cfg(target_os = "macos")]
fn query_system_fonts() -> Vec<String> {
    let output = Command::new("system_profiler")
        .args(["SPFontsDataType", "-detailLevel", "mini"])
        .output();
    let Ok(output) = output else {
        return Vec::new();
    };
    if !output.status.success() {
        return Vec::new();
    }

    let mut families = BTreeSet::new();
    let stdout = String::from_utf8_lossy(&output.stdout);
    for line in stdout.lines() {
        let trimmed = line.trim();
        if let Some(name) = trimmed.strip_prefix("Full Name:") {
            let normalized = normalize_font_name(name);
            if !normalized.is_empty() {
                families.insert(normalized);
            }
        }
    }
    families.into_iter().collect()
}

#[cfg(not(any(target_os = "windows", target_os = "linux", target_os = "macos")))]
fn query_system_fonts() -> Vec<String> {
    Vec::new()
}

#[tauri::command]
pub async fn settings_get_system_fonts() -> Result<IpcResponse<Vec<String>>, String> {
    Ok(IpcResponse::success(query_system_fonts()))
}
