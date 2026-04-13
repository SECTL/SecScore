pub mod commands;
pub mod db;
pub mod models;
pub mod services;
pub mod state;
pub mod utils;

use crate::db::connection::DatabaseType;
use crate::db::connection::{create_postgres_connection, create_sqlite_connection};
use crate::db::migration::run_migration;
use crate::services::settings::{SettingsKey, SettingsValue};
use crate::{commands::*, state::AppState};
use parking_lot::RwLock;
use std::sync::Arc;
use tauri::Emitter;
#[cfg(desktop)]
use tauri::{
    image::Image,
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    WindowEvent,
};
use tauri::{App, Manager};
use tokio::time::{timeout, Duration};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_deep_link::init())
        .setup(|app| {
            let state = AppState::new(app.handle().clone());
            app.manage(Arc::new(RwLock::new(state)));
            setup_app(app)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            student_query,
            student_create,
            student_update,
            student_delete,
            student_import_from_xlsx,
            student_fetch_banyou_classrooms,
            student_fetch_banyou_classroom_detail,
            tags_get_all,
            tags_get_by_student,
            tags_create,
            tags_delete,
            tags_update_student_tags,
            reason_query,
            reason_create,
            reason_update,
            reason_delete,
            reward_setting_query,
            reward_setting_create,
            reward_setting_update,
            reward_setting_delete,
            reward_redeem,
            reward_redemption_query,
            event_query,
            event_create,
            event_delete,
            event_query_by_student,
            leaderboard_query,
            db_settlement_query,
            db_settlement_create,
            db_settlement_leaderboard,
            settings_get_all,
            settings_get,
            settings_set,
            settings_get_system_fonts,
            auth_get_status,
            auth_login,
            auth_logout,
            auth_set_passwords,
            auth_generate_recovery,
            auth_reset_by_recovery,
            auth_clear_all,
            oauth_get_authorization_url,
            oauth_exchange_code,
            oauth_get_user_info,
            oauth_refresh_token,
            oauth_revoke_token,
            oauth_introspect_token,
            oauth_start_callback_server,
            oauth_stop_callback_server,
            oauth_report_online,
            oauth_get_device_uuid,
            theme_list,
            theme_current,
            theme_set,
            theme_save,
            theme_delete,
            auto_score_get_rules,
            auto_score_add_rule,
            auto_score_update_rule,
            auto_score_delete_rule,
            auto_score_toggle_rule,
            auto_score_get_status,
            auto_score_sort_rules,
            auto_score_query_batches,
            auto_score_rollback_batch,
            auto_score_apply_backfill,
            board_get_configs,
            board_save_configs,
            board_query_sql,
            log_query,
            log_clear,
            log_set_level,
            log_write,
            plugin_get_all,
            plugin_get,
            plugin_get_stats,
            plugin_toggle,
            plugin_install,
            plugin_uninstall,
            plugin_load_manifest,
            plugin_get_dir,
            plugin_get_list,
            plugin_get_runtime_modules,
            data_export_json,
            data_import_json,
            window_minimize,
            window_maximize,
            window_close,
            window_is_maximized,
            toggle_devtools,
            window_resize,
            window_set_resizable,
            db_test_connection,
            db_switch_connection,
            db_get_status,
            db_sync,
            db_sync_preview,
            db_sync_apply,
            fs_get_config_structure,
            fs_read_json,
            fs_write_json,
            fs_read_text,
            fs_write_text,
            fs_delete_file,
            fs_list_files,
            fs_file_exists,
            fs_open_path,
            http_server_start,
            http_server_stop,
            http_server_status,
            mcp_server_start,
            mcp_server_stop,
            mcp_server_status,
            register_url_protocol,
            app_quit,
            app_restart,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

pub fn setup_app(app: &mut App) -> Result<(), Box<dyn std::error::Error>> {
    setup_database(app)?;

    setup_tray(app)?;

    setup_window_events(app)?;

    setup_deep_link(app)?;

    Ok(())
}

fn setup_deep_link(app: &mut App) -> Result<(), Box<dyn std::error::Error>> {
    let handle = app.handle().clone();

    #[cfg(desktop)]
    {
        use tauri_plugin_deep_link::DeepLinkExt;

        app.deep_link().on_open_url(move |event| {
            let url = event
                .urls()
                .first()
                .map(|u| u.to_string())
                .unwrap_or_default();
            if !url.is_empty() {
                let _ = handle.emit("deep-link://new-url", url);
            }
        });
    }

    Ok(())
}

fn setup_database(app: &mut App) -> Result<(), Box<dyn std::error::Error>> {
    const DB_CONNECT_TIMEOUT_SECS: u64 = 15;
    const DB_MIGRATION_TIMEOUT_SECS: u64 = 20;

    let handle = app.handle().clone();
    let db_path = if cfg!(all(debug_assertions, desktop)) {
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

    let db_path_str = db_path.to_str().ok_or("Invalid database path")?.to_string();

    let db_result = tauri::async_runtime::block_on(async {
        let sqlite_conn = create_sqlite_connection(&db_path_str).await?;
        run_migration(&sqlite_conn, DatabaseType::SQLite).await?;

        let state = handle.state::<crate::state::SafeAppState>();
        let state_guard = state.write();
        let mut active_conn = sqlite_conn.clone();

        {
            let mut settings = state_guard.settings.write();
            settings.attach_db(Some(sqlite_conn.clone()));
            settings
                .initialize()
                .await
                .map_err(|e| format!("Failed to initialize settings from sqlite: {}", e))?;

            let pg_connection_string = match settings.get_value(SettingsKey::PgConnectionString) {
                SettingsValue::String(s) => s,
                _ => String::new(),
            };

            if !pg_connection_string.trim().is_empty() {
                match timeout(
                    Duration::from_secs(DB_CONNECT_TIMEOUT_SECS),
                    create_postgres_connection(&pg_connection_string),
                )
                .await
                {
                    Err(_) => {
                        let timeout_message = "PostgreSQL auto-connect timeout".to_string();
                        eprintln!(
                            "PostgreSQL auto-connect timed out on startup, fallback to sqlite"
                        );
                        settings
                            .set_value(
                                SettingsKey::PgConnectionStatus,
                                SettingsValue::Json(serde_json::json!({
                                    "connected": false,
                                    "type": "sqlite",
                                    "error": timeout_message
                                })),
                            )
                            .await
                            .map_err(|err| format!("Failed to save pg status: {}", err))?;
                    }
                    Ok(Err(e)) => {
                        eprintln!("PostgreSQL auto-connect failed, fallback to sqlite: {}", e);
                        settings
                            .set_value(
                                SettingsKey::PgConnectionStatus,
                                SettingsValue::Json(serde_json::json!({
                                    "connected": false,
                                    "type": "sqlite",
                                    "error": e.to_string()
                                })),
                            )
                            .await
                            .map_err(|err| format!("Failed to save pg status: {}", err))?;
                    }
                    Ok(Ok(pg_conn)) => {
                        let migration_result = timeout(
                            Duration::from_secs(DB_MIGRATION_TIMEOUT_SECS),
                            run_migration(&pg_conn, DatabaseType::PostgreSQL),
                        )
                        .await;

                        if let Err(_) = migration_result {
                            let timeout_message = "PostgreSQL migration timeout".to_string();
                            eprintln!(
                                "PostgreSQL migration timed out on startup, fallback to sqlite"
                            );
                            settings
                                .set_value(
                                    SettingsKey::PgConnectionStatus,
                                    SettingsValue::Json(serde_json::json!({
                                        "connected": false,
                                        "type": "sqlite",
                                        "error": timeout_message
                                    })),
                                )
                                .await
                                .map_err(|err| format!("Failed to save pg status: {}", err))?;
                        } else if let Ok(Err(e)) = migration_result {
                            eprintln!(
                                "PostgreSQL migration failed on startup, fallback to sqlite: {}",
                                e
                            );
                            settings
                                .set_value(
                                    SettingsKey::PgConnectionStatus,
                                    SettingsValue::Json(serde_json::json!({
                                        "connected": false,
                                        "type": "sqlite",
                                        "error": e.to_string()
                                    })),
                                )
                                .await
                                .map_err(|err| format!("Failed to save pg status: {}", err))?;
                        } else {
                            active_conn = pg_conn;
                            settings
                                .set_value(
                                    SettingsKey::PgConnectionStatus,
                                    SettingsValue::Json(serde_json::json!({
                                        "connected": true,
                                        "type": "postgresql"
                                    })),
                                )
                                .await
                                .map_err(|err| format!("Failed to save pg status: {}", err))?;
                            eprintln!("Auto connected to PostgreSQL from saved connection string");
                        }
                    }
                }
            } else {
                settings
                    .set_value(
                        SettingsKey::PgConnectionStatus,
                        SettingsValue::Json(serde_json::json!({
                            "connected": true,
                            "type": "sqlite"
                        })),
                    )
                    .await
                    .map_err(|err| format!("Failed to save sqlite status: {}", err))?;
            }
        }

        {
            let mut db_guard = state_guard.db.write();
            *db_guard = Some(active_conn);
        }

        state_guard
            .initialize()
            .await
            .map_err(|e| format!("Failed to initialize app state: {}", e))?;

        Ok::<_, Box<dyn std::error::Error>>(())
    });

    if let Err(e) = db_result {
        eprintln!("Failed to connect to database: {}", e);
    } else {
        eprintln!(
            "Database bootstrap completed, sqlite settings db: {}",
            db_path_str
        );
    }

    Ok(())
}

#[cfg(desktop)]
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

#[cfg(not(desktop))]
fn setup_tray(_app: &mut App) -> Result<(), Box<dyn std::error::Error>> {
    Ok(())
}

#[cfg(desktop)]
fn setup_window_events(app: &mut App) -> Result<(), Box<dyn std::error::Error>> {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.set_size(tauri::Size::Logical(tauri::LogicalSize {
            width: 1180.0,
            height: 680.0,
        }));
        let _ = window.center();

        #[cfg(target_os = "macos")]
        {
            let _ = window.set_shadow(true);
        }

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

#[cfg(not(desktop))]
fn setup_window_events(_app: &mut App) -> Result<(), Box<dyn std::error::Error>> {
    Ok(())
}
