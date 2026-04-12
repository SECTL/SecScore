use parking_lot::RwLock;
use std::path::PathBuf;
use std::sync::Arc;
use tauri::State;

use crate::services::plugin::{
    Plugin, PluginManifest, PluginRuntimeModule, PluginService, PluginStats,
};
use crate::services::PermissionLevel;
use crate::state::AppState;

use super::response::IpcResponse;

fn check_admin_permission(state: &Arc<RwLock<AppState>>, sender_id: Option<u32>) -> bool {
    let state_guard = state.read();
    let mut permissions = state_guard.permissions.write();
    let id = sender_id.unwrap_or(0);
    permissions.require_permission(id, PermissionLevel::Admin)
}

#[tauri::command]
pub fn plugin_get_all(state: State<'_, Arc<RwLock<AppState>>>) -> Result<IpcResponse<Vec<Plugin>>, String> {
    let state_guard = state.read();
    let plugins = state_guard.plugins.read();
    let all_plugins = (*plugins).get_all_plugins().to_vec();
    Ok(IpcResponse::success(all_plugins))
}

#[tauri::command]
pub fn plugin_get(
    plugin_id: String,
    state: State<'_, Arc<RwLock<AppState>>>,
) -> Result<IpcResponse<Plugin>, String> {
    let state_guard = state.read();
    let plugins = state_guard.plugins.read();

    match plugins.get_plugin(&plugin_id) {
        Some(plugin) => Ok(IpcResponse::success(plugin.clone())),
        None => Ok(IpcResponse::error("Plugin not found")),
    }
}

#[tauri::command]
pub fn plugin_get_stats(state: State<'_, Arc<RwLock<AppState>>>) -> Result<IpcResponse<PluginStats>, String> {
    let state_guard = state.read();
    let plugins = state_guard.plugins.read();
    let stats = plugins.get_plugin_stats();
    Ok(IpcResponse::success(stats))
}

#[tauri::command]
pub fn plugin_toggle(
    plugin_id: String,
    enabled: bool,
    sender_id: Option<u32>,
    state: State<'_, Arc<RwLock<AppState>>>,
) -> Result<IpcResponse<()>, String> {
    if !check_admin_permission(&state, sender_id) {
        return Ok(IpcResponse::error("Permission denied: admin required"));
    }
    let state_guard = state.read();
    let mut plugins = state_guard.plugins.write();
    plugins.toggle_plugin(&plugin_id, enabled)?;
    Ok(IpcResponse::success(()))
}

#[tauri::command]
pub fn plugin_install(
    manifest: PluginManifest,
    plugin_dir: PathBuf,
    sender_id: Option<u32>,
    state: State<'_, Arc<RwLock<AppState>>>,
) -> Result<IpcResponse<Plugin>, String> {
    if !check_admin_permission(&state, sender_id) {
        return Ok(IpcResponse::error("Permission denied: admin required"));
    }
    let state_guard = state.read();
    let mut plugins = state_guard.plugins.write();
    let plugin = plugins.install_plugin(&state_guard.app_handle, manifest, plugin_dir)?;
    Ok(IpcResponse::success(plugin))
}

#[tauri::command]
pub fn plugin_uninstall(
    plugin_id: String,
    sender_id: Option<u32>,
    state: State<'_, Arc<RwLock<AppState>>>,
) -> Result<IpcResponse<()>, String> {
    if !check_admin_permission(&state, sender_id) {
        return Ok(IpcResponse::error("Permission denied: admin required"));
    }
    let state_guard = state.read();
    let mut plugins = state_guard.plugins.write();
    plugins.uninstall_plugin(&plugin_id)?;
    Ok(IpcResponse::success(()))
}

#[tauri::command]
pub fn plugin_load_manifest(
    path: PathBuf,
    sender_id: Option<u32>,
    state: State<'_, Arc<RwLock<AppState>>>,
) -> Result<IpcResponse<PluginManifest>, String> {
    if !check_admin_permission(&state, sender_id) {
        return Ok(IpcResponse::error("Permission denied: admin required"));
    }
    let manifest = PluginService::load_plugin_manifest(&path)?;
    Ok(IpcResponse::success(manifest))
}

#[tauri::command]
pub fn plugin_get_dir(
    plugin_id: String,
    state: State<'_, Arc<RwLock<AppState>>>,
) -> Result<IpcResponse<String>, String> {
    let state_guard = state.read();
    let plugins = state_guard.plugins.read();

    match plugins.get_plugin_dir(&plugin_id) {
        Some(dir) => Ok(IpcResponse::success(dir.to_string_lossy().to_string())),
        None => Ok(IpcResponse::error("Plugin not found")),
    }
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginListItem {
    pub id: String,
    pub name: String,
    pub version: String,
    pub description: Option<String>,
    pub author: Option<String>,
    pub enabled: bool,
}

impl From<Plugin> for PluginListItem {
    fn from(plugin: Plugin) -> Self {
        Self {
            id: plugin.id,
            name: plugin.name,
            version: plugin.version,
            description: plugin.description,
            author: plugin.author,
            enabled: plugin.enabled,
        }
    }
}

#[tauri::command]
pub fn plugin_get_list(state: State<'_, Arc<RwLock<AppState>>>) -> Result<IpcResponse<Vec<PluginListItem>>, String> {
    let state_guard = state.read();
    let plugins = state_guard.plugins.read();
    let list: Vec<PluginListItem> = (*plugins).get_all_plugins().iter().map(|p| (*p).clone().into()).collect();
    Ok(IpcResponse::success(list))
}

#[tauri::command]
pub fn plugin_get_runtime_modules(
    state: State<'_, Arc<RwLock<AppState>>>,
) -> Result<IpcResponse<Vec<PluginRuntimeModule>>, String> {
    let state_guard = state.read();
    let plugins = state_guard.plugins.read();
    let modules = plugins.get_runtime_modules()?;
    Ok(IpcResponse::success(modules))
}
