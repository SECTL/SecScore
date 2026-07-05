use parking_lot::RwLock;
use serde::{Deserialize, Serialize};
use std::net::SocketAddr;
use std::sync::Arc;
use tauri::Emitter;
use tauri::State;
use tokio::sync::Mutex;
use tokio::task::JoinHandle;

use crate::state::AppState;

use super::response::IpcResponse;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OAuthServerStartResult {
    pub url: String,
    pub port: u16,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OAuthCallbackResult {
    pub code: Option<String>,
    pub state: Option<String>,
    pub error: Option<String>,
    pub error_description: Option<String>,
}

/// 持有回调服务器任务的 JoinHandle，用于在停止时硬中止任务以立即释放端口。
static OAUTH_SERVER_HANDLE: once_cell::sync::Lazy<Arc<Mutex<Option<JoinHandle<()>>>>> =
    once_cell::sync::Lazy::new(|| Arc::new(Mutex::new(None)));

/// OAuth 本地回调服务器监听端口
const OAUTH_CALLBACK_PORT: u16 = 51267;

#[tauri::command]
pub async fn oauth_start_callback_server(
    app_handle: tauri::AppHandle,
    _state: State<'_, Arc<RwLock<AppState>>>,
) -> Result<IpcResponse<OAuthServerStartResult>, String> {
    let t0 = std::time::Instant::now();
    let log = |step: &str| {
        println!(
            "[OAuth Callback] {} +{}ms (wall={})",
            step,
            t0.elapsed().as_millis(),
            chrono::Local::now().format("%H:%M:%S%.3f")
        );
    };
    log("oauth_start_callback_server enter");

    let mut handle_guard = OAUTH_SERVER_HANDLE.lock().await;
    log("after acquire handle lock");

    // 如果服务器已经在运行，直接返回 URL
    if let Some(h) = handle_guard.as_ref() {
        if !h.is_finished() {
            let port = OAUTH_CALLBACK_PORT;
            let url = format!("http://localhost:{}/oauth/callback", port);
            log("server already running, return early");
            return Ok(IpcResponse::success(OAuthServerStartResult { url, port }));
        }
    }

    let port = OAUTH_CALLBACK_PORT;
    let addr: SocketAddr = ([127, 0, 0, 1], port).into();
    let url = format!("http://localhost:{}/oauth/callback", port);
    let url_for_spawn = url.clone();

    // 尝试绑定；若端口被占用，强杀占用进程后重试一次
    log("before TcpListener::bind");
    let listener = match tokio::net::TcpListener::bind(addr).await {
        Ok(l) => {
            log("after TcpListener::bind (ok)");
            l
        }
        Err(e) => {
            if e.kind() == std::io::ErrorKind::AddrInUse {
                println!(
                    "[OAuth Callback] 端口 {} 被占用，尝试强杀占用进程 +{}ms",
                    port,
                    t0.elapsed().as_millis()
                );
                if let Err(kill_err) = kill_processes_on_port(port).await {
                    eprintln!("[OAuth Callback] 强杀端口占用进程失败: {}", kill_err);
                }
                log("after kill_processes_on_port");
                // 给系统一点时间回收端口
                tokio::time::sleep(std::time::Duration::from_millis(300)).await;
                log("after sleep 300ms");
                tokio::net::TcpListener::bind(addr)
                    .await
                    .map_err(|e| format!("绑定回调服务器端口 {} 失败: {}", port, e))?
            } else {
                return Err(format!("绑定回调服务器端口 {} 失败: {}", port, e));
            }
        }
    };

    let app_handle_clone = app_handle.clone();

    let join = tokio::spawn(async move {
        let app = axum::Router::new()
            .route("/oauth/callback", axum::routing::get(handle_oauth_callback))
            .layer(axum::extract::Extension(app_handle_clone));

        println!("OAuth callback server started at {}", url_for_spawn);

        // 服务运行至此任务被 abort（drop listener → 释放端口）或自身结束
        axum::serve(listener, app).await.ok();
        println!("OAuth callback server task exited");
    });
    *handle_guard = Some(join);
    drop(handle_guard);
    log("after tokio::spawn, returning");

    Ok(IpcResponse::success(OAuthServerStartResult { url, port }))
}

/// 查找并强杀占用指定端口的进程。
/// macOS/Linux 使用 lsof (-n -P 跳过 DNS/端口名解析)，Windows 使用 netstat + taskkill。
/// 全程异步并带 5s 超时，避免 DNS 解析挂起导致命令阻塞数十秒。
async fn kill_processes_on_port(port: u16) -> Result<(), String> {
    let pids = find_pids_on_port(port).await?;
    for pid in pids {
        let _ = kill_pid(pid).await;
        println!("[OAuth Callback] 已强杀占用端口 {} 的进程 {}", port, pid);
    }
    Ok(())
}

#[cfg(unix)]
async fn find_pids_on_port(port: u16) -> Result<Vec<u32>, String> {
    use tokio::process::Command;
    let port_arg = format!(":{}", port);
    let output = tokio::time::timeout(
        std::time::Duration::from_secs(5),
        Command::new("lsof")
            .args(["-t", "-n", "-P", "-i", &port_arg])
            .output(),
    )
    .await
    .map_err(|_| format!("lsof 执行超时 (5s), 端口 {}", port))?
    .map_err(|e| format!("执行 lsof 失败: {}", e))?;
    let pids = String::from_utf8_lossy(&output.stdout)
        .lines()
        .filter_map(|line| line.trim().parse::<u32>().ok())
        .collect();
    Ok(pids)
}

#[cfg(windows)]
async fn find_pids_on_port(port: u16) -> Result<Vec<u32>, String> {
    use tokio::process::Command;
    let output = tokio::time::timeout(
        std::time::Duration::from_secs(5),
        Command::new("netstat").args(["-ano"]).output(),
    )
    .await
    .map_err(|_| format!("netstat 执行超时 (5s), 端口 {}", port))?
    .map_err(|e| format!("执行 netstat 失败: {}", e))?;
    let text = String::from_utf8_lossy(&output.stdout);
    let needle = format!(":{}", port);
    let mut pids = std::collections::HashSet::<u32>::new();
    for line in text.lines() {
        if line.contains(&needle) {
            let parts: Vec<&str> = line.split_whitespace().collect();
            if let Some(pid_str) = parts.last() {
                if let Ok(pid) = pid_str.parse::<u32>() {
                    pids.insert(pid);
                }
            }
        }
    }
    Ok(pids.into_iter().collect())
}

#[cfg(unix)]
async fn kill_pid(pid: u32) -> Result<(), String> {
    std::process::Command::new("kill")
        .args(["-9", &pid.to_string()])
        .status()
        .map_err(|e| format!("kill 失败: {}", e))?;
    Ok(())
}

#[cfg(windows)]
async fn kill_pid(pid: u32) -> Result<(), String> {
    std::process::Command::new("taskkill")
        .args(["/PID", &pid.to_string(), "/F"])
        .status()
        .map_err(|e| format!("taskkill 失败: {}", e))?;
    Ok(())
}

#[cfg(not(any(unix, windows)))]
async fn find_pids_on_port(_port: u16) -> Result<Vec<u32>, String> {
    Err("当前平台不支持强杀端口占用进程".into())
}
#[cfg(not(any(unix, windows)))]
async fn kill_pid(_pid: u32) -> Result<(), String> {
    Err("当前平台不支持强杀端口占用进程".into())
}

#[tauri::command]
pub async fn oauth_stop_callback_server(
    _state: State<'_, Arc<RwLock<AppState>>>,
) -> Result<IpcResponse<()>, String> {
    let mut handle_guard = OAUTH_SERVER_HANDLE.lock().await;

    if let Some(join) = handle_guard.take() {
        // 硬中止任务：drop 其持有的 listener，立即释放端口
        join.abort();
        println!("[OAuth Callback] 已中止回调服务器任务，端口已释放");
    }

    Ok(IpcResponse::success(()))
}

async fn handle_oauth_callback(
    axum::extract::Query(params): axum::extract::Query<std::collections::HashMap<String, String>>,
    axum::extract::Extension(app_handle): axum::extract::Extension<tauri::AppHandle>,
) -> impl axum::response::IntoResponse {
    let code = params.get("code").cloned();
    let state = params.get("state").cloned();
    let error = params.get("error").cloned();
    let error_description = params.get("error_description").cloned();

    println!(
        "[OAuth Callback] 收到回调 - code: {:?}, state: {:?}, error: {:?}",
        code, state, error
    );

    let result = OAuthCallbackResult {
        code: code.clone(),
        state: state.clone(),
        error: error.clone(),
        error_description: error_description.clone(),
    };

    match app_handle.emit("oauth-callback", result) {
        Ok(_) => println!("[OAuth Callback] Event 发送成功"),
        Err(e) => println!("[OAuth Callback] Event 发送失败：{:?}", e),
    }

    let html = r#"
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <title>OAuth 授权完成</title>
        <style>
            * {
                margin: 0;
                padding: 0;
                box-sizing: border-box;
            }
            body {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Microsoft YaHei', sans-serif;
                display: flex;
                justify-content: center;
                align-items: center;
                min-height: 100vh;
                background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
                color: #e4e4e4;
            }
            .container {
                text-align: center;
                padding: 48px 40px;
                background: rgba(255, 255, 255, 0.05);
                border-radius: 20px;
                backdrop-filter: blur(20px);
                box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3), 
                            0 0 0 1px rgba(255, 255, 255, 0.1) inset;
                animation: slideUp 0.5s ease-out;
            }
            @keyframes slideUp {
                from {
                    opacity: 0;
                    transform: translateY(20px);
                }
                to {
                    opacity: 1;
                    transform: translateY(0);
                }
            }
            .icon {
                width: 80px;
                height: 80px;
                margin: 0 auto 24px;
                background: linear-gradient(135deg, #4ade80 0%, #22c55e 100%);
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                box-shadow: 0 4px 20px rgba(74, 222, 128, 0.4);
                animation: scaleIn 0.5s ease-out 0.2s both;
            }
            @keyframes scaleIn {
                from {
                    opacity: 0;
                    transform: scale(0.5);
                }
                to {
                    opacity: 1;
                    transform: scale(1);
                }
            }
            .icon svg {
                width: 40px;
                height: 40px;
                color: white;
            }
            h1 {
                margin: 0 0 12px 0;
                font-size: 28px;
                font-weight: 600;
                background: linear-gradient(135deg, #4ade80 0%, #22c55e 100%);
                -webkit-background-clip: text;
                -webkit-text-fill-color: transparent;
                background-clip: text;
            }
            p {
                margin: 0;
                color: #a0a0a0;
                font-size: 15px;
                line-height: 1.6;
            }
            .hint {
                margin-top: 20px;
                font-size: 13px;
                color: #666;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="icon">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                </svg>
            </div>
            <h1>授权成功</h1>
            <p>请返回 SecScore 应用查看登录结果</p>
            <p class="hint">此窗口可以关闭</p>
        </div>
        <script>
            setTimeout(() => {
                window.close();
            }, 3000);
        </script>
    </body>
    </html>
    "#;

    let error_html = r#"
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <title>OAuth 授权失败</title>
        <style>
            * {
                margin: 0;
                padding: 0;
                box-sizing: border-box;
            }
            body {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Microsoft YaHei', sans-serif;
                display: flex;
                justify-content: center;
                align-items: center;
                min-height: 100vh;
                background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
                color: #e4e4e4;
            }
            .container {
                text-align: center;
                padding: 48px 40px;
                background: rgba(255, 255, 255, 0.05);
                border-radius: 20px;
                backdrop-filter: blur(20px);
                box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3), 
                            0 0 0 1px rgba(255, 255, 255, 0.1) inset;
                animation: slideUp 0.5s ease-out;
            }
            @keyframes slideUp {
                from {
                    opacity: 0;
                    transform: translateY(20px);
                }
                to {
                    opacity: 1;
                    transform: translateY(0);
                }
            }
            .icon {
                width: 80px;
                height: 80px;
                margin: 0 auto 24px;
                background: linear-gradient(135deg, #f87171 0%, #ef4444 100%);
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                box-shadow: 0 4px 20px rgba(248, 113, 113, 0.4);
                animation: scaleIn 0.5s ease-out 0.2s both;
            }
            @keyframes scaleIn {
                from {
                    opacity: 0;
                    transform: scale(0.5);
                }
                to {
                    opacity: 1;
                    transform: scale(1);
                }
            }
            .icon svg {
                width: 40px;
                height: 40px;
                color: white;
            }
            h1 {
                margin: 0 0 12px 0;
                font-size: 28px;
                font-weight: 600;
                background: linear-gradient(135deg, #f87171 0%, #ef4444 100%);
                -webkit-background-clip: text;
                -webkit-text-fill-color: transparent;
                background-clip: text;
            }
            p {
                margin: 0;
                color: #a0a0a0;
                font-size: 15px;
                line-height: 1.6;
            }
            .hint {
                margin-top: 20px;
                font-size: 13px;
                color: #666;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="icon">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
            </div>
            <h1>授权失败</h1>
            <p>请返回 SecScore 应用查看错误信息</p>
            <p class="hint">此窗口可以关闭</p>
        </div>
    </body>
    </html>
    "#;

    let response_html = if error.is_some() { error_html } else { html };

    (
        axum::http::StatusCode::OK,
        [(axum::http::header::CONTENT_TYPE, "text/html; charset=utf-8")],
        response_html,
    )
}
