use parking_lot::RwLock;
use sea_orm::{
    ActiveModelTrait, ColumnTrait, EntityTrait, QueryFilter, QueryOrder, Set, TransactionTrait,
};
use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::State;

use crate::db::entities::students;
use crate::models::{StudentUpdate, StudentWithTags};
use crate::services::logger::LogLevel;
use crate::services::PermissionLevel;
use crate::state::AppState;

use super::database::realtime_dual_write_sync;
use super::response::{ImportResult, IpcResponse};

#[derive(Deserialize)]
pub struct CreateStudentData {
    pub name: String,
    pub group_name: Option<String>,
}

#[derive(Deserialize)]
pub struct ImportStudentsParams {
    pub names: Vec<String>,
}

#[derive(Deserialize)]
pub struct FetchBanYouClassroomsParams {
    pub cookie: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FetchBanYouClassroomDetailParams {
    pub cookie: String,
    pub class_id: String,
    pub team_plan_id: Option<i64>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct BanYouClassroom {
    pub class_id: String,
    #[serde(default)]
    pub class_nick_name: String,
    #[serde(default)]
    pub invitation_code: Option<String>,
    #[serde(default)]
    pub master_name: Option<String>,
    #[serde(default)]
    pub students_num: Option<i32>,
    #[serde(default)]
    pub praise_count: Option<i32>,
    #[serde(default)]
    pub class_avatar_path: Option<String>,
    #[serde(default)]
    pub class_avatar_data_url: Option<String>,
    #[serde(default)]
    pub is_own: Option<bool>,
}

#[derive(Debug, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct BanYouClassroomFetchData {
    #[serde(default)]
    pub classrooms: Vec<BanYouClassroom>,
    #[serde(default)]
    pub administrative_groups: Vec<BanYouClassroom>,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct BanYouMedal {
    #[serde(default)]
    pub key: String,
    #[serde(default)]
    pub uid: String,
    #[serde(default)]
    pub name: String,
    #[serde(rename = "type", default)]
    pub medal_type: i32,
    #[serde(default)]
    pub value: i32,
    #[serde(default)]
    pub avatar: Option<String>,
    #[serde(default)]
    pub custom_avatar: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct BanYouStudentItem {
    #[serde(default)]
    pub student_id: String,
    #[serde(default)]
    pub student_name: String,
    #[serde(default)]
    pub avatar: Option<String>,
    #[serde(default)]
    pub student_avatar: Option<String>,
    #[serde(default)]
    pub custom_avatar: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct BanYouTeamItem {
    #[serde(default)]
    pub team_id: String,
    #[serde(default)]
    pub team_name: String,
    #[serde(default)]
    pub students: Vec<BanYouStudentItem>,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct BanYouStudentFetchData {
    #[serde(default)]
    pub students: Vec<BanYouStudentItem>,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct BanYouGroupFetchData {
    #[serde(default)]
    pub teams: Vec<BanYouTeamItem>,
    #[serde(default)]
    pub students: Vec<BanYouStudentItem>,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct BanYouClassroomDetailData {
    #[serde(default)]
    pub medals: Vec<BanYouMedal>,
    #[serde(default)]
    pub students: Vec<BanYouStudentItem>,
    #[serde(default)]
    pub teams: Vec<BanYouTeamItem>,
    #[serde(default)]
    pub ungrouped_students: Vec<BanYouStudentItem>,
    #[serde(default)]
    pub team_plan_id_used: Option<i64>,
    #[serde(default)]
    pub team_plans: Vec<BanYouTeamPlanOption>,
    #[serde(default)]
    pub team_plan_source: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct BanYouTeamPlanOption {
    pub team_plan_id: i64,
    #[serde(default)]
    pub name: String,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
struct BanYouGroupCollectionPlan {
    #[serde(default)]
    pub team_plan_id: i64,
    #[serde(default)]
    pub plan_name: String,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
struct BanYouGroupCollectionData {
    #[serde(default)]
    pub class_team_plans: Vec<BanYouGroupCollectionPlan>,
}

#[derive(Debug, Deserialize)]
struct BanYouApiResponse<T> {
    pub code: i32,
    pub data: Option<T>,
    pub message: Option<String>,
}

fn check_admin_permission(state: &Arc<RwLock<AppState>>, sender_id: Option<u32>) -> bool {
    let state_guard = state.read();
    let mut permissions = state_guard.permissions.write();
    let id = sender_id.unwrap_or(0);
    permissions.require_permission(id, PermissionLevel::Admin)
}

fn check_view_permission(state: &Arc<RwLock<AppState>>, sender_id: Option<u32>) -> bool {
    let state_guard = state.read();
    let mut permissions = state_guard.permissions.write();
    let id = sender_id.unwrap_or(0);
    permissions.require_permission(id, PermissionLevel::View)
}

fn log_banyou(
    state: &Arc<RwLock<AppState>>,
    level: LogLevel,
    message: &str,
    meta: Option<serde_json::Value>,
) {
    let state_guard = state.read();
    let logger = state_guard.logger.read();
    logger.log(level, message, Some("student:banyou"), meta);
}

fn first_n_chars(text: &str, n: usize) -> String {
    text.chars().take(n).collect()
}

fn extract_between<'a>(text: &'a str, start: &str, end: &str) -> Option<&'a str> {
    let from = text.find(start)?;
    let from_idx = from + start.len();
    let tail = &text[from_idx..];
    let to = tail.find(end)?;
    Some(&tail[..to])
}

fn extract_csrf_token_from_html(html: &str) -> Option<String> {
    let patterns = [
        ("name=\"csrf-token\" content=\"", "\""),
        ("name='csrf-token' content='", "'"),
        ("\"csrfToken\":\"", "\""),
        ("'csrfToken':'", "'"),
        ("csrfToken:\"", "\""),
        ("csrfToken:'", "'"),
    ];
    for (start, end) in patterns {
        if let Some(token) = extract_between(html, start, end) {
            let trimmed = token.trim();
            if !trimmed.is_empty() {
                return Some(trimmed.to_string());
            }
        }
    }
    None
}

async fn get_banyou_client_and_csrf(
    state: &Arc<RwLock<AppState>>,
    cookie: &str,
) -> Result<(reqwest::Client, Option<String>), String> {
    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36")
        .build()
        .map_err(|e| {
            log_banyou(
                state,
                LogLevel::Error,
                "failed to build reqwest client",
                Some(serde_json::json!({ "error": e.to_string() })),
            );
            e.to_string()
        })?;

    let csrf_token = match client
        .get("https://care.seewo.com/app/")
        .header(reqwest::header::COOKIE, cookie)
        .send()
        .await
    {
        Ok(resp) => {
            let status = resp.status();
            match resp.text().await {
                Ok(html) => {
                    let token = extract_csrf_token_from_html(&html);
                    log_banyou(
                        state,
                        LogLevel::Info,
                        "csrf token fetch finished",
                        Some(serde_json::json!({
                            "status": status.as_u16(),
                            "html_length": html.len(),
                            "csrf_found": token.is_some(),
                        })),
                    );
                    token
                }
                Err(e) => {
                    log_banyou(
                        state,
                        LogLevel::Warn,
                        "failed to read app html when fetching csrf token",
                        Some(serde_json::json!({ "error": e.to_string() })),
                    );
                    None
                }
            }
        }
        Err(e) => {
            log_banyou(
                state,
                LogLevel::Warn,
                "failed to request app html for csrf token",
                Some(serde_json::json!({ "error": e.to_string() })),
            );
            None
        }
    };

    Ok((client, csrf_token))
}

async fn post_banyou_action<T: DeserializeOwned>(
    state: &Arc<RwLock<AppState>>,
    client: &reqwest::Client,
    cookie: &str,
    csrf_token: Option<&str>,
    action: &str,
    params: serde_json::Value,
) -> Result<T, String> {
    let timestamp = chrono::Utc::now().timestamp_millis();
    let url = format!(
        "https://care.seewo.com/app/apis.json?action={action}&timestamp={timestamp}&isAjax=1"
    );
    let payload = serde_json::json!({
        "action": action,
        "params": params,
    });

    let mut request = client
        .post(url)
        .header(
            reqwest::header::ACCEPT,
            "application/json, text/javascript, */*; q=0.01",
        )
        .header(reqwest::header::ACCEPT_LANGUAGE, "zh-CN,zh;q=0.9")
        .header(reqwest::header::CACHE_CONTROL, "no-cache")
        .header(reqwest::header::PRAGMA, "no-cache")
        .header(reqwest::header::CONTENT_TYPE, "application/json")
        .header(reqwest::header::ORIGIN, "https://care.seewo.com")
        .header(reqwest::header::REFERER, "https://care.seewo.com/app/")
        .header("X-Requested-With", "XMLHttpRequest")
        .header(reqwest::header::COOKIE, cookie)
        .json(&payload);

    if let Some(token) = csrf_token {
        request = request.header("x-csrf-token", token);
    }

    let response = request.send().await.map_err(|e| {
        log_banyou(
            state,
            LogLevel::Error,
            "http request failed",
            Some(serde_json::json!({ "action": action, "error": e.to_string() })),
        );
        e.to_string()
    })?;

    let status = response.status();
    let body = response.text().await.map_err(|e| {
        log_banyou(
            state,
            LogLevel::Error,
            "failed to read response body",
            Some(serde_json::json!({ "action": action, "error": e.to_string() })),
        );
        e.to_string()
    })?;

    if !status.is_success() {
        log_banyou(
            state,
            LogLevel::Error,
            "non-success http status from banyou",
            Some(serde_json::json!({
                "action": action,
                "status": status.as_u16(),
                "body_preview": first_n_chars(&body, 500),
            })),
        );
        return Err(format!(
            "班优接口请求失败（{} HTTP {}）",
            action,
            status.as_u16()
        ));
    }

    let parsed: BanYouApiResponse<T> = serde_json::from_str(&body).map_err(|e| {
        log_banyou(
            state,
            LogLevel::Error,
            "failed to parse banyou response json",
            Some(serde_json::json!({
                "action": action,
                "error": e.to_string(),
                "body_preview": first_n_chars(&body, 500),
            })),
        );
        format!("Failed to parse BanYou response: {}", e)
    })?;

    if parsed.code != 200 {
        let msg = parsed
            .message
            .unwrap_or_else(|| format!("BanYou API returned code {}", parsed.code));
        log_banyou(
            state,
            LogLevel::Warn,
            "banyou api returned non-200 business code",
            Some(serde_json::json!({
                "action": action,
                "code": parsed.code,
                "message": msg,
            })),
        );
        return Err(msg);
    }

    parsed
        .data
        .ok_or_else(|| format!("班优接口返回空数据（{}）", action))
}

async fn try_fetch_team_plans(
    state: &Arc<RwLock<AppState>>,
    client: &reqwest::Client,
    cookie: &str,
    csrf_token: Option<&str>,
    class_id: &str,
) -> (Vec<BanYouTeamPlanOption>, Option<String>) {
    if let Ok(data) = post_banyou_action::<BanYouGroupCollectionData>(
        state,
        client,
        cookie,
        csrf_token,
        "GROUP_COLLECTION_GET_LIST",
        serde_json::json!({ "classId": class_id, "originKey": "easicare-web" }),
    )
    .await
    {
        let mut list: Vec<BanYouTeamPlanOption> = data
            .class_team_plans
            .into_iter()
            .filter(|p| p.team_plan_id > 0)
            .map(|p| BanYouTeamPlanOption {
                team_plan_id: p.team_plan_id,
                name: p.plan_name,
            })
            .collect();
        if !list.is_empty() {
            list.sort_by_key(|x| x.team_plan_id);
            return (list, Some("GROUP_COLLECTION_GET_LIST".to_string()));
        }
    }
    (Vec::new(), None)
}

async fn fetch_image_as_data_url(
    client: &reqwest::Client,
    image_url: &str,
    cookie: &str,
) -> Result<String, String> {
    let response = client
        .get(image_url)
        .header(reqwest::header::REFERER, "https://care.seewo.com/app/")
        .header(reqwest::header::ORIGIN, "https://care.seewo.com")
        .header(reqwest::header::COOKIE, cookie)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let status = response.status();
    if !status.is_success() {
        return Err(format!("http status {}", status.as_u16()));
    }

    let content_type = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("image/png")
        .to_string();

    let bytes = response.bytes().await.map_err(|e| e.to_string())?;
    let base64_data = base64::Engine::encode(&base64::engine::general_purpose::STANDARD, &bytes);
    Ok(format!("data:{};base64,{}", content_type, base64_data))
}

#[tauri::command]
pub async fn student_query(
    state: State<'_, Arc<RwLock<AppState>>>,
    sender_id: Option<u32>,
) -> Result<IpcResponse<Vec<StudentWithTags>>, String> {
    if !check_view_permission(&state, sender_id) {
        return Ok(IpcResponse::error("Permission denied: view required"));
    }

    let state_guard = state.read();
    let db_guard = state_guard.db.read();

    if let Some(conn) = db_guard.as_ref() {
        let results = students::Entity::find()
            .order_by_desc(students::Column::Score)
            .order_by_asc(students::Column::Name)
            .all(conn)
            .await;

        match results {
            Ok(student_models) => {
                let students: Vec<StudentWithTags> = student_models
                    .into_iter()
                    .map(|s| StudentWithTags {
                        id: s.id,
                        name: s.name,
                        group_name: s.group_name,
                        score: s.score,
                        reward_points: s.reward_points,
                        tags: serde_json::from_str(&s.tags).unwrap_or_default(),
                        extra_json: s.extra_json,
                    })
                    .collect();
                Ok(IpcResponse::success(students))
            }
            Err(e) => Ok(IpcResponse::error(&format!(
                "Failed to query students: {}",
                e
            ))),
        }
    } else {
        Ok(IpcResponse::error("Database not connected"))
    }
}

#[tauri::command]
pub async fn student_create(
    state: State<'_, Arc<RwLock<AppState>>>,
    sender_id: Option<u32>,
    data: CreateStudentData,
) -> Result<IpcResponse<i32>, String> {
    if !check_admin_permission(&state, sender_id) {
        return Ok(IpcResponse::error("Permission denied: admin required"));
    }

    let name = data.name.trim();
    if name.is_empty() {
        return Ok(IpcResponse::error("Student name cannot be empty"));
    }
    if name.len() > 64 {
        return Ok(IpcResponse::error(
            "Student name too long (max 64 characters)",
        ));
    }

    let state_guard = state.read();
    let db_guard = state_guard.db.read();

    if let Some(conn) = db_guard.as_ref() {
        let existing = students::Entity::find()
            .filter(students::Column::Name.eq(name))
            .one(conn)
            .await;

        match existing {
            Ok(Some(_)) => Ok(IpcResponse::error("Student with this name already exists")),
            Ok(None) => {
                let now = chrono::Utc::now()
                    .format("%Y-%m-%dT%H:%M:%S%.3fZ")
                    .to_string();
                let group_name = data
                    .group_name
                    .as_deref()
                    .map(str::trim)
                    .filter(|v| !v.is_empty())
                    .map(|v| v.to_string());
                let new_student = students::ActiveModel {
                    id: sea_orm::ActiveValue::NotSet,
                    name: Set(name.to_string()),
                    group_name: Set(group_name),
                    score: Set(0),
                    reward_points: Set(0),
                    tags: Set("[]".to_string()),
                    extra_json: Set(None),
                    created_at: Set(now.clone()),
                    updated_at: Set(now),
                };

                match new_student.insert(conn).await {
                    Ok(inserted) => {
                        realtime_dual_write_sync(state.inner()).await?;
                        Ok(IpcResponse::success(inserted.id))
                    }
                    Err(e) => Ok(IpcResponse::error(&format!(
                        "Failed to create student: {}",
                        e
                    ))),
                }
            }
            Err(e) => Ok(IpcResponse::error(&format!("Database error: {}", e))),
        }
    } else {
        Ok(IpcResponse::error("Database not connected"))
    }
}

#[tauri::command]
pub async fn student_update(
    state: State<'_, Arc<RwLock<AppState>>>,
    sender_id: Option<u32>,
    id: i32,
    data: StudentUpdate,
) -> Result<IpcResponse<()>, String> {
    if !check_admin_permission(&state, sender_id) {
        return Ok(IpcResponse::error("Permission denied: admin required"));
    }

    let state_guard = state.read();
    let db_guard = state_guard.db.read();

    if let Some(conn) = db_guard.as_ref() {
        let existing = students::Entity::find_by_id(id).one(conn).await;

        match existing {
            Ok(Some(student)) => {
                let now = chrono::Utc::now()
                    .format("%Y-%m-%dT%H:%M:%S%.3fZ")
                    .to_string();
                let mut active: students::ActiveModel = student.into();

                active.updated_at = Set(now);

                if let Some(name) = data.name {
                    active.name = Set(name);
                }
                if let Some(group_name) = data.group_name {
                    let normalized = group_name.trim();
                    active.group_name = if normalized.is_empty() {
                        Set(None)
                    } else {
                        Set(Some(normalized.to_string()))
                    };
                }
                if let Some(score) = data.score {
                    active.score = Set(score);
                }
                if let Some(reward_points) = data.reward_points {
                    active.reward_points = Set(reward_points);
                }
                if let Some(tags) = data.tags {
                    active.tags =
                        Set(serde_json::to_string(&tags).unwrap_or_else(|_| "[]".to_string()));
                }
                if let Some(extra_json) = data.extra_json {
                    active.extra_json = Set(Some(extra_json));
                }

                match active.update(conn).await {
                    Ok(_) => {
                        realtime_dual_write_sync(state.inner()).await?;
                        Ok(IpcResponse::success_empty())
                    }
                    Err(e) => Ok(IpcResponse::error(&format!(
                        "Failed to update student: {}",
                        e
                    ))),
                }
            }
            Ok(None) => Ok(IpcResponse::error("Student not found")),
            Err(e) => Ok(IpcResponse::error(&format!("Database error: {}", e))),
        }
    } else {
        Ok(IpcResponse::error("Database not connected"))
    }
}

#[tauri::command]
pub async fn student_delete(
    state: State<'_, Arc<RwLock<AppState>>>,
    sender_id: Option<u32>,
    id: i32,
) -> Result<IpcResponse<()>, String> {
    if !check_admin_permission(&state, sender_id) {
        return Ok(IpcResponse::error("Permission denied: admin required"));
    }

    let state_guard = state.read();
    let db_guard = state_guard.db.read();

    if let Some(conn) = db_guard.as_ref() {
        let existing = students::Entity::find_by_id(id).one(conn).await;

        match existing {
            Ok(Some(student)) => {
                let txn = conn.begin().await.map_err(|e| e.to_string())?;

                students::Entity::delete(students::ActiveModel {
                    id: sea_orm::ActiveValue::Set(student.id),
                    name: sea_orm::ActiveValue::Unchanged(student.name),
                    group_name: sea_orm::ActiveValue::Unchanged(student.group_name),
                    score: sea_orm::ActiveValue::Unchanged(student.score),
                    reward_points: sea_orm::ActiveValue::Unchanged(student.reward_points),
                    tags: sea_orm::ActiveValue::Unchanged(student.tags),
                    extra_json: sea_orm::ActiveValue::Unchanged(student.extra_json),
                    created_at: sea_orm::ActiveValue::Unchanged(student.created_at),
                    updated_at: sea_orm::ActiveValue::Unchanged(student.updated_at),
                })
                .exec(&txn)
                .await
                .map_err(|e| e.to_string())?;

                txn.commit().await.map_err(|e| e.to_string())?;
                realtime_dual_write_sync(state.inner()).await?;
                Ok(IpcResponse::success_empty())
            }
            Ok(None) => Ok(IpcResponse::error("Student not found")),
            Err(e) => Ok(IpcResponse::error(&format!("Database error: {}", e))),
        }
    } else {
        Ok(IpcResponse::error("Database not connected"))
    }
}

#[tauri::command]
pub async fn student_import_from_xlsx(
    state: State<'_, Arc<RwLock<AppState>>>,
    sender_id: Option<u32>,
    params: ImportStudentsParams,
) -> Result<IpcResponse<ImportResult>, String> {
    if !check_admin_permission(&state, sender_id) {
        return Ok(IpcResponse::error("Permission denied: admin required"));
    }

    let cleaned: Vec<String> = params
        .names
        .into_iter()
        .map(|n| n.trim().to_string())
        .filter(|n| !n.is_empty() && n.len() <= 64)
        .collect();

    let unique_names: std::collections::HashSet<String> = cleaned.into_iter().collect();
    let unique_names: Vec<String> = unique_names.into_iter().collect();

    if unique_names.is_empty() {
        return Ok(IpcResponse::success(ImportResult {
            inserted: 0,
            skipped: 0,
            total: 0,
        }));
    }

    let state_guard = state.read();
    let db_guard = state_guard.db.read();

    if let Some(conn) = db_guard.as_ref() {
        let existing = students::Entity::find()
            .filter(
                students::Column::Name
                    .is_in(unique_names.iter().map(|s| s.as_str()).collect::<Vec<_>>()),
            )
            .all(conn)
            .await;

        match existing {
            Ok(existing_students) => {
                let existing_names: std::collections::HashSet<String> =
                    existing_students.into_iter().map(|s| s.name).collect();

                let to_insert: Vec<&String> = unique_names
                    .iter()
                    .filter(|n| !existing_names.contains(*n))
                    .collect();

                let inserted = to_insert.len();
                let skipped = unique_names.len() - inserted;

                if !to_insert.is_empty() {
                    let txn = conn.begin().await.map_err(|e| e.to_string())?;
                    let now = chrono::Utc::now()
                        .format("%Y-%m-%dT%H:%M:%S%.3fZ")
                        .to_string();

                    for name in &to_insert {
                        let new_student = students::ActiveModel {
                            id: sea_orm::ActiveValue::NotSet,
                            name: Set(name.to_string()),
                            group_name: Set(None),
                            score: Set(0),
                            reward_points: Set(0),
                            tags: Set("[]".to_string()),
                            extra_json: Set(None),
                            created_at: Set(now.clone()),
                            updated_at: Set(now.clone()),
                        };
                        new_student.insert(&txn).await.map_err(|e| e.to_string())?;
                    }

                    txn.commit().await.map_err(|e| e.to_string())?;
                    realtime_dual_write_sync(state.inner()).await?;
                }

                Ok(IpcResponse::success(ImportResult {
                    inserted,
                    skipped,
                    total: unique_names.len(),
                }))
            }
            Err(e) => Ok(IpcResponse::error(&format!("Database error: {}", e))),
        }
    } else {
        Ok(IpcResponse::error("Database not connected"))
    }
}

#[tauri::command]
pub async fn student_fetch_banyou_classrooms(
    state: State<'_, Arc<RwLock<AppState>>>,
    sender_id: Option<u32>,
    params: FetchBanYouClassroomsParams,
) -> Result<IpcResponse<BanYouClassroomFetchData>, String> {
    if !check_admin_permission(&state, sender_id) {
        return Ok(IpcResponse::error("Permission denied: admin required"));
    }

    let cookie = params.cookie.trim();
    if cookie.is_empty() {
        log_banyou(
            state.inner(),
            LogLevel::Warn,
            "fetch classrooms rejected: empty cookie",
            None,
        );
        return Ok(IpcResponse::error("Cookie cannot be empty"));
    }
    log_banyou(
        state.inner(),
        LogLevel::Info,
        "fetch classrooms started",
        Some(serde_json::json!({
            "cookie_length": cookie.len(),
            "contains_uid": cookie.contains("uid="),
            "contains_access_token": cookie.contains("accessToken="),
        })),
    );

    let (client, csrf_token) = match get_banyou_client_and_csrf(state.inner(), cookie).await {
        Ok(v) => v,
        Err(err) => return Ok(IpcResponse::error(&err)),
    };

    let mut data: BanYouClassroomFetchData = match post_banyou_action(
        state.inner(),
        &client,
        cookie,
        csrf_token.as_deref(),
        "CLASSROOM_FETCH",
        serde_json::json!({ "originKey": "easicare-web" }),
    )
    .await
    {
        Ok(v) => v,
        Err(err) => return Ok(IpcResponse::error(&err)),
    };

    for classroom in &mut data.classrooms {
        classroom.class_avatar_data_url = None;
        if let Some(url) = classroom.class_avatar_path.clone() {
            match fetch_image_as_data_url(&client, &url, cookie).await {
                Ok(data_url) => {
                    classroom.class_avatar_data_url = Some(data_url);
                }
                Err(err) => {
                    log_banyou(
                        state.inner(),
                        LogLevel::Warn,
                        "failed to fetch classroom avatar",
                        Some(serde_json::json!({
                            "class_id": classroom.class_id,
                            "url": url,
                            "error": err,
                        })),
                    );
                }
            }
        }
    }

    for classroom in &mut data.administrative_groups {
        classroom.class_avatar_data_url = None;
        if let Some(url) = classroom.class_avatar_path.clone() {
            match fetch_image_as_data_url(&client, &url, cookie).await {
                Ok(data_url) => {
                    classroom.class_avatar_data_url = Some(data_url);
                }
                Err(err) => {
                    log_banyou(
                        state.inner(),
                        LogLevel::Warn,
                        "failed to fetch administrative group avatar",
                        Some(serde_json::json!({
                            "class_id": classroom.class_id,
                            "url": url,
                            "error": err,
                        })),
                    );
                }
            }
        }
    }

    log_banyou(
        state.inner(),
        LogLevel::Info,
        "fetch classrooms succeeded",
        Some(serde_json::json!({
            "classrooms": data.classrooms.len(),
            "administrative_groups": data.administrative_groups.len(),
            "classrooms_avatar_data_url_count": data
                .classrooms
                .iter()
                .filter(|c| c.class_avatar_data_url.is_some())
                .count(),
        })),
    );
    Ok(IpcResponse::success(data))
}

#[tauri::command]
pub async fn student_fetch_banyou_classroom_detail(
    state: State<'_, Arc<RwLock<AppState>>>,
    sender_id: Option<u32>,
    params: FetchBanYouClassroomDetailParams,
) -> Result<IpcResponse<BanYouClassroomDetailData>, String> {
    if !check_admin_permission(&state, sender_id) {
        return Ok(IpcResponse::error("Permission denied: admin required"));
    }

    let cookie = params.cookie.trim();
    let class_id = params.class_id.trim();
    if cookie.is_empty() {
        return Ok(IpcResponse::error("Cookie cannot be empty"));
    }
    if class_id.is_empty() {
        return Ok(IpcResponse::error("Class ID cannot be empty"));
    }

    log_banyou(
        state.inner(),
        LogLevel::Info,
        "fetch classroom detail started",
        Some(serde_json::json!({
            "class_id": class_id,
            "team_plan_id": params.team_plan_id,
        })),
    );

    let (client, csrf_token) = match get_banyou_client_and_csrf(state.inner(), cookie).await {
        Ok(v) => v,
        Err(err) => return Ok(IpcResponse::error(&err)),
    };

    let medals: Vec<BanYouMedal> = match post_banyou_action(
        state.inner(),
        &client,
        cookie,
        csrf_token.as_deref(),
        "MEDAL_FETCH_BY_CLASSROOM",
        serde_json::json!({
            "cid": class_id,
            "originKey": "easicare-web",
        }),
    )
    .await
    {
        Ok(v) => v,
        Err(err) => return Ok(IpcResponse::error(&err)),
    };

    let students_data: BanYouStudentFetchData = match post_banyou_action(
        state.inner(),
        &client,
        cookie,
        csrf_token.as_deref(),
        "STUDENT_FETCH_LIST",
        serde_json::json!({
            "classroomId": class_id,
            "originKey": "easicare-web",
        }),
    )
    .await
    {
        Ok(v) => v,
        Err(err) => return Ok(IpcResponse::error(&err)),
    };

    let (team_plans, team_plan_source) = if params.team_plan_id.is_none() {
        try_fetch_team_plans(
            state.inner(),
            &client,
            cookie,
            csrf_token.as_deref(),
            class_id,
        )
        .await
    } else {
        (Vec::new(), None)
    };

    let final_team_plan_id = params
        .team_plan_id
        .or_else(|| team_plans.first().map(|p| p.team_plan_id));

    let group_data = if let Some(team_plan_id) = final_team_plan_id {
        match post_banyou_action::<BanYouGroupFetchData>(
            state.inner(),
            &client,
            cookie,
            csrf_token.as_deref(),
            "GROUP_FETCH_LIST",
            serde_json::json!({
                "classroomId": class_id,
                "teamPlanId": team_plan_id,
                "originKey": "easicare-web",
            }),
        )
        .await
        {
            Ok(v) => Some(v),
            Err(err) => {
                log_banyou(
                    state.inner(),
                    LogLevel::Warn,
                    "group fetch failed",
                    Some(serde_json::json!({
                        "class_id": class_id,
                        "team_plan_id": team_plan_id,
                        "error": err,
                    })),
                );
                None
            }
        }
    } else {
        None
    };

    let detail = BanYouClassroomDetailData {
        medals,
        students: students_data.students,
        teams: group_data
            .as_ref()
            .map(|d| d.teams.clone())
            .unwrap_or_default(),
        ungrouped_students: group_data
            .as_ref()
            .map(|d| d.students.clone())
            .unwrap_or_default(),
        team_plan_id_used: final_team_plan_id,
        team_plans,
        team_plan_source,
    };

    log_banyou(
        state.inner(),
        LogLevel::Info,
        "fetch classroom detail succeeded",
        Some(serde_json::json!({
            "class_id": class_id,
            "medals": detail.medals.len(),
            "students": detail.students.len(),
            "teams": detail.teams.len(),
            "ungrouped_students": detail.ungrouped_students.len(),
            "team_plans": detail.team_plans.len(),
            "team_plan_id_used": detail.team_plan_id_used,
            "team_plan_source": detail.team_plan_source,
        })),
    );

    Ok(IpcResponse::success(detail))
}
