use parking_lot::RwLock;
use std::sync::Arc;
use tauri::{AppHandle, WebviewWindow};
#[cfg(desktop)]
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};

use crate::state::AppState;

#[tauri::command]
pub async fn window_minimize(
    window: WebviewWindow,
    _state: tauri::State<'_, Arc<RwLock<AppState>>>,
) -> Result<(), String> {
    #[cfg(not(desktop))]
    {
        let _ = window;
    }

    #[cfg(desktop)]
    {
        window.minimize().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub async fn window_maximize(
    window: WebviewWindow,
    _state: tauri::State<'_, Arc<RwLock<AppState>>>,
) -> Result<bool, String> {
    #[cfg(not(desktop))]
    {
        let _ = window;
        return Ok(false);
    }

    #[cfg(desktop)]
    {
        let is_maximized = window.is_maximized().map_err(|e| e.to_string())?;

        if is_maximized {
            window.unmaximize().map_err(|e| e.to_string())?;
            Ok(false)
        } else {
            window.maximize().map_err(|e| e.to_string())?;
            Ok(true)
        }
    }
}

#[tauri::command]
pub async fn window_close(
    window: WebviewWindow,
    _state: tauri::State<'_, Arc<RwLock<AppState>>>,
) -> Result<(), String> {
    #[cfg(not(desktop))]
    {
        let _ = window;
    }

    #[cfg(desktop)]
    {
        if window.label() == "main" {
            window.hide().map_err(|e| e.to_string())?;
        } else {
            window.close().map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn window_is_maximized(
    window: WebviewWindow,
    _state: tauri::State<'_, Arc<RwLock<AppState>>>,
) -> Result<bool, String> {
    #[cfg(not(desktop))]
    {
        let _ = window;
        return Ok(false);
    }

    #[cfg(desktop)]
    {
        window.is_maximized().map_err(|e| e.to_string())
    }
}

#[tauri::command]
pub async fn toggle_devtools(
    window: WebviewWindow,
    _state: tauri::State<'_, Arc<RwLock<AppState>>>,
) -> Result<(), String> {
    #[cfg(not(desktop))]
    {
        let _ = window;
    }

    #[cfg(all(debug_assertions, desktop))]
    {
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
    window: WebviewWindow,
    _state: tauri::State<'_, Arc<RwLock<AppState>>>,
) -> Result<(), String> {
    #[cfg(not(desktop))]
    {
        let _ = (width, height, window);
    }

    #[cfg(desktop)]
    {
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
    window: WebviewWindow,
    _state: tauri::State<'_, Arc<RwLock<AppState>>>,
) -> Result<(), String> {
    #[cfg(not(desktop))]
    {
        let _ = (resizable, window);
    }

    #[cfg(desktop)]
    {
        window.set_resizable(resizable).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub async fn window_start_dragging(
    window: WebviewWindow,
    _state: tauri::State<'_, Arc<RwLock<AppState>>>,
) -> Result<(), String> {
    #[cfg(not(desktop))]
    {
        let _ = window;
    }

    #[cfg(desktop)]
    {
        window.start_dragging().map_err(|e| e.to_string())?;
    }
    Ok(())
}

pub fn show_management_window(app: &AppHandle) -> Result<(), String> {
    #[cfg(not(desktop))]
    {
        let _ = app;
        return Ok(());
    }

    #[cfg(desktop)]
    {
        if let Some(window) = app.get_webview_window("management") {
            window.show().map_err(|e| e.to_string())?;
            window.set_focus().map_err(|e| e.to_string())?;
            return Ok(());
        }

        let window = WebviewWindowBuilder::new(
            app,
            "management",
            WebviewUrl::App("index.html?window=management#/students".into()),
        )
        .title("SecScore 管理")
        .inner_size(1180.0, 680.0)
        .min_inner_size(360.0, 640.0)
        .resizable(true)
        .decorations(true)
        .transparent(true)
        .hidden_title(true)
        .title_bar_style(tauri::TitleBarStyle::Overlay)
        .traffic_light_position(tauri::LogicalPosition::new(16.0, 22.0))
        .center()
        .build()
        .map_err(|e| e.to_string())?;

        #[cfg(target_os = "macos")]
        {
            let _ = window.set_shadow(true);
        }

        window.set_focus().map_err(|e| e.to_string())?;
        Ok(())
    }
}

#[tauri::command]
pub async fn window_open_management(
    app: AppHandle,
    _state: tauri::State<'_, Arc<RwLock<AppState>>>,
) -> Result<(), String> {
    show_management_window(&app)
}
