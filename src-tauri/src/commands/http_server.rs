use parking_lot::RwLock;
use serde::{Deserialize, Serialize};
use std::net::SocketAddr;
use std::sync::Arc;
use tauri::State;
use tokio::sync::Mutex;

use crate::services::permission::PermissionLevel;
use crate::state::AppState;

use super::response::IpcResponse;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HttpServerConfig {
    pub port: u16,
    pub host: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cors_origin: Option<String>,
}

impl Default for HttpServerConfig {
    fn default() -> Self {
        Self {
            port: 3000,
            host: "127.0.0.1".to_string(),
            cors_origin: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HttpServerStartResult {
    pub url: String,
    pub config: HttpServerConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HttpServerStatus {
    pub is_running: bool,
    pub config: HttpServerConfig,
    pub url: Option<String>,
}

pub struct HttpServerState {
    pub is_running: bool,
    pub config: HttpServerConfig,
    pub url: Option<String>,
}

impl Default for HttpServerState {
    fn default() -> Self {
        Self {
            is_running: false,
            config: HttpServerConfig::default(),
            url: None,
        }
    }
}

fn check_admin_permission(state: &Arc<RwLock<AppState>>) -> Result<(), String> {
    let state_guard = state.read();
    let mut permissions = state_guard.permissions.write();
    let sender_id = 0;
    if !permissions.require_permission(sender_id, PermissionLevel::Admin) {
        return Err("Permission denied: Admin required".to_string());
    }
    Ok(())
}

static HTTP_SERVER_STATE: once_cell::sync::Lazy<Arc<Mutex<HttpServerState>>> =
    once_cell::sync::Lazy::new(|| Arc::new(Mutex::new(HttpServerState::default())));

#[tauri::command]
pub async fn http_server_start(
    config: Option<HttpServerConfig>,
    state: State<'_, Arc<RwLock<AppState>>>,
) -> Result<IpcResponse<HttpServerStartResult>, String> {
    check_admin_permission(&state)?;

    let mut server_state = HTTP_SERVER_STATE.lock().await;

    if server_state.is_running {
        return Ok(IpcResponse::failure_with_type(
            "HTTP server is already running",
        ));
    }

    let config = config.unwrap_or_default();

    let host: std::net::IpAddr = config
        .host
        .parse()
        .map_err(|e| format!("Invalid host address: {}", e))?;
    let addr: SocketAddr = (host, config.port).into();

    let url = format!("http://{}:{}", config.host, config.port);

    server_state.is_running = true;
    server_state.config = config.clone();
    server_state.url = Some(url.clone());

    let _ = addr;

    Ok(IpcResponse::success(HttpServerStartResult { url, config }))
}

#[tauri::command]
pub async fn http_server_stop(
    state: State<'_, Arc<RwLock<AppState>>>,
) -> Result<IpcResponse<()>, String> {
    check_admin_permission(&state)?;

    let mut server_state = HTTP_SERVER_STATE.lock().await;

    if !server_state.is_running {
        return Ok(IpcResponse::success_empty());
    }

    server_state.is_running = false;
    server_state.url = None;

    Ok(IpcResponse::success_empty())
}

#[tauri::command]
pub async fn http_server_status(
    _state: State<'_, Arc<RwLock<AppState>>>,
) -> Result<IpcResponse<HttpServerStatus>, String> {
    let server_state = HTTP_SERVER_STATE.lock().await;

    let status = HttpServerStatus {
        is_running: server_state.is_running,
        config: server_state.config.clone(),
        url: server_state.url.clone(),
    };

    Ok(IpcResponse::success(status))
}
