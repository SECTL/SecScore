use axum::Router;
use parking_lot::RwLock;
use rmcp::{
    handler::server::{router::tool::ToolRouter, wrapper::Parameters},
    model::{
        CallToolResult, Content, Implementation, InitializeResult, ProtocolVersion,
        ServerCapabilities, ServerInfo,
    },
    schemars,
    service::RequestContext,
    tool, tool_handler, tool_router,
    transport::streamable_http_server::{
        session::local::LocalSessionManager, StreamableHttpServerConfig, StreamableHttpService,
    },
    ErrorData as McpError, RoleServer, ServerHandler,
};
use sea_orm::{
    ActiveModelTrait, ColumnTrait, EntityTrait, QueryFilter, QueryOrder, QuerySelect, Set,
    TransactionTrait,
};
use sea_orm::prelude::Expr;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::fs;
use std::net::SocketAddr;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tauri::{Emitter, State};
use tokio::sync::{oneshot, Mutex};
use tokio_util::sync::CancellationToken;
use uuid::Uuid;

use crate::db::entities::{score_events, students};
use crate::services::permission::PermissionLevel;
use crate::state::AppState;

use super::database::realtime_dual_write_sync_if_legacy;
use super::response::IpcResponse;

const SECAGENT_SERVER_NAME: &str = "secscore";
const SECAGENT_SERVER_URL: &str = "http://127.0.0.1:3901/mcp";
const SECAGENT_SKILL_DIR: &str = "secscore";
const SECAGENT_SKILL: &str = r#"---
name: SecScore
description: 查询学生、调整积分和撤销积分操作。
---
# SecScore

SecScore 提供学生查询、积分变更和撤销工具。涉及写入时，先确认学生身份和变更原因；完成后用中文简洁说明真实结果。

## 工具

- `secscore__list_students`：列出学生。参数：`limit`（可选，整数）。
- `secscore__find_students`：按姓名或关键词查找学生。参数：`query`（字符串）、`limit`（可选，整数）。
- `secscore__add_score`：给学生增加或扣减积分。参数：`student_id`（可选整数）、`student_name`（可选字符串，用于二次确认）、`delta`（整数，负数表示扣分）、`reason_content`（可选字符串）。
- `secscore__undo_score`：撤销一条积分操作。参数：`event_uuid`（字符串）、`student_id`（整数）。只能撤销真实存在且允许撤销的记录。

优先使用查询工具确认学生，再执行写入；不要臆造学生 ID、事件 UUID 或操作结果。
"#;
const SECAGENT_MCP: &str = r#"{
  "name": "secscore",
  "transport": "http",
  "url": "http://127.0.0.1:3901/mcp",
  "tools": ["list_students", "find_students", "add_score", "undo_score"]
}
"#;

#[derive(Debug, Clone, Serialize)]
pub struct SecAgentRegistrationStatus {
    pub workspace: Option<String>,
    pub skill_registered: bool,
    pub mcp_registered: bool,
    pub server_running: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct SecAgentRegistrationResult {
    pub workspace: String,
    pub skill_path: String,
    pub mcp_path: String,
    pub config_path: String,
}

fn secagent_workspace() -> PathBuf {
    std::env::var_os("SECAGENT_WORKSPACE")
        .map(PathBuf::from)
        .unwrap_or_else(|| dirs::home_dir().unwrap_or_default().join("SecAgentWorkspace"))
}

fn secagent_paths() -> (PathBuf, PathBuf, PathBuf, PathBuf) {
    let root = secagent_workspace();
    (
        root.clone(),
        root.join("secagent.yaml"),
        root.join("skills").join(SECAGENT_SKILL_DIR).join("SKILL.md"),
        root.join("mcp").join("secscore-server.json"),
    )
}

fn secagent_config_enabled(path: &Path) -> bool {
    let Ok(raw) = fs::read_to_string(path) else { return false };
    let Ok(value) = serde_yaml::from_str::<serde_yaml::Value>(&raw) else { return false };
    value.get("mcp")
        .and_then(|v| v.get("servers"))
        .and_then(|v| v.get(SECAGENT_SERVER_NAME))
        .map(|server| {
            server.get("enabled").and_then(serde_yaml::Value::as_bool) == Some(true)
                && server.get("url").and_then(serde_yaml::Value::as_str) == Some(SECAGENT_SERVER_URL)
        })
        .unwrap_or(false)
}

#[tauri::command]
pub async fn secagent_registration_status(
    _state: tauri::State<'_, Arc<RwLock<AppState>>>,
) -> Result<IpcResponse<SecAgentRegistrationStatus>, String> {
    let (root, config, skill, mcp) = secagent_paths();
    Ok(IpcResponse::success(SecAgentRegistrationStatus {
        workspace: if config.is_file() { Some(root.to_string_lossy().into_owned()) } else { None },
        skill_registered: skill.is_file(),
        mcp_registered: mcp.is_file()
            && fs::read_to_string(&mcp).ok().as_deref() == Some(SECAGENT_MCP)
            && secagent_config_enabled(&config),
        server_running: MCP_SERVER_STATE.lock().await.is_running,
    }))
}

#[tauri::command]
pub async fn secagent_register(
    _state: tauri::State<'_, Arc<RwLock<AppState>>>,
) -> Result<IpcResponse<SecAgentRegistrationResult>, String> {
    let (root, config, skill, mcp) = secagent_paths();
    if !config.is_file() {
        return Ok(IpcResponse::error(&format!("未找到 SecAgent 配置：{}，请先初始化 SecAgent。", config.display())));
    }
    let raw = fs::read_to_string(&config).map_err(|e| format!("读取 SecAgent 配置失败：{}", e))?;
    let mut yaml = serde_yaml::from_str::<serde_yaml::Value>(&raw).map_err(|e| format!("SecAgent 配置不是有效 YAML：{}", e))?;
    let root_map = yaml.as_mapping_mut().ok_or("SecAgent 配置根节点必须是对象。")?;
    let mcp_map = root_map.entry(serde_yaml::Value::String("mcp".into())).or_insert_with(|| serde_yaml::Value::Mapping(Default::default())).as_mapping_mut().ok_or("SecAgent 配置的 mcp 节点必须是对象。")?;
    let servers_map = mcp_map.entry(serde_yaml::Value::String("servers".into())).or_insert_with(|| serde_yaml::Value::Mapping(Default::default())).as_mapping_mut().ok_or("SecAgent 配置的 mcp.servers 节点必须是对象。")?;
    servers_map.insert(serde_yaml::Value::String(SECAGENT_SERVER_NAME.into()), serde_yaml::Mapping::from_iter([
        (serde_yaml::Value::String("transport".into()), serde_yaml::Value::String("http".into())),
        (serde_yaml::Value::String("url".into()), serde_yaml::Value::String(SECAGENT_SERVER_URL.into())),
        (serde_yaml::Value::String("enabled".into()), serde_yaml::Value::Bool(true)),
    ]).into());
    let serialized = serde_yaml::to_string(&yaml).map_err(|e| format!("生成 SecAgent 配置失败：{}", e))?;
    fs::create_dir_all(skill.parent().unwrap()).map_err(|e| format!("创建 Skill 目录失败：{}", e))?;
    fs::create_dir_all(mcp.parent().unwrap()).map_err(|e| format!("创建 MCP 目录失败：{}", e))?;
    fs::write(&skill, SECAGENT_SKILL).map_err(|e| format!("写入 Skill 失败：{}", e))?;
    fs::write(&mcp, SECAGENT_MCP).map_err(|e| format!("写入 MCP 配置失败：{}", e))?;
    fs::copy(&config, config.with_extension("yaml.bak")).map_err(|e| format!("备份 SecAgent 配置失败：{}", e))?;
    let temp = config.with_extension(format!("yaml.tmp.{}", uuid::Uuid::new_v4().simple()));
    fs::write(&temp, serialized).map_err(|e| format!("写入临时配置失败：{}", e))?;
    fs::rename(&temp, &config).map_err(|e| format!("替换 SecAgent 配置失败：{}", e))?;
    Ok(IpcResponse::success(SecAgentRegistrationResult {
        workspace: root.to_string_lossy().into_owned(), skill_path: skill.to_string_lossy().into_owned(),
        mcp_path: mcp.to_string_lossy().into_owned(), config_path: config.to_string_lossy().into_owned(),
    }))
}

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
    pub cancellation_token: Option<CancellationToken>,
}

impl Default for McpServerState {
    fn default() -> Self {
        Self {
            is_running: false,
            config: McpServerConfig::default(),
            url: None,
            shutdown_tx: None,
            cancellation_token: None,
        }
    }
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
struct AddScoreArgs {
    #[serde(default)]
    student_id: Option<i32>,
    #[serde(default)]
    student_name: Option<String>,
    delta: i32,
    #[serde(default)]
    reason_content: Option<String>,
}

#[derive(Debug, Deserialize, Default, schemars::JsonSchema)]
struct ListStudentsArgs {
    #[serde(default)]
    limit: Option<u64>,
}

#[derive(Debug, Deserialize, Default, schemars::JsonSchema)]
struct FindStudentsArgs {
    query: String,
    #[serde(default)]
    limit: Option<u64>,
}

#[derive(Debug, Serialize, schemars::JsonSchema)]
struct AddScoreResult {
    event_id: i32,
    event_uuid: String,
    student_id: i32,
    student_name: String,
    delta: i32,
    val_prev: i32,
    val_curr: i32,
    reason_content: String,
    event_time: String,
}

#[derive(Debug, Serialize, schemars::JsonSchema)]
struct StudentListItem {
    id: i32,
    name: String,
    group_name: Option<String>,
    score: i32,
    reward_points: i32,
    tags: Vec<String>,
}

#[derive(Debug, Serialize, schemars::JsonSchema)]
struct ListStudentsResult {
    total: usize,
    students: Vec<StudentListItem>,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
struct UndoScoreArgs {
    event_uuid: String,
    student_id: i32,
}

#[derive(Debug, Serialize, schemars::JsonSchema)]
struct UndoScoreResult {
    event_uuid: String,
    student_id: i32,
    student_name: String,
    delta: i32,
    val_curr: i32,
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

fn mcp_log_info(app_state: &Arc<RwLock<AppState>>, message: &str, meta: Value) {
    println!("[MCP][INFO] {} | {}", message, meta);
    let state_guard = app_state.read();
    let logger = state_guard.logger.read();
    logger.info_with_meta(message, meta.clone());
}

fn mcp_log_error(app_state: &Arc<RwLock<AppState>>, message: &str, meta: Value) {
    eprintln!("[MCP][ERROR] {} | {}", message, meta);
    let state_guard = app_state.read();
    let logger = state_guard.logger.read();
    logger.error_with_meta(message, meta.clone());
}

#[derive(Clone)]
struct SecScoreMcpServer {
    app_state: Arc<RwLock<AppState>>,
    tool_router: ToolRouter<SecScoreMcpServer>,
}

#[tool_router]
impl SecScoreMcpServer {
    fn new(app_state: Arc<RwLock<AppState>>) -> Self {
        Self {
            app_state,
            tool_router: Self::tool_router(),
        }
    }

    #[tool(
        name = "add_score",
        description = "给指定学生加分/扣分，并写入 score_events 记录。优先传入 student_id，避免同名学生误操作。"
    )]
    async fn add_score(
        &self,
        Parameters(args): Parameters<AddScoreArgs>,
    ) -> Result<CallToolResult, McpError> {
        match mcp_add_score(&self.app_state, args).await {
            Ok(payload) => {
                let text = format!(
                    "已记录：{} {:+} 分（{} -> {}）",
                    payload.student_name, payload.delta, payload.val_prev, payload.val_curr
                );
                let structured = serde_json::to_value(&payload)
                    .map_err(|e| McpError::internal_error(e.to_string(), None))?;
                let mut result = CallToolResult::structured(structured);
                result.content = vec![Content::text(text)];
                Ok(result)
            }
            Err(e) => {
                mcp_log_error(
                    &self.app_state,
                    "mcp:tool_call_failed",
                    json!({
                        "tool": "add_score",
                        "error": e
                    }),
                );
                Ok(CallToolResult::error(vec![Content::text(format!(
                    "加分失败: {}",
                    e
                ))]))
            }
        }
    }

    #[tool(
        name = "list_students",
        description = "获取学生列表，包含姓名、积分、奖励积分和标签。"
    )]
    async fn list_students(
        &self,
        Parameters(args): Parameters<ListStudentsArgs>,
    ) -> Result<CallToolResult, McpError> {
        match mcp_list_students(&self.app_state, args).await {
            Ok(payload) => {
                let text = format!("已获取 {} 名学生", payload.total);
                let structured = serde_json::to_value(&payload)
                    .map_err(|e| McpError::internal_error(e.to_string(), None))?;
                let mut result = CallToolResult::structured(structured);
                result.content = vec![Content::text(text)];
                Ok(result)
            }
            Err(e) => {
                mcp_log_error(
                    &self.app_state,
                    "mcp:tool_call_failed",
                    json!({
                        "tool": "list_students",
                        "error": e
                    }),
                );
                Ok(CallToolResult::error(vec![Content::text(format!(
                    "获取学生列表失败: {}",
                    e
                ))]))
            }
        }
    }

    #[tool(
        name = "find_students",
        description = "按姓名关键词查找学生。"
    )]
    async fn find_students(
        &self,
        Parameters(args): Parameters<FindStudentsArgs>,
    ) -> Result<CallToolResult, McpError> {
        match mcp_find_students(&self.app_state, args).await {
            Ok(payload) => {
                let text = format!("找到 {} 名学生", payload.total);
                let structured = serde_json::to_value(&payload)
                    .map_err(|e| McpError::internal_error(e.to_string(), None))?;
                let mut result = CallToolResult::structured(structured);
                result.content = vec![Content::text(text)];
                Ok(result)
            }
            Err(e) => Ok(CallToolResult::error(vec![Content::text(format!("查询学生失败: {}", e))])),
        }
    }

    #[tool(
        name = "undo_score",
        description = "撤销一条未结算积分记录。必须同时提供 add_score 返回的 event_uuid 与 student_id。"
    )]
    async fn undo_score(
        &self,
        Parameters(args): Parameters<UndoScoreArgs>,
    ) -> Result<CallToolResult, McpError> {
        match mcp_undo_score(&self.app_state, args).await {
            Ok(payload) => {
                let text = format!("已撤销：{} {:+} 分", payload.student_name, -payload.delta);
                let structured = serde_json::to_value(&payload)
                    .map_err(|e| McpError::internal_error(e.to_string(), None))?;
                let mut result = CallToolResult::structured(structured);
                result.content = vec![Content::text(text)];
                Ok(result)
            }
            Err(e) => Ok(CallToolResult::error(vec![Content::text(format!("撤销失败: {}", e))])),
        }
    }
}

#[tool_handler]
impl ServerHandler for SecScoreMcpServer {
    fn get_info(&self) -> ServerInfo {
        ServerInfo::new(ServerCapabilities::builder().enable_tools().build())
            .with_server_info(Implementation::new("secscore-mcp", "1.0.0"))
            .with_protocol_version(ProtocolVersion::V_2024_11_05)
    }

    async fn initialize(
        &self,
        request: rmcp::model::InitializeRequestParams,
        context: RequestContext<RoleServer>,
    ) -> Result<InitializeResult, McpError> {
        if context.peer.peer_info().is_none() {
            context.peer.set_peer_info(request);
        }
        mcp_log_info(&self.app_state, "mcp:initialized", json!({}));
        Ok(self.get_info())
    }
}

async fn mcp_add_score(
    app_state: &Arc<RwLock<AppState>>,
    args: AddScoreArgs,
) -> Result<AddScoreResult, String> {
    mcp_log_info(
        app_state,
        "mcp:tool_call_started",
        json!({
            "tool": "add_score",
            "student_id": args.student_id,
            "student_name": args.student_name.clone(),
            "delta": args.delta
        }),
    );

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

    let student = if let Some(student_id) = args.student_id {
        students::Entity::find_by_id(student_id)
            .one(&db_conn)
            .await
            .map_err(|e| e.to_string())?
            .ok_or_else(|| format!("Student not found: {}", student_id))?
    } else {
        let student_name = args.student_name.as_deref().unwrap_or("").trim();
        if student_name.is_empty() {
            return Err("student_id 或 student_name 至少提供一个".to_string());
        }
        students::Entity::find()
            .filter(students::Column::Name.eq(student_name))
            .one(&db_conn)
            .await
            .map_err(|e| e.to_string())?
            .ok_or_else(|| format!("Student not found: {}", student_name))?
    };
    let student_id = student.id;
    let student_name = student.name.clone();

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
        student_name: Set(student_name.clone()),
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

    realtime_dual_write_sync_if_legacy(app_state).await?;
    {
        let state_guard = app_state.read();
        let _ = state_guard.app_handle.emit(
            "ss:data-updated",
            json!({
                "category": "all",
                "source": "mcp"
            }),
        );
    }

    mcp_log_info(
        app_state,
        "mcp:tool_call_succeeded",
        json!({
            "tool": "add_score",
            "student_name": student_name,
            "student_id": student_id,
            "delta": args.delta,
            "event_id": inserted.id,
            "event_uuid": event_uuid
        }),
    );

    Ok(AddScoreResult {
        event_id: inserted.id,
        event_uuid,
        student_id,
        student_name,
        delta: args.delta,
        val_prev,
        val_curr,
        reason_content,
        event_time,
    })
}

async fn mcp_undo_score(
    app_state: &Arc<RwLock<AppState>>,
    args: UndoScoreArgs,
) -> Result<UndoScoreResult, String> {
    let event_uuid = args.event_uuid.trim();
    if event_uuid.is_empty() {
        return Err("event_uuid 不能为空".to_string());
    }

    mcp_log_info(
        app_state,
        "mcp:tool_call_started",
        json!({ "tool": "undo_score", "event_uuid": event_uuid, "student_id": args.student_id }),
    );

    let db_conn = {
        let state_guard = app_state.read();
        let db_guard = state_guard.db.read();
        db_guard.clone()
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

    let student = students::Entity::find_by_id(args.student_id)
        .one(&db_conn)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Student not found: {}", args.student_id))?;
    if student.name != event.student_name {
        return Err("学生与积分事件不匹配，拒绝撤销".to_string());
    }

    let next_score = student.score - event.delta;
    let next_reward_points = student.reward_points - event.delta;
    let now = chrono::Utc::now()
        .format("%Y-%m-%dT%H:%M:%S%.3fZ")
        .to_string();
    let txn = db_conn.begin().await.map_err(|e| e.to_string())?;
    let mut active: students::ActiveModel = student.into();
    active.score = Set(next_score);
    active.reward_points = Set(next_reward_points);
    active.updated_at = Set(now);
    active.update(&txn).await.map_err(|e| e.to_string())?;
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
            json!({ "category": "all", "source": "mcp" }),
        );
    }
    mcp_log_info(
        app_state,
        "mcp:tool_call_succeeded",
        json!({ "tool": "undo_score", "event_uuid": event_uuid, "student_id": args.student_id }),
    );

    Ok(UndoScoreResult {
        event_uuid: event_uuid.to_string(),
        student_id: args.student_id,
        student_name: event.student_name,
        delta: event.delta,
        val_curr: next_score,
    })
}

async fn mcp_list_students(
    app_state: &Arc<RwLock<AppState>>,
    args: ListStudentsArgs,
) -> Result<ListStudentsResult, String> {
    mcp_log_info(
        app_state,
        "mcp:tool_call_started",
        json!({
            "tool": "list_students",
            "limit": args.limit
        }),
    );

    let db_conn = {
        let state_guard = app_state.read();
        let db_guard = state_guard.db.read();
        db_guard.clone()
    }
    .ok_or_else(|| "Database not connected".to_string())?;

    let mut query = students::Entity::find().order_by_asc(students::Column::Name);
    if let Some(limit) = args.limit {
        let safe_limit = limit.min(i64::MAX as u64);
        query = query.limit(safe_limit);
    }

    let rows = query.all(&db_conn).await.map_err(|e| e.to_string())?;

    let students = rows
        .into_iter()
        .map(|row| StudentListItem {
            id: row.id,
            name: row.name,
            group_name: row.group_name,
            score: row.score,
            reward_points: row.reward_points,
            tags: serde_json::from_str::<Vec<String>>(&row.tags).unwrap_or_default(),
        })
        .collect::<Vec<_>>();

    mcp_log_info(
        app_state,
        "mcp:tool_call_succeeded",
        json!({
            "tool": "list_students",
            "total": students.len()
        }),
    );

    Ok(ListStudentsResult {
        total: students.len(),
        students,
    })
}

async fn mcp_find_students(
    app_state: &Arc<RwLock<AppState>>,
    args: FindStudentsArgs,
) -> Result<ListStudentsResult, String> {
    let query = args.query.trim();
    if query.is_empty() {
        return Err("query 不能为空".to_string());
    }
    let db_conn = {
        let state_guard = app_state.read();
        let db_guard = state_guard.db.read();
        db_guard.clone()
    }
    .ok_or_else(|| "Database not connected".to_string())?;

    let mut student_query = students::Entity::find()
        .filter(Expr::col(students::Column::Name).like(format!("%{}%", query)))
        .order_by_asc(students::Column::Name);
    if let Some(limit) = args.limit {
        student_query = student_query.limit(limit.min(i64::MAX as u64));
    }
    let rows = student_query.all(&db_conn).await.map_err(|e| e.to_string())?;
    let students = rows
        .into_iter()
        .map(|row| StudentListItem {
            id: row.id,
            name: row.name,
            group_name: row.group_name,
            score: row.score,
            reward_points: row.reward_points,
            tags: serde_json::from_str::<Vec<String>>(&row.tags).unwrap_or_default(),
        })
        .collect::<Vec<_>>();
    mcp_log_info(app_state, "mcp:tool_call_succeeded", json!({
        "tool": "find_students", "query": query, "total": students.len()
    }));
    Ok(ListStudentsResult { total: students.len(), students })
}

#[tauri::command]
pub async fn mcp_server_start(
    config: Option<McpServerConfig>,
    state: State<'_, Arc<RwLock<AppState>>>,
) -> Result<IpcResponse<McpServerStartResult>, String> {
    check_admin_permission(&state)?;
    mcp_log_info(
        state.inner(),
        "mcp:server_start_requested",
        json!({
            "config": config.clone()
        }),
    );

    let mut server_state = MCP_SERVER_STATE.lock().await;
    if server_state.is_running {
        mcp_log_info(
            state.inner(),
            "mcp:server_already_running",
            json!({
                "url": server_state.url.clone()
            }),
        );
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
    let cancellation_token = CancellationToken::new();
    let mcp_service = StreamableHttpService::new(
        move || Ok(SecScoreMcpServer::new(app_state.clone())),
        LocalSessionManager::default().into(),
        StreamableHttpServerConfig {
            stateful_mode: false,
            json_response: true,
            cancellation_token: cancellation_token.child_token(),
            ..Default::default()
        },
    );

    let router = Router::new().nest_service("/mcp", mcp_service);

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
    server_state.cancellation_token = Some(cancellation_token);

    mcp_log_info(
        state.inner(),
        "mcp:server_started",
        json!({
            "url": url.clone(),
            "host": server_state.config.host.clone(),
            "port": server_state.config.port
        }),
    );

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
    mcp_log_info(state.inner(), "mcp:server_stop_requested", json!({}));

    let mut server_state = MCP_SERVER_STATE.lock().await;

    if !server_state.is_running {
        mcp_log_info(state.inner(), "mcp:server_already_stopped", json!({}));
        return Ok(IpcResponse::success_empty());
    }

    if let Some(token) = server_state.cancellation_token.take() {
        token.cancel();
    }

    if let Some(tx) = server_state.shutdown_tx.take() {
        let _ = tx.send(());
    }

    server_state.is_running = false;
    server_state.url = None;

    mcp_log_info(state.inner(), "mcp:server_stopped", json!({}));

    Ok(IpcResponse::success_empty())
}

#[tauri::command]
pub async fn mcp_server_status(
    state: State<'_, Arc<RwLock<AppState>>>,
) -> Result<IpcResponse<McpServerStatus>, String> {
    let server_state = MCP_SERVER_STATE.lock().await;
    mcp_log_info(
        state.inner(),
        "mcp:server_status_requested",
        json!({
            "is_running": server_state.is_running,
            "url": server_state.url.clone()
        }),
    );

    Ok(IpcResponse::success(McpServerStatus {
        is_running: server_state.is_running,
        config: server_state.config.clone(),
        url: server_state.url.clone(),
    }))
}
