use chrono::{Datelike, Duration, Timelike, Utc};
use parking_lot::RwLock;
use sea_orm::{
    ActiveModelTrait, ColumnTrait, EntityTrait, QueryFilter, QueryOrder, QuerySelect, Set,
    TransactionTrait,
};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::sync::Arc;
use tauri::State;
use uuid::Uuid;

use crate::db::entities::{score_events, students};
use crate::services::PermissionLevel;
use crate::state::AppState;

use super::database::realtime_dual_write_sync;
use super::response::IpcResponse;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScoreEvent {
    pub id: i32,
    pub uuid: String,
    pub student_name: String,
    pub reason_content: String,
    pub delta: i32,
    pub val_prev: i32,
    pub val_curr: i32,
    pub event_time: String,
    pub settlement_id: Option<i32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateScoreEvent {
    pub student_name: String,
    pub reason_content: String,
    pub delta: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QueryEventParams {
    pub limit: Option<i32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QueryByStudentParams {
    pub student_name: String,
    pub limit: Option<i32>,
    pub start_time: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LeaderboardRow {
    pub id: i32,
    pub name: String,
    pub score: i32,
    pub range_change: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LeaderboardResult {
    pub start_time: String,
    pub rows: Vec<LeaderboardRow>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LeaderboardParams {
    pub range: String,
}

fn check_points_permission(state: &Arc<RwLock<AppState>>) -> bool {
    let state_guard = state.read();
    let mut permissions = state_guard.permissions.write();
    permissions.require_permission(0, PermissionLevel::Points)
}

#[tauri::command]
pub async fn event_query(
    state: State<'_, Arc<RwLock<AppState>>>,
    params: QueryEventParams,
) -> Result<IpcResponse<Vec<ScoreEvent>>, String> {
    let state_guard = state.read();
    let db_guard = state_guard.db.read();

    let limit = params.limit.unwrap_or(100);

    if let Some(conn) = db_guard.as_ref() {
        let results = score_events::Entity::find()
            .filter(score_events::Column::SettlementId.is_null())
            .order_by_desc(score_events::Column::EventTime)
            .limit(limit as u64)
            .all(conn)
            .await;

        match results {
            Ok(event_models) => {
                let event_list: Vec<ScoreEvent> = event_models
                    .into_iter()
                    .map(|e| ScoreEvent {
                        id: e.id,
                        uuid: e.uuid,
                        student_name: e.student_name,
                        reason_content: e.reason_content,
                        delta: e.delta,
                        val_prev: e.val_prev,
                        val_curr: e.val_curr,
                        event_time: e.event_time,
                        settlement_id: e.settlement_id,
                    })
                    .collect();
                Ok(IpcResponse::success(event_list))
            }
            Err(e) => Ok(IpcResponse::error(&format!(
                "Failed to query events: {}",
                e
            ))),
        }
    } else {
        Ok(IpcResponse::error("Database not connected"))
    }
}

#[tauri::command]
pub async fn event_create(
    state: State<'_, Arc<RwLock<AppState>>>,
    data: CreateScoreEvent,
) -> Result<IpcResponse<i32>, String> {
    if !check_points_permission(&state) {
        return Ok(IpcResponse::error("Permission denied: points required"));
    }

    let student_name = data.student_name.trim();
    if student_name.is_empty() {
        return Ok(IpcResponse::error("Student name cannot be empty"));
    }

    let state_guard = state.read();
    let db_guard = state_guard.db.read();

    if let Some(conn) = db_guard.as_ref() {
        let student = students::Entity::find()
            .filter(students::Column::Name.eq(student_name))
            .one(conn)
            .await;

        match student {
            Ok(Some(student)) => {
                let val_prev = student.score;
                let val_curr = val_prev + data.delta;
                let now = chrono::Utc::now()
                    .format("%Y-%m-%dT%H:%M:%S%.3fZ")
                    .to_string();
                let uuid = Uuid::new_v4().to_string();

                let txn = conn.begin().await.map_err(|e| e.to_string())?;

                let new_event = score_events::ActiveModel {
                    id: sea_orm::ActiveValue::NotSet,
                    uuid: Set(uuid),
                    student_name: Set(student_name.to_string()),
                    reason_content: Set(data.reason_content.trim().to_string()),
                    delta: Set(data.delta),
                    val_prev: Set(val_prev),
                    val_curr: Set(val_curr),
                    event_time: Set(now.clone()),
                    settlement_id: Set(None),
                };

                let inserted = new_event.insert(&txn).await.map_err(|e| e.to_string())?;

                let mut active: students::ActiveModel = student.into();
                active.score = Set(val_curr);
                active.updated_at = Set(now);
                active.update(&txn).await.map_err(|e| e.to_string())?;

                txn.commit().await.map_err(|e| e.to_string())?;
                {
                    let state_guard = state.read();
                    let logger = state_guard.logger.read();
                    logger.info_with_meta(
                        "event_create:committed",
                        json!({
                            "student_name": student_name,
                            "delta": data.delta,
                            "val_prev": val_prev,
                            "val_curr": val_curr,
                        }),
                    );
                }
                realtime_dual_write_sync(state.inner()).await?;
                {
                    let state_guard = state.read();
                    let logger = state_guard.logger.read();
                    logger.info_with_meta(
                        "event_create:sync_done",
                        json!({
                            "student_name": student_name,
                            "delta": data.delta,
                            "val_curr": val_curr,
                        }),
                    );
                }
                Ok(IpcResponse::success(inserted.id))
            }
            Ok(None) => Ok(IpcResponse::error("Student not found")),
            Err(e) => Ok(IpcResponse::error(&format!("Database error: {}", e))),
        }
    } else {
        Ok(IpcResponse::error("Database not connected"))
    }
}

#[tauri::command]
pub async fn event_delete(
    state: State<'_, Arc<RwLock<AppState>>>,
    uuid: String,
) -> Result<IpcResponse<()>, String> {
    if !check_points_permission(&state) {
        return Ok(IpcResponse::error("Permission denied: points required"));
    }

    let state_guard = state.read();
    let db_guard = state_guard.db.read();

    if let Some(conn) = db_guard.as_ref() {
        let event = score_events::Entity::find()
            .filter(score_events::Column::Uuid.eq(uuid.trim()))
            .one(conn)
            .await;

        match event {
            Ok(Some(event)) => {
                if event.settlement_id.is_some() {
                    return Ok(IpcResponse::error("该记录已结算，无法撤销"));
                }

                let txn = conn.begin().await.map_err(|e| e.to_string())?;

                let student = students::Entity::find()
                    .filter(students::Column::Name.eq(&event.student_name))
                    .one(&txn)
                    .await
                    .map_err(|e| e.to_string())?;

                if let Some(student) = student {
                    let new_score = student.score - event.delta;
                    let now = chrono::Utc::now()
                        .format("%Y-%m-%dT%H:%M:%S%.3fZ")
                        .to_string();

                    let mut active: students::ActiveModel = student.into();
                    active.score = Set(new_score);
                    active.updated_at = Set(now);
                    active.update(&txn).await.map_err(|e| e.to_string())?;
                }

                score_events::Entity::delete_by_id(event.id)
                    .exec(&txn)
                    .await
                    .map_err(|e| e.to_string())?;

                txn.commit().await.map_err(|e| e.to_string())?;
                realtime_dual_write_sync(state.inner()).await?;
                Ok(IpcResponse::success_empty())
            }
            Ok(None) => Ok(IpcResponse::error("Event not found")),
            Err(e) => Ok(IpcResponse::error(&format!("Database error: {}", e))),
        }
    } else {
        Ok(IpcResponse::error("Database not connected"))
    }
}

#[tauri::command]
pub async fn event_query_by_student(
    state: State<'_, Arc<RwLock<AppState>>>,
    params: QueryByStudentParams,
) -> Result<IpcResponse<Vec<ScoreEvent>>, String> {
    let state_guard = state.read();
    let db_guard = state_guard.db.read();

    let limit = params.limit.unwrap_or(50);
    let student_name = params.student_name.trim();

    if student_name.is_empty() {
        return Ok(IpcResponse::success(vec![]));
    }

    if let Some(conn) = db_guard.as_ref() {
        let mut query = score_events::Entity::find()
            .filter(score_events::Column::StudentName.eq(student_name))
            .filter(score_events::Column::SettlementId.is_null())
            .order_by_desc(score_events::Column::EventTime)
            .limit(limit as u64);

        if let Some(start_time) = &params.start_time {
            query = query.filter(score_events::Column::EventTime.gte(start_time));
        }

        let results = query.all(conn).await;

        match results {
            Ok(event_models) => {
                let event_list: Vec<ScoreEvent> = event_models
                    .into_iter()
                    .map(|e| ScoreEvent {
                        id: e.id,
                        uuid: e.uuid,
                        student_name: e.student_name,
                        reason_content: e.reason_content,
                        delta: e.delta,
                        val_prev: e.val_prev,
                        val_curr: e.val_curr,
                        event_time: e.event_time,
                        settlement_id: e.settlement_id,
                    })
                    .collect();
                Ok(IpcResponse::success(event_list))
            }
            Err(e) => Ok(IpcResponse::error(&format!(
                "Failed to query events: {}",
                e
            ))),
        }
    } else {
        Ok(IpcResponse::error("Database not connected"))
    }
}

#[tauri::command]
pub async fn leaderboard_query(
    state: State<'_, Arc<RwLock<AppState>>>,
    params: LeaderboardParams,
) -> Result<IpcResponse<LeaderboardResult>, String> {
    let state_guard = state.read();
    let db_guard = state_guard.db.read();

    if let Some(conn) = db_guard.as_ref() {
        let now = Utc::now();
        let start = match params.range.as_str() {
            "today" => {
                let mut s = now;
                s = s.with_hour(0).unwrap_or(s);
                s = s.with_minute(0).unwrap_or(s);
                s = s.with_second(0).unwrap_or(s);
                s = s.with_nanosecond(0).unwrap_or(s);
                s
            }
            "week" => {
                let mut s = now;
                let day = s.weekday().num_days_from_monday() as i64;
                s = s - Duration::days(day);
                s = s.with_hour(0).unwrap_or(s);
                s = s.with_minute(0).unwrap_or(s);
                s = s.with_second(0).unwrap_or(s);
                s = s.with_nanosecond(0).unwrap_or(s);
                s
            }
            "month" => {
                let s = now.with_day0(0).unwrap_or(now);
                let mut s = s.with_hour(0).unwrap_or(s);
                s = s.with_minute(0).unwrap_or(s);
                s = s.with_second(0).unwrap_or(s);
                s = s.with_nanosecond(0).unwrap_or(s);
                s
            }
            _ => {
                let mut s = now;
                s = s.with_hour(0).unwrap_or(s);
                s = s.with_minute(0).unwrap_or(s);
                s = s.with_second(0).unwrap_or(s);
                s = s.with_nanosecond(0).unwrap_or(s);
                s
            }
        };

        let start_time = start.format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string();

        let student_results = students::Entity::find()
            .order_by_desc(students::Column::Score)
            .all(conn)
            .await;

        match student_results {
            Ok(student_models) => {
                let mut rows: Vec<LeaderboardRow> = student_models
                    .into_iter()
                    .map(|s| LeaderboardRow {
                        id: s.id,
                        name: s.name,
                        score: s.score,
                        range_change: 0,
                    })
                    .collect();

                for row in &mut rows {
                    let events = score_events::Entity::find()
                        .filter(score_events::Column::StudentName.eq(&row.name))
                        .filter(score_events::Column::SettlementId.is_null())
                        .filter(score_events::Column::EventTime.gte(&start_time))
                        .all(conn)
                        .await
                        .unwrap_or_default();

                    row.range_change = events.iter().map(|e| e.delta as i64).sum();
                }

                rows.sort_by(|a, b| {
                    b.score
                        .cmp(&a.score)
                        .then(b.range_change.cmp(&a.range_change))
                        .then(a.name.cmp(&b.name))
                });

                Ok(IpcResponse::success(LeaderboardResult { start_time, rows }))
            }
            Err(e) => Ok(IpcResponse::error(&format!(
                "Failed to query leaderboard: {}",
                e
            ))),
        }
    } else {
        Ok(IpcResponse::error("Database not connected"))
    }
}
