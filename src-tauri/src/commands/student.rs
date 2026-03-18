use parking_lot::RwLock;
use sea_orm::{
    ActiveModelTrait, ColumnTrait, EntityTrait, QueryFilter, QueryOrder, Set, TransactionTrait,
};
use serde::Deserialize;
use std::sync::Arc;
use tauri::State;

use crate::db::entities::students;
use crate::models::{StudentUpdate, StudentWithTags};
use crate::services::PermissionLevel;
use crate::state::AppState;

use super::response::{ImportResult, IpcResponse};

#[derive(Deserialize)]
pub struct CreateStudentData {
    pub name: String,
}

#[derive(Deserialize)]
pub struct ImportStudentsParams {
    pub names: Vec<String>,
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
                        score: s.score,
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
                let new_student = students::ActiveModel {
                    id: sea_orm::ActiveValue::NotSet,
                    name: Set(name.to_string()),
                    score: Set(0),
                    tags: Set("[]".to_string()),
                    extra_json: Set(None),
                    created_at: Set(now.clone()),
                    updated_at: Set(now),
                };

                match new_student.insert(conn).await {
                    Ok(inserted) => Ok(IpcResponse::success(inserted.id)),
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
                if let Some(score) = data.score {
                    active.score = Set(score);
                }
                if let Some(tags) = data.tags {
                    active.tags =
                        Set(serde_json::to_string(&tags).unwrap_or_else(|_| "[]".to_string()));
                }
                if let Some(extra_json) = data.extra_json {
                    active.extra_json = Set(Some(extra_json));
                }

                match active.update(conn).await {
                    Ok(_) => Ok(IpcResponse::success_empty()),
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
                    score: sea_orm::ActiveValue::Unchanged(student.score),
                    tags: sea_orm::ActiveValue::Unchanged(student.tags),
                    extra_json: sea_orm::ActiveValue::Unchanged(student.extra_json),
                    created_at: sea_orm::ActiveValue::Unchanged(student.created_at),
                    updated_at: sea_orm::ActiveValue::Unchanged(student.updated_at),
                })
                .exec(&txn)
                .await
                .map_err(|e| e.to_string())?;

                txn.commit().await.map_err(|e| e.to_string())?;

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
                            score: Set(0),
                            tags: Set("[]".to_string()),
                            extra_json: Set(None),
                            created_at: Set(now.clone()),
                            updated_at: Set(now.clone()),
                        };
                        new_student.insert(&txn).await.map_err(|e| e.to_string())?;
                    }

                    txn.commit().await.map_err(|e| e.to_string())?;
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
