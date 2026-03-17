use parking_lot::RwLock;
use std::sync::Arc;
use tauri::{AppHandle, Manager};

use crate::state::AppState;

#[tauri::command]
pub async fn window_minimize(
    app: AppHandle,
    _state: tauri::State<'_, Arc<RwLock<AppState>>>,
) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        window.minimize().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub async fn window_maximize(
    app: AppHandle,
    _state: tauri::State<'_, Arc<RwLock<AppState>>>,
) -> Result<bool, String> {
    if let Some(window) = app.get_webview_window("main") {
        let is_maximized = window.is_maximized().map_err(|e| e.to_string())?;

        if is_maximized {
            window.unmaximize().map_err(|e| e.to_string())?;
            Ok(false)
        } else {
            window.maximize().map_err(|e| e.to_string())?;
            Ok(true)
        }
    } else {
        Err("Window not found".to_string())
    }
}

#[tauri::command]
pub async fn window_close(
    app: AppHandle,
    _state: tauri::State<'_, Arc<RwLock<AppState>>>,
) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        window.hide().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub async fn window_is_maximized(
    app: AppHandle,
    _state: tauri::State<'_, Arc<RwLock<AppState>>>,
) -> Result<bool, String> {
    if let Some(window) = app.get_webview_window("main") {
        window.is_maximized().map_err(|e| e.to_string())
    } else {
        Ok(false)
    }
}

#[tauri::command]
pub async fn toggle_devtools(
    app: AppHandle,
    _state: tauri::State<'_, Arc<RwLock<AppState>>>,
) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        if window.is_devtools_open() {
            window.close_devtools();
        } else {
            window.open_devtools();
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn window_resize(
    width: u32,
    height: u32,
    app: AppHandle,
    _state: tauri::State<'_, Arc<RwLock<AppState>>>,
) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        window
            .set_size(tauri::Size::Physical(tauri::PhysicalSize { width, height }))
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}
