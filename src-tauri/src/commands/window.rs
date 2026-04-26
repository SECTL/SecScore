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

    #[cfg(all(debug_assertions, desktop))]
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

#[tauri::command]
pub async fn open_settings_window(app: AppHandle) -> Result<(), String> {
    #[cfg(not(desktop))]
    {
        let _ = app;
        return Err("Not supported on mobile".to_string());
    }

    #[cfg(desktop)]
    {
        // 检查设置窗口是否已存在
        if let Some(window) = app.get_webview_window("settings") {
            // 如果窗口已存在，将其置于前台
            window.set_focus().map_err(|e| e.to_string())?;
            return Ok(());
        }

        // 创建新的设置窗口
        let window = tauri::WebviewWindowBuilder::new(
            &app,
            "settings",
            tauri::WebviewUrl::App("/settings-window".into()),
        )
        .title("SecScore 设置")
        .inner_size(900.0, 650.0)
        .min_inner_size(700.0, 500.0)
        .center()
        .decorations(false)
        .transparent(false)
        .resizable(true)
        .build()
        .map_err(|e| e.to_string())?;

        // 在开发模式下打开开发者工具
        #[cfg(debug_assertions)]
        window.open_devtools();

        Ok(())
    }
}

#[tauri::command]
pub async fn close_settings_window(app: AppHandle) -> Result<(), String> {
    #[cfg(not(desktop))]
    {
        let _ = app;
        return Ok(());
    }

    #[cfg(desktop)]
    {
        if let Some(window) = app.get_webview_window("settings") {
            window.close().map_err(|e| e.to_string())?;
        }
        Ok(())
    }
}
