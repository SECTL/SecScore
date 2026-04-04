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
    pub expires_in: u64,
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
        base64::Engine::encode(&base64::engine::general_purpose::URL_SAFE_NO_PAD, &random_bytes)
    });

    let url = format!(
        "https://sectl.top/oauth/authorize?client_id={}&redirect_uri={}&response_type=code&state={}",
        platform_id,
        urlencoding::encode(&callback_url),
        urlencoding::encode(&state)
    );

    Ok(IpcResponse::success(OAuthAuthorizationUrlResponse { url, state }))
}

#[tauri::command]
pub async fn oauth_exchange_code(
    code: String,
    platform_id: String,
    platform_secret: String,
    callback_url: String,
) -> Result<IpcResponse<OAuthTokenResponse>, String> {
    println!("[OAuth] 换取令牌 - code: {}, platform_id: {}, callback_url: {}", code, platform_id, callback_url);
    
    let client = reqwest::Client::new();
    let payload = serde_json::json!({
        "grant_type": "authorization_code",
        "code": code,
        "client_id": platform_id,
        "client_secret": platform_secret,
        "redirect_uri": callback_url
    });
    
    println!("[OAuth] 请求体：{:?}", payload);
    
    let response = client
        .post("https://sectl.top/api/oauth/token")
        .json(&payload)
        .send()
        .await
        .map_err(|e| format!("Request failed: {}", e))?;

    println!("[OAuth] 响应状态：{}", response.status());
    
    let response_text = response.text().await.map_err(|e| format!("Failed to read response: {}", e))?;
    println!("[OAuth] 响应内容：{}", response_text);
    
    let status_success = response_text.is_empty() || !response_text.contains("error");

    if !status_success {
        return Ok(IpcResponse::error(&response_text));
    }

    let token_response: OAuthTokenResponse = serde_json::from_str(&response_text)
        .map_err(|e| format!("Failed to parse response: {}", e))?;

    Ok(IpcResponse::success(token_response))
}

#[tauri::command]
pub async fn oauth_revoke_token(
    token: String,
    token_type_hint: Option<String>,
    platform_id: String,
    platform_secret: String,
) -> Result<IpcResponse<()>, String> {
    let client = reqwest::Client::new();
    let mut payload = serde_json::json!({
        "token": token,
        "client_id": platform_id,
        "client_secret": platform_secret
    });

    if let Some(hint) = token_type_hint {
        payload["token_type_hint"] = serde_json::json!(hint);
    }

    let response = client
        .post("https://sectl.top/api/oauth/revoke")
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
) -> Result<IpcResponse<OAuthIntrospectResponse>, String> {
    let client = reqwest::Client::new();
    let response = client
        .post("https://sectl.top/api/oauth/introspect")
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
) -> Result<IpcResponse<OAuthUserInfo>, String> {
    let client = reqwest::Client::new();
    let response = client
        .get("https://sectl.top/api/oauth/userinfo")
        .header("Authorization", format!("Bearer {}", access_token))
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

    let user_info: OAuthUserInfo = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse response: {}", e))?;

    Ok(IpcResponse::success(user_info))
}

#[tauri::command]
pub async fn oauth_refresh_token(
    refresh_token: String,
    platform_id: String,
    platform_secret: String,
) -> Result<IpcResponse<OAuthTokenResponse>, String> {
    let client = reqwest::Client::new();
    let response = client
        .post("https://sectl.top/api/oauth/token")
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
