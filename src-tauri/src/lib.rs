pub mod commands;
pub mod db;
pub mod models;
pub mod services;
pub mod state;
pub mod utils;

use crate::db::connection::create_sqlite_connection;
use tauri::{
    image::Image,
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    App, Manager, WindowEvent,
};

pub fn setup_app(app: &mut App) -> Result<(), Box<dyn std::error::Error>> {
    #[cfg(desktop)]
    {
        let _ = app;
    }

    setup_database(app)?;

    setup_tray(app)?;

    setup_window_events(app)?;

    Ok(())
}

fn setup_database(app: &mut App) -> Result<(), Box<dyn std::error::Error>> {
    let handle = app.handle().clone();
    let db_path = if cfg!(debug_assertions) {
        std::path::PathBuf::from("data.sql")
    } else {
        let app_data_dir = handle
            .path()
            .app_data_dir()
            .map_err(|e| format!("Failed to get app data directory: {}", e))?;
        let data_dir = app_data_dir.join("data");
        std::fs::create_dir_all(&data_dir)
            .map_err(|e| format!("Failed to create data directory: {}", e))?;
        data_dir.join("data.sql")
    };

    let db_path_str = db_path
        .to_str()
        .ok_or("Invalid database path")?
        .to_string();

    tauri::async_runtime::spawn(async move {
        match create_sqlite_connection(&db_path_str).await {
            Ok(conn) => {
                let state = handle.state::<crate::state::SafeAppState>();
                let state_guard = state.write();
                let mut db_guard = state_guard.db.write();
                *db_guard = Some(conn);
                eprintln!("Database connected to: {}", db_path_str);
            }
            Err(e) => {
                eprintln!("Failed to connect to database: {}", e);
            }
        }
    });

    Ok(())
}

fn setup_tray(app: &mut App) -> Result<(), Box<dyn std::error::Error>> {
    let show_item = MenuItem::with_id(app, "show", "显示窗口", true, None::<&str>)?;
    let hide_item = MenuItem::with_id(app, "hide", "隐藏窗口", true, None::<&str>)?;
    let quit_item = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;

    let menu = Menu::with_items(app, &[&show_item, &hide_item, &quit_item])?;

    let _tray = TrayIconBuilder::new()
        .icon(Image::from_bytes(include_bytes!("../icons/icon.png"))?)
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
            "hide" => {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.hide();
                }
            }
            "quit" => {
                app.exit(0);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let app = tray.app_handle();
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
        })
        .build(app)?;

    Ok(())
}

fn setup_window_events(app: &mut App) -> Result<(), Box<dyn std::error::Error>> {
    if let Some(window) = app.get_webview_window("main") {
        let window_clone = window.clone();
        window.on_window_event(move |event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window_clone.hide();
            }
        });
    }

    Ok(())
}
