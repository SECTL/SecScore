use axum::{
    extract::{Path, Query, State as AxumState},
    http::{HeaderMap, HeaderValue, StatusCode},
    response::{IntoResponse, Response},
    routing::{get, post},
    Json, Router,
};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use parking_lot::RwLock;
use rand::RngCore;
use sea_orm::{
    ActiveModelTrait, ColumnTrait, EntityTrait, QueryFilter, QueryOrder, Set, TransactionTrait,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::sync::Arc;
use tauri::Emitter;
use tokio::sync::{oneshot, Mutex};
use uuid::Uuid;

use crate::db::entities::{score_events, students};
use crate::services::settings::{SettingsKey, SettingsValue};
use crate::state::AppState;

use super::database::realtime_dual_write_sync_if_legacy;

pub const REST_API_HOST: &str = "127.0.0.1";
pub const REST_API_PORT: u16 = 18791;
const REST_API_TOKEN_KEY: &str = "rest_api_token";

#[derive(Clone)]
struct RestApiState {
    app_state: Arc<RwLock<AppState>>,
}

#[derive(Default)]
struct RestApiServerState {
    is_running: bool,
    shutdown_tx: Option<oneshot::Sender<()>>,
}

static REST_API_SERVER_STATE: once_cell::sync::Lazy<Arc<Mutex<RestApiServerState>>> =
    once_cell::sync::Lazy::new(|| Arc::new(Mutex::new(RestApiServerState::default())));

#[derive(Debug, Clone, Serialize)]
pub struct RestApiStatus {
    pub is_running: bool,
    pub host: String,
    pub port: u16,
    pub url: String,
    pub auth_enabled: bool,
    pub token_configured: bool,
    pub token: Option<String>,
}

#[derive(Debug, Deserialize, Default)]
struct StudentQuery {
    query: Option<String>,
    limit: Option<u64>,
}

#[derive(Debug, Deserialize)]
struct CreateScoreRequest {
    #[serde(default, alias = "studentId")]
    student_id: Option<i32>,
    #[serde(default, alias = "studentName")]
    student_name: Option<String>,
    delta: i32,
    #[serde(default, alias = "reasonContent")]
    reason_content: Option<String>,
}

fn response(status: StatusCode, payload: Value) -> Response {
    let mut response = (status, Json(payload)).into_response();
    let headers = response.headers_mut();
    headers.insert("access-control-allow-origin", HeaderValue::from_static("*"));
    headers.insert(
        "access-control-allow-methods",
        HeaderValue::from_static("GET,POST,OPTIONS"),
    );
    headers.insert(
        "access-control-allow-headers",
        HeaderValue::from_static("authorization,content-type,x-auth-token"),
    );
    response
}

fn success(data: Value) -> Response {
    response(StatusCode::OK, json!({ "ok": true, "data": data }))
}

fn error(status: StatusCode, message: impl Into<String>) -> Response {
    response(
        status,
        json!({ "ok": false, "error": { "message": message.into() } }),
    )
}

async fn options() -> Response {
    response(StatusCode::NO_CONTENT, json!({}))
}

fn generate_token() -> String {
    let mut bytes = [0_u8; 32];
    rand::thread_rng().fill_bytes(&mut bytes);
    URL_SAFE_NO_PAD.encode(bytes)
}

async fn read_api_settings(
    app_state: &Arc<RwLock<AppState>>,
) -> Result<(bool, bool, Option<String>), String> {
    let state_guard = app_state.read();
    let db_conn = state_guard.db.read().clone();
    let mut settings = state_guard.settings.write();
    settings.attach_db(db_conn);
    settings.initialize().await.map_err(|e| e.to_string())?;
    let enabled = matches!(
        settings.get_value(SettingsKey::RestApiEnabled),
        SettingsValue::Boolean(true)
    );
    let auth_enabled = matches!(
        settings.get_value(SettingsKey::RestApiAuthEnabled),
        SettingsValue::Boolean(true)
    );
    let encrypted_token = settings.get_raw(REST_API_TOKEN_KEY);
    let token = if encrypted_token.trim().is_empty() {
        None
    } else {
        state_guard
            .security
            .read()
            .decrypt_secret(&encrypted_token)
            .ok()
            .filter(|value| !value.trim().is_empty())
    };
    Ok((enabled, auth_enabled, token))
}

async fn require_auth(
    headers: &HeaderMap,
    app_state: &Arc<RwLock<AppState>>,
) -> Result<(), Response> {
    let (enabled, auth_enabled, configured_token) = read_api_settings(app_state)
        .await
        .map_err(|message| error(StatusCode::INTERNAL_SERVER_ERROR, message))?;
    if !enabled {
        return Err(error(
            StatusCode::SERVICE_UNAVAILABLE,
            "REST API is disabled",
        ));
    }
    if !auth_enabled {
        return Ok(());
    }

    let supplied = headers
        .get("authorization")
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.strip_prefix("Bearer "))
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .or_else(|| {
            headers
                .get("x-auth-token")
                .and_then(|value| value.to_str().ok())
                .map(str::trim)
                .filter(|value| !value.is_empty())
        });

    if configured_token.as_deref() == supplied {
        Ok(())
    } else if configured_token.is_none() {
        Err(error(
            StatusCode::UNAUTHORIZED,
            "REST API token is not configured",
        ))
    } else {
        Err(error(StatusCode::UNAUTHORIZED, "Invalid REST API token"))
    }
}

fn clone_db_conn(app_state: &Arc<RwLock<AppState>>) -> Option<sea_orm::DatabaseConnection> {
    let state_guard = app_state.read();
    let db_conn = state_guard.db.read().clone();
    db_conn
}

fn student_json(student: &students::Model) -> Value {
    json!({
        "id": student.id,
        "name": student.name,
        "group_name": student.group_name,
        "score": student.score,
        "reward_points": student.reward_points,
        "extra_json": student.extra_json,
    })
}

async fn list_students(
    AxumState(state): AxumState<RestApiState>,
    headers: HeaderMap,
    Query(params): Query<StudentQuery>,
) -> Response {
    if let Err(response) = require_auth(&headers, &state.app_state).await {
        return response;
    }
    let Some(conn) = clone_db_conn(&state.app_state) else {
        return error(StatusCode::SERVICE_UNAVAILABLE, "Database not connected");
    };
    let query = params.query.unwrap_or_default().trim().to_lowercase();
    let limit = params.limit.unwrap_or(500).clamp(1, 500) as usize;
    let rows = match students::Entity::find()
        .order_by_asc(students::Column::Name)
        .all(&conn)
        .await
    {
        Ok(rows) => rows,
        Err(e) => return error(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()),
    };
    let matched = rows
        .iter()
        .filter(|student| query.is_empty() || student.name.to_lowercase().contains(&query))
        .collect::<Vec<_>>();
    let total = matched.len();
    let students = matched
        .into_iter()
        .take(limit)
        .map(student_json)
        .collect::<Vec<_>>();
    success(json!({ "total": total, "students": students }))
}

async fn get_student(
    AxumState(state): AxumState<RestApiState>,
    headers: HeaderMap,
    Path(id): Path<i32>,
) -> Response {
    if let Err(response) = require_auth(&headers, &state.app_state).await {
        return response;
    }
    let Some(conn) = clone_db_conn(&state.app_state) else {
        return error(StatusCode::SERVICE_UNAVAILABLE, "Database not connected");
    };
    match students::Entity::find_by_id(id).one(&conn).await {
        Ok(Some(student)) => success(student_json(&student)),
        Ok(None) => error(StatusCode::NOT_FOUND, "Student not found"),
        Err(e) => error(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()),
    }
}

async fn create_score(
    AxumState(state): AxumState<RestApiState>,
    headers: HeaderMap,
    Json(data): Json<CreateScoreRequest>,
) -> Response {
    if let Err(response) = require_auth(&headers, &state.app_state).await {
        return response;
    }
    let local_write_lock = { state.app_state.read().local_write_lock.clone() };
    let _write_guard = local_write_lock.lock().await;
    if data.delta == 0 {
        return error(StatusCode::BAD_REQUEST, "delta cannot be zero");
    }
    let Some(conn) = clone_db_conn(&state.app_state) else {
        return error(StatusCode::SERVICE_UNAVAILABLE, "Database not connected");
    };
    let student = if let Some(id) = data.student_id {
        students::Entity::find_by_id(id).one(&conn).await
    } else if let Some(name) = data
        .student_name
        .as_deref()
        .map(str::trim)
        .filter(|v| !v.is_empty())
    {
        students::Entity::find()
            .filter(students::Column::Name.eq(name))
            .one(&conn)
            .await
    } else {
        return error(
            StatusCode::BAD_REQUEST,
            "student_id or student_name is required",
        );
    };
    let student = match student {
        Ok(Some(student)) => student,
        Ok(None) => return error(StatusCode::NOT_FOUND, "Student not found"),
        Err(e) => return error(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()),
    };
    let student_id = student.id;
    let val_prev = student.score;
    let val_curr = val_prev + data.delta;
    let reward_points = student.reward_points + data.delta;
    let now = chrono::Utc::now()
        .format("%Y-%m-%dT%H:%M:%S%.3fZ")
        .to_string();
    let event_uuid = Uuid::new_v4().to_string();
    let reason_content = data
        .reason_content
        .unwrap_or_else(|| "REST API".to_string())
        .trim()
        .to_string();

    let txn = match conn.begin().await {
        Ok(txn) => txn,
        Err(e) => return error(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()),
    };
    let event = score_events::ActiveModel {
        id: sea_orm::ActiveValue::NotSet,
        uuid: Set(event_uuid.clone()),
        student_name: Set(student.name.clone()),
        reason_content: Set(reason_content.clone()),
        delta: Set(data.delta),
        val_prev: Set(val_prev),
        val_curr: Set(val_curr),
        event_time: Set(now.clone()),
        settlement_id: Set(None),
    };
    let inserted = match event.insert(&txn).await {
        Ok(event) => event,
        Err(e) => return error(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()),
    };
    let mut active: students::ActiveModel = student.into();
    active.score = Set(val_curr);
    active.reward_points = Set(reward_points);
    active.updated_at = Set(now.clone());
    if let Err(e) = active.update(&txn).await {
        return error(StatusCode::INTERNAL_SERVER_ERROR, e.to_string());
    }
    if let Err(e) = txn.commit().await {
        return error(StatusCode::INTERNAL_SERVER_ERROR, e.to_string());
    }
    if let Err(e) = realtime_dual_write_sync_if_legacy(&state.app_state).await {
        return error(StatusCode::INTERNAL_SERVER_ERROR, e);
    }
    {
        let state_guard = state.app_state.read();
        let _ = state_guard.app_handle.emit(
            "ss:data-updated",
            json!({ "category": "events", "source": "rest_api" }),
        );
    }
    response(
        StatusCode::CREATED,
        json!({
            "ok": true,
            "data": {
                "event_id": inserted.id,
                "event_uuid": event_uuid,
                "student_id": student_id,
                "student_name": inserted.student_name,
                "delta": inserted.delta,
                "val_prev": inserted.val_prev,
                "val_curr": inserted.val_curr,
                "reason_content": reason_content,
                "event_time": now,
            }
        }),
    )
}

async fn health(AxumState(state): AxumState<RestApiState>) -> Response {
    let (_, auth_enabled, token) = read_api_settings(&state.app_state)
        .await
        .unwrap_or((true, true, None));
    success(json!({
        "name": "secscore",
        "status": "ok",
        "api_version": 1,
        "auth_enabled": auth_enabled,
        "token_configured": token.is_some(),
    }))
}

pub async fn rest_api_server_start(app_state: Arc<RwLock<AppState>>) -> Result<(), String> {
    let mut server_state = REST_API_SERVER_STATE.lock().await;
    if server_state.is_running {
        return Ok(());
    }
    let listener = tokio::net::TcpListener::bind((REST_API_HOST, REST_API_PORT))
        .await
        .map_err(|e| format!("Failed to bind REST API server: {}", e))?;
    let router = Router::new()
        .route("/health", get(health).options(options))
        .route("/api/v1/students", get(list_students).options(options))
        .route("/api/v1/students/:id", get(get_student).options(options))
        .route("/api/v1/scores", post(create_score).options(options))
        .with_state(RestApiState { app_state });
    let (shutdown_tx, shutdown_rx) = oneshot::channel::<()>();
    tauri::async_runtime::spawn(async move {
        let server = axum::serve(listener, router).with_graceful_shutdown(async move {
            let _ = shutdown_rx.await;
        });
        if let Err(e) = server.await {
            eprintln!("REST API server error: {}", e);
        }
    });
    server_state.is_running = true;
    server_state.shutdown_tx = Some(shutdown_tx);
    Ok(())
}

#[tauri::command]
pub async fn rest_api_start(
    state: tauri::State<'_, Arc<RwLock<AppState>>>,
) -> Result<crate::commands::response::IpcResponse<RestApiStatus>, String> {
    check_admin_permission(state.inner())?;
    rest_api_server_start(state.inner().clone()).await?;
    rest_api_status_inner(state.inner()).await
}

#[tauri::command]
pub async fn rest_api_stop(
    state: tauri::State<'_, Arc<RwLock<AppState>>>,
) -> Result<crate::commands::response::IpcResponse<RestApiStatus>, String> {
    check_admin_permission(state.inner())?;
    let mut server_state = REST_API_SERVER_STATE.lock().await;
    if let Some(tx) = server_state.shutdown_tx.take() {
        let _ = tx.send(());
    }
    server_state.is_running = false;
    drop(server_state);
    rest_api_status_inner(state.inner()).await
}

#[tauri::command]
pub async fn rest_api_status(
    state: tauri::State<'_, Arc<RwLock<AppState>>>,
) -> Result<crate::commands::response::IpcResponse<RestApiStatus>, String> {
    rest_api_status_inner(state.inner()).await
}

async fn rest_api_status_inner(
    app_state: &Arc<RwLock<AppState>>,
) -> Result<crate::commands::response::IpcResponse<RestApiStatus>, String> {
    let (_, auth_enabled, configured_token) = read_api_settings(app_state).await?;
    let token_configured = configured_token.is_some();
    let token = {
        let state_guard = app_state.read();
        let mut permissions = state_guard.permissions.write();
        if permissions.require_permission(0, crate::services::permission::PermissionLevel::Admin) {
            configured_token
        } else {
            None
        }
    };
    let server_state = REST_API_SERVER_STATE.lock().await;
    Ok(crate::commands::response::IpcResponse::success(
        RestApiStatus {
            is_running: server_state.is_running,
            host: REST_API_HOST.to_string(),
            port: REST_API_PORT,
            url: format!("http://{}:{}", REST_API_HOST, REST_API_PORT),
            auth_enabled,
            token_configured,
            token,
        },
    ))
}

#[tauri::command]
pub async fn rest_api_generate_token(
    state: tauri::State<'_, Arc<RwLock<AppState>>>,
) -> Result<crate::commands::response::IpcResponse<RestApiStatus>, String> {
    check_admin_permission(state.inner())?;
    let token = generate_token();
    let state_guard = state.read();
    let db_conn = state_guard.db.read().clone();
    let encrypted_token = state_guard
        .security
        .read()
        .encrypt_secret(&token)
        .map_err(|e| e.to_string())?;
    let mut settings = state_guard.settings.write();
    settings.attach_db(db_conn);
    settings.initialize().await.map_err(|e| e.to_string())?;
    settings
        .set_raw(REST_API_TOKEN_KEY, &encrypted_token)
        .await?;
    drop(settings);
    drop(state_guard);
    rest_api_status_inner(state.inner()).await
}

pub async fn rest_api_start_from_settings(app_state: Arc<RwLock<AppState>>) -> Result<(), String> {
    let (enabled, _, _) = read_api_settings(&app_state).await?;
    if enabled {
        rest_api_server_start(app_state).await?;
    }
    Ok(())
}

fn check_admin_permission(state: &Arc<RwLock<AppState>>) -> Result<(), String> {
    let state_guard = state.read();
    let mut permissions = state_guard.permissions.write();
    if permissions.require_permission(0, crate::services::permission::PermissionLevel::Admin) {
        Ok(())
    } else {
        Err("Permission denied: Admin required".to_string())
    }
}
