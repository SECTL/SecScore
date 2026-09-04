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

/// 脱离 Tauri 进程启动系统浏览器，避免 shell 插件在 macOS 上等待 open 命令结束。
#[tauri::command]
pub async fn oauth_open_browser(url: String) -> Result<IpcResponse<()>, String> {
    #[cfg(target_os = "macos")]
    let result = std::process::Command::new("open").arg(&url).spawn();

    #[cfg(target_os = "windows")]
    let result = {
        use std::os::windows::ffi::OsStrExt;
        use windows_sys::Win32::UI::Shell::ShellExecuteW;
        use windows_sys::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;

        let operation: Vec<u16> = std::ffi::OsStr::new("open")
            .encode_wide()
            .chain(std::iter::once(0))
            .collect();
        let url_wide: Vec<u16> = std::ffi::OsStr::new(&url)
            .encode_wide()
            .chain(std::iter::once(0))
            .collect();

        // 不经过 cmd.exe，避免 URL 中的 `&` 被当作命令分隔符，导致
        // redirect_uri、state 等 OAuth 参数被截断。
        let shell_result = unsafe {
            ShellExecuteW(
                std::ptr::null_mut(),
                operation.as_ptr(),
                url_wide.as_ptr(),
                std::ptr::null(),
                std::ptr::null(),
                SW_SHOWNORMAL,
            )
        };

        if (shell_result as isize) > 32 {
            Ok(())
        } else {
            Err(std::io::Error::new(
                std::io::ErrorKind::Other,
                format!("ShellExecuteW 返回错误码 {}", shell_result as isize),
            ))
        }
    };

    #[cfg(target_os = "linux")]
    let result = std::process::Command::new("xdg-open").arg(&url).spawn();

    result
        .map(|_| IpcResponse::success(()))
        .map_err(|error| format!("启动系统浏览器失败: {}", error))
}

/// 将前端 OAuth 错误转发到 Tauri 后端输出，便于排查服务端返回结果。
#[tauri::command]
pub fn oauth_log_error(message: String) -> Result<IpcResponse<()>, String> {
    eprintln!("[OAuth Frontend Error] {}", message);
    Ok(IpcResponse::success(()))
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

#[derive(Clone, Copy)]
enum CallbackPageStatus {
    Received,
    Error,
    Invalid,
}

fn render_callback_page(status: CallbackPageStatus) -> String {
    let (title, heading, message, tone, icon_path) = match status {
        CallbackPageStatus::Received => (
            "OAuth 授权结果",
            "已收到授权结果",
            "请返回 SecScore 查看登录结果",
            "#2ba471",
            "M5 13l4 4L19 7",
        ),
        CallbackPageStatus::Error => (
            "OAuth 授权未完成",
            "授权未完成",
            "请返回 SecScore 查看错误信息并重试",
            "#d54941",
            "M6 6l12 12M18 6L6 18",
        ),
        CallbackPageStatus::Invalid => (
            "无效的 OAuth 回调",
            "无效的授权回调",
            "请返回 SecScore 重新发起登录",
            "#d9822b",
            "M12 8v5m0 3h.01",
        ),
    };

    format!(
        r#"<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{title}</title>
  <style>
    * {{ box-sizing: border-box; }}
    body {{
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      padding: 24px;
      background: #f4f7fb;
      color: #181818;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif;
    }}
    main {{
      width: min(100%, 420px);
      padding: 40px 32px;
      text-align: center;
      background: #ffffff;
      border: 1px solid #dfe5ec;
      border-radius: 12px;
    }}
    .icon {{
      width: 56px;
      height: 56px;
      display: grid;
      place-items: center;
      margin: 0 auto 20px;
      border-radius: 50%;
      background: {tone}12;
      color: {tone};
    }}
    svg {{ width: 28px; height: 28px; }}
    h1 {{ margin: 0 0 12px; font-size: 24px; font-weight: 600; line-height: 1.35; }}
    p {{ margin: 0; color: #5f6670; font-size: 15px; line-height: 1.7; }}
    .hint {{ margin-top: 18px; color: #8b929b; font-size: 13px; }}
  </style>
</head>
<body>
  <main>
    <div class="icon" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="{icon_path}" />
      </svg>
    </div>
    <h1>{heading}</h1>
    <p>{message}</p>
    <p class="hint">现在可以关闭此页面</p>
  </main>
</body>
</html>"#
    )
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
        "[OAuth Callback] 收到回调 - has_code: {}, has_state: {}, error: {}",
        code.is_some(),
        state.is_some(),
        error.as_deref().unwrap_or("none")
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

    let page_status = if error.is_some() {
        CallbackPageStatus::Error
    } else if code.is_some() && state.is_some() {
        CallbackPageStatus::Received
    } else {
        CallbackPageStatus::Invalid
    };
    let response_html = render_callback_page(page_status);

    (
        axum::http::StatusCode::OK,
        [
            (axum::http::header::CONTENT_TYPE, "text/html; charset=utf-8"),
            (axum::http::header::CACHE_CONTROL, "no-store"),
            (axum::http::header::X_CONTENT_TYPE_OPTIONS, "nosniff"),
        ],
        response_html,
    )
}

#[cfg(test)]
mod tests {
    use super::{render_callback_page, CallbackPageStatus};

    #[test]
    fn renders_received_callback_without_claiming_login_succeeded() {
        let html = render_callback_page(CallbackPageStatus::Received);
        assert!(html.contains("已收到授权结果"));
        assert!(!html.contains("登录成功"));
    }

    #[test]
    fn renders_error_and_invalid_callback_states() {
        assert!(render_callback_page(CallbackPageStatus::Error).contains("授权未完成"));
        assert!(render_callback_page(CallbackPageStatus::Invalid).contains("无效的授权回调"));
    }

    #[test]
    fn callback_page_does_not_contain_credentials() {
        for status in [
            CallbackPageStatus::Received,
            CallbackPageStatus::Error,
            CallbackPageStatus::Invalid,
        ] {
            let html = render_callback_page(status);
            assert!(!html.contains("code="));
            assert!(!html.contains("state="));
            assert!(!html.contains("error_description"));
        }
    }
}
