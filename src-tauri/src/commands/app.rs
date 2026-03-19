use parking_lot::RwLock;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::AppHandle;

use crate::state::AppState;

use super::response::IpcResponse;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RegisterUrlProtocolResult {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub registered: Option<bool>,
}

#[tauri::command]
pub async fn register_url_protocol(
    app: AppHandle,
    _state: tauri::State<'_, Arc<RwLock<AppState>>>,
) -> Result<IpcResponse<RegisterUrlProtocolResult>, String> {
    #[cfg(target_os = "windows")]
    let protocol = "secscore";

    #[cfg(target_os = "windows")]
    {
        use std::process::Command;

        let exe_path = std::env::current_exe()
            .map_err(|e| format!("Failed to get executable path: {}", e))?;

        let exe_path_str = exe_path.to_string_lossy();

        let reg_command = format!(
            r#"reg add "HKCU\Software\Classes\{}" /ve /d "URL:SecScore Protocol" /f"#,
            protocol
        );

        let reg_command2 = format!(
            r#"reg add "HKCU\Software\Classes\{}\DefaultIcon" /ve /d "{},1" /f"#,
            protocol, exe_path_str
        );

        let reg_command3 = format!(
            r#"reg add "HKCU\Software\Classes\{}\shell\open\command" /ve /d "\"{}\" \"%%1\"" /f"#,
            protocol, exe_path_str
        );

        let _ = Command::new("cmd")
            .args(["/C", &reg_command])
            .output();

        let _ = Command::new("cmd")
            .args(["/C", &reg_command2])
            .output();

        let _ = Command::new("cmd")
            .args(["/C", &reg_command3])
            .output();

        let _ = app;

        return Ok(IpcResponse::success(RegisterUrlProtocolResult {
            registered: Some(true),
        }));
    }

    #[cfg(target_os = "macos")]
    {
        let _ = app;
        return Ok(IpcResponse::success(RegisterUrlProtocolResult {
            registered: Some(false),
        }));
    }

    #[cfg(target_os = "linux")]
    {
        let _ = app;
        return Ok(IpcResponse::success(RegisterUrlProtocolResult {
            registered: Some(false),
        }));
    }

    #[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
    {
        let _ = app;
        Ok(IpcResponse::error("URL protocol registration is not supported on this platform"))
    }
}

#[tauri::command]
pub async fn app_quit(
    app: AppHandle,
    _state: tauri::State<'_, Arc<RwLock<AppState>>>,
) -> Result<(), String> {
    app.exit(0);
    Ok(())
}

#[tauri::command]
pub async fn app_restart(
    app: AppHandle,
    _state: tauri::State<'_, Arc<RwLock<AppState>>>,
) -> Result<(), String> {
    app.restart();
}
