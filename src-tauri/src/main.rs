#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use parking_lot::RwLock;
use secscore::{commands::*, setup_app, state::AppState};
use std::sync::Arc;
use tauri::Manager;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
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
            tags_get_all,
            tags_get_by_student,
            tags_create,
            tags_delete,
            tags_update_student_tags,
            reason_query,
            reason_create,
            reason_update,
            reason_delete,
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
            auth_get_status,
            auth_login,
            auth_logout,
            auth_set_passwords,
            auth_generate_recovery,
            auth_reset_by_recovery,
            auth_clear_all,
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
            log_query,
            log_clear,
            log_set_level,
            log_write,
            data_export_json,
            data_import_json,
            window_minimize,
            window_maximize,
            window_close,
            window_is_maximized,
            toggle_devtools,
            window_resize,
            db_test_connection,
            db_switch_connection,
            db_get_status,
            db_sync,
            fs_get_config_structure,
            fs_read_json,
            fs_write_json,
            fs_read_text,
            fs_write_text,
            fs_delete_file,
            fs_list_files,
            fs_file_exists,
            http_server_start,
            http_server_stop,
            http_server_status,
            register_url_protocol,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
