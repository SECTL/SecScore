use axum::{
    extract::State as AxumState,
    http::StatusCode,
    response::{IntoResponse, Response},
    routing::post,
    Json, Router,
};
use parking_lot::RwLock;
use sea_orm::{
    ActiveModelTrait, ColumnTrait, EntityTrait, QueryFilter, QueryOrder, QuerySelect, Set,
    TransactionTrait,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::net::SocketAddr;
use std::sync::Arc;
use tauri::State;
use tokio::sync::{oneshot, Mutex};
use uuid::Uuid;

use crate::db::entities::{score_events, students};
use crate::services::permission::PermissionLevel;
use crate::state::AppState;

use super::database::realtime_dual_write_sync;
use super::response::IpcResponse;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpServerConfig {
    pub port: u16,
    pub host: String,
}

impl Default for McpServerConfig {
    fn default() -> Self {
        Self {
            port: 3901,
            host: "127.0.0.1".to_string(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpServerStartResult {
    pub url: String,
    pub config: McpServerConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpServerStatus {
    pub is_running: bool,
    pub config: McpServerConfig,
    pub url: Option<String>,
}

struct McpServerState {
    pub is_running: bool,
    pub config: McpServerConfig,
    pub url: Option<String>,
    pub shutdown_tx: Option<oneshot::Sender<()>>,
}

impl Default for McpServerState {
    fn default() -> Self {
        Self {
            is_running: false,
            config: McpServerConfig::default(),
            url: None,
            shutdown_tx: None,
        }
    }
}

#[derive(Debug, Deserialize)]
struct McpRequest {
    #[allow(dead_code)]
    jsonrpc: Option<String>,
    id: Option<Value>,
    method: String,
    params: Option<Value>,
}

#[derive(Debug, Deserialize)]
struct ToolCallParams {
    name: String,
    #[serde(default)]
    arguments: Value,
}

#[derive(Debug, Deserialize)]
struct AddScoreArgs {
    student_name: String,
    delta: i32,
    #[serde(default)]
    reason_content: Option<String>,
}

#[derive(Debug, Deserialize, Default)]
struct ListStudentsArgs {
    #[serde(default)]
    limit: Option<u64>,
}

#[derive(Debug, Serialize)]
struct AddScoreResult {
    event_id: i32,
    event_uuid: String,
    student_name: String,
    delta: i32,
    val_prev: i32,
    val_curr: i32,
    reason_content: String,
    event_time: String,
}

#[derive(Debug, Serialize)]
struct StudentListItem {
    id: i32,
    name: String,
    score: i32,
    reward_points: i32,
    tags: Vec<String>,
}

#[derive(Debug, Serialize)]
struct ListStudentsResult {
    total: usize,
    students: Vec<StudentListItem>,
}

static MCP_SERVER_STATE: once_cell::sync::Lazy<Arc<Mutex<McpServerState>>> =
    once_cell::sync::Lazy::new(|| Arc::new(Mutex::new(McpServerState::default())));

fn check_admin_permission(state: &Arc<RwLock<AppState>>) -> Result<(), String> {
    let state_guard = state.read();
    let mut permissions = state_guard.permissions.write();
    if !permissions.require_permission(0, PermissionLevel::Admin) {
        return Err("Permission denied: Admin required".to_string());
    }
    Ok(())
}

fn jsonrpc_ok(id: Value, result: Value) -> Value {
    json!({
        "jsonrpc": "2.0",
        "id": id,
        "result": result
    })
}

fn jsonrpc_error(id: Value, code: i32, message: &str) -> Value {
    json!({
        "jsonrpc": "2.0",
        "id": id,
        "error": {
            "code": code,
            "message": message
        }
    })
}

fn initialize_result() -> Value {
    json!({
        "protocolVersion": "2024-11-05",
        "capabilities": {
            "tools": {
                "listChanged": false
            }
        },
        "serverInfo": {
            "name": "secscore-mcp",
            "version": "1.0.0"
        }
    })
}

fn tools_list_result() -> Value {
    json!({
        "tools": [
            {
                "name": "add_score",
                "description": "给指定学生加分/扣分，并写入 score_events 记录。",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "student_name": {"type": "string", "description": "学生姓名"},
                        "delta": {"type": "integer", "description": "分值变化，正数加分，负数扣分"},
                        "reason_content": {"type": "string", "description": "加分原因，默认 MCP 加分"}
                    },
                    "required": ["student_name", "delta"]
                }
            },
            {
                "name": "list_students",
                "description": "获取学生列表，包含姓名、积分、奖励积分和标签。",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "limit": {"type": "integer", "description": "最多返回多少条，默认全部"}
                    }
                }
            }
        ]
    })
}

async fn handle_mcp(
    AxumState(app_state): AxumState<Arc<RwLock<AppState>>>,
    Json(payload): Json<Value>,
) -> Response {
    let req = match serde_json::from_value::<McpRequest>(payload) {
        Ok(v) => v,
        Err(e) => {
            let body = jsonrpc_error(Value::Null, -32700, &format!("Parse error: {}", e));
            return (StatusCode::OK, Json(body)).into_response();
        }
    };

    let Some(id) = req.id.clone() else {
        return StatusCode::NO_CONTENT.into_response();
    };

    let response = match req.method.as_str() {
        "initialize" => jsonrpc_ok(id, initialize_result()),
        "tools/list" => jsonrpc_ok(id, tools_list_result()),
        "tools/call" => {
            let params = req
                .params
                .and_then(|p| serde_json::from_value::<ToolCallParams>(p).ok());

            match params {
                None => jsonrpc_error(id, -32602, "Invalid tools/call params"),
                Some(params) => match params.name.as_str() {
                    "add_score" => match serde_json::from_value::<AddScoreArgs>(params.arguments) {
                        Ok(args) => match mcp_add_score(&app_state, args).await {
                            Ok(payload) => jsonrpc_ok(
                                id,
                                json!({
                                    "content": [
                                        {
                                            "type": "text",
                                            "text": format!(
                                                "已记录：{} {:+} 分（{} -> {}）",
                                                payload.student_name, payload.delta, payload.val_prev, payload.val_curr
                                            )
                                        }
                                    ],
                                    "isError": false,
                                    "structuredContent": payload
                                }),
                            ),
                            Err(e) => jsonrpc_ok(
                                id,
                                json!({
                                    "content": [
                                        {
                                            "type": "text",
                                            "text": format!("加分失败: {}", e)
                                        }
                                    ],
                                    "isError": true
                                }),
                            ),
                        },
                        Err(e) => jsonrpc_error(id, -32602, &format!("Invalid arguments: {}", e)),
                    },
                    "list_students" => {
                        match serde_json::from_value::<ListStudentsArgs>(params.arguments) {
                            Ok(args) => match mcp_list_students(&app_state, args).await {
                                Ok(payload) => jsonrpc_ok(
                                    id,
                                    json!({
                                        "content": [
                                            {
                                                "type": "text",
                                                "text": format!("已获取 {} 名学生", payload.total)
                                            }
                                        ],
                                        "isError": false,
                                        "structuredContent": payload
                                    }),
                                ),
                                Err(e) => jsonrpc_ok(
                                    id,
                                    json!({
                                        "content": [
                                            {
                                                "type": "text",
                                                "text": format!("获取学生列表失败: {}", e)
                                            }
                                        ],
                                        "isError": true
                                    }),
                                ),
                            },
                            Err(e) => {
                                jsonrpc_error(id, -32602, &format!("Invalid arguments: {}", e))
                            }
                        }
                    }
                    _ => jsonrpc_error(id, -32601, &format!("Unknown tool: {}", params.name)),
                },
            }
        }
        "notifications/initialized" => return StatusCode::NO_CONTENT.into_response(),
        _ => jsonrpc_error(id, -32601, &format!("Method not found: {}", req.method)),
    };

    (StatusCode::OK, Json(response)).into_response()
}

async fn mcp_add_score(
    app_state: &Arc<RwLock<AppState>>,
    args: AddScoreArgs,
) -> Result<AddScoreResult, String> {
    let student_name = args.student_name.trim();
    if student_name.is_empty() {
        return Err("student_name 不能为空".to_string());
    }

    let reason_content = args
        .reason_content
        .as_deref()
        .unwrap_or("MCP 加分")
        .trim()
        .to_string();

    let db_conn = {
        let state_guard = app_state.read();
        let db_guard = state_guard.db.read();
        db_guard.clone()
    }
    .ok_or_else(|| "Database not connected".to_string())?;

    let student = students::Entity::find()
        .filter(students::Column::Name.eq(student_name))
        .one(&db_conn)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Student not found: {}", student_name))?;

    let val_prev = student.score;
    let val_curr = val_prev + args.delta;
    let reward_curr = student.reward_points + args.delta;
    let event_time = chrono::Utc::now()
        .format("%Y-%m-%dT%H:%M:%S%.3fZ")
        .to_string();
    let event_uuid = Uuid::new_v4().to_string();

    let txn = db_conn.begin().await.map_err(|e| e.to_string())?;

    let new_event = score_events::ActiveModel {
        id: sea_orm::ActiveValue::NotSet,
        uuid: Set(event_uuid.clone()),
        student_name: Set(student_name.to_string()),
        reason_content: Set(reason_content.clone()),
        delta: Set(args.delta),
        val_prev: Set(val_prev),
        val_curr: Set(val_curr),
        event_time: Set(event_time.clone()),
        settlement_id: Set(None),
    };

    let inserted = new_event.insert(&txn).await.map_err(|e| e.to_string())?;

    let mut student_model: students::ActiveModel = student.into();
    student_model.score = Set(val_curr);
    student_model.reward_points = Set(reward_curr);
    student_model.updated_at = Set(event_time.clone());
    student_model
        .update(&txn)
        .await
        .map_err(|e| e.to_string())?;

    txn.commit().await.map_err(|e| e.to_string())?;

    realtime_dual_write_sync(app_state).await?;

    Ok(AddScoreResult {
        event_id: inserted.id,
        event_uuid,
        student_name: student_name.to_string(),
        delta: args.delta,
        val_prev,
        val_curr,
        reason_content,
        event_time,
    })
}

async fn mcp_list_students(
    app_state: &Arc<RwLock<AppState>>,
    args: ListStudentsArgs,
) -> Result<ListStudentsResult, String> {
    let db_conn = {
        let state_guard = app_state.read();
        let db_guard = state_guard.db.read();
        db_guard.clone()
    }
    .ok_or_else(|| "Database not connected".to_string())?;

    let limit = args.limit.unwrap_or(u64::MAX);

    let rows = students::Entity::find()
        .order_by_asc(students::Column::Name)
        .limit(limit)
        .all(&db_conn)
        .await
        .map_err(|e| e.to_string())?;

    let students = rows
        .into_iter()
        .map(|row| StudentListItem {
            id: row.id,
            name: row.name,
            score: row.score,
            reward_points: row.reward_points,
            tags: serde_json::from_str::<Vec<String>>(&row.tags).unwrap_or_default(),
        })
        .collect::<Vec<_>>();

    Ok(ListStudentsResult {
        total: students.len(),
        students,
    })
}

#[tauri::command]
pub async fn mcp_server_start(
    config: Option<McpServerConfig>,
    state: State<'_, Arc<RwLock<AppState>>>,
) -> Result<IpcResponse<McpServerStartResult>, String> {
    check_admin_permission(&state)?;

    let mut server_state = MCP_SERVER_STATE.lock().await;
    if server_state.is_running {
        return Ok(IpcResponse::failure_with_type(
            "MCP server is already running",
        ));
    }

    let config = config.unwrap_or_default();

    let host: std::net::IpAddr = config
        .host
        .parse()
        .map_err(|e| format!("Invalid host address: {}", e))?;

    let bind_addr: SocketAddr = (host, config.port).into();

    let listener = tokio::net::TcpListener::bind(bind_addr)
        .await
        .map_err(|e| format!("Failed to bind MCP server: {}", e))?;

    let local_addr = listener
        .local_addr()
        .map_err(|e| format!("Failed to get local addr: {}", e))?;

    let app_state = state.inner().clone();
    let router = Router::new()
        .route("/mcp", post(handle_mcp))
        .with_state(app_state);

    let (shutdown_tx, shutdown_rx) = oneshot::channel::<()>();
    tauri::async_runtime::spawn(async move {
        let server = axum::serve(listener, router).with_graceful_shutdown(async move {
            let _ = shutdown_rx.await;
        });

        if let Err(e) = server.await {
            eprintln!("MCP server error: {}", e);
        }
    });

    let url = format!("http://{}:{}/mcp", local_addr.ip(), local_addr.port());

    server_state.is_running = true;
    server_state.config = McpServerConfig {
        host: local_addr.ip().to_string(),
        port: local_addr.port(),
    };
    server_state.url = Some(url.clone());
    server_state.shutdown_tx = Some(shutdown_tx);

    Ok(IpcResponse::success(McpServerStartResult {
        url,
        config: server_state.config.clone(),
    }))
}

#[tauri::command]
pub async fn mcp_server_stop(
    state: State<'_, Arc<RwLock<AppState>>>,
) -> Result<IpcResponse<()>, String> {
    check_admin_permission(&state)?;

    let mut server_state = MCP_SERVER_STATE.lock().await;

    if !server_state.is_running {
        return Ok(IpcResponse::success_empty());
    }

    if let Some(tx) = server_state.shutdown_tx.take() {
        let _ = tx.send(());
    }

    server_state.is_running = false;
    server_state.url = None;

    Ok(IpcResponse::success_empty())
}

#[tauri::command]
pub async fn mcp_server_status(
    _state: State<'_, Arc<RwLock<AppState>>>,
) -> Result<IpcResponse<McpServerStatus>, String> {
    let server_state = MCP_SERVER_STATE.lock().await;

    Ok(IpcResponse::success(McpServerStatus {
        is_running: server_state.is_running,
        config: server_state.config.clone(),
        url: server_state.url.clone(),
    }))
}
