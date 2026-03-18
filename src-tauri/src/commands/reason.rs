use parking_lot::RwLock;
use sea_orm::{ActiveModelTrait, EntityTrait, QueryOrder, Set};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::State;

use crate::db::entities::reasons;
use crate::services::PermissionLevel;
use crate::state::AppState;

use super::response::IpcResponse;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Reason {
    pub id: i32,
    pub content: String,
    pub category: String,
    pub delta: i32,
    pub is_system: i32,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateReason {
    pub content: String,
    pub category: String,
    pub delta: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateReason {
    pub content: Option<String>,
    pub category: Option<String>,
    pub delta: Option<i32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeleteResult {
    pub changes: i32,
}

fn check_admin_permission(state: &Arc<RwLock<AppState>>, sender_id: Option<u32>) -> bool {
    let state_guard = state.read();
    let mut permissions = state_guard.permissions.write();
    let id = sender_id.unwrap_or(0);
    permissions.require_permission(id, PermissionLevel::Admin)
}

#[tauri::command]
pub async fn reason_query(
    state: State<'_, Arc<RwLock<AppState>>>,
) -> Result<IpcResponse<Vec<Reason>>, String> {
    let state_guard = state.read();
    let db_guard = state_guard.db.read();

    if let Some(conn) = db_guard.as_ref() {
        let results = reasons::Entity::find()
            .order_by_asc(reasons::Column::Category)
            .order_by_asc(reasons::Column::Content)
            .all(conn)
            .await;

        match results {
            Ok(reason_models) => {
                let reason_list: Vec<Reason> = reason_models
                    .into_iter()
                    .map(|r| Reason {
                        id: r.id,
                        content: r.content,
                        category: r.category,
                        delta: r.delta,
                        is_system: r.is_system,
                        updated_at: r.updated_at,
                    })
                    .collect();
                Ok(IpcResponse::success(reason_list))
            }
            Err(e) => Ok(IpcResponse::error(&format!(
                "Failed to query reasons: {}",
                e
            ))),
        }
    } else {
        Ok(IpcResponse::error("Database not connected"))
    }
}

#[tauri::command]
pub async fn reason_create(
    state: State<'_, Arc<RwLock<AppState>>>,
    sender_id: Option<u32>,
    data: CreateReason,
) -> Result<IpcResponse<i32>, String> {
    if !check_admin_permission(&state, sender_id) {
        return Ok(IpcResponse::error("Permission denied: admin required"));
    }

    let content = data.content.trim();
    if content.is_empty() {
        return Ok(IpcResponse::error("Reason content cannot be empty"));
    }

    let state_guard = state.read();
    let db_guard = state_guard.db.read();

    if let Some(conn) = db_guard.as_ref() {
        let now = chrono::Utc::now()
            .format("%Y-%m-%dT%H:%M:%S%.3fZ")
            .to_string();
        let new_reason = reasons::ActiveModel {
            id: sea_orm::ActiveValue::NotSet,
            content: Set(content.to_string()),
            category: Set(data.category.trim().to_string()),
            delta: Set(data.delta),
            is_system: Set(0),
            updated_at: Set(now),
        };

        match new_reason.insert(conn).await {
            Ok(inserted) => Ok(IpcResponse::success(inserted.id)),
            Err(e) => Ok(IpcResponse::error(&format!(
                "Failed to create reason: {}",
                e
            ))),
        }
    } else {
        Ok(IpcResponse::error("Database not connected"))
    }
}

#[tauri::command]
pub async fn reason_update(
    state: State<'_, Arc<RwLock<AppState>>>,
    sender_id: Option<u32>,
    id: i32,
    data: UpdateReason,
) -> Result<IpcResponse<()>, String> {
    if !check_admin_permission(&state, sender_id) {
        return Ok(IpcResponse::error("Permission denied: admin required"));
    }

    let state_guard = state.read();
    let db_guard = state_guard.db.read();

    if let Some(conn) = db_guard.as_ref() {
        let existing = reasons::Entity::find_by_id(id).one(conn).await;

        match existing {
            Ok(Some(reason)) => {
                let now = chrono::Utc::now()
                    .format("%Y-%m-%dT%H:%M:%S%.3fZ")
                    .to_string();
                let mut active: reasons::ActiveModel = reason.into();

                active.updated_at = Set(now);

                if let Some(content) = data.content {
                    active.content = Set(content);
                }
                if let Some(category) = data.category {
                    active.category = Set(category);
                }
                if let Some(delta) = data.delta {
                    active.delta = Set(delta);
                }

                match active.update(conn).await {
                    Ok(_) => Ok(IpcResponse::success_empty()),
                    Err(e) => Ok(IpcResponse::error(&format!(
                        "Failed to update reason: {}",
                        e
                    ))),
                }
            }
            Ok(None) => Ok(IpcResponse::error("Reason not found")),
            Err(e) => Ok(IpcResponse::error(&format!("Database error: {}", e))),
        }
    } else {
        Ok(IpcResponse::error("Database not connected"))
    }
}

#[tauri::command]
pub async fn reason_delete(
    state: State<'_, Arc<RwLock<AppState>>>,
    sender_id: Option<u32>,
    id: i32,
) -> Result<IpcResponse<DeleteResult>, String> {
    if !check_admin_permission(&state, sender_id) {
        return Ok(IpcResponse::error("Permission denied: admin required"));
    }

    let state_guard = state.read();
    let db_guard = state_guard.db.read();

    if let Some(conn) = db_guard.as_ref() {
        let existing = reasons::Entity::find_by_id(id).one(conn).await;

        match existing {
            Ok(Some(reason)) => {
                let delete_result = reasons::Entity::delete_by_id(reason.id).exec(conn).await;

                match delete_result {
                    Ok(result) => {
                        if result.rows_affected == 0 {
                            Ok(IpcResponse::error("记录不存在"))
                        } else {
                            Ok(IpcResponse::success(DeleteResult {
                                changes: result.rows_affected as i32,
                            }))
                        }
                    }
                    Err(e) => Ok(IpcResponse::error(&format!(
                        "Failed to delete reason: {}",
                        e
                    ))),
                }
            }
            Ok(None) => Ok(IpcResponse::error("记录不存在")),
            Err(e) => Ok(IpcResponse::error(&format!("Database error: {}", e))),
        }
    } else {
        Ok(IpcResponse::error("Database not connected"))
    }
}
