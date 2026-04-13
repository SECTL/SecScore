use parking_lot::RwLock;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::State;

use crate::services::{
    auth::{AuthService, SetPasswordsPayload},
    SecurityService,
};
use crate::state::AppState;

use super::response::IpcResponse;

/// 生成标准 UUID v4
fn generate_uuid() -> String {
    use rand::Rng;
    let mut rng = rand::thread_rng();
    let mut bytes = [0u8; 16];
    rng.fill(&mut bytes);

    // UUID v4 版本和变体位设置
    bytes[6] = (bytes[6] & 0x0f) | 0x40; // 版本 4
    bytes[8] = (bytes[8] & 0x3f) | 0x80; // 变体 10

    format!(
        "{:02x}{:02x}{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}{:02x}{:02x}{:02x}{:02x}",
        bytes[0], bytes[1], bytes[2], bytes[3],
        bytes[4], bytes[5],
        bytes[6], bytes[7],
        bytes[8], bytes[9],
        bytes[10], bytes[11], bytes[12], bytes[13], bytes[14], bytes[15]
    )
}

/// 获取设备 UUID（从存储或生成新的）
fn get_or_create_device_uuid() -> String {
    // 尝试从存储中读取
    if let Ok(uuid) = std::fs::read_to_string(get_device_uuid_file_path()) {
        let uuid = uuid.trim();
        if is_valid_uuid(uuid) {
            return uuid.to_string();
        }
    }

    // 生成新的 UUID
    let new_uuid = generate_uuid();

    // 保存到文件
    let _ = std::fs::write(get_device_uuid_file_path(), &new_uuid);

    new_uuid
}

/// 获取设备 UUID 文件路径
fn get_device_uuid_file_path() -> std::path::PathBuf {
    let app_dir = dirs::config_dir()
        .map(|p| p.join("secscore"))
        .unwrap_or_else(|| std::path::PathBuf::from("."));
    // 确保目录存在
    let _ = std::fs::create_dir_all(&app_dir);
    app_dir.join("device_uuid")
}

/// 验证 UUID 格式
fn is_valid_uuid(uuid: &str) -> bool {
    uuid.len() == 36
        && uuid.chars().nth(8) == Some('-')
        && uuid.chars().nth(13) == Some('-')
        && uuid.chars().nth(18) == Some('-')
        && uuid.chars().nth(23) == Some('-')
}

/// 获取本机 IP 地址
async fn get_local_ip() -> Result<String, String> {
    // 尝试通过外部服务获取公网 IP
    match reqwest::get("https://api.ipify.org").await {
        Ok(response) => {
            if let Ok(ip) = response.text().await {
                return Ok(ip.trim().to_string());
            }
        }
        Err(_) => {}
    }

    // 备用：返回本地主机名
    Ok("127.0.0.1".to_string())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthStatusResponse {
    pub permission: String,
    pub has_admin_password: bool,
    pub has_points_password: bool,
    pub has_recovery_string: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LoginResponse {
    pub permission: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SetPasswordsResponse {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub recovery_string: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OAuthConfig {
    pub platform_id: String,
    pub platform_secret: String,
    pub callback_url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OAuthTokenResponse {
    pub access_token: String,
    pub refresh_token: String,
    pub token_type: String,
    pub expires_in: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OAuthUserInfo {
    pub user_id: String,
    pub email: String,
    pub name: String,
    pub github_username: Option<String>,
    pub permission: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OAuthIntrospectResponse {
    pub active: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub scope: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub client_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub username: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub token_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub exp: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub iat: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sub: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub aud: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub iss: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OAuthAuthorizationUrlResponse {
    pub url: String,
    pub state: String,
    pub code_verifier: String,
}

fn get_iv_hex() -> String {
    SecurityService::generate_iv_hex()
}

#[tauri::command]
pub async fn auth_get_status(
    sender_id: Option<u32>,
    state: State<'_, Arc<RwLock<AppState>>>,
) -> Result<IpcResponse<AuthStatusResponse>, String> {
    let state_guard = state.read();
    let db_conn = state_guard.db.read().clone();
    let mut settings = state_guard.settings.write();
    settings.attach_db(db_conn);
    settings.initialize().await?;
    let mut permissions = state_guard.permissions.write();

    let status = AuthService::get_status(&settings, sender_id, &mut permissions);

    let response = AuthStatusResponse {
        permission: status.permission,
        has_admin_password: status.has_admin_password,
        has_points_password: status.has_points_password,
        has_recovery_string: status.has_recovery_string,
    };

    Ok(IpcResponse::success(response))
}

#[tauri::command]
pub async fn auth_login(
    password: String,
    sender_id: Option<u32>,
    state: State<'_, Arc<RwLock<AppState>>>,
) -> Result<IpcResponse<LoginResponse>, String> {
    let sender = sender_id.unwrap_or(0);

    let iv_hex = get_iv_hex();

    let result = {
        let state_guard = state.read();
        let db_conn = state_guard.db.read().clone();
        let mut settings = state_guard.settings.write();
        settings.attach_db(db_conn);
        settings.initialize().await?;
        let security = state_guard.security.read();
        let mut permissions = state_guard.permissions.write();

        AuthService::login(
            &mut settings,
            &security,
            &mut permissions,
            sender,
            &password,
            &iv_hex,
        )
        .await
    };

    if result.success {
        Ok(IpcResponse::success(LoginResponse {
            permission: result.permission.unwrap_or_else(|| "view".to_string()),
        }))
    } else {
        Ok(IpcResponse::failure_with_type(
            &result.message.unwrap_or_else(|| "Login failed".to_string()),
        ))
    }
}

#[tauri::command]
pub async fn auth_logout(
    sender_id: Option<u32>,
    state: State<'_, Arc<RwLock<AppState>>>,
) -> Result<IpcResponse<LoginResponse>, String> {
    let default_permission = {
        let state_guard = state.read();
        let mut permissions = state_guard.permissions.write();

        if let Some(id) = sender_id {
            let level = AuthService::logout(&mut permissions, id);
            level.as_str().to_string()
        } else {
            permissions.get_default_permission().as_str().to_string()
        }
    };

    Ok(IpcResponse::success(LoginResponse {
        permission: default_permission,
    }))
}

#[tauri::command]
pub async fn auth_set_passwords(
    admin_password: Option<String>,
    points_password: Option<String>,
    sender_id: Option<u32>,
    state: State<'_, Arc<RwLock<AppState>>>,
) -> Result<IpcResponse<SetPasswordsResponse>, String> {
    let sender = sender_id.unwrap_or(0);

    let iv_hex = get_iv_hex();

    let payload = SetPasswordsPayload {
        admin_password,
        points_password,
    };

    let result = {
        let state_guard = state.read();
        let db_conn = state_guard.db.read().clone();
        let mut settings = state_guard.settings.write();
        settings.attach_db(db_conn);
        settings.initialize().await?;
        let security = state_guard.security.read();
        let mut permissions = state_guard.permissions.write();

        AuthService::set_passwords(
            &mut settings,
            &security,
            &mut permissions,
            sender,
            payload,
            &iv_hex,
        )
        .await
    };

    if result.success {
        Ok(IpcResponse::success(SetPasswordsResponse {
            recovery_string: result.recovery_string,
        }))
    } else {
        Ok(IpcResponse::failure_with_type(
            &result
                .message
                .unwrap_or_else(|| "Failed to set passwords".to_string()),
        ))
    }
}

#[tauri::command]
pub async fn auth_generate_recovery(
    sender_id: Option<u32>,
    state: State<'_, Arc<RwLock<AppState>>>,
) -> Result<IpcResponse<SetPasswordsResponse>, String> {
    let sender = sender_id.unwrap_or(0);

    let iv_hex = get_iv_hex();

    let result = {
        let state_guard = state.read();
        let db_conn = state_guard.db.read().clone();
        let mut settings = state_guard.settings.write();
        settings.attach_db(db_conn);
        settings.initialize().await?;
        let security = state_guard.security.read();
        let mut permissions = state_guard.permissions.write();

        AuthService::generate_recovery(&mut settings, &security, &mut permissions, sender, &iv_hex)
            .await
    };

    if result.success {
        Ok(IpcResponse::success(SetPasswordsResponse {
            recovery_string: result.recovery_string,
        }))
    } else {
        Ok(IpcResponse::failure_with_type(
            &result
                .message
                .unwrap_or_else(|| "Failed to generate recovery".to_string()),
        ))
    }
}

#[tauri::command]
pub async fn auth_reset_by_recovery(
    recovery_string: String,
    sender_id: Option<u32>,
    state: State<'_, Arc<RwLock<AppState>>>,
) -> Result<IpcResponse<SetPasswordsResponse>, String> {
    let sender = sender_id.unwrap_or(0);

    let iv_hex = get_iv_hex();

    let result = {
        let state_guard = state.read();
        let db_conn = state_guard.db.read().clone();
        let mut settings = state_guard.settings.write();
        settings.attach_db(db_conn);
        settings.initialize().await?;
        let security = state_guard.security.read();
        let mut permissions = state_guard.permissions.write();

        AuthService::reset_by_recovery(
            &mut settings,
            &security,
            &mut permissions,
            sender,
            &recovery_string,
            &iv_hex,
        )
        .await
    };

    if result.success {
        Ok(IpcResponse::success(SetPasswordsResponse {
            recovery_string: result.recovery_string,
        }))
    } else {
        Ok(IpcResponse::failure_with_type(
            &result
                .message
                .unwrap_or_else(|| "Recovery failed".to_string()),
        ))
    }
}

#[tauri::command]
pub async fn auth_clear_all(
    sender_id: Option<u32>,
    state: State<'_, Arc<RwLock<AppState>>>,
) -> Result<IpcResponse<()>, String> {
    let sender = sender_id.unwrap_or(0);

    let result = {
        let state_guard = state.read();
        let db_conn = state_guard.db.read().clone();
        let mut settings = state_guard.settings.write();
        settings.attach_db(db_conn);
        settings.initialize().await?;
        let mut permissions = state_guard.permissions.write();

        AuthService::clear_all(&mut settings, &mut permissions, sender).await
    };

    match result {
        Ok(()) => Ok(IpcResponse::success(())),
        Err(e) => Ok(IpcResponse::error(&e)),
    }
}

/// 生成 PKCE code_verifier
fn generate_code_verifier() -> String {
    use rand::Rng;
    let mut rng = rand::thread_rng();
    let random_bytes: Vec<u8> = (0..32).map(|_| rng.gen()).collect();
    base64::Engine::encode(
        &base64::engine::general_purpose::URL_SAFE_NO_PAD,
        &random_bytes,
    )
}

/// 生成 PKCE code_challenge (S256)
fn generate_code_challenge(verifier: &str) -> String {
    use sha2::{Digest, Sha256};
    let mut hasher = Sha256::new();
    hasher.update(verifier.as_bytes());
    let result = hasher.finalize();
    base64::Engine::encode(
        &base64::engine::general_purpose::URL_SAFE_NO_PAD,
        &result,
    )
}

#[tauri::command]
pub async fn oauth_get_authorization_url(
    platform_id: String,
    callback_url: String,
    state: Option<String>,
) -> Result<IpcResponse<OAuthAuthorizationUrlResponse>, String> {
    let state = state.unwrap_or_else(|| {
        use rand::Rng;
        let mut rng = rand::thread_rng();
        let random_bytes: Vec<u8> = (0..32).map(|_| rng.gen()).collect();
        base64::Engine::encode(
            &base64::engine::general_purpose::URL_SAFE_NO_PAD,
            &random_bytes,
        )
    });

    // 生成 PKCE 参数
    let code_verifier = generate_code_verifier();
    let code_challenge = generate_code_challenge(&code_verifier);

    let url = format!(
        "https://sectl.top/oauth/authorize?client_id={}&redirect_uri={}&response_type=code&state={}&code_challenge={}&code_challenge_method=S256",
        platform_id,
        urlencoding::encode(&callback_url),
        urlencoding::encode(&state),
        urlencoding::encode(&code_challenge)
    );

    Ok(IpcResponse::success(OAuthAuthorizationUrlResponse {
        url,
        state,
        code_verifier,
    }))
}

#[tauri::command]
pub async fn oauth_exchange_code(
    code: String,
    platform_id: String,
    platform_secret: String,
    callback_url: String,
    code_verifier: String,
    state: State<'_, Arc<RwLock<AppState>>>,
) -> Result<IpcResponse<OAuthTokenResponse>, String> {
    println!(
        "[OAuth] 换取令牌 - code: {}, platform_id: {}, callback_url: {}",
        code, platform_id, callback_url
    );

    // 获取设备 UUID 和 IP 地址
    let device_uuid = get_or_create_device_uuid();
    let ip_address = get_local_ip().await.unwrap_or_else(|_| "127.0.0.1".to_string());

    println!("[OAuth] 设备 UUID: {}, IP: {}", device_uuid, ip_address);

    let state_guard = state.read();
    let client = &state_guard.http_client;
    let payload = serde_json::json!({
        "grant_type": "authorization_code",
        "code": &code,
        "client_id": &platform_id,
        "client_secret": &platform_secret,
        "redirect_uri": &callback_url,
        "code_verifier": &code_verifier,
        "device_uuid": &device_uuid,
        "ip_address": &ip_address,
    });

    println!("[OAuth] 请求参数：{:?}", payload);

    let response = client
        .post("https://appwrite.sectl.top/api/oauth/token")
        .json(&payload)
        .send()
        .await
        .map_err(|e| format!("Request failed: {}", e))?;

    println!("[OAuth] 响应状态：{}", response.status());

    let response_text = response
        .text()
        .await
        .map_err(|e| format!("Failed to read response: {}", e))?;
    println!("[OAuth] 响应内容：{}", response_text);

    if !response_text.is_empty() && response_text.contains("error") {
        return Ok(IpcResponse::error(&response_text));
    }

    let mut token_response: OAuthTokenResponse = serde_json::from_str(&response_text)
        .map_err(|e| format!("Failed to parse response: {}", e))?;

    // 处理 access_token 格式: JWT|refresh_token
    // 服务器返回的 access_token 包含 JWT 和 refresh_token，用 | 分隔
    // 我们只保留 JWT 部分用于后续请求
    if token_response.access_token.contains('|') {
        let parts: Vec<&str> = token_response.access_token.split('|').collect();
        if !parts.is_empty() {
            println!("[OAuth] 拆分 access_token，使用 JWT 部分");
            token_response.access_token = parts[0].to_string();
        }
    }

    println!("[OAuth] Token 处理完成，access_token 长度: {}", token_response.access_token.len());

    Ok(IpcResponse::success(token_response))
}

#[tauri::command]
pub async fn oauth_revoke_token(
    token: String,
    token_type_hint: Option<String>,
    platform_id: String,
    platform_secret: String,
    state: State<'_, Arc<RwLock<AppState>>>,
) -> Result<IpcResponse<()>, String> {
    let state_guard = state.read();
    let client = &state_guard.http_client;

    let mut payload = serde_json::json!({
        "token": token,
        "client_id": platform_id,
        "client_secret": platform_secret
    });

    if let Some(hint) = token_type_hint {
        payload["token_type_hint"] = serde_json::json!(hint);
    }

    let response = client
        .post("https://appwrite.sectl.top/api/oauth/revoke")
        .json(&payload)
        .send()
        .await
        .map_err(|e| format!("Request failed: {}", e))?;

    if !response.status().is_success() {
        let error_text = response
            .text()
            .await
            .unwrap_or_else(|_| "Unknown error".to_string());
        return Ok(IpcResponse::error(&error_text));
    }

    Ok(IpcResponse::success(()))
}

#[tauri::command]
pub async fn oauth_introspect_token(
    token: String,
    platform_id: String,
    platform_secret: String,
    state: State<'_, Arc<RwLock<AppState>>>,
) -> Result<IpcResponse<OAuthIntrospectResponse>, String> {
    let state_guard = state.read();
    let client = &state_guard.http_client;

    let response = client
        .post("https://appwrite.sectl.top/api/oauth/introspect")
        .json(&serde_json::json!({
            "token": token,
            "client_id": platform_id,
            "client_secret": platform_secret
        }))
        .send()
        .await
        .map_err(|e| format!("Request failed: {}", e))?;

    if !response.status().is_success() {
        let error_text = response
            .text()
            .await
            .unwrap_or_else(|_| "Unknown error".to_string());
        return Ok(IpcResponse::error(&error_text));
    }

    let introspect_response: OAuthIntrospectResponse = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse response: {}", e))?;

    Ok(IpcResponse::success(introspect_response))
}

#[tauri::command]
pub async fn oauth_get_user_info(
    access_token: String,
    state: State<'_, Arc<RwLock<AppState>>>,
) -> Result<IpcResponse<OAuthUserInfo>, String> {
    println!(
        "[OAuth] 获取用户信息 - access_token: {}...",
        &access_token[..20.min(access_token.len())]
    );

    let state_guard = state.read();
    let client = &state_guard.http_client;

    let response = client
        .get("https://appwrite.sectl.top/api/oauth/userinfo")
        .header("Authorization", format!("Bearer {}", access_token))
        .send()
        .await
        .map_err(|e| format!("Request failed: {}", e))?;

    println!("[OAuth] 用户信息响应状态: {}", response.status());

    if !response.status().is_success() {
        let error_text = response
            .text()
            .await
            .unwrap_or_else(|_| "Unknown error".to_string());
        println!("[OAuth] 用户信息响应错误: {}", error_text);
        // 尝试解析 JSON 错误，提取 error_description 或 error
        let error_message =
            if let Ok(json_err) = serde_json::from_str::<serde_json::Value>(&error_text) {
                json_err
                    .get("error_description")
                    .or_else(|| json_err.get("error"))
                    .and_then(|v| v.as_str())
                    .unwrap_or(&error_text)
                    .to_string()
            } else {
                error_text
            };
        return Ok(IpcResponse::error(&error_message));
    }

    let response_text = response
        .text()
        .await
        .map_err(|e| format!("Failed to read response: {}", e))?;
    println!("[OAuth] 用户信息响应内容: {}", response_text);

    let user_info: OAuthUserInfo = serde_json::from_str(&response_text)
        .map_err(|e| format!("Failed to parse response: {}", e))?;

    Ok(IpcResponse::success(user_info))
}

#[tauri::command]
pub async fn oauth_refresh_token(
    refresh_token: String,
    platform_id: String,
    platform_secret: String,
    state: State<'_, Arc<RwLock<AppState>>>,
) -> Result<IpcResponse<OAuthTokenResponse>, String> {
    let state_guard = state.read();
    let client = &state_guard.http_client;

    let response = client
        .post("https://appwrite.sectl.top/api/oauth/token")
        .json(&serde_json::json!({
            "grant_type": "refresh_token",
            "refresh_token": refresh_token,
            "client_id": platform_id,
            "client_secret": platform_secret
        }))
        .send()
        .await
        .map_err(|e| format!("Request failed: {}", e))?;

    if !response.status().is_success() {
        let error_text = response
            .text()
            .await
            .unwrap_or_else(|_| "Unknown error".to_string());
        return Ok(IpcResponse::error(&error_text));
    }

    let token_response: OAuthTokenResponse = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse response: {}", e))?;

    Ok(IpcResponse::success(token_response))
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OnlineStatusResponse {
    pub success: bool,
    pub message: String,
}

#[tauri::command]
pub async fn oauth_report_online(
    platform_id: String,
    device_type: String,
    custom_data: Option<serde_json::Value>,
    state: State<'_, Arc<RwLock<AppState>>>,
) -> Result<IpcResponse<OnlineStatusResponse>, String> {
    let device_uuid = get_or_create_device_uuid();
    let ip_address = get_local_ip().await.unwrap_or_else(|_| "127.0.0.1".to_string());

    println!(
        "[OAuth] 上报在线状态 - platform_id: {}, device_uuid: {}, device_type: {}",
        platform_id, device_uuid, device_type
    );

    let state_guard = state.read();
    let client = &state_guard.http_client;

    let mut payload = serde_json::json!({
        "platform_id": platform_id,
        "device_uuid": device_uuid,
        "device_type": device_type,
        "ip_address": ip_address,
        "country": "CN",
        "province": "Unknown",
        "city": "Unknown",
        "district": "Unknown",
    });

    if let Some(data) = custom_data {
        payload["custom_data"] = data;
    }

    let response = client
        .post("https://appwrite.sectl.top/api/stats/online")
        .json(&payload)
        .send()
        .await
        .map_err(|e| format!("Request failed: {}", e))?;

    println!("[OAuth] 在线状态上报响应: {}", response.status());

    if !response.status().is_success() {
        let error_text = response
            .text()
            .await
            .unwrap_or_else(|_| "Unknown error".to_string());
        return Ok(IpcResponse::error(&error_text));
    }

    let result: OnlineStatusResponse = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse response: {}", e))?;

    Ok(IpcResponse::success(result))
}

#[tauri::command]
pub async fn oauth_get_device_uuid() -> Result<IpcResponse<String>, String> {
    let device_uuid = get_or_create_device_uuid();
    Ok(IpcResponse::success(device_uuid))
}
