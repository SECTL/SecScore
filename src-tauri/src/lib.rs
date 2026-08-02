pub mod commands;
pub mod db;
pub mod models;
pub mod services;
pub mod state;
pub mod utils;

use crate::db::connection::DatabaseType;
use crate::db::migration::run_migration;
use crate::services::settings::{SettingsKey, SettingsValue};
use crate::services::WorkspaceService;
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
            student_fetch_banyou_cookie_with_browser,
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
            oauth_open_browser,
            oauth_log_error,
            oauth_stop_callback_server,
            oauth_report_online,
            oauth_get_device_uuid,
            oauth_get_storage_usage,
            oauth_save_login_state,
            oauth_load_login_state,
            oauth_clear_login_state,
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
            window_open_management,
            toggle_devtools,
            window_resize,
            window_set_resizable,
            db_test_connection,
            db_switch_connection,
            db_use_local_sqlite,
            db_get_status,
            workspace_get_state,
            workspace_create_local_class,
            workspace_switch_class,
            workspace_switch_account,
            workspace_upsert_sectl_account,
            workspace_remove_account,
            workspace_add_online_class,
            workspace_upsert_online_class,
            workspace_mark_class_online,
            workspace_rename_class,
            workspace_update_class_code,
            workspace_mark_class_deleted,
            workspace_leave_class,
            db_sync,
            db_sync_preview,
            db_sync_apply,
            sync_apply_remote_operation,
            sync_apply_snapshot,
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
            http_server_refresh_token,
            http_server_stop,
            http_server_status,
            mcp_server_start,
            mcp_server_stop,
            mcp_server_status,
            secagent_registration_status,
            secagent_register,
            register_url_protocol,
            check_url_protocol_status,
            unregister_url_protocol,
            check_elevation,
            request_elevation,
            app_quit,
            app_restart,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

pub fn setup_app(app: &mut App) -> Result<(), Box<dyn std::error::Error>> {
    // 主窗口由静态配置创建。Windows/Linux 在窗口显示前移除系统装饰，
    // 让前端的 ss-app-header 成为唯一标题栏；macOS 保留 Overlay 红绿灯。
    #[cfg(not(target_os = "macos"))]
    if let Some(window) = app.get_webview_window("main") {
        window.set_decorations(false)?;
    }

    setup_database(app)?;

    setup_tray(app)?;

    setup_window_events(app)?;

    setup_deep_link(app)?;

    setup_lan_http_server(app)?;

    Ok(())
}

fn setup_lan_http_server(app: &mut App) -> Result<(), Box<dyn std::error::Error>> {
    let handle = app.handle().clone();
    let state = handle.state::<crate::state::SafeAppState>().inner().clone();

    tauri::async_runtime::spawn(async move {
        let enabled = {
            let state_guard = state.read();
            let db_conn = state_guard.db.read().clone();
            let mut settings = state_guard.settings.write();
            settings.attach_db(db_conn);
            if settings.initialize().await.is_err() {
                false
            } else {
                matches!(
                    settings.get_value(SettingsKey::LanAccessEnabled),
                    SettingsValue::Boolean(true)
                )
            }
        };

        if enabled {
            if let Err(error) =
                crate::commands::http_server_start_from_settings(handle.clone(), state.clone())
                    .await
            {
                eprintln!("Failed to start LAN server from settings: {}", error);
            }
        }
    });

    Ok(())
}

fn setup_deep_link(app: &mut App) -> Result<(), Box<dyn std::error::Error>> {
    let handle = app.handle().clone();

    #[cfg(desktop)]
    {
        use tauri_plugin_deep_link::DeepLinkExt;

        // 静态配置在开发模式下不一定会被操作系统注册，显式注册可保证
        // `tauri:dev` 运行时也能接收 secscore:// 回调。
        app.deep_link().register_all()?;

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
    let handle = app.handle().clone();
    let legacy_path = if cfg!(all(debug_assertions, desktop)) {
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

    let workspace_root = if cfg!(all(debug_assertions, desktop)) {
        std::path::PathBuf::from(".secscore-workspace")
    } else {
        let app_data_dir = handle
            .path()
            .app_data_dir()
            .map_err(|e| format!("Failed to get app data directory: {}", e))?;
        app_data_dir.join("data").join("workspace")
    };
    let legacy_path_for_log = legacy_path.clone();
    let workspace_root_for_log = workspace_root.clone();

    let db_result = tauri::async_runtime::block_on(async {
        let state = handle.state::<crate::state::SafeAppState>();
        let state_guard = state.write();
        let (workspace, active_conn) =
            WorkspaceService::initialize(workspace_root, &legacy_path).await?;
        run_migration(&active_conn, DatabaseType::SQLite).await?;
        *state_guard.workspace.write() = Some(workspace);
        *state_guard.local_sqlite.write() = Some(active_conn.clone());
        *state_guard.db.write() = Some(active_conn.clone());
        {
            let mut settings = state_guard.settings.write();
            settings.attach_db(Some(active_conn));
            settings
                .initialize()
                .await
                .map_err(|e| format!("Failed to initialize settings from sqlite: {}", e))?;
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
            settings
                .set_value(
                    SettingsKey::SyncMethod,
                    SettingsValue::String("sectl_cloud_v2".to_string()),
                )
                .await
                .map_err(|err| format!("Failed to enable SECTL cloud sync: {}", err))?;
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
        eprintln!("Database bootstrap completed with isolated workspace SQLite files");
        let state = handle.state::<crate::state::SafeAppState>();
        state.read().logger.read().info_with_meta(
            "[workspace] database_bootstrap_complete",
            serde_json::json!({
                "legacy_path": legacy_path_for_log.display().to_string(),
                "workspace_root": workspace_root_for_log.display().to_string(),
                "storage_mode": "isolated_sqlite",
            }),
        );
    }

    Ok(())
}

#[cfg(desktop)]
fn setup_tray(app: &mut App) -> Result<(), Box<dyn std::error::Error>> {
    let show_item = MenuItem::with_id(app, "show", "显示窗口", true, None::<&str>)?;
    let management_item = MenuItem::with_id(app, "management", "打开管理页", true, None::<&str>)?;
    let hide_item = MenuItem::with_id(app, "hide", "隐藏窗口", true, None::<&str>)?;
    let quit_item = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;

    let menu = Menu::with_items(app, &[&show_item, &management_item, &hide_item, &quit_item])?;

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
            "management" => {
                let _ = show_management_window(app);
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
