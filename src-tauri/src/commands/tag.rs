use parking_lot::RwLock;
use sea_orm::{
    ActiveModelTrait, ColumnTrait, EntityTrait, QueryFilter, QueryOrder, Set, TransactionTrait,
};
use std::sync::Arc;
use tauri::State;

use crate::db::entities::{student_tags, tags};
use crate::services::PermissionLevel;
use crate::state::AppState;

use super::database::realtime_dual_write_sync;
use super::response::{IpcResponse, TagResponse};

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

#[tauri::command]
pub async fn tags_get_all(
    state: State<'_, Arc<RwLock<AppState>>>,
    sender_id: Option<u32>,
) -> Result<IpcResponse<Vec<TagResponse>>, String> {
    if !check_view_permission(&state, sender_id) {
        return Ok(IpcResponse::error("Permission denied: view required"));
    }

    let state_guard = state.read();
    let db_guard = state_guard.db.read();

    if let Some(conn) = db_guard.as_ref() {
        let results = tags::Entity::find()
            .order_by_asc(tags::Column::CreatedAt)
            .all(conn)
            .await;

        match results {
            Ok(tag_models) => {
                let tags_response: Vec<TagResponse> = tag_models
                    .into_iter()
                    .map(|t| TagResponse {
                        id: t.id,
                        name: t.name,
                    })
                    .collect();
                Ok(IpcResponse::success(tags_response))
            }
            Err(e) => Ok(IpcResponse::error(&format!("Failed to query tags: {}", e))),
        }
    } else {
        Ok(IpcResponse::error("Database not connected"))
    }
}

#[tauri::command]
pub async fn tags_get_by_student(
    state: State<'_, Arc<RwLock<AppState>>>,
    sender_id: Option<u32>,
    student_id: i32,
) -> Result<IpcResponse<Vec<TagResponse>>, String> {
    if !check_view_permission(&state, sender_id) {
        return Ok(IpcResponse::error("Permission denied: view required"));
    }

    let state_guard = state.read();
    let db_guard = state_guard.db.read();

    if let Some(conn) = db_guard.as_ref() {
        let results = student_tags::Entity::find()
            .filter(student_tags::Column::StudentId.eq(student_id))
            .order_by_asc(student_tags::Column::CreatedAt)
            .all(conn)
            .await;

        match results {
            Ok(student_tag_models) => {
                let tag_ids: Vec<i32> = student_tag_models.iter().map(|st| st.tag_id).collect();

                if tag_ids.is_empty() {
                    return Ok(IpcResponse::success(vec![]));
                }

                let tag_results = tags::Entity::find()
                    .filter(tags::Column::Id.is_in(tag_ids))
                    .all(conn)
                    .await;

                match tag_results {
                    Ok(tag_models) => {
                        let tags_response: Vec<TagResponse> = tag_models
                            .into_iter()
                            .map(|t| TagResponse {
                                id: t.id,
                                name: t.name,
                            })
                            .collect();
                        Ok(IpcResponse::success(tags_response))
                    }
                    Err(e) => Ok(IpcResponse::error(&format!("Failed to query tags: {}", e))),
                }
            }
            Err(e) => Ok(IpcResponse::error(&format!(
                "Failed to query student tags: {}",
                e
            ))),
        }
    } else {
        Ok(IpcResponse::error("Database not connected"))
    }
}

#[tauri::command]
pub async fn tags_create(
    state: State<'_, Arc<RwLock<AppState>>>,
    sender_id: Option<u32>,
    name: String,
) -> Result<IpcResponse<TagResponse>, String> {
    if !check_admin_permission(&state, sender_id) {
        return Ok(IpcResponse::error("Permission denied: admin required"));
    }

    let name = name.trim();
    if name.is_empty() {
        return Ok(IpcResponse::error("Tag name cannot be empty"));
    }
    if name.len() > 32 {
        return Ok(IpcResponse::error("Tag name too long (max 32 characters)"));
    }

    let state_guard = state.read();
    let db_guard = state_guard.db.read();

    if let Some(conn) = db_guard.as_ref() {
        let existing = tags::Entity::find()
            .filter(tags::Column::Name.eq(name))
            .one(conn)
            .await;

        match existing {
            Ok(Some(_)) => Ok(IpcResponse::error("Tag with this name already exists")),
            Ok(None) => {
                let now = chrono::Utc::now()
                    .format("%Y-%m-%dT%H:%M:%S%.3fZ")
                    .to_string();
                let new_tag = tags::ActiveModel {
                    id: sea_orm::ActiveValue::NotSet,
                    name: Set(name.to_string()),
                    created_at: Set(now.clone()),
                    updated_at: Set(now),
                };

                match new_tag.insert(conn).await {
                    Ok(inserted) => {
                        realtime_dual_write_sync(state.inner()).await?;
                        Ok(IpcResponse::success(TagResponse {
                            id: inserted.id,
                            name: inserted.name,
                        }))
                    }
                    Err(e) => Ok(IpcResponse::error(&format!("Failed to create tag: {}", e))),
                }
            }
            Err(e) => Ok(IpcResponse::error(&format!("Database error: {}", e))),
        }
    } else {
        Ok(IpcResponse::error("Database not connected"))
    }
}

#[tauri::command]
pub async fn tags_delete(
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
        let existing = tags::Entity::find_by_id(id).one(conn).await;

        match existing {
            Ok(Some(tag)) => {
                let txn = conn.begin().await.map_err(|e| e.to_string())?;

                student_tags::Entity::delete_many()
                    .filter(student_tags::Column::TagId.eq(tag.id))
                    .exec(&txn)
                    .await
                    .map_err(|e| e.to_string())?;

                tags::Entity::delete(tags::ActiveModel {
                    id: sea_orm::ActiveValue::Set(tag.id),
                    name: sea_orm::ActiveValue::Unchanged(tag.name),
                    created_at: sea_orm::ActiveValue::Unchanged(tag.created_at),
                    updated_at: sea_orm::ActiveValue::Unchanged(tag.updated_at),
                })
                .exec(&txn)
                .await
                .map_err(|e| e.to_string())?;

                txn.commit().await.map_err(|e| e.to_string())?;
                realtime_dual_write_sync(state.inner()).await?;
                Ok(IpcResponse::success_empty())
            }
            Ok(None) => Ok(IpcResponse::error("Tag not found")),
            Err(e) => Ok(IpcResponse::error(&format!("Database error: {}", e))),
        }
    } else {
        Ok(IpcResponse::error("Database not connected"))
    }
}

#[tauri::command]
pub async fn tags_update_student_tags(
    state: State<'_, Arc<RwLock<AppState>>>,
    sender_id: Option<u32>,
    student_id: i32,
    tag_ids: Vec<i32>,
) -> Result<IpcResponse<()>, String> {
    if !check_admin_permission(&state, sender_id) {
        return Ok(IpcResponse::error("Permission denied: admin required"));
    }

    let state_guard = state.read();
    let db_guard = state_guard.db.read();

    if let Some(conn) = db_guard.as_ref() {
        let txn = conn.begin().await.map_err(|e| e.to_string())?;

        student_tags::Entity::delete_many()
            .filter(student_tags::Column::StudentId.eq(student_id))
            .exec(&txn)
            .await
            .map_err(|e| e.to_string())?;

        if !tag_ids.is_empty() {
            let now = chrono::Utc::now()
                .format("%Y-%m-%dT%H:%M:%S%.3fZ")
                .to_string();

            for tag_id in tag_ids {
                let new_student_tag = student_tags::ActiveModel {
                    id: sea_orm::ActiveValue::NotSet,
                    student_id: Set(student_id),
                    tag_id: Set(tag_id),
                    created_at: Set(now.clone()),
                };
                new_student_tag
                    .insert(&txn)
                    .await
                    .map_err(|e| e.to_string())?;
            }
        }

        txn.commit().await.map_err(|e| e.to_string())?;
        realtime_dual_write_sync(state.inner()).await?;
        Ok(IpcResponse::success_empty())
    } else {
        Ok(IpcResponse::error("Database not connected"))
    }
}
