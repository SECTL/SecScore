use axum::{
    body::Body,
    extract::{Path, Query, State as AxumState},
    http::{
        header::{
            ACCESS_CONTROL_ALLOW_CREDENTIALS, ACCESS_CONTROL_ALLOW_HEADERS,
            ACCESS_CONTROL_ALLOW_METHODS, ACCESS_CONTROL_ALLOW_ORIGIN, CACHE_CONTROL, CONTENT_TYPE,
            COOKIE, LOCATION, ORIGIN, SET_COOKIE,
        },
        HeaderMap, HeaderValue, Response, StatusCode, Uri,
    },
    routing::{delete, get},
    Json, Router,
};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use local_ip_address::list_afinet_netifas;
use parking_lot::RwLock;
use rand::RngCore;
use sea_orm::{
    ActiveModelTrait, ColumnTrait, EntityTrait, QueryFilter, QueryOrder, QuerySelect, Set,
    TransactionTrait,
};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::collections::{HashMap, HashSet};
use std::net::{IpAddr, Ipv4Addr, SocketAddr};
use std::path::{Path as FsPath, PathBuf};
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::sync::{oneshot, Mutex};
use uuid::Uuid;

use crate::db::entities::{reasons, reward_settings, score_events, students};
use crate::services::permission::PermissionLevel;
use crate::state::AppState;

use super::database::realtime_dual_write_sync;
use super::response::IpcResponse;

const DEFAULT_STATIC_PORT: u16 = 45739;
const DEFAULT_API_PORT: u16 = 45740;
const LAN_COOKIE_NAME: &str = "secscore_lan_token";
const LAN_TRUSTED_TOKENS_KEY: &str = "lan_trusted_tokens";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HttpServerConfig {
    pub port: u16,
    pub host: String,
    #[serde(default)]
    #[serde(alias = "apiPort")]
    pub api_port: u16,
    #[serde(alias = "corsOrigin")]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cors_origin: Option<String>,
}

impl Default for HttpServerConfig {
    fn default() -> Self {
        Self {
            port: DEFAULT_STATIC_PORT,
            host: "0.0.0.0".to_string(),
            api_port: DEFAULT_API_PORT,
            cors_origin: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HttpServerShareUrl {
    pub ip: String,
    pub url: String,
    pub is_private: bool,
    pub is_192_168: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HttpServerStartResult {
    pub url: String,
    pub api_url: String,
    pub share_url: String,
    pub share_urls: Vec<HttpServerShareUrl>,
    pub token: String,
    pub config: HttpServerConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HttpServerStatus {
    pub is_running: bool,
    pub config: HttpServerConfig,
    pub url: Option<String>,
    pub api_url: Option<String>,
    pub share_url: Option<String>,
    pub share_urls: Vec<HttpServerShareUrl>,
    pub token: Option<String>,
}

struct HttpServerState {
    pub is_running: bool,
    pub config: HttpServerConfig,
    pub url: Option<String>,
    pub api_url: Option<String>,
    pub token: Option<String>,
    pub trusted_tokens: HashSet<String>,
    pub static_shutdown_tx: Option<oneshot::Sender<()>>,
    pub api_shutdown_tx: Option<oneshot::Sender<()>>,
}

impl Default for HttpServerState {
    fn default() -> Self {
        Self {
            is_running: false,
            config: HttpServerConfig::default(),
            url: None,
            api_url: None,
            token: None,
            trusted_tokens: HashSet::new(),
            static_shutdown_tx: None,
            api_shutdown_tx: None,
        }
    }
}

#[derive(Clone)]
struct LanStaticState {
    dist_dir: PathBuf,
    app_state: Arc<RwLock<AppState>>,
    server_state: Arc<Mutex<HttpServerState>>,
}

#[derive(Clone)]
struct LanApiState {
    app_state: Arc<RwLock<AppState>>,
    server_state: Arc<Mutex<HttpServerState>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LanStudent {
    pub id: i32,
    pub name: String,
    pub group_name: Option<String>,
    pub score: i32,
    pub reward_points: i32,
    pub extra_json: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LanReason {
    pub id: i32,
    pub content: String,
    pub category: String,
    pub delta: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LanRewardSetting {
    pub id: i32,
    pub name: String,
    pub cost_points: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LanScoreEvent {
    pub id: i32,
    pub uuid: String,
    pub student_name: String,
    pub reason_content: String,
    pub delta: i32,
    pub val_prev: i32,
    pub val_curr: i32,
    pub event_time: String,
    pub settlement_id: Option<i32>,
}

#[derive(Debug, Deserialize)]
struct LanQueryEventParams {
    limit: Option<i32>,
}

#[derive(Debug, Deserialize)]
struct LanCreateScoreEvent {
    #[serde(alias = "studentName")]
    student_name: String,
    #[serde(alias = "reasonContent")]
    reason_content: String,
    delta: i32,
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

fn generate_token() -> String {
    let mut bytes = [0_u8; 32];
    rand::thread_rng().fill_bytes(&mut bytes);
    URL_SAFE_NO_PAD.encode(bytes)
}

fn ipv4_priority(ip: &Ipv4Addr) -> u8 {
    let octets = ip.octets();
    if octets[0] == 192 && octets[1] == 168 {
        0
    } else if octets[0] == 10 || (octets[0] == 172 && (16..=31).contains(&octets[1])) {
        1
    } else if octets[0] == 169 && octets[1] == 254 {
        2
    } else {
        3
    }
}

fn resolve_lan_ips() -> Vec<Ipv4Addr> {
    let mut ips = list_afinet_netifas()
        .map(|items| {
            items
                .into_iter()
                .filter_map(|(_, ip)| match ip {
                    IpAddr::V4(v4) if !v4.is_loopback() && !v4.is_unspecified() => Some(v4),
                    _ => None,
                })
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();

    ips.sort_by_key(|ip| (ipv4_priority(ip), ip.octets()));
    ips.dedup();

    if ips.is_empty() {
        ips.push(Ipv4Addr::LOCALHOST);
    }

    ips
}

fn resolve_dist_dir(app_handle: &AppHandle) -> Result<PathBuf, String> {
    let mut candidates = Vec::new();
    if let Ok(current_dir) = std::env::current_dir() {
        candidates.push(current_dir.join("dist"));
        candidates.push(current_dir.join("../dist"));
    }
    if let Ok(resource_dir) = app_handle.path().resource_dir() {
        candidates.push(resource_dir.join("dist"));
        candidates.push(resource_dir);
    }

    candidates
        .into_iter()
        .find(|path| path.join("index.html").is_file())
        .ok_or_else(|| "未找到前端静态资源 dist/index.html，请先执行 pnpm run build".to_string())
}

fn build_share_url(public_host: &str, port: u16, token: &str) -> String {
    format!("http://{}:{}/?token={}", public_host, port, token)
}

fn build_share_urls(port: u16, token: &str) -> Vec<HttpServerShareUrl> {
    resolve_lan_ips()
        .into_iter()
        .map(|ip| {
            let octets = ip.octets();
            let is_192_168 = octets[0] == 192 && octets[1] == 168;
            HttpServerShareUrl {
                ip: ip.to_string(),
                url: build_share_url(&ip.to_string(), port, token),
                is_private: ip.is_private(),
                is_192_168,
            }
        })
        .collect()
}

fn content_type_for(path: &FsPath) -> &'static str {
    match path.extension().and_then(|v| v.to_str()).unwrap_or("") {
        "html" => "text/html; charset=utf-8",
        "js" => "text/javascript; charset=utf-8",
        "css" => "text/css; charset=utf-8",
        "json" => "application/json; charset=utf-8",
        "svg" => "image/svg+xml",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "ico" => "image/x-icon",
        "woff" => "font/woff",
        "woff2" => "font/woff2",
        _ => "application/octet-stream",
    }
}

fn token_from_cookie(headers: &HeaderMap) -> Option<String> {
    let cookie = headers.get(COOKIE)?.to_str().ok()?;
    for part in cookie.split(';') {
        let mut pair = part.trim().splitn(2, '=');
        let name = pair.next()?.trim();
        let value = pair.next()?.trim();
        if name == LAN_COOKIE_NAME && !value.is_empty() {
            return Some(value.to_string());
        }
    }
    None
}

fn clone_db_conn(app_state: &Arc<RwLock<AppState>>) -> Option<sea_orm::DatabaseConnection> {
    let state_guard = app_state.read();
    let db_conn = state_guard.db.read().clone();
    db_conn
}

fn parse_trusted_tokens(raw: &str) -> HashSet<String> {
    serde_json::from_str::<Vec<String>>(raw)
        .unwrap_or_default()
        .into_iter()
        .filter(|token| !token.trim().is_empty())
        .collect()
}

async fn load_trusted_tokens(app_state: &Arc<RwLock<AppState>>) -> HashSet<String> {
    let state_guard = app_state.read();
    let db_conn = state_guard.db.read().clone();
    let mut settings = state_guard.settings.write();
    settings.attach_db(db_conn);
    if settings.initialize().await.is_err() {
        return HashSet::new();
    }
    parse_trusted_tokens(&settings.get_raw(LAN_TRUSTED_TOKENS_KEY))
}

async fn save_trusted_tokens(
    app_state: &Arc<RwLock<AppState>>,
    tokens: &HashSet<String>,
) -> Result<(), String> {
    let mut values = tokens.iter().cloned().collect::<Vec<_>>();
    values.sort();
    let raw = serde_json::to_string(&values).map_err(|e| e.to_string())?;
    let state_guard = app_state.read();
    let db_conn = state_guard.db.read().clone();
    let mut settings = state_guard.settings.write();
    settings.attach_db(db_conn);
    settings.initialize().await.map_err(|e| e.to_string())?;
    settings.set_raw(LAN_TRUSTED_TOKENS_KEY, &raw).await
}

async fn current_token(server_state: &Arc<Mutex<HttpServerState>>) -> Option<String> {
    let state = server_state.lock().await;
    state.token.clone()
}

async fn issue_trusted_browser_token(state: &LanStaticState) -> String {
    let trusted_token = generate_token();
    let snapshot = {
        let mut server_state = state.server_state.lock().await;
        server_state.trusted_tokens.insert(trusted_token.clone());
        server_state.trusted_tokens.clone()
    };
    if let Err(error) = save_trusted_tokens(&state.app_state, &snapshot).await {
        eprintln!("Failed to persist LAN trusted token: {}", error);
    }
    trusted_token
}

async fn is_authorized(headers: &HeaderMap, server_state: &Arc<Mutex<HttpServerState>>) -> bool {
    let Some(cookie_token) = token_from_cookie(headers) else {
        return false;
    };
    let state = server_state.lock().await;
    state.trusted_tokens.contains(&cookie_token)
}

fn html_response(status: StatusCode, body: &str) -> Response<Body> {
    Response::builder()
        .status(status)
        .header(CONTENT_TYPE, "text/html; charset=utf-8")
        .body(Body::from(body.to_string()))
        .unwrap_or_else(|_| Response::new(Body::empty()))
}

fn redirect_with_cookie(location: String, token: String) -> Response<Body> {
    let cookie = format!(
        "{}={}; Path=/; Max-Age=315360000; Expires=Fri, 31 Dec 9999 23:59:59 GMT; SameSite=Lax; HttpOnly",
        LAN_COOKIE_NAME, token
    );
    Response::builder()
        .status(StatusCode::FOUND)
        .header(LOCATION, location)
        .header(SET_COOKIE, cookie)
        .body(Body::empty())
        .unwrap_or_else(|_| Response::new(Body::empty()))
}

fn clean_uri_without_token(uri: &Uri) -> String {
    let path = uri.path();
    let Some(query) = uri.query() else {
        return path.to_string();
    };
    let filtered = query
        .split('&')
        .filter(|part| !part.starts_with("token="))
        .collect::<Vec<_>>()
        .join("&");
    if filtered.is_empty() {
        path.to_string()
    } else {
        format!("{}?{}", path, filtered)
    }
}

fn safe_static_path(dist_dir: &FsPath, uri_path: &str) -> PathBuf {
    let mut path = dist_dir.to_path_buf();
    for segment in uri_path.trim_start_matches('/').split('/') {
        if segment.is_empty() || segment == "." || segment == ".." {
            continue;
        }
        path.push(segment);
    }
    if path == dist_dir {
        path.push("index.html");
    }
    path
}

async fn static_handler(
    AxumState(state): AxumState<LanStaticState>,
    headers: HeaderMap,
    uri: Uri,
) -> Response<Body> {
    let query_params = uri
        .query()
        .map(|q| {
            q.split('&')
                .filter_map(|part| {
                    let mut pair = part.splitn(2, '=');
                    Some((
                        pair.next()?.to_string(),
                        pair.next().unwrap_or("").to_string(),
                    ))
                })
                .collect::<HashMap<String, String>>()
        })
        .unwrap_or_default();

    if let Some(token) = query_params.get("token") {
        if current_token(&state.server_state).await.as_deref() == Some(token.as_str()) {
            let trusted_token = issue_trusted_browser_token(&state).await;
            return redirect_with_cookie(clean_uri_without_token(&uri), trusted_token);
        }
        return html_response(
            StatusCode::UNAUTHORIZED,
            "SecScore LAN token 无效或已过期。",
        );
    }

    if !is_authorized(&headers, &state.server_state).await {
        return html_response(
            StatusCode::UNAUTHORIZED,
            "请从 SecScore 主程序复制最新的局域网访问链接打开。",
        );
    }

    let requested = safe_static_path(&state.dist_dir, uri.path());
    let file_path = if requested.is_file() {
        requested
    } else {
        state.dist_dir.join("index.html")
    };

    match tokio::fs::read(&file_path).await {
        Ok(bytes) => Response::builder()
            .status(StatusCode::OK)
            .header(CONTENT_TYPE, content_type_for(&file_path))
            .header(CACHE_CONTROL, "no-store")
            .body(Body::from(bytes))
            .unwrap_or_else(|_| Response::new(Body::empty())),
        Err(_) => html_response(StatusCode::NOT_FOUND, "静态资源不存在。"),
    }
}

fn cors_origin(headers: &HeaderMap) -> HeaderValue {
    headers
        .get(ORIGIN)
        .cloned()
        .unwrap_or_else(|| HeaderValue::from_static("http://127.0.0.1:45739"))
}

fn with_cors<T: Serialize>(
    headers: &HeaderMap,
    status: StatusCode,
    payload: &IpcResponse<T>,
) -> Response<Body> {
    let body = serde_json::to_vec(payload).unwrap_or_else(|_| b"{\"success\":false}".to_vec());
    Response::builder()
        .status(status)
        .header(CONTENT_TYPE, "application/json; charset=utf-8")
        .header(ACCESS_CONTROL_ALLOW_ORIGIN, cors_origin(headers))
        .header(
            ACCESS_CONTROL_ALLOW_CREDENTIALS,
            HeaderValue::from_static("true"),
        )
        .body(Body::from(body))
        .unwrap_or_else(|_| Response::new(Body::empty()))
}

async fn api_options(headers: HeaderMap) -> Response<Body> {
    Response::builder()
        .status(StatusCode::NO_CONTENT)
        .header(ACCESS_CONTROL_ALLOW_ORIGIN, cors_origin(&headers))
        .header(
            ACCESS_CONTROL_ALLOW_CREDENTIALS,
            HeaderValue::from_static("true"),
        )
        .header(
            ACCESS_CONTROL_ALLOW_METHODS,
            HeaderValue::from_static("GET,POST,DELETE,OPTIONS"),
        )
        .header(
            ACCESS_CONTROL_ALLOW_HEADERS,
            HeaderValue::from_static("content-type"),
        )
        .body(Body::empty())
        .unwrap_or_else(|_| Response::new(Body::empty()))
}

async fn require_api_auth(
    headers: &HeaderMap,
    server_state: &Arc<Mutex<HttpServerState>>,
) -> Option<Response<Body>> {
    if is_authorized(headers, server_state).await {
        None
    } else {
        Some(with_cors(
            headers,
            StatusCode::UNAUTHORIZED,
            &IpcResponse::<()>::error("LAN token invalid"),
        ))
    }
}

async fn lan_students(
    AxumState(state): AxumState<LanApiState>,
    headers: HeaderMap,
) -> Response<Body> {
    if let Some(response) = require_api_auth(&headers, &state.server_state).await {
        return response;
    }
    let db_conn = clone_db_conn(&state.app_state);
    let Some(conn) = db_conn else {
        return with_cors(
            &headers,
            StatusCode::OK,
            &IpcResponse::<Vec<LanStudent>>::error("Database not connected"),
        );
    };

    match students::Entity::find()
        .order_by_asc(students::Column::Name)
        .all(&conn)
        .await
    {
        Ok(rows) => {
            let data = rows
                .into_iter()
                .map(|row| LanStudent {
                    id: row.id,
                    name: row.name,
                    group_name: row.group_name,
                    score: row.score,
                    reward_points: row.reward_points,
                    extra_json: row.extra_json,
                })
                .collect::<Vec<_>>();
            with_cors(&headers, StatusCode::OK, &IpcResponse::success(data))
        }
        Err(e) => with_cors(
            &headers,
            StatusCode::OK,
            &IpcResponse::<Vec<LanStudent>>::error(&e.to_string()),
        ),
    }
}

async fn lan_reasons(
    AxumState(state): AxumState<LanApiState>,
    headers: HeaderMap,
) -> Response<Body> {
    if let Some(response) = require_api_auth(&headers, &state.server_state).await {
        return response;
    }
    let db_conn = clone_db_conn(&state.app_state);
    let Some(conn) = db_conn else {
        return with_cors(
            &headers,
            StatusCode::OK,
            &IpcResponse::<Vec<LanReason>>::error("Database not connected"),
        );
    };

    match reasons::Entity::find()
        .order_by_asc(reasons::Column::Id)
        .all(&conn)
        .await
    {
        Ok(rows) => {
            let data = rows
                .into_iter()
                .map(|row| LanReason {
                    id: row.id,
                    content: row.content,
                    category: row.category,
                    delta: row.delta,
                })
                .collect::<Vec<_>>();
            with_cors(&headers, StatusCode::OK, &IpcResponse::success(data))
        }
        Err(e) => with_cors(
            &headers,
            StatusCode::OK,
            &IpcResponse::<Vec<LanReason>>::error(&e.to_string()),
        ),
    }
}

async fn lan_rewards(
    AxumState(state): AxumState<LanApiState>,
    headers: HeaderMap,
) -> Response<Body> {
    if let Some(response) = require_api_auth(&headers, &state.server_state).await {
        return response;
    }
    let db_conn = clone_db_conn(&state.app_state);
    let Some(conn) = db_conn else {
        return with_cors(
            &headers,
            StatusCode::OK,
            &IpcResponse::<Vec<LanRewardSetting>>::error("Database not connected"),
        );
    };

    match reward_settings::Entity::find()
        .order_by_asc(reward_settings::Column::Id)
        .all(&conn)
        .await
    {
        Ok(rows) => {
            let data = rows
                .into_iter()
                .map(|row| LanRewardSetting {
                    id: row.id,
                    name: row.name,
                    cost_points: row.cost_points,
                })
                .collect::<Vec<_>>();
            with_cors(&headers, StatusCode::OK, &IpcResponse::success(data))
        }
        Err(e) => with_cors(
            &headers,
            StatusCode::OK,
            &IpcResponse::<Vec<LanRewardSetting>>::error(&e.to_string()),
        ),
    }
}

async fn lan_events(
    AxumState(state): AxumState<LanApiState>,
    headers: HeaderMap,
    Query(params): Query<LanQueryEventParams>,
) -> Response<Body> {
    if let Some(response) = require_api_auth(&headers, &state.server_state).await {
        return response;
    }
    let db_conn = clone_db_conn(&state.app_state);
    let Some(conn) = db_conn else {
        return with_cors(
            &headers,
            StatusCode::OK,
            &IpcResponse::<Vec<LanScoreEvent>>::error("Database not connected"),
        );
    };
    let limit = params.limit.unwrap_or(100).max(1).min(500) as u64;

    match score_events::Entity::find()
        .filter(score_events::Column::SettlementId.is_null())
        .order_by_desc(score_events::Column::EventTime)
        .limit(limit)
        .all(&conn)
        .await
    {
        Ok(rows) => {
            let data = rows
                .into_iter()
                .map(|row| LanScoreEvent {
                    id: row.id,
                    uuid: row.uuid,
                    student_name: row.student_name,
                    reason_content: row.reason_content,
                    delta: row.delta,
                    val_prev: row.val_prev,
                    val_curr: row.val_curr,
                    event_time: row.event_time,
                    settlement_id: row.settlement_id,
                })
                .collect::<Vec<_>>();
            with_cors(&headers, StatusCode::OK, &IpcResponse::success(data))
        }
        Err(e) => with_cors(
            &headers,
            StatusCode::OK,
            &IpcResponse::<Vec<LanScoreEvent>>::error(&e.to_string()),
        ),
    }
}

async fn lan_create_event(
    AxumState(state): AxumState<LanApiState>,
    headers: HeaderMap,
    Json(data): Json<LanCreateScoreEvent>,
) -> Response<Body> {
    if let Some(response) = require_api_auth(&headers, &state.server_state).await {
        return response;
    }
    let student_name = data.student_name.trim();
    if student_name.is_empty() {
        return with_cors(
            &headers,
            StatusCode::OK,
            &IpcResponse::<i32>::error("Student name cannot be empty"),
        );
    }
    let db_conn = clone_db_conn(&state.app_state);
    let Some(conn) = db_conn else {
        return with_cors(
            &headers,
            StatusCode::OK,
            &IpcResponse::<i32>::error("Database not connected"),
        );
    };

    let result = async {
        let student = students::Entity::find()
            .filter(students::Column::Name.eq(student_name))
            .one(&conn)
            .await
            .map_err(|e| e.to_string())?
            .ok_or_else(|| "Student not found".to_string())?;

        let val_prev = student.score;
        let val_curr = val_prev + data.delta;
        let reward_points_next = student.reward_points + data.delta;
        let now = chrono::Utc::now()
            .format("%Y-%m-%dT%H:%M:%S%.3fZ")
            .to_string();

        let txn = conn.begin().await.map_err(|e| e.to_string())?;
        let new_event = score_events::ActiveModel {
            id: sea_orm::ActiveValue::NotSet,
            uuid: Set(Uuid::new_v4().to_string()),
            student_name: Set(student_name.to_string()),
            reason_content: Set(data.reason_content.trim().to_string()),
            delta: Set(data.delta),
            val_prev: Set(val_prev),
            val_curr: Set(val_curr),
            event_time: Set(now.clone()),
            settlement_id: Set(None),
        };
        let inserted = new_event.insert(&txn).await.map_err(|e| e.to_string())?;

        let mut active: students::ActiveModel = student.into();
        active.score = Set(val_curr);
        active.reward_points = Set(reward_points_next);
        active.updated_at = Set(now);
        active.update(&txn).await.map_err(|e| e.to_string())?;

        txn.commit().await.map_err(|e| e.to_string())?;
        realtime_dual_write_sync(&state.app_state).await?;
        {
            let state_guard = state.app_state.read();
            let _ = state_guard.app_handle.emit(
                "ss:data-updated",
                json!({
                    "category": "events",
                    "source": "lan"
                }),
            );
        }
        Ok::<i32, String>(inserted.id)
    }
    .await;

    match result {
        Ok(id) => with_cors(&headers, StatusCode::OK, &IpcResponse::success(id)),
        Err(e) => with_cors(&headers, StatusCode::OK, &IpcResponse::<i32>::error(&e)),
    }
}

async fn lan_delete_event(
    AxumState(state): AxumState<LanApiState>,
    headers: HeaderMap,
    Path(uuid): Path<String>,
) -> Response<Body> {
    if let Some(response) = require_api_auth(&headers, &state.server_state).await {
        return response;
    }
    let db_conn = clone_db_conn(&state.app_state);
    let Some(conn) = db_conn else {
        return with_cors(
            &headers,
            StatusCode::OK,
            &IpcResponse::<()>::error("Database not connected"),
        );
    };

    let result = async {
        let event = score_events::Entity::find()
            .filter(score_events::Column::Uuid.eq(uuid.trim()))
            .one(&conn)
            .await
            .map_err(|e| e.to_string())?
            .ok_or_else(|| "Event not found".to_string())?;

        if event.settlement_id.is_some() {
            return Err("该记录已结算，无法撤销".to_string());
        }

        let txn = conn.begin().await.map_err(|e| e.to_string())?;
        if let Some(student) = students::Entity::find()
            .filter(students::Column::Name.eq(&event.student_name))
            .one(&txn)
            .await
            .map_err(|e| e.to_string())?
        {
            let next_score = student.score - event.delta;
            let next_reward_points = student.reward_points - event.delta;
            let now = chrono::Utc::now()
                .format("%Y-%m-%dT%H:%M:%S%.3fZ")
                .to_string();
            let mut active: students::ActiveModel = student.into();
            active.score = Set(next_score);
            active.reward_points = Set(next_reward_points);
            active.updated_at = Set(now);
            active.update(&txn).await.map_err(|e| e.to_string())?;
        }

        score_events::Entity::delete_by_id(event.id)
            .exec(&txn)
            .await
            .map_err(|e| e.to_string())?;
        txn.commit().await.map_err(|e| e.to_string())?;
        realtime_dual_write_sync(&state.app_state).await?;
        {
            let state_guard = state.app_state.read();
            let _ = state_guard.app_handle.emit(
                "ss:data-updated",
                json!({
                    "category": "events",
                    "source": "lan"
                }),
            );
        }
        Ok::<(), String>(())
    }
    .await;

    match result {
        Ok(()) => with_cors(&headers, StatusCode::OK, &IpcResponse::success_empty()),
        Err(e) => with_cors(&headers, StatusCode::OK, &IpcResponse::<()>::error(&e)),
    }
}

async fn api_not_found(headers: HeaderMap) -> Response<Body> {
    with_cors(
        &headers,
        StatusCode::NOT_FOUND,
        &IpcResponse::<()>::error("Not found"),
    )
}

async fn start_http_server_inner(
    config: Option<HttpServerConfig>,
    app_handle: AppHandle,
    app_state: Arc<RwLock<AppState>>,
    refresh_if_running: bool,
) -> Result<IpcResponse<HttpServerStartResult>, String> {
    let mut server_state = HTTP_SERVER_STATE.lock().await;

    if server_state.is_running {
        if refresh_if_running {
            server_state.token = Some(generate_token());
            let token = server_state.token.clone().unwrap_or_default();
            let share_urls = build_share_urls(server_state.config.port, &token);
            let share_url = share_urls
                .first()
                .map(|item| item.url.clone())
                .unwrap_or_else(|| build_share_url("127.0.0.1", server_state.config.port, &token));
            let url = server_state.url.clone().unwrap_or_default();
            let api_url = server_state.api_url.clone().unwrap_or_default();
            return Ok(IpcResponse::success(HttpServerStartResult {
                share_url,
                share_urls,
                token,
                url,
                api_url,
                config: server_state.config.clone(),
            }));
        }
        return Ok(IpcResponse::failure_with_type(
            "HTTP server is already running",
        ));
    }

    let mut config = config.unwrap_or_default();
    if config.api_port == 0 {
        config.api_port = DEFAULT_API_PORT;
    }

    let host: IpAddr = config
        .host
        .parse()
        .map_err(|e| format!("Invalid host address: {}", e))?;
    let static_addr: SocketAddr = (host, config.port).into();
    let api_addr: SocketAddr = (host, config.api_port).into();

    let static_listener = tokio::net::TcpListener::bind(static_addr)
        .await
        .map_err(|e| format!("Failed to bind LAN static server: {}", e))?;
    let api_listener = tokio::net::TcpListener::bind(api_addr)
        .await
        .map_err(|e| format!("Failed to bind LAN API server: {}", e))?;

    let static_local_addr = static_listener
        .local_addr()
        .map_err(|e| format!("Failed to get LAN static addr: {}", e))?;
    let api_local_addr = api_listener
        .local_addr()
        .map_err(|e| format!("Failed to get LAN API addr: {}", e))?;
    let dist_dir = resolve_dist_dir(&app_handle)?;
    let trusted_tokens = load_trusted_tokens(&app_state).await;

    let token = generate_token();
    let share_urls = build_share_urls(static_local_addr.port(), &token);
    let primary_host = share_urls
        .first()
        .map(|item| item.ip.clone())
        .unwrap_or_else(|| "127.0.0.1".to_string());
    let url = format!("http://{}:{}", primary_host, static_local_addr.port());
    let api_url = format!("http://{}:{}", primary_host, api_local_addr.port());
    let share_url = share_urls
        .first()
        .map(|item| item.url.clone())
        .unwrap_or_else(|| build_share_url(&primary_host, static_local_addr.port(), &token));

    let static_state = LanStaticState {
        dist_dir,
        app_state: app_state.clone(),
        server_state: HTTP_SERVER_STATE.clone(),
    };
    let api_state = LanApiState {
        app_state,
        server_state: HTTP_SERVER_STATE.clone(),
    };

    let static_router = Router::new()
        .fallback(static_handler)
        .with_state(static_state);
    let api_router = Router::new()
        .route("/api/students", get(lan_students).options(api_options))
        .route("/api/reasons", get(lan_reasons).options(api_options))
        .route("/api/rewards", get(lan_rewards).options(api_options))
        .route(
            "/api/events",
            get(lan_events).post(lan_create_event).options(api_options),
        )
        .route(
            "/api/events/:uuid",
            delete(lan_delete_event).options(api_options),
        )
        .fallback(api_not_found)
        .with_state(api_state);

    let (static_shutdown_tx, static_shutdown_rx) = oneshot::channel::<()>();
    let (api_shutdown_tx, api_shutdown_rx) = oneshot::channel::<()>();

    tauri::async_runtime::spawn(async move {
        let server =
            axum::serve(static_listener, static_router).with_graceful_shutdown(async move {
                let _ = static_shutdown_rx.await;
            });
        if let Err(e) = server.await {
            eprintln!("LAN static server error: {}", e);
        }
    });

    tauri::async_runtime::spawn(async move {
        let server = axum::serve(api_listener, api_router).with_graceful_shutdown(async move {
            let _ = api_shutdown_rx.await;
        });
        if let Err(e) = server.await {
            eprintln!("LAN API server error: {}", e);
        }
    });

    config.port = static_local_addr.port();
    config.api_port = api_local_addr.port();

    server_state.is_running = true;
    server_state.config = config.clone();
    server_state.url = Some(url.clone());
    server_state.api_url = Some(api_url.clone());
    server_state.token = Some(token.clone());
    server_state.trusted_tokens = trusted_tokens;
    server_state.static_shutdown_tx = Some(static_shutdown_tx);
    server_state.api_shutdown_tx = Some(api_shutdown_tx);

    Ok(IpcResponse::success(HttpServerStartResult {
        url,
        api_url,
        share_url,
        share_urls,
        token,
        config,
    }))
}

#[tauri::command]
pub async fn http_server_start(
    config: Option<HttpServerConfig>,
    app_handle: AppHandle,
    state: State<'_, Arc<RwLock<AppState>>>,
) -> Result<IpcResponse<HttpServerStartResult>, String> {
    check_admin_permission(&state)?;
    start_http_server_inner(config, app_handle, state.inner().clone(), false).await
}

#[tauri::command]
pub async fn http_server_refresh_token(
    app_handle: AppHandle,
    state: State<'_, Arc<RwLock<AppState>>>,
) -> Result<IpcResponse<HttpServerStartResult>, String> {
    check_admin_permission(&state)?;
    start_http_server_inner(None, app_handle, state.inner().clone(), true).await
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

    if let Some(tx) = server_state.static_shutdown_tx.take() {
        let _ = tx.send(());
    }
    if let Some(tx) = server_state.api_shutdown_tx.take() {
        let _ = tx.send(());
    }

    server_state.is_running = false;
    server_state.url = None;
    server_state.api_url = None;
    server_state.token = None;

    Ok(IpcResponse::success_empty())
}

#[tauri::command]
pub async fn http_server_status(
    _state: State<'_, Arc<RwLock<AppState>>>,
) -> Result<IpcResponse<HttpServerStatus>, String> {
    let server_state = HTTP_SERVER_STATE.lock().await;
    let token = server_state.token.clone();
    let share_urls = token
        .as_ref()
        .map(|token| build_share_urls(server_state.config.port, token.as_str()))
        .unwrap_or_default();
    let share_url = share_urls.first().map(|item| item.url.clone());

    let status = HttpServerStatus {
        is_running: server_state.is_running,
        config: server_state.config.clone(),
        url: server_state.url.clone(),
        api_url: server_state.api_url.clone(),
        share_url,
        share_urls,
        token,
    };

    Ok(IpcResponse::success(status))
}

pub async fn http_server_start_from_settings(
    app_handle: AppHandle,
    app_state: Arc<RwLock<AppState>>,
) -> Result<(), String> {
    let res = start_http_server_inner(None, app_handle, app_state, false).await?;
    if res.success {
        Ok(())
    } else {
        Err(res
            .message
            .unwrap_or_else(|| "Failed to start LAN server".to_string()))
    }
}
