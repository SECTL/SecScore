use parking_lot::RwLock;
use sea_orm::{ConnectionTrait, DatabaseBackend, Statement, TransactionTrait};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::State;
use uuid::Uuid;

use crate::services::PermissionLevel;
use crate::state::AppState;
use super::response::IpcResponse;

#[derive(Debug, Serialize)]
pub struct GroupScoreRow {
    pub group_name: String,
    pub score: i32,
}

#[derive(Debug, Deserialize)]
pub struct GroupScoreCreateData {
    pub group_name: String,
    pub delta: i32,
    pub reason_content: String,
}

#[derive(Debug, Deserialize)]
pub struct GroupScoreRenameData {
    #[serde(alias = "oldName")]
    pub old_name: String,
    #[serde(alias = "newName")]
    pub new_name: String,
}

fn require_permission(state: &Arc<RwLock<AppState>>, level: PermissionLevel) -> bool {
    let state_guard = state.read();
    let mut permissions = state_guard.permissions.write();
    permissions.require_permission(0, level)
}

fn statement(backend: DatabaseBackend, sql: &str, values: Vec<sea_orm::Value>) -> Statement {
    Statement::from_sql_and_values(backend, sql, values)
}

#[tauri::command]
pub async fn group_score_query(
    state: State<'_, Arc<RwLock<AppState>>>,
) -> Result<IpcResponse<Vec<GroupScoreRow>>, String> {
    if !require_permission(&state, PermissionLevel::View) {
        return Ok(IpcResponse::error("Permission denied: view required"));
    }
    let state_guard = state.read();
    let db_guard = state_guard.db.read();
    let Some(conn) = db_guard.as_ref() else { return Ok(IpcResponse::error("Database not connected")); };
    let rows = conn.query_all(Statement::from_string(conn.get_database_backend(), "SELECT group_name, score FROM group_scores ORDER BY group_name")).await
        .map_err(|e| e.to_string())?
        .into_iter()
        .map(|row| Ok(GroupScoreRow { group_name: row.try_get("", "group_name")?, score: row.try_get("", "score")? }))
        .collect::<Result<Vec<_>, sea_orm::DbErr>>()
        .map_err(|e| e.to_string())?;
    Ok(IpcResponse::success(rows))
}

#[tauri::command]
pub async fn group_score_create(
    state: State<'_, Arc<RwLock<AppState>>>,
    data: GroupScoreCreateData,
) -> Result<IpcResponse<i32>, String> {
    if !require_permission(&state, PermissionLevel::Points) {
        return Ok(IpcResponse::error("Permission denied: points required"));
    }
    let group_name = data.group_name.trim();
    let reason = data.reason_content.trim();
    if group_name.is_empty() || reason.is_empty() || data.delta == 0 { return Ok(IpcResponse::error("Invalid group score data")); }
    let local_write_lock = { state.read().local_write_lock.clone() };
    let _guard = local_write_lock.lock().await;
    let state_guard = state.read();
    let db_guard = state_guard.db.read();
    let Some(conn) = db_guard.as_ref() else { return Ok(IpcResponse::error("Database not connected")); };
    let backend = conn.get_database_backend();
    let txn = conn.begin().await.map_err(|e| e.to_string())?;
    let select_sql = if backend == DatabaseBackend::Sqlite { "SELECT score FROM group_scores WHERE group_name = ?" } else { "SELECT score FROM group_scores WHERE group_name = $1" };
    let previous = txn.query_one(statement(backend, select_sql, vec![group_name.to_string().into()])).await.map_err(|e| e.to_string())?
        .map(|row| row.try_get::<i32>("", "score")).transpose().map_err(|e| e.to_string())?.unwrap_or(0);
    let current = previous + data.delta;
    let now = chrono::Utc::now().format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string();
    let uuid = Uuid::new_v4().to_string();
    let event_sql = if backend == DatabaseBackend::Sqlite { "INSERT INTO group_score_events (uuid, group_name, reason_content, delta, val_prev, val_curr, event_time, settlement_id) VALUES (?, ?, ?, ?, ?, ?, ?, NULL)" } else { "INSERT INTO group_score_events (uuid, group_name, reason_content, delta, val_prev, val_curr, event_time, settlement_id) VALUES ($1, $2, $3, $4, $5, $6, $7, NULL)" };
    txn.execute(statement(backend, event_sql, vec![uuid.into(), group_name.to_string().into(), reason.to_string().into(), data.delta.into(), previous.into(), current.into(), now.clone().into()])).await.map_err(|e| e.to_string())?;
    let score_sql = if backend == DatabaseBackend::Sqlite { "UPDATE group_scores SET score = ?, updated_at = ? WHERE group_name = ?" } else { "UPDATE group_scores SET score = $1, updated_at = $2 WHERE group_name = $3" };
    let updated = txn.execute(statement(backend, score_sql, vec![current.into(), now.clone().into(), group_name.to_string().into()])).await.map_err(|e| e.to_string())?;
    if updated.rows_affected() == 0 {
        let insert_sql = if backend == DatabaseBackend::Sqlite { "INSERT INTO group_scores (group_name, score, updated_at) VALUES (?, ?, ?)" } else { "INSERT INTO group_scores (group_name, score, updated_at) VALUES ($1, $2, $3)" };
        txn.execute(statement(backend, insert_sql, vec![group_name.to_string().into(), current.into(), now.into()])).await.map_err(|e| e.to_string())?;
    }
    txn.commit().await.map_err(|e| e.to_string())?;
    Ok(IpcResponse::success(current))
}

#[tauri::command]
pub async fn group_score_rename(
    state: State<'_, Arc<RwLock<AppState>>>,
    data: GroupScoreRenameData,
) -> Result<IpcResponse<()>, String> {
    if !require_permission(&state, PermissionLevel::Admin) { return Ok(IpcResponse::error("Permission denied: admin required")); }
    let old_name = data.old_name.trim();
    let new_name = data.new_name.trim();
    if old_name.is_empty() || new_name.is_empty() || old_name == new_name { return Ok(IpcResponse::success(())); }
    let state_guard = state.read();
    let db_guard = state_guard.db.read();
    let Some(conn) = db_guard.as_ref() else { return Ok(IpcResponse::error("Database not connected")); };
    let backend = conn.get_database_backend();
    let txn = conn.begin().await.map_err(|e| e.to_string())?;
    let sql = if backend == DatabaseBackend::Sqlite { "UPDATE group_scores SET group_name = ? WHERE group_name = ?" } else { "UPDATE group_scores SET group_name = $1 WHERE group_name = $2" };
    txn.execute(statement(backend, sql, vec![new_name.to_string().into(), old_name.to_string().into()])).await.map_err(|e| e.to_string())?;
    let sql = if backend == DatabaseBackend::Sqlite { "UPDATE group_score_events SET group_name = ? WHERE group_name = ?" } else { "UPDATE group_score_events SET group_name = $1 WHERE group_name = $2" };
    txn.execute(statement(backend, sql, vec![new_name.to_string().into(), old_name.to_string().into()])).await.map_err(|e| e.to_string())?;
    txn.commit().await.map_err(|e| e.to_string())?;
    Ok(IpcResponse::success(()))
}
