use parking_lot::RwLock;
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::time::{timeout, Duration};

use crate::db::connection::DatabaseType;
use crate::db::connection::{create_postgres_connection, create_sqlite_connection};
use crate::db::entities::{
    reasons, reward_redemptions, reward_settings, score_events, student_tags, students, tags,
};
use crate::db::migration::run_migration;
use crate::services::logger::LogLevel;
use crate::services::permission::PermissionLevel;
use crate::services::settings::{SettingsKey, SettingsValue};
use crate::state::AppState;
use sea_orm::{ActiveModelTrait, ColumnTrait, EntityTrait, QueryFilter, Set};

use super::response::IpcResponse;

const DB_CONNECT_TIMEOUT_SECS: u64 = 15;
const DB_MIGRATION_TIMEOUT_SECS: u64 = 20;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TestConnectionResult {
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SwitchConnectionResult {
    #[serde(rename = "type")]
    pub db_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DatabaseStatus {
    #[serde(rename = "type")]
    pub db_type: String,
    pub connected: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncResult {
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DbSyncConflict {
    pub table: String,
    pub key: String,
    pub local_summary: String,
    pub remote_summary: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DbSyncPreviewResult {
    pub can_sync: bool,
    pub need_sync: bool,
    pub local_only: usize,
    pub remote_only: usize,
    pub conflicts: Vec<DbSyncConflict>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DbSyncApplyResult {
    pub success: bool,
    pub synced_records: usize,
    pub resolved_conflicts: usize,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct SettingChange {
    pub key: String,
    pub value: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ConflictStrategy {
    KeepLocal,
    KeepRemote,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct StudentNormalized {
    name: String,
    group_name: Option<String>,
    score: i32,
    reward_points: i32,
    tags: String,
    extra_json: Option<String>,
    created_at: String,
    updated_at: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct ReasonNormalized {
    content: String,
    category: String,
    delta: i32,
    is_system: i32,
    updated_at: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct TagNormalized {
    name: String,
    created_at: String,
    updated_at: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct EventNormalized {
    uuid: String,
    student_name: String,
    reason_content: String,
    delta: i32,
    val_prev: i32,
    val_curr: i32,
    event_time: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct RewardSettingNormalized {
    name: String,
    cost_points: i32,
    created_at: String,
    updated_at: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct RewardRedemptionNormalized {
    uuid: String,
    student_name: String,
    reward_id: i32,
    reward_name: String,
    cost_points: i32,
    redeemed_at: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
struct StudentTagPair {
    student_name: String,
    tag_name: String,
}

fn normalize_tags(raw: &str) -> String {
    let parsed: Vec<String> = serde_json::from_str(raw).unwrap_or_default();
    let mut cleaned: Vec<String> = parsed
        .into_iter()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect();
    cleaned.sort();
    cleaned.dedup();
    serde_json::to_string(&cleaned).unwrap_or_else(|_| "[]".to_string())
}

fn sqlite_db_path(app_handle: &AppHandle) -> Result<String, String> {
    if cfg!(all(debug_assertions, desktop)) {
        return Ok("data.sql".to_string());
    }

    let app_data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data directory: {}", e))?;
    let data_dir = app_data_dir.join("data");
    std::fs::create_dir_all(&data_dir)
        .map_err(|e| format!("Failed to create data directory: {}", e))?;
    let db_path = data_dir.join("data.sql");
    db_path
        .to_str()
        .map(|s| s.to_string())
        .ok_or_else(|| "Invalid sqlite database path".to_string())
}

async fn load_students(
    conn: &sea_orm::DatabaseConnection,
) -> Result<std::collections::HashMap<String, StudentNormalized>, String> {
    let rows = students::Entity::find()
        .all(conn)
        .await
        .map_err(|e| e.to_string())?;
    let mut map = std::collections::HashMap::new();
    for row in rows {
        map.insert(
            row.name.clone(),
            StudentNormalized {
                name: row.name,
                group_name: row.group_name,
                score: row.score,
                reward_points: row.reward_points,
                tags: normalize_tags(&row.tags),
                extra_json: row.extra_json,
                created_at: row.created_at,
                updated_at: row.updated_at,
            },
        );
    }
    Ok(map)
}

async fn load_reasons(
    conn: &sea_orm::DatabaseConnection,
) -> Result<std::collections::HashMap<String, ReasonNormalized>, String> {
    let rows = reasons::Entity::find()
        .all(conn)
        .await
        .map_err(|e| e.to_string())?;
    let mut map = std::collections::HashMap::new();
    for row in rows {
        map.insert(
            row.content.clone(),
            ReasonNormalized {
                content: row.content,
                category: row.category,
                delta: row.delta,
                is_system: row.is_system,
                updated_at: row.updated_at,
            },
        );
    }
    Ok(map)
}

async fn load_tags(
    conn: &sea_orm::DatabaseConnection,
) -> Result<std::collections::HashMap<String, TagNormalized>, String> {
    let rows = tags::Entity::find()
        .all(conn)
        .await
        .map_err(|e| e.to_string())?;
    let mut map = std::collections::HashMap::new();
    for row in rows {
        map.insert(
            row.name.clone(),
            TagNormalized {
                name: row.name,
                created_at: row.created_at,
                updated_at: row.updated_at,
            },
        );
    }
    Ok(map)
}

async fn load_events(
    conn: &sea_orm::DatabaseConnection,
) -> Result<std::collections::HashMap<String, EventNormalized>, String> {
    let rows = score_events::Entity::find()
        .all(conn)
        .await
        .map_err(|e| e.to_string())?;
    let mut map = std::collections::HashMap::new();
    for row in rows {
        map.insert(
            row.uuid.clone(),
            EventNormalized {
                uuid: row.uuid,
                student_name: row.student_name,
                reason_content: row.reason_content,
                delta: row.delta,
                val_prev: row.val_prev,
                val_curr: row.val_curr,
                event_time: row.event_time,
            },
        );
    }
    Ok(map)
}

async fn load_reward_settings(
    conn: &sea_orm::DatabaseConnection,
) -> Result<std::collections::HashMap<String, RewardSettingNormalized>, String> {
    let rows = reward_settings::Entity::find()
        .all(conn)
        .await
        .map_err(|e| e.to_string())?;
    let mut map = std::collections::HashMap::new();
    for row in rows {
        map.insert(
            row.name.clone(),
            RewardSettingNormalized {
                name: row.name,
                cost_points: row.cost_points,
                created_at: row.created_at,
                updated_at: row.updated_at,
            },
        );
    }
    Ok(map)
}

async fn load_reward_redemptions(
    conn: &sea_orm::DatabaseConnection,
) -> Result<std::collections::HashMap<String, RewardRedemptionNormalized>, String> {
    let rows = reward_redemptions::Entity::find()
        .all(conn)
        .await
        .map_err(|e| e.to_string())?;
    let mut map = std::collections::HashMap::new();
    for row in rows {
        map.insert(
            row.uuid.clone(),
            RewardRedemptionNormalized {
                uuid: row.uuid,
                student_name: row.student_name,
                reward_id: row.reward_id,
                reward_name: row.reward_name,
                cost_points: row.cost_points,
                redeemed_at: row.redeemed_at,
            },
        );
    }
    Ok(map)
}

async fn load_student_tag_pairs(
    conn: &sea_orm::DatabaseConnection,
) -> Result<std::collections::HashSet<StudentTagPair>, String> {
    let student_rows = students::Entity::find()
        .all(conn)
        .await
        .map_err(|e| e.to_string())?;
    let tag_rows = tags::Entity::find()
        .all(conn)
        .await
        .map_err(|e| e.to_string())?;
    let link_rows = student_tags::Entity::find()
        .all(conn)
        .await
        .map_err(|e| e.to_string())?;

    let student_name_map: std::collections::HashMap<i32, String> =
        student_rows.into_iter().map(|s| (s.id, s.name)).collect();
    let tag_name_map: std::collections::HashMap<i32, String> =
        tag_rows.into_iter().map(|t| (t.id, t.name)).collect();

    let mut pairs = std::collections::HashSet::new();
    for rel in link_rows {
        if let (Some(student_name), Some(tag_name)) = (
            student_name_map.get(&rel.student_id),
            tag_name_map.get(&rel.tag_id),
        ) {
            pairs.insert(StudentTagPair {
                student_name: student_name.clone(),
                tag_name: tag_name.clone(),
            });
        }
    }
    Ok(pairs)
}

fn compare_maps<T: PartialEq>(
    table: &str,
    local: &std::collections::HashMap<String, T>,
    remote: &std::collections::HashMap<String, T>,
) -> (usize, usize, Vec<(String, String)>) {
    let mut local_only = 0usize;
    let mut remote_only = 0usize;
    let mut conflicts: Vec<(String, String)> = Vec::new();

    for (key, local_value) in local {
        if let Some(remote_value) = remote.get(key) {
            if local_value != remote_value {
                conflicts.push((table.to_string(), key.clone()));
            }
        } else {
            local_only += 1;
        }
    }

    for key in remote.keys() {
        if !local.contains_key(key) {
            remote_only += 1;
        }
    }

    (local_only, remote_only, conflicts)
}

async fn upsert_student(
    conn: &sea_orm::DatabaseConnection,
    data: &StudentNormalized,
) -> Result<bool, String> {
    let existing = students::Entity::find()
        .filter(students::Column::Name.eq(&data.name))
        .one(conn)
        .await
        .map_err(|e| e.to_string())?;

    match existing {
        Some(row) => {
            let normalized_current = StudentNormalized {
                name: row.name.clone(),
                group_name: row.group_name.clone(),
                score: row.score,
                reward_points: row.reward_points,
                tags: normalize_tags(&row.tags),
                extra_json: row.extra_json.clone(),
                created_at: row.created_at.clone(),
                updated_at: row.updated_at.clone(),
            };
            if normalized_current == *data {
                return Ok(false);
            }
            let mut active: students::ActiveModel = row.into();
            active.score = Set(data.score);
            active.group_name = Set(data.group_name.clone());
            active.reward_points = Set(data.reward_points);
            active.tags = Set(data.tags.clone());
            active.extra_json = Set(data.extra_json.clone());
            active.created_at = Set(data.created_at.clone());
            active.updated_at = Set(data.updated_at.clone());
            active.update(conn).await.map_err(|e| e.to_string())?;
            Ok(true)
        }
        None => {
            students::ActiveModel {
                id: sea_orm::ActiveValue::NotSet,
                name: Set(data.name.clone()),
                group_name: Set(data.group_name.clone()),
                score: Set(data.score),
                reward_points: Set(data.reward_points),
                tags: Set(data.tags.clone()),
                extra_json: Set(data.extra_json.clone()),
                created_at: Set(data.created_at.clone()),
                updated_at: Set(data.updated_at.clone()),
            }
            .insert(conn)
            .await
            .map_err(|e| e.to_string())?;
            Ok(true)
        }
    }
}

async fn upsert_reason(
    conn: &sea_orm::DatabaseConnection,
    data: &ReasonNormalized,
) -> Result<bool, String> {
    let existing = reasons::Entity::find()
        .filter(reasons::Column::Content.eq(&data.content))
        .one(conn)
        .await
        .map_err(|e| e.to_string())?;
    match existing {
        Some(row) => {
            let normalized_current = ReasonNormalized {
                content: row.content.clone(),
                category: row.category.clone(),
                delta: row.delta,
                is_system: row.is_system,
                updated_at: row.updated_at.clone(),
            };
            if normalized_current == *data {
                return Ok(false);
            }
            let mut active: reasons::ActiveModel = row.into();
            active.category = Set(data.category.clone());
            active.delta = Set(data.delta);
            active.is_system = Set(data.is_system);
            active.updated_at = Set(data.updated_at.clone());
            active.update(conn).await.map_err(|e| e.to_string())?;
            Ok(true)
        }
        None => {
            reasons::ActiveModel {
                id: sea_orm::ActiveValue::NotSet,
                content: Set(data.content.clone()),
                category: Set(data.category.clone()),
                delta: Set(data.delta),
                is_system: Set(data.is_system),
                updated_at: Set(data.updated_at.clone()),
            }
            .insert(conn)
            .await
            .map_err(|e| e.to_string())?;
            Ok(true)
        }
    }
}

async fn upsert_tag(
    conn: &sea_orm::DatabaseConnection,
    data: &TagNormalized,
) -> Result<bool, String> {
    let existing = tags::Entity::find()
        .filter(tags::Column::Name.eq(&data.name))
        .one(conn)
        .await
        .map_err(|e| e.to_string())?;
    match existing {
        Some(row) => {
            let normalized_current = TagNormalized {
                name: row.name.clone(),
                created_at: row.created_at.clone(),
                updated_at: row.updated_at.clone(),
            };
            if normalized_current == *data {
                return Ok(false);
            }
            let mut active: tags::ActiveModel = row.into();
            active.created_at = Set(data.created_at.clone());
            active.updated_at = Set(data.updated_at.clone());
            active.update(conn).await.map_err(|e| e.to_string())?;
            Ok(true)
        }
        None => {
            tags::ActiveModel {
                id: sea_orm::ActiveValue::NotSet,
                name: Set(data.name.clone()),
                created_at: Set(data.created_at.clone()),
                updated_at: Set(data.updated_at.clone()),
            }
            .insert(conn)
            .await
            .map_err(|e| e.to_string())?;
            Ok(true)
        }
    }
}

async fn upsert_event(
    conn: &sea_orm::DatabaseConnection,
    data: &EventNormalized,
) -> Result<bool, String> {
    let existing = score_events::Entity::find()
        .filter(score_events::Column::Uuid.eq(&data.uuid))
        .one(conn)
        .await
        .map_err(|e| e.to_string())?;
    match existing {
        Some(row) => {
            let normalized_current = EventNormalized {
                uuid: row.uuid.clone(),
                student_name: row.student_name.clone(),
                reason_content: row.reason_content.clone(),
                delta: row.delta,
                val_prev: row.val_prev,
                val_curr: row.val_curr,
                event_time: row.event_time.clone(),
            };
            if normalized_current == *data {
                return Ok(false);
            }
            let mut active: score_events::ActiveModel = row.into();
            active.student_name = Set(data.student_name.clone());
            active.reason_content = Set(data.reason_content.clone());
            active.delta = Set(data.delta);
            active.val_prev = Set(data.val_prev);
            active.val_curr = Set(data.val_curr);
            active.event_time = Set(data.event_time.clone());
            active.update(conn).await.map_err(|e| e.to_string())?;
            Ok(true)
        }
        None => {
            score_events::ActiveModel {
                id: sea_orm::ActiveValue::NotSet,
                uuid: Set(data.uuid.clone()),
                student_name: Set(data.student_name.clone()),
                reason_content: Set(data.reason_content.clone()),
                delta: Set(data.delta),
                val_prev: Set(data.val_prev),
                val_curr: Set(data.val_curr),
                event_time: Set(data.event_time.clone()),
                settlement_id: Set(None),
            }
            .insert(conn)
            .await
            .map_err(|e| e.to_string())?;
            Ok(true)
        }
    }
}

async fn upsert_reward_setting(
    conn: &sea_orm::DatabaseConnection,
    data: &RewardSettingNormalized,
) -> Result<bool, String> {
    let existing = reward_settings::Entity::find()
        .filter(reward_settings::Column::Name.eq(&data.name))
        .one(conn)
        .await
        .map_err(|e| e.to_string())?;
    match existing {
        Some(row) => {
            let normalized_current = RewardSettingNormalized {
                name: row.name.clone(),
                cost_points: row.cost_points,
                created_at: row.created_at.clone(),
                updated_at: row.updated_at.clone(),
            };
            if normalized_current == *data {
                return Ok(false);
            }
            let mut active: reward_settings::ActiveModel = row.into();
            active.cost_points = Set(data.cost_points);
            active.created_at = Set(data.created_at.clone());
            active.updated_at = Set(data.updated_at.clone());
            active.update(conn).await.map_err(|e| e.to_string())?;
            Ok(true)
        }
        None => {
            reward_settings::ActiveModel {
                id: sea_orm::ActiveValue::NotSet,
                name: Set(data.name.clone()),
                cost_points: Set(data.cost_points),
                created_at: Set(data.created_at.clone()),
                updated_at: Set(data.updated_at.clone()),
            }
            .insert(conn)
            .await
            .map_err(|e| e.to_string())?;
            Ok(true)
        }
    }
}

async fn upsert_reward_redemption(
    conn: &sea_orm::DatabaseConnection,
    data: &RewardRedemptionNormalized,
) -> Result<bool, String> {
    let existing = reward_redemptions::Entity::find()
        .filter(reward_redemptions::Column::Uuid.eq(&data.uuid))
        .one(conn)
        .await
        .map_err(|e| e.to_string())?;
    match existing {
        Some(row) => {
            let normalized_current = RewardRedemptionNormalized {
                uuid: row.uuid.clone(),
                student_name: row.student_name.clone(),
                reward_id: row.reward_id,
                reward_name: row.reward_name.clone(),
                cost_points: row.cost_points,
                redeemed_at: row.redeemed_at.clone(),
            };
            if normalized_current == *data {
                return Ok(false);
            }
            let mut active: reward_redemptions::ActiveModel = row.into();
            active.student_name = Set(data.student_name.clone());
            active.reward_id = Set(data.reward_id);
            active.reward_name = Set(data.reward_name.clone());
            active.cost_points = Set(data.cost_points);
            active.redeemed_at = Set(data.redeemed_at.clone());
            active.update(conn).await.map_err(|e| e.to_string())?;
            Ok(true)
        }
        None => {
            reward_redemptions::ActiveModel {
                id: sea_orm::ActiveValue::NotSet,
                uuid: Set(data.uuid.clone()),
                student_name: Set(data.student_name.clone()),
                reward_id: Set(data.reward_id),
                reward_name: Set(data.reward_name.clone()),
                cost_points: Set(data.cost_points),
                redeemed_at: Set(data.redeemed_at.clone()),
            }
            .insert(conn)
            .await
            .map_err(|e| e.to_string())?;
            Ok(true)
        }
    }
}

async fn ensure_student_tag_pair(
    conn: &sea_orm::DatabaseConnection,
    pair: &StudentTagPair,
) -> Result<bool, String> {
    let student_row = students::Entity::find()
        .filter(students::Column::Name.eq(&pair.student_name))
        .one(conn)
        .await
        .map_err(|e| e.to_string())?;
    let tag_row = tags::Entity::find()
        .filter(tags::Column::Name.eq(&pair.tag_name))
        .one(conn)
        .await
        .map_err(|e| e.to_string())?;

    let (Some(student_row), Some(tag_row)) = (student_row, tag_row) else {
        return Ok(false);
    };

    let existing = student_tags::Entity::find()
        .filter(student_tags::Column::StudentId.eq(student_row.id))
        .filter(student_tags::Column::TagId.eq(tag_row.id))
        .one(conn)
        .await
        .map_err(|e| e.to_string())?;

    if existing.is_some() {
        return Ok(false);
    }

    student_tags::ActiveModel {
        id: sea_orm::ActiveValue::NotSet,
        student_id: Set(student_row.id),
        tag_id: Set(tag_row.id),
        created_at: Set(chrono::Utc::now()
            .format("%Y-%m-%dT%H:%M:%S%.3fZ")
            .to_string()),
    }
    .insert(conn)
    .await
    .map_err(|e| e.to_string())?;
    Ok(true)
}

async fn current_remote_and_local_from_state(
    app_handle: &AppHandle,
    app_state: &Arc<RwLock<AppState>>,
) -> Result<Option<(sea_orm::DatabaseConnection, sea_orm::DatabaseConnection)>, String> {
    let (current_conn, db_type) = {
        let state_guard = app_state.read();
        let db = state_guard.db.read().clone();
        let settings = state_guard.settings.read();
        let status_json = settings.get_value(SettingsKey::PgConnectionStatus);
        let db_type = match status_json {
            SettingsValue::Json(json) => json
                .get("type")
                .and_then(|t| t.as_str())
                .unwrap_or("sqlite")
                .to_string(),
            _ => "sqlite".to_string(),
        };
        (db, db_type)
    };

    let Some(remote_conn) = current_conn else {
        return Ok(None);
    };
    if db_type != "postgresql" {
        return Ok(None);
    }

    let local_path = sqlite_db_path(app_handle)?;
    let local_conn = create_sqlite_connection(&local_path)
        .await
        .map_err(|e| e.to_string())?;
    run_migration(&local_conn, DatabaseType::SQLite)
        .await
        .map_err(|e| e.to_string())?;

    Ok(Some((local_conn, remote_conn)))
}

pub async fn realtime_dual_write_sync(app_state: &Arc<RwLock<AppState>>) -> Result<(), String> {
    let app_handle = {
        let state_guard = app_state.read();
        state_guard.app_handle.clone()
    };

    let Some((local_conn, remote_conn)) =
        current_remote_and_local_from_state(&app_handle, app_state).await?
    else {
        return Ok(());
    };

    // PostgreSQL 远端为主库，实时同步只做远端 -> 本地镜像，避免本地旧快照反向覆盖远端新值。
    let remote_students = load_students(&remote_conn).await?;
    for student in remote_students.values() {
        let _ = upsert_student(&local_conn, student).await?;
    }

    let remote_reasons = load_reasons(&remote_conn).await?;
    for reason in remote_reasons.values() {
        let _ = upsert_reason(&local_conn, reason).await?;
    }

    let remote_tags = load_tags(&remote_conn).await?;
    for tag in remote_tags.values() {
        let _ = upsert_tag(&local_conn, tag).await?;
    }

    let remote_events = load_events(&remote_conn).await?;
    for event in remote_events.values() {
        let _ = upsert_event(&local_conn, event).await?;
    }

    let remote_reward_settings = load_reward_settings(&remote_conn).await?;
    for reward in remote_reward_settings.values() {
        let _ = upsert_reward_setting(&local_conn, reward).await?;
    }

    let remote_redemptions = load_reward_redemptions(&remote_conn).await?;
    for redemption in remote_redemptions.values() {
        let _ = upsert_reward_redemption(&local_conn, redemption).await?;
    }

    let remote_pairs = load_student_tag_pairs(&remote_conn).await?;
    for pair in &remote_pairs {
        let _ = ensure_student_tag_pair(&local_conn, pair).await?;
    }

    Ok(())
}

async fn db_sync_apply_internal(
    strategy: ConflictStrategy,
    app_handle: AppHandle,
    app_state: Arc<RwLock<AppState>>,
) -> Result<DbSyncApplyResult, String> {
    let Some((local_conn, remote_conn)) =
        current_remote_and_local_from_state(&app_handle, &app_state).await?
    else {
        return Ok(DbSyncApplyResult {
            success: false,
            synced_records: 0,
            resolved_conflicts: 0,
            message: Some("当前不在 PostgreSQL 远程模式，无法执行同步".to_string()),
        });
    };

    let local_students = load_students(&local_conn).await?;
    let remote_students = load_students(&remote_conn).await?;
    let local_reasons = load_reasons(&local_conn).await?;
    let remote_reasons = load_reasons(&remote_conn).await?;
    let local_tags = load_tags(&local_conn).await?;
    let remote_tags = load_tags(&remote_conn).await?;
    let local_events = load_events(&local_conn).await?;
    let remote_events = load_events(&remote_conn).await?;
    let local_reward_settings = load_reward_settings(&local_conn).await?;
    let remote_reward_settings = load_reward_settings(&remote_conn).await?;
    let local_reward_redemptions = load_reward_redemptions(&local_conn).await?;
    let remote_reward_redemptions = load_reward_redemptions(&remote_conn).await?;
    let local_pairs = load_student_tag_pairs(&local_conn).await?;
    let remote_pairs = load_student_tag_pairs(&remote_conn).await?;

    let mut synced_records = 0usize;
    let mut resolved_conflicts = 0usize;

    // Deterministic per-key merge:
    // 1) local_only => remote
    // 2) remote_only => local
    // 3) conflict => resolve by strategy (winner -> loser)
    let student_keys: std::collections::HashSet<String> = local_students
        .keys()
        .chain(remote_students.keys())
        .cloned()
        .collect();
    for key in student_keys {
        match (local_students.get(&key), remote_students.get(&key)) {
            (Some(local), Some(remote)) if local != remote => {
                let changed = if strategy == ConflictStrategy::KeepLocal {
                    upsert_student(&remote_conn, local).await?
                } else {
                    upsert_student(&local_conn, remote).await?
                };
                if changed {
                    resolved_conflicts += 1;
                }
            }
            (Some(local), None) => {
                if upsert_student(&remote_conn, local).await? {
                    synced_records += 1;
                }
            }
            (None, Some(remote)) => {
                if upsert_student(&local_conn, remote).await? {
                    synced_records += 1;
                }
            }
            _ => {}
        }
    }

    let reason_keys: std::collections::HashSet<String> = local_reasons
        .keys()
        .chain(remote_reasons.keys())
        .cloned()
        .collect();
    for key in reason_keys {
        match (local_reasons.get(&key), remote_reasons.get(&key)) {
            (Some(local), Some(remote)) if local != remote => {
                let changed = if strategy == ConflictStrategy::KeepLocal {
                    upsert_reason(&remote_conn, local).await?
                } else {
                    upsert_reason(&local_conn, remote).await?
                };
                if changed {
                    resolved_conflicts += 1;
                }
            }
            (Some(local), None) => {
                if upsert_reason(&remote_conn, local).await? {
                    synced_records += 1;
                }
            }
            (None, Some(remote)) => {
                if upsert_reason(&local_conn, remote).await? {
                    synced_records += 1;
                }
            }
            _ => {}
        }
    }

    let tag_keys: std::collections::HashSet<String> = local_tags
        .keys()
        .chain(remote_tags.keys())
        .cloned()
        .collect();
    for key in tag_keys {
        match (local_tags.get(&key), remote_tags.get(&key)) {
            (Some(local), Some(remote)) if local != remote => {
                let changed = if strategy == ConflictStrategy::KeepLocal {
                    upsert_tag(&remote_conn, local).await?
                } else {
                    upsert_tag(&local_conn, remote).await?
                };
                if changed {
                    resolved_conflicts += 1;
                }
            }
            (Some(local), None) => {
                if upsert_tag(&remote_conn, local).await? {
                    synced_records += 1;
                }
            }
            (None, Some(remote)) => {
                if upsert_tag(&local_conn, remote).await? {
                    synced_records += 1;
                }
            }
            _ => {}
        }
    }

    let event_keys: std::collections::HashSet<String> = local_events
        .keys()
        .chain(remote_events.keys())
        .cloned()
        .collect();
    for key in event_keys {
        match (local_events.get(&key), remote_events.get(&key)) {
            (Some(local), Some(remote)) if local != remote => {
                let changed = if strategy == ConflictStrategy::KeepLocal {
                    upsert_event(&remote_conn, local).await?
                } else {
                    upsert_event(&local_conn, remote).await?
                };
                if changed {
                    resolved_conflicts += 1;
                }
            }
            (Some(local), None) => {
                if upsert_event(&remote_conn, local).await? {
                    synced_records += 1;
                }
            }
            (None, Some(remote)) => {
                if upsert_event(&local_conn, remote).await? {
                    synced_records += 1;
                }
            }
            _ => {}
        }
    }

    let reward_setting_keys: std::collections::HashSet<String> = local_reward_settings
        .keys()
        .chain(remote_reward_settings.keys())
        .cloned()
        .collect();
    for key in reward_setting_keys {
        match (
            local_reward_settings.get(&key),
            remote_reward_settings.get(&key),
        ) {
            (Some(local), Some(remote)) if local != remote => {
                let changed = if strategy == ConflictStrategy::KeepLocal {
                    upsert_reward_setting(&remote_conn, local).await?
                } else {
                    upsert_reward_setting(&local_conn, remote).await?
                };
                if changed {
                    resolved_conflicts += 1;
                }
            }
            (Some(local), None) => {
                if upsert_reward_setting(&remote_conn, local).await? {
                    synced_records += 1;
                }
            }
            (None, Some(remote)) => {
                if upsert_reward_setting(&local_conn, remote).await? {
                    synced_records += 1;
                }
            }
            _ => {}
        }
    }

    let redemption_keys: std::collections::HashSet<String> = local_reward_redemptions
        .keys()
        .chain(remote_reward_redemptions.keys())
        .cloned()
        .collect();
    for key in redemption_keys {
        match (
            local_reward_redemptions.get(&key),
            remote_reward_redemptions.get(&key),
        ) {
            (Some(local), Some(remote)) if local != remote => {
                let changed = if strategy == ConflictStrategy::KeepLocal {
                    upsert_reward_redemption(&remote_conn, local).await?
                } else {
                    upsert_reward_redemption(&local_conn, remote).await?
                };
                if changed {
                    resolved_conflicts += 1;
                }
            }
            (Some(local), None) => {
                if upsert_reward_redemption(&remote_conn, local).await? {
                    synced_records += 1;
                }
            }
            (None, Some(remote)) => {
                if upsert_reward_redemption(&local_conn, remote).await? {
                    synced_records += 1;
                }
            }
            _ => {}
        }
    }

    for pair in local_pairs.difference(&remote_pairs) {
        if ensure_student_tag_pair(&remote_conn, pair).await? {
            synced_records += 1;
        }
    }
    for pair in remote_pairs.difference(&local_pairs) {
        if ensure_student_tag_pair(&local_conn, pair).await? {
            synced_records += 1;
        }
    }

    Ok(DbSyncApplyResult {
        success: true,
        synced_records,
        resolved_conflicts,
        message: Some("本地与远程同步完成".to_string()),
    })
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

#[tauri::command]
pub async fn db_test_connection(
    connection_string: String,
    _state: State<'_, Arc<RwLock<AppState>>>,
) -> Result<IpcResponse<TestConnectionResult>, String> {
    let result = if connection_string.starts_with("sqlite://") {
        let path = connection_string
            .strip_prefix("sqlite://")
            .unwrap_or(&connection_string);
        match create_sqlite_connection(path).await {
            Ok(conn) => {
                let _ = conn.close().await;
                TestConnectionResult {
                    success: true,
                    error: None,
                }
            }
            Err(e) => TestConnectionResult {
                success: false,
                error: Some(e.to_string()),
            },
        }
    } else if connection_string.starts_with("postgres://")
        || connection_string.starts_with("postgresql://")
    {
        let connection_result = timeout(
            Duration::from_secs(DB_CONNECT_TIMEOUT_SECS),
            create_postgres_connection(&connection_string),
        )
        .await;

        match connection_result {
            Err(_) => TestConnectionResult {
                success: false,
                error: Some("PostgreSQL 连接超时，请检查网络或连接字符串".to_string()),
            },
            Ok(Err(e)) => TestConnectionResult {
                success: false,
                error: Some(e.to_string()),
            },
            Ok(Ok(conn)) => {
                let _ = conn.close().await;
                TestConnectionResult {
                    success: true,
                    error: None,
                }
            }
        }
    } else {
        let path = connection_string.as_str();
        match create_sqlite_connection(path).await {
            Ok(conn) => {
                let _ = conn.close().await;
                TestConnectionResult {
                    success: true,
                    error: None,
                }
            }
            Err(e) => TestConnectionResult {
                success: false,
                error: Some(e.to_string()),
            },
        }
    };

    Ok(IpcResponse::success(result))
}

#[tauri::command]
pub async fn db_switch_connection(
    connection_string: String,
    app_handle: AppHandle,
    state: State<'_, Arc<RwLock<AppState>>>,
) -> Result<IpcResponse<SwitchConnectionResult>, String> {
    check_admin_permission(&state)?;

    let state_guard = state.read();
    let logger = state_guard.logger.read();
    logger.log(
        LogLevel::Info,
        &format!(
            "Database switch requested, connection_string length: {}",
            connection_string.len()
        ),
        Some("database"),
        None,
    );

    let (db_type, saved_connection_string, saved_status, conn) = if connection_string
        .starts_with("postgres://")
        || connection_string.starts_with("postgresql://")
    {
        logger.log(
            LogLevel::Info,
            "Switching to PostgreSQL database",
            Some("database"),
            None,
        );
        let conn = timeout(
            Duration::from_secs(DB_CONNECT_TIMEOUT_SECS),
            create_postgres_connection(&connection_string),
        )
        .await
        .map_err(|_| "PostgreSQL 连接超时，请检查网络或连接字符串".to_string())?
        .map_err(|e| {
            logger.log(
                LogLevel::Error,
                &format!("PostgreSQL connection failed: {}", e),
                Some("database"),
                None,
            );
            e.to_string()
        })?;
        timeout(
            Duration::from_secs(DB_MIGRATION_TIMEOUT_SECS),
            run_migration(&conn, DatabaseType::PostgreSQL),
        )
        .await
        .map_err(|_| "PostgreSQL 初始化超时，请稍后重试".to_string())?
        .map_err(|e| {
            logger.log(
                LogLevel::Error,
                &format!("PostgreSQL migration failed: {}", e),
                Some("database"),
                None,
            );
            e.to_string()
        })?;

        logger.log(
            LogLevel::Info,
            "PostgreSQL connection and migration successful",
            Some("database"),
            None,
        );

        (
            "postgresql".to_string(),
            connection_string.clone(),
            json!({ "connected": true, "type": "postgresql" }),
            conn,
        )
    } else {
        logger.log(
            LogLevel::Info,
            "Switching to SQLite database",
            Some("database"),
            None,
        );
        let path = if connection_string.starts_with("sqlite://") {
            connection_string
                .strip_prefix("sqlite://")
                .unwrap_or(&connection_string)
                .to_string()
        } else {
            connection_string
        };

        let conn = create_sqlite_connection(&path).await.map_err(|e| {
            logger.log(
                LogLevel::Error,
                &format!("SQLite connection failed: {}", e),
                Some("database"),
                None,
            );
            e.to_string()
        })?;
        run_migration(&conn, DatabaseType::SQLite)
            .await
            .map_err(|e| {
                logger.log(
                    LogLevel::Error,
                    &format!("SQLite migration failed: {}", e),
                    Some("database"),
                    None,
                );
                e.to_string()
            })?;

        logger.log(
            LogLevel::Info,
            "SQLite connection and migration successful",
            Some("database"),
            None,
        );

        (
            "sqlite".to_string(),
            String::new(),
            json!({ "connected": true, "type": "sqlite" }),
            conn,
        )
    };

    {
        let settings_db_path = sqlite_db_path(&app_handle)?;
        let settings_conn = create_sqlite_connection(&settings_db_path)
            .await
            .map_err(|e| e.to_string())?;
        run_migration(&settings_conn, DatabaseType::SQLite)
            .await
            .map_err(|e| e.to_string())?;

        let state_guard = state.read();
        {
            let mut db_guard = state_guard.db.write();
            *db_guard = Some(conn.clone());
        }

        let mut settings = state_guard.settings.write();
        settings.attach_db(Some(settings_conn));
        settings.initialize().await.map_err(|e| e.to_string())?;
        settings
            .set_value(
                SettingsKey::PgConnectionString,
                SettingsValue::String(saved_connection_string.clone()),
            )
            .await
            .map_err(|e| e.to_string())?;
        settings
            .set_value(
                SettingsKey::PgConnectionStatus,
                SettingsValue::Json(saved_status.clone()),
            )
            .await
            .map_err(|e| e.to_string())?;
    }

    let _ = app_handle.emit(
        "settings:changed",
        &SettingChange {
            key: "pg_connection_string".to_string(),
            value: serde_json::Value::String(saved_connection_string),
        },
    );
    let _ = app_handle.emit(
        "settings:changed",
        &SettingChange {
            key: "pg_connection_status".to_string(),
            value: saved_status,
        },
    );

    let state_guard = state.read();
    let logger = state_guard.logger.read();
    logger.log(
        LogLevel::Info,
        &format!("Database switched successfully to {}", db_type),
        Some("database"),
        None,
    );

    Ok(IpcResponse::success(SwitchConnectionResult { db_type }))
}

#[tauri::command]
pub async fn db_get_status(
    state: State<'_, Arc<RwLock<AppState>>>,
) -> Result<IpcResponse<DatabaseStatus>, String> {
    let state_guard = state.read();
    let db_guard = state_guard.db.read();
    let connected = db_guard.is_some();

    let db_type = if connected {
        let settings = state_guard.settings.read();
        let status_json =
            settings.get_value(crate::services::settings::SettingsKey::PgConnectionStatus);
        match status_json {
            crate::services::settings::SettingsValue::Json(json) => json
                .get("type")
                .and_then(|t| t.as_str())
                .map(|s| s.to_string())
                .unwrap_or_else(|| "sqlite".to_string()),
            _ => "sqlite".to_string(),
        }
    } else {
        "sqlite".to_string()
    };

    Ok(IpcResponse::success(DatabaseStatus {
        db_type,
        connected,
        error: None,
    }))
}

#[tauri::command]
pub async fn db_sync_preview(
    app_handle: AppHandle,
    state: State<'_, Arc<RwLock<AppState>>>,
) -> Result<IpcResponse<DbSyncPreviewResult>, String> {
    check_admin_permission(&state)?;

    let app_state = state.inner().clone();
    let Some((local_conn, remote_conn)) =
        current_remote_and_local_from_state(&app_handle, &app_state).await?
    else {
        return Ok(IpcResponse::success(DbSyncPreviewResult {
            can_sync: false,
            need_sync: false,
            local_only: 0,
            remote_only: 0,
            conflicts: vec![],
            message: Some("当前不在 PostgreSQL 远程模式，已跳过同步预检查".to_string()),
        }));
    };

    let local_students = load_students(&local_conn).await?;
    let remote_students = load_students(&remote_conn).await?;
    let local_reasons = load_reasons(&local_conn).await?;
    let remote_reasons = load_reasons(&remote_conn).await?;
    let local_tags = load_tags(&local_conn).await?;
    let remote_tags = load_tags(&remote_conn).await?;
    let local_events = load_events(&local_conn).await?;
    let remote_events = load_events(&remote_conn).await?;
    let local_reward_settings = load_reward_settings(&local_conn).await?;
    let remote_reward_settings = load_reward_settings(&remote_conn).await?;
    let local_reward_redemptions = load_reward_redemptions(&local_conn).await?;
    let remote_reward_redemptions = load_reward_redemptions(&remote_conn).await?;
    let local_pairs = load_student_tag_pairs(&local_conn).await?;
    let remote_pairs = load_student_tag_pairs(&remote_conn).await?;

    let (stu_local_only, stu_remote_only, stu_conflicts) =
        compare_maps("students", &local_students, &remote_students);
    let (rea_local_only, rea_remote_only, rea_conflicts) =
        compare_maps("reasons", &local_reasons, &remote_reasons);
    let (tag_local_only, tag_remote_only, tag_conflicts) =
        compare_maps("tags", &local_tags, &remote_tags);
    let (evt_local_only, evt_remote_only, evt_conflicts) =
        compare_maps("score_events", &local_events, &remote_events);
    let (reward_local_only, reward_remote_only, reward_conflicts) = compare_maps(
        "reward_settings",
        &local_reward_settings,
        &remote_reward_settings,
    );
    let (redeem_local_only, redeem_remote_only, redeem_conflicts) = compare_maps(
        "reward_redemptions",
        &local_reward_redemptions,
        &remote_reward_redemptions,
    );

    let mut local_only = stu_local_only
        + rea_local_only
        + tag_local_only
        + evt_local_only
        + reward_local_only
        + redeem_local_only;
    let mut remote_only = stu_remote_only
        + rea_remote_only
        + tag_remote_only
        + evt_remote_only
        + reward_remote_only
        + redeem_remote_only;

    for pair in &local_pairs {
        if !remote_pairs.contains(pair) {
            local_only += 1;
        }
    }
    for pair in &remote_pairs {
        if !local_pairs.contains(pair) {
            remote_only += 1;
        }
    }

    let mut conflicts = Vec::new();
    for (table, key) in stu_conflicts {
        let local = local_students.get(&key).expect("local student exists");
        let remote = remote_students.get(&key).expect("remote student exists");
        conflicts.push(DbSyncConflict {
            table,
            key,
            local_summary: format!(
                "score={}, reward_points={}, updated_at={}",
                local.score, local.reward_points, local.updated_at
            ),
            remote_summary: format!(
                "score={}, reward_points={}, updated_at={}",
                remote.score, remote.reward_points, remote.updated_at
            ),
        });
    }
    for (table, key) in rea_conflicts {
        let local = local_reasons.get(&key).expect("local reason exists");
        let remote = remote_reasons.get(&key).expect("remote reason exists");
        conflicts.push(DbSyncConflict {
            table,
            key,
            local_summary: format!("delta={}, updated_at={}", local.delta, local.updated_at),
            remote_summary: format!("delta={}, updated_at={}", remote.delta, remote.updated_at),
        });
    }
    for (table, key) in tag_conflicts {
        let local = local_tags.get(&key).expect("local tag exists");
        let remote = remote_tags.get(&key).expect("remote tag exists");
        conflicts.push(DbSyncConflict {
            table,
            key,
            local_summary: format!("updated_at={}", local.updated_at),
            remote_summary: format!("updated_at={}", remote.updated_at),
        });
    }
    for (table, key) in evt_conflicts {
        let local = local_events.get(&key).expect("local event exists");
        let remote = remote_events.get(&key).expect("remote event exists");
        conflicts.push(DbSyncConflict {
            table,
            key,
            local_summary: format!(
                "delta={}, val_curr={}, event_time={}",
                local.delta, local.val_curr, local.event_time
            ),
            remote_summary: format!(
                "delta={}, val_curr={}, event_time={}",
                remote.delta, remote.val_curr, remote.event_time
            ),
        });
    }
    for (table, key) in reward_conflicts {
        let local = local_reward_settings
            .get(&key)
            .expect("local reward setting exists");
        let remote = remote_reward_settings
            .get(&key)
            .expect("remote reward setting exists");
        conflicts.push(DbSyncConflict {
            table,
            key,
            local_summary: format!(
                "cost_points={}, updated_at={}",
                local.cost_points, local.updated_at
            ),
            remote_summary: format!(
                "cost_points={}, updated_at={}",
                remote.cost_points, remote.updated_at
            ),
        });
    }
    for (table, key) in redeem_conflicts {
        let local = local_reward_redemptions
            .get(&key)
            .expect("local redemption exists");
        let remote = remote_reward_redemptions
            .get(&key)
            .expect("remote redemption exists");
        conflicts.push(DbSyncConflict {
            table,
            key,
            local_summary: format!(
                "student={}, reward={}, cost={}, redeemed_at={}",
                local.student_name, local.reward_name, local.cost_points, local.redeemed_at
            ),
            remote_summary: format!(
                "student={}, reward={}, cost={}, redeemed_at={}",
                remote.student_name, remote.reward_name, remote.cost_points, remote.redeemed_at
            ),
        });
    }

    let need_sync = local_only > 0 || remote_only > 0 || !conflicts.is_empty();
    Ok(IpcResponse::success(DbSyncPreviewResult {
        can_sync: true,
        need_sync,
        local_only,
        remote_only,
        conflicts,
        message: None,
    }))
}

#[tauri::command]
pub async fn db_sync_apply(
    strategy: ConflictStrategy,
    app_handle: AppHandle,
    state: State<'_, Arc<RwLock<AppState>>>,
) -> Result<IpcResponse<DbSyncApplyResult>, String> {
    check_admin_permission(&state)?;
    let result = db_sync_apply_internal(strategy, app_handle, state.inner().clone()).await?;
    Ok(IpcResponse::success(result))
}

#[tauri::command]
pub async fn db_sync(
    state: State<'_, Arc<RwLock<AppState>>>,
) -> Result<IpcResponse<SyncResult>, String> {
    check_admin_permission(&state)?;

    let state_guard = state.read();
    let db_guard = state_guard.db.read();
    if let Some(conn) = db_guard.as_ref() {
        let settings = state_guard.settings.read();
        let status_json =
            settings.get_value(crate::services::settings::SettingsKey::PgConnectionStatus);
        let db_type = match status_json {
            crate::services::settings::SettingsValue::Json(json) => json
                .get("type")
                .and_then(|t| t.as_str())
                .map(|s| s.to_string())
                .unwrap_or_else(|| "sqlite".to_string()),
            _ => "sqlite".to_string(),
        };

        let migration_result = if db_type == "postgresql" {
            run_migration(conn, DatabaseType::PostgreSQL).await
        } else {
            run_migration(conn, DatabaseType::SQLite).await
        };

        match migration_result {
            Ok(_) => Ok(IpcResponse::success(SyncResult {
                success: true,
                message: Some("Database synchronized successfully".to_string()),
            })),
            Err(e) => Ok(IpcResponse::success(SyncResult {
                success: false,
                message: Some(format!("Sync failed: {}", e)),
            })),
        }
    } else {
        Ok(IpcResponse::success(SyncResult {
            success: false,
            message: Some("No database connection".to_string()),
        }))
    }
}
