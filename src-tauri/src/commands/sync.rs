use chrono::Utc;
use parking_lot::RwLock;
use sea_orm::{
    ActiveModelTrait, ColumnTrait, ConnectionTrait, DbBackend, EntityTrait, QueryFilter, Set,
    Statement, TransactionTrait,
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::sync::Arc;
use tauri::State;

use crate::db::entities::{
    reasons, reward_redemptions, reward_settings, score_events, student_tags, students, tags,
};
use crate::state::AppState;

use super::response::IpcResponse;

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct ApplyRemoteOperation {
    pub operation_id: String,
    pub operation_type: String,
    pub payload: Value,
    pub client_created_at: Option<String>,
}

fn snapshot_string(value: &Value, key: &str) -> Option<String> {
    value.get(key).and_then(Value::as_str).map(ToString::to_string)
}

fn snapshot_i32(value: &Value, key: &str) -> Option<i32> {
    value
        .get(key)
        .and_then(Value::as_i64)
        .and_then(|item| i32::try_from(item).ok())
}

fn snapshot_array<'a>(snapshot: &'a Value, key: &str) -> &'a [Value] {
    snapshot
        .get(key)
        .and_then(Value::as_array)
        .map(Vec::as_slice)
        .unwrap_or(&[])
}

fn now_string() -> String {
    Utc::now().to_rfc3339()
}

#[tauri::command]
pub async fn sync_apply_snapshot(
    state: State<'_, Arc<RwLock<AppState>>>,
    snapshot: Value,
) -> Result<IpcResponse<()>, String> {
    let state_guard = state.read();
    let connection = state_guard
        .local_sqlite
        .read()
        .clone()
        .or_else(|| state_guard.db.read().clone());
    let Some(connection) = connection else {
        return Ok(IpcResponse::error("本地数据库未连接"));
    };
    let transaction = connection.begin().await.map_err(|e| e.to_string())?;

    for value in snapshot_array(&snapshot, "students") {
        let Some(name) = snapshot_string(value, "name") else { continue };
        let existing = students::Entity::find()
            .filter(students::Column::Name.eq(&name))
            .one(&transaction)
            .await
            .map_err(|e| e.to_string())?;
        let tags_value = value
            .get("tags")
            .cloned()
            .unwrap_or_else(|| Value::Array(Vec::new()));
        let tags_text = serde_json::to_string(&tags_value).unwrap_or_else(|_| "[]".into());
        let group_name = value.get("group_name").and_then(Value::as_str).map(String::from);
        let extra_json = value.get("extra_json").and_then(Value::as_str).map(String::from);
        let score = snapshot_i32(value, "score").unwrap_or(0);
        let reward_points = snapshot_i32(value, "reward_points").unwrap_or(0);
        let updated_at = snapshot_string(value, "updated_at").unwrap_or_else(now_string);
        match existing {
            Some(student) => {
                let should_initialize_balance = student.score == 0
                    && student.reward_points == 0
                    && (score != 0 || reward_points != 0);
                let mut active: students::ActiveModel = student.into();
                active.group_name = Set(group_name);
                active.tags = Set(tags_text);
                active.extra_json = Set(extra_json);
                if should_initialize_balance {
                    active.score = Set(score);
                    active.reward_points = Set(reward_points);
                }
                active.updated_at = Set(updated_at);
                active.update(&transaction).await.map_err(|e| e.to_string())?;
            }
            None => {
                students::ActiveModel {
                    id: sea_orm::ActiveValue::NotSet,
                    name: Set(name),
                    group_name: Set(group_name),
                    score: Set(score),
                    reward_points: Set(reward_points),
                    tags: Set(tags_text),
                    extra_json: Set(extra_json),
                    created_at: Set(snapshot_string(value, "created_at").unwrap_or_else(now_string)),
                    updated_at: Set(updated_at),
                }
                .insert(&transaction)
                .await
                .map_err(|e| e.to_string())?;
            }
        }
    }

    for value in snapshot_array(&snapshot, "reasons") {
        let Some(content) = snapshot_string(value, "content") else { continue };
        let existing = reasons::Entity::find()
            .filter(reasons::Column::Content.eq(&content))
            .one(&transaction)
            .await
            .map_err(|e| e.to_string())?;
        let model = reasons::ActiveModel {
            id: existing.as_ref().map(|row| Set(row.id)).unwrap_or(sea_orm::ActiveValue::NotSet),
            content: Set(content),
            category: Set(snapshot_string(value, "category").unwrap_or_else(|| "其他".into())),
            delta: Set(snapshot_i32(value, "delta").unwrap_or(0)),
            is_system: Set(snapshot_i32(value, "is_system").unwrap_or(0)),
            updated_at: Set(snapshot_string(value, "updated_at").unwrap_or_else(now_string)),
        };
        if existing.is_some() {
            model.update(&transaction).await.map_err(|e| e.to_string())?;
        } else {
            model.insert(&transaction).await.map_err(|e| e.to_string())?;
        }
    }

    for value in snapshot_array(&snapshot, "reward_settings") {
        let Some(name) = snapshot_string(value, "name") else { continue };
        let existing = reward_settings::Entity::find()
            .filter(reward_settings::Column::Name.eq(&name))
            .one(&transaction)
            .await
            .map_err(|e| e.to_string())?;
        let model = reward_settings::ActiveModel {
            id: existing.as_ref().map(|row| Set(row.id)).unwrap_or(sea_orm::ActiveValue::NotSet),
            name: Set(name),
            cost_points: Set(snapshot_i32(value, "cost_points").unwrap_or(0)),
            created_at: Set(snapshot_string(value, "created_at").unwrap_or_else(now_string)),
            updated_at: Set(snapshot_string(value, "updated_at").unwrap_or_else(now_string)),
        };
        if existing.is_some() {
            model.update(&transaction).await.map_err(|e| e.to_string())?;
        } else {
            model.insert(&transaction).await.map_err(|e| e.to_string())?;
        }
    }

    for value in snapshot_array(&snapshot, "tags") {
        let Some(name) = snapshot_string(value, "name") else { continue };
        let existing = tags::Entity::find()
            .filter(tags::Column::Name.eq(&name))
            .one(&transaction)
            .await
            .map_err(|e| e.to_string())?;
        let model = tags::ActiveModel {
            id: existing.as_ref().map(|row| Set(row.id)).unwrap_or(sea_orm::ActiveValue::NotSet),
            name: Set(name),
            created_at: Set(snapshot_string(value, "created_at").unwrap_or_else(now_string)),
            updated_at: Set(snapshot_string(value, "updated_at").unwrap_or_else(now_string)),
        };
        if existing.is_some() {
            model.update(&transaction).await.map_err(|e| e.to_string())?;
        } else {
            model.insert(&transaction).await.map_err(|e| e.to_string())?;
        }
    }

    for value in snapshot_array(&snapshot, "score_events") {
        let Some(uuid) = snapshot_string(value, "uuid") else { continue };
        let exists = score_events::Entity::find()
            .filter(score_events::Column::Uuid.eq(&uuid))
            .one(&transaction)
            .await
            .map_err(|e| e.to_string())?;
        if exists.is_none() {
            score_events::ActiveModel {
                id: sea_orm::ActiveValue::NotSet,
                uuid: Set(uuid),
                student_name: Set(snapshot_string(value, "student_name").unwrap_or_default()),
                reason_content: Set(snapshot_string(value, "reason_content").unwrap_or_default()),
                delta: Set(snapshot_i32(value, "delta").unwrap_or(0)),
                val_prev: Set(snapshot_i32(value, "val_prev").unwrap_or(0)),
                val_curr: Set(snapshot_i32(value, "val_curr").unwrap_or(0)),
                event_time: Set(snapshot_string(value, "event_time").unwrap_or_else(now_string)),
                settlement_id: Set(snapshot_i32(value, "settlement_id")),
            }
            .insert(&transaction)
            .await
            .map_err(|e| e.to_string())?;
        }
    }

    for value in snapshot_array(&snapshot, "reward_redemptions") {
        let Some(uuid) = snapshot_string(value, "uuid") else { continue };
        let reward_name = snapshot_string(value, "reward_name").unwrap_or_default();
        let local_reward_id = reward_settings::Entity::find()
            .filter(reward_settings::Column::Name.eq(&reward_name))
            .one(&transaction)
            .await
            .map_err(|e| e.to_string())?
            .map(|reward| reward.id)
            .unwrap_or_else(|| snapshot_i32(value, "reward_id").unwrap_or(0));
        let exists = reward_redemptions::Entity::find()
            .filter(reward_redemptions::Column::Uuid.eq(&uuid))
            .one(&transaction)
            .await
            .map_err(|e| e.to_string())?;
        if exists.is_none() {
            reward_redemptions::ActiveModel {
                id: sea_orm::ActiveValue::NotSet,
                uuid: Set(uuid),
                student_name: Set(snapshot_string(value, "student_name").unwrap_or_default()),
                reward_id: Set(local_reward_id),
                reward_name: Set(reward_name),
                cost_points: Set(snapshot_i32(value, "cost_points").unwrap_or(0)),
                redeemed_at: Set(snapshot_string(value, "redeemed_at").unwrap_or_else(now_string)),
            }
            .insert(&transaction)
            .await
            .map_err(|e| e.to_string())?;
        }
    }

    for value in snapshot_array(&snapshot, "student_tags") {
        let Some(student_name) = snapshot_string(value, "student_name") else { continue };
        let Some(tag_name) = snapshot_string(value, "tag_name") else { continue };
        let Some(student) = students::Entity::find()
            .filter(students::Column::Name.eq(&student_name))
            .one(&transaction)
            .await
            .map_err(|e| e.to_string())? else { continue };
        let Some(tag) = tags::Entity::find()
            .filter(tags::Column::Name.eq(&tag_name))
            .one(&transaction)
            .await
            .map_err(|e| e.to_string())? else { continue };
        let exists = student_tags::Entity::find()
            .filter(student_tags::Column::StudentId.eq(student.id))
            .filter(student_tags::Column::TagId.eq(tag.id))
            .one(&transaction)
            .await
            .map_err(|e| e.to_string())?;
        if exists.is_none() {
            student_tags::ActiveModel {
                id: sea_orm::ActiveValue::NotSet,
                student_id: Set(student.id),
                tag_id: Set(tag.id),
                created_at: Set(snapshot_string(value, "created_at").unwrap_or_else(now_string)),
            }
            .insert(&transaction)
            .await
            .map_err(|e| e.to_string())?;
        }
    }

    for value in snapshot_array(&snapshot, "settlements") {
        let Some(start_time) = snapshot_string(value, "start_time") else { continue };
        let Some(end_time) = snapshot_string(value, "end_time") else { continue };
        let created_at = snapshot_string(value, "created_at").unwrap_or_else(now_string);
        let statement = Statement::from_sql_and_values(
            DbBackend::Sqlite,
            "INSERT INTO settlements (start_time, end_time, created_at) SELECT ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM settlements WHERE start_time = ? AND end_time = ? AND created_at = ?)",
            vec![
                start_time.clone().into(),
                end_time.clone().into(),
                created_at.clone().into(),
                start_time.into(),
                end_time.into(),
                created_at.into(),
            ],
        );
        transaction.execute(statement).await.map_err(|e| e.to_string())?;
    }

    for value in snapshot_array(&snapshot, "board_configs") {
        let Some(id) = snapshot_i32(value, "id") else { continue };
        let config_json = snapshot_string(value, "config_json").unwrap_or_else(|| "[]".into());
        let updated_at = snapshot_string(value, "updated_at").unwrap_or_else(now_string);
        let statement = Statement::from_sql_and_values(
            DbBackend::Sqlite,
            "INSERT INTO board_configs (id, config_json, updated_at) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET config_json = excluded.config_json, updated_at = excluded.updated_at",
            vec![id.into(), config_json.into(), updated_at.into()],
        );
        transaction.execute(statement).await.map_err(|e| e.to_string())?;
    }

    for (key, value) in snapshot
        .get("settings")
        .and_then(Value::as_object)
        .into_iter()
        .flat_map(|settings| settings.iter())
    {
        if matches!(key.as_str(), "pg_connection_string" | "pg_connection_status") {
            continue;
        }
        let raw = serde_json::to_string(value).map_err(|e| e.to_string())?;
        let statement = Statement::from_sql_and_values(
            DbBackend::Sqlite,
            "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            vec![key.clone().into(), raw.into()],
        );
        transaction.execute(statement).await.map_err(|e| e.to_string())?;
    }

    transaction.commit().await.map_err(|e| e.to_string())?;
    Ok(IpcResponse::success_empty())
}

fn text(payload: &Value, key: &str) -> Result<String, String> {
    payload
        .get(key)
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToString::to_string)
        .ok_or_else(|| format!("同步操作缺少字段: {}", key))
}

fn number(payload: &Value, key: &str) -> Result<i32, String> {
    payload
        .get(key)
        .and_then(Value::as_i64)
        .ok_or_else(|| format!("同步操作缺少数字字段: {}", key))
        .and_then(|value| i32::try_from(value).map_err(|_| format!("同步字段超出范围: {}", key)))
}

fn operation_time(operation: &ApplyRemoteOperation) -> String {
    operation
        .client_created_at
        .clone()
        .unwrap_or_else(|| Utc::now().to_rfc3339())
}

#[tauri::command]
pub async fn sync_apply_remote_operation(
    state: State<'_, Arc<RwLock<AppState>>>,
    operation: ApplyRemoteOperation,
) -> Result<IpcResponse<()>, String> {
    if operation.operation_id.trim().is_empty() {
        return Ok(IpcResponse::error("同步操作缺少 operation_id"));
    }

    let state_guard = state.read();
    let connection = state_guard
        .local_sqlite
        .read()
        .clone()
        .or_else(|| state_guard.db.read().clone());
    let Some(connection) = connection else {
        return Ok(IpcResponse::error("本地数据库未连接"));
    };

    let transaction = connection.begin().await.map_err(|e| e.to_string())?;
    let operation_id = operation.operation_id.trim();
    let timestamp = operation_time(&operation);

    match operation.operation_type.as_str() {
        "score.adjust" => {
            let student_name = text(&operation.payload, "student_name")?;
            let reason_content = text(&operation.payload, "reason_content")
                .unwrap_or_else(|_| "同步积分操作".to_string());
            let delta = number(&operation.payload, "score_delta")?;

            if score_events::Entity::find()
                .filter(score_events::Column::Uuid.eq(operation_id))
                .one(&transaction)
                .await
                .map_err(|e| e.to_string())?
                .is_some()
            {
                transaction.commit().await.map_err(|e| e.to_string())?;
                return Ok(IpcResponse::success_empty());
            }

            let Some(student) = students::Entity::find()
                .filter(students::Column::Name.eq(&student_name))
                .one(&transaction)
                .await
                .map_err(|e| e.to_string())?
            else {
                return Ok(IpcResponse::error("本地找不到同步操作对应的学生"));
            };

            let val_curr = student.score + delta;
            let reward_delta = operation
                .payload
                .get("reward_delta")
                .and_then(Value::as_i64)
                .and_then(|value| i32::try_from(value).ok())
                .unwrap_or(delta);

            score_events::ActiveModel {
                id: sea_orm::ActiveValue::NotSet,
                uuid: Set(operation_id.to_string()),
                student_name: Set(student_name),
                reason_content: Set(reason_content),
                delta: Set(delta),
                val_prev: Set(student.score),
                val_curr: Set(val_curr),
                event_time: Set(timestamp.clone()),
                settlement_id: Set(None),
            }
            .insert(&transaction)
            .await
            .map_err(|e| e.to_string())?;

            let mut active: students::ActiveModel = student.into();
            active.score = Set(val_curr);
            active.reward_points = Set(active_reward_points(&active, reward_delta));
            active.updated_at = Set(timestamp);
            active
                .update(&transaction)
                .await
                .map_err(|e| e.to_string())?;
        }
        "reward.redeem" => {
            let student_name = text(&operation.payload, "student_name")?;
            let reward_id = number(&operation.payload, "reward_id")?;
            let reward_name =
                text(&operation.payload, "reward_name").unwrap_or_else(|_| "同步奖励".to_string());
            let cost_points = number(&operation.payload, "cost_points")?;

            if reward_redemptions::Entity::find()
                .filter(reward_redemptions::Column::Uuid.eq(operation_id))
                .one(&transaction)
                .await
                .map_err(|e| e.to_string())?
                .is_some()
            {
                transaction.commit().await.map_err(|e| e.to_string())?;
                return Ok(IpcResponse::success_empty());
            }

            let Some(student) = students::Entity::find()
                .filter(students::Column::Name.eq(&student_name))
                .one(&transaction)
                .await
                .map_err(|e| e.to_string())?
            else {
                return Ok(IpcResponse::error("本地找不到同步操作对应的学生"));
            };

            reward_redemptions::ActiveModel {
                id: sea_orm::ActiveValue::NotSet,
                uuid: Set(operation_id.to_string()),
                student_name: Set(student_name),
                reward_id: Set(reward_id),
                reward_name: Set(reward_name),
                cost_points: Set(cost_points),
                redeemed_at: Set(timestamp.clone()),
            }
            .insert(&transaction)
            .await
            .map_err(|e| e.to_string())?;

            let mut active: students::ActiveModel = student.into();
            active.reward_points = Set(active_reward_points(&active, -cost_points));
            active.updated_at = Set(timestamp);
            active
                .update(&transaction)
                .await
                .map_err(|e| e.to_string())?;
        }
        _ => return Ok(IpcResponse::error("不支持的远程同步操作")),
    }

    transaction.commit().await.map_err(|e| e.to_string())?;
    Ok(IpcResponse::success_empty())
}

fn active_reward_points(active: &students::ActiveModel, delta: i32) -> i32 {
    match &active.reward_points {
        sea_orm::ActiveValue::Set(value) => *value + delta,
        sea_orm::ActiveValue::Unchanged(value) => *value + delta,
        sea_orm::ActiveValue::NotSet => delta,
    }
}
