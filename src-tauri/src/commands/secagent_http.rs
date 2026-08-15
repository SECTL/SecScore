use axum::{
    extract::{Path, State as AxumState},
    http::{HeaderValue, StatusCode},
    response::{IntoResponse, Response},
    routing::{get, post},
    Json, Router,
};
use parking_lot::RwLock;
use sea_orm::{ActiveModelTrait, ColumnTrait, EntityTrait, QueryFilter, Set, TransactionTrait};
use serde::Deserialize;
use serde_json::{json, Value};
use std::sync::Arc;
use tauri::Emitter;
use tokio::sync::{oneshot, Mutex};

use crate::db::entities::{score_events, students};
use crate::services::permission::PermissionLevel;
use crate::state::AppState;

use super::database::realtime_dual_write_sync_if_legacy;
use super::mcp::{mcp_list_students, AddScoreArgs, ListStudentsArgs};

pub const SECAGENT_HTTP_HOST: &str = "127.0.0.1";
pub const SECAGENT_HTTP_PORT: u16 = 18791;

#[derive(Clone)]
struct SecAgentHttpState {
    app_state: Arc<RwLock<AppState>>,
}

#[derive(Default)]
struct SecAgentHttpServerState {
    is_running: bool,
    shutdown_tx: Option<oneshot::Sender<()>>,
}

static SECAGENT_HTTP_SERVER_STATE: once_cell::sync::Lazy<Arc<Mutex<SecAgentHttpServerState>>> =
    once_cell::sync::Lazy::new(|| Arc::new(Mutex::new(SecAgentHttpServerState::default())));

#[derive(Debug, Deserialize, Default)]
struct FindStudentsArgs {
    query: String,
    #[serde(default)]
    limit: Option<u64>,
}

#[derive(Debug, Deserialize)]
struct AddScoreHttpArgs {
    #[serde(default)]
    student_id: Option<i32>,
    #[serde(default)]
    student_name: Option<String>,
    delta: i32,
    #[serde(default)]
    reason_content: Option<String>,
}

#[derive(Debug, Deserialize)]
struct UndoScoreArgs {
    event_uuid: String,
    #[serde(default)]
    student_id: Option<i32>,
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
        HeaderValue::from_static("content-type,accept"),
    );
    response
}

fn ok(payload: Value) -> Response {
    response(StatusCode::OK, json!({ "ok": true, "result": payload }))
}

fn error(status: StatusCode, message: impl Into<String>) -> Response {
    response(
        status,
        json!({ "ok": false, "error": { "message": message.into() } }),
    )
}

async fn health() -> Response {
    response(
        StatusCode::OK,
        json!({
            "apiVersion": 1,
            "name": "secscore",
            "status": "ok",
            "toolEndpoint": "/tools/{toolName}"
        }),
    )
}

async fn tools() -> Response {
    response(
        StatusCode::OK,
        json!({
            "apiVersion": 1,
            "tools": [
                {
                    "name": "list_students",
                    "description": "获取 SecScore 学生列表，包含姓名、班级和当前积分。",
                    "inputSchema": {
                        "type": "object",
                        "additionalProperties": false,
                        "properties": {
                            "limit": { "type": "integer", "minimum": 1 }
                        }
                    },
                    "hidden": true
                },
                {
                    "name": "find_students",
                    "description": "按姓名模糊查找 SecScore 学生。",
                    "inputSchema": {
                        "type": "object",
                        "required": ["query"],
                        "additionalProperties": false,
                        "properties": {
                            "query": { "type": "string", "minLength": 1 },
                            "limit": { "type": "integer", "minimum": 1 }
                        }
                    },
                    "hidden": true
                },
                {
                    "name": "add_score",
                    "description": "给指定学生加分或扣分，并写入 SecScore 记录。",
                    "inputSchema": {
                        "type": "object",
                        "required": ["delta"],
                        "additionalProperties": false,
                        "properties": {
                            "student_id": { "type": "integer" },
                            "student_name": { "type": "string" },
                            "delta": { "type": "integer" },
                            "reason_content": { "type": "string" }
                        },
                        "anyOf": [
                            { "required": ["student_id"] },
                            { "required": ["student_name"] }
                        ]
                    },
                    "hidden": true
                },
                {
                    "name": "undo_score",
                    "description": "按事件 UUID 撤销一条未结算的积分记录。",
                    "inputSchema": {
                        "type": "object",
                        "required": ["event_uuid"],
                        "additionalProperties": false,
                        "properties": {
                            "event_uuid": { "type": "string" },
                            "student_id": { "type": "integer" }
                        }
                    },
                    "hidden": true
                }
            ]
        }),
    )
}

async fn options() -> Response {
    response(StatusCode::NO_CONTENT, json!({}))
}

fn check_points_permission(app_state: &Arc<RwLock<AppState>>) -> Result<(), String> {
    let state_guard = app_state.read();
    let mut permissions = state_guard.permissions.write();
    if permissions.require_permission(0, PermissionLevel::Points) {
        Ok(())
    } else {
        Err("Permission denied: points required".to_string())
    }
}

async fn resolve_student_name(
    app_state: &Arc<RwLock<AppState>>,
    student_id: Option<i32>,
    student_name: Option<&str>,
) -> Result<String, String> {
    let db_conn = {
        let state_guard = app_state.read();
        let db_conn = state_guard.db.read().clone();
        db_conn
    }
    .ok_or_else(|| "Database not connected".to_string())?;

    let student = if let Some(id) = student_id {
        students::Entity::find()
            .filter(students::Column::Id.eq(id))
            .one(&db_conn)
            .await
            .map_err(|e| e.to_string())?
    } else {
        let name = student_name.unwrap_or("").trim();
        if name.is_empty() {
            return Err("student_id 或 student_name 至少需要一个".to_string());
        }
        students::Entity::find()
            .filter(students::Column::Name.eq(name))
            .one(&db_conn)
            .await
            .map_err(|e| e.to_string())?
    };

    student
        .map(|item| item.name)
        .ok_or_else(|| "Student not found".to_string())
}

async fn call_tool(
    Path(tool_name): Path<String>,
    AxumState(state): AxumState<SecAgentHttpState>,
    Json(args): Json<Value>,
) -> Response {
    let Some(args) = args.as_object() else {
        return error(StatusCode::BAD_REQUEST, "工具参数必须是 JSON 对象");
    };
    let args = Value::Object(args.clone());

    match tool_name.as_str() {
        "list_students" => {
            let parsed = match serde_json::from_value::<ListStudentsArgs>(args) {
                Ok(value) => value,
                Err(e) => return error(StatusCode::BAD_REQUEST, e.to_string()),
            };
            match mcp_list_students(&state.app_state, parsed).await {
                Ok(payload) => match serde_json::to_value(payload) {
                    Ok(value) => ok(value),
                    Err(e) => error(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()),
                },
                Err(e) => error(StatusCode::BAD_REQUEST, e),
            }
        }
        "find_students" => {
            let parsed = match serde_json::from_value::<FindStudentsArgs>(args) {
                Ok(value) => value,
                Err(e) => return error(StatusCode::BAD_REQUEST, e.to_string()),
            };
            let query = parsed.query.trim().to_lowercase();
            if query.is_empty() {
                return error(StatusCode::BAD_REQUEST, "query 不能为空");
            }
            let all = match mcp_list_students(&state.app_state, ListStudentsArgs { limit: None }).await {
                Ok(value) => value,
                Err(e) => return error(StatusCode::BAD_REQUEST, e),
            };
            let mut value = match serde_json::to_value(all) {
                Ok(value) => value,
                Err(e) => return error(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()),
            };
            if let Some(students) = value.get_mut("students").and_then(Value::as_array_mut) {
                students.retain(|student| {
                    student
                        .get("name")
                        .and_then(Value::as_str)
                        .map(|name| name.to_lowercase().contains(&query))
                        .unwrap_or(false)
                });
                if let Some(limit) = parsed.limit {
                    students.truncate(limit.min(usize::MAX as u64) as usize);
                }
                value["total"] = json!(students.len());
            }
            ok(value)
        }
        "add_score" => {
            let parsed = match serde_json::from_value::<AddScoreHttpArgs>(args) {
                Ok(value) => value,
                Err(e) => return error(StatusCode::BAD_REQUEST, e.to_string()),
            };
            if let Err(e) = check_points_permission(&state.app_state) {
                return error(StatusCode::FORBIDDEN, e);
            }
            let student_name = match resolve_student_name(
                &state.app_state,
                parsed.student_id,
                parsed.student_name.as_deref(),
            )
            .await
            {
                Ok(value) => value,
                Err(e) => return error(StatusCode::BAD_REQUEST, e),
            };
            let args = AddScoreArgs {
                student_id: None,
                student_name: Some(student_name),
                delta: parsed.delta,
                reason_content: parsed.reason_content,
            };
            match super::mcp::mcp_add_score(&state.app_state, args).await {
                Ok(value) => match serde_json::to_value(value) {
                    Ok(value) => ok(value),
                    Err(e) => error(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()),
                },
                Err(e) => error(StatusCode::BAD_REQUEST, e),
            }
        }
        "undo_score" => {
            let parsed = match serde_json::from_value::<UndoScoreArgs>(args) {
                Ok(value) => value,
                Err(e) => return error(StatusCode::BAD_REQUEST, e.to_string()),
            };
            match undo_score(&state.app_state, parsed).await {
                Ok(value) => ok(value),
                Err(e) => error(StatusCode::BAD_REQUEST, e),
            }
        }
        _ => error(StatusCode::NOT_FOUND, format!("未知工具：{}", tool_name)),
    }
}

async fn undo_score(
    app_state: &Arc<RwLock<AppState>>,
    args: UndoScoreArgs,
) -> Result<Value, String> {
    check_points_permission(app_state)?;
    let event_uuid = args.event_uuid.trim();
    if event_uuid.is_empty() {
        return Err("event_uuid 不能为空".to_string());
    }

    let local_write_lock = { app_state.read().local_write_lock.clone() };
    let _write_guard = local_write_lock.lock().await;
    let db_conn = {
        let state_guard = app_state.read();
        let db_conn = state_guard.db.read().clone();
        db_conn
    }
    .ok_or_else(|| "Database not connected".to_string())?;

    let event = score_events::Entity::find()
        .filter(score_events::Column::Uuid.eq(event_uuid))
        .one(&db_conn)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Event not found".to_string())?;
    if event.settlement_id.is_some() {
        return Err("该记录已结算，无法撤销".to_string());
    }

    let txn = db_conn.begin().await.map_err(|e| e.to_string())?;
    let student = students::Entity::find()
        .filter(students::Column::Name.eq(&event.student_name))
        .one(&txn)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Student not found".to_string())?;
    if let Some(expected_id) = args.student_id {
        if expected_id != student.id {
            return Err("student_id 与事件所属学生不匹配".to_string());
        }
    }

    let val_curr = student.score - event.delta;
    let reward_points = student.reward_points - event.delta;
    let now = chrono::Utc::now()
        .format("%Y-%m-%dT%H:%M:%S%.3fZ")
        .to_string();
    let student_id = student.id;
    let mut student_model: students::ActiveModel = student.into();
    student_model.score = Set(val_curr);
    student_model.reward_points = Set(reward_points);
    student_model.updated_at = Set(now);
    student_model.update(&txn).await.map_err(|e| e.to_string())?;
    score_events::Entity::delete_by_id(event.id)
        .exec(&txn)
        .await
        .map_err(|e| e.to_string())?;
    txn.commit().await.map_err(|e| e.to_string())?;

    realtime_dual_write_sync_if_legacy(app_state).await?;
    {
        let state_guard = app_state.read();
        let _ = state_guard.app_handle.emit(
            "ss:data-updated",
            json!({ "category": "all", "source": "secagent_http" }),
        );
    }

    Ok(json!({
        "event_uuid": event.uuid,
        "student_id": student_id,
        "student_name": event.student_name,
        "delta": event.delta,
        "val_curr": val_curr
    }))
}

pub async fn secagent_http_server_start(
    app_state: Arc<RwLock<AppState>>,
) -> Result<(), String> {
    let mut server_state = SECAGENT_HTTP_SERVER_STATE.lock().await;
    if server_state.is_running {
        return Ok(());
    }

    let listener = tokio::net::TcpListener::bind((SECAGENT_HTTP_HOST, SECAGENT_HTTP_PORT))
        .await
        .map_err(|e| format!("Failed to bind SecAgent HTTP server: {}", e))?;
    let router = Router::new()
        .route("/health", get(health).options(options))
        .route("/tools", get(tools).options(options))
        .route("/tools/:tool_name", post(call_tool).options(options))
        .with_state(SecAgentHttpState { app_state });
    let (shutdown_tx, shutdown_rx) = oneshot::channel::<()>();

    tauri::async_runtime::spawn(async move {
        let server = axum::serve(listener, router).with_graceful_shutdown(async move {
            let _ = shutdown_rx.await;
        });
        if let Err(e) = server.await {
            eprintln!("SecAgent HTTP server error: {}", e);
        }
    });

    server_state.is_running = true;
    server_state.shutdown_tx = Some(shutdown_tx);
    println!(
        "SecScore SecAgent HTTP server listening at http://{}:{}",
        SECAGENT_HTTP_HOST, SECAGENT_HTTP_PORT
    );
    Ok(())
}
