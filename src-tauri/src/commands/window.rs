use parking_lot::RwLock;
use std::sync::Arc;
use tauri::AppHandle;
#[cfg(desktop)]
use tauri::Manager;

use crate::state::AppState;

#[tauri::command]
pub async fn window_minimize(
    app: AppHandle,
    _state: tauri::State<'_, Arc<RwLock<AppState>>>,
) -> Result<(), String> {
    #[cfg(not(desktop))]
    {
        let _ = app;
    }

    #[cfg(desktop)]
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
    #[cfg(not(desktop))]
    {
        let _ = app;
        return Ok(false);
    }

    #[cfg(desktop)]
    {
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
}

#[tauri::command]
pub async fn window_close(
    app: AppHandle,
    _state: tauri::State<'_, Arc<RwLock<AppState>>>,
) -> Result<(), String> {
    #[cfg(not(desktop))]
    {
        let _ = app;
    }

    #[cfg(desktop)]
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
    #[cfg(not(desktop))]
    {
        let _ = app;
        return Ok(false);
    }

    #[cfg(desktop)]
    {
        if let Some(window) = app.get_webview_window("main") {
            window.is_maximized().map_err(|e| e.to_string())
        } else {
            Ok(false)
        }
    }
}

#[tauri::command]
pub async fn toggle_devtools(
    app: AppHandle,
    _state: tauri::State<'_, Arc<RwLock<AppState>>>,
) -> Result<(), String> {
    #[cfg(not(desktop))]
    {
        let _ = app;
    }

    #[cfg(debug_assertions)]
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
    #[cfg(not(desktop))]
    {
        let _ = (width, height, app);
    }

    #[cfg(desktop)]
    if let Some(window) = app.get_webview_window("main") {
        window
            .set_size(tauri::Size::Logical(tauri::LogicalSize {
                width: width as f64,
                height: height as f64,
            }))
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub async fn window_set_resizable(
    resizable: bool,
    app: AppHandle,
    _state: tauri::State<'_, Arc<RwLock<AppState>>>,
) -> Result<(), String> {
    #[cfg(not(desktop))]
    {
        let _ = (resizable, app);
    }

    #[cfg(desktop)]
    if let Some(window) = app.get_webview_window("main") {
        window.set_resizable(resizable).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub async fn window_start_dragging(
    app: AppHandle,
    _state: tauri::State<'_, Arc<RwLock<AppState>>>,
) -> Result<(), String> {
    #[cfg(not(desktop))]
    {
        let _ = app;
    }

    #[cfg(desktop)]
    if let Some(window) = app.get_webview_window("main") {
        window.start_dragging().map_err(|e| e.to_string())?;
    }
    Ok(())
}
