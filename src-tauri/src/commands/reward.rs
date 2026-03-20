use parking_lot::RwLock;
use sea_orm::{
    ActiveModelTrait, ColumnTrait, EntityTrait, QueryFilter, QueryOrder, QuerySelect, Set,
    TransactionTrait,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::State;
use uuid::Uuid;

use crate::db::entities::{reward_redemptions, reward_settings, students};
use crate::services::PermissionLevel;
use crate::state::AppState;

use super::database::realtime_dual_write_sync;
use super::response::IpcResponse;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RewardSettingDto {
    pub id: i32,
    pub name: String,
    pub cost_points: i32,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RewardRedemptionDto {
    pub id: i32,
    pub uuid: String,
    pub student_name: String,
    pub reward_id: i32,
    pub reward_name: String,
    pub cost_points: i32,
    pub redeemed_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateRewardSettingData {
    pub name: String,
    pub cost_points: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateRewardSettingData {
    pub name: Option<String>,
    pub cost_points: Option<i32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RedeemRewardData {
    pub student_name: String,
    pub reward_id: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RedeemRewardResult {
    pub redemption_id: i32,
    pub remaining_reward_points: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QueryRewardRedemptionsParams {
    pub limit: Option<u64>,
}

fn require_permission(
    state: &Arc<RwLock<AppState>>,
    level: PermissionLevel,
) -> Result<(), IpcResponse<()>> {
    let state_guard = state.read();
    let mut permissions = state_guard.permissions.write();
    if permissions.require_permission(0, level) {
        Ok(())
    } else {
        Err(IpcResponse::error("Permission denied"))
    }
}

#[tauri::command]
pub async fn reward_setting_query(
    state: State<'_, Arc<RwLock<AppState>>>,
) -> Result<IpcResponse<Vec<RewardSettingDto>>, String> {
    if require_permission(&state, PermissionLevel::View).is_err() {
        return Ok(IpcResponse::error("Permission denied: view required"));
    }

    let state_guard = state.read();
    let db_guard = state_guard.db.read();
    let Some(conn) = db_guard.as_ref() else {
        return Ok(IpcResponse::error("Database not connected"));
    };

    let rows = reward_settings::Entity::find()
        .order_by_asc(reward_settings::Column::CostPoints)
        .order_by_asc(reward_settings::Column::Name)
        .all(conn)
        .await
        .map_err(|e| e.to_string())?;

    let data = rows
        .into_iter()
        .map(|row| RewardSettingDto {
            id: row.id,
            name: row.name,
            cost_points: row.cost_points,
            created_at: row.created_at,
            updated_at: row.updated_at,
        })
        .collect();

    Ok(IpcResponse::success(data))
}

#[tauri::command]
pub async fn reward_setting_create(
    state: State<'_, Arc<RwLock<AppState>>>,
    data: CreateRewardSettingData,
) -> Result<IpcResponse<i32>, String> {
    if require_permission(&state, PermissionLevel::Admin).is_err() {
        return Ok(IpcResponse::error("Permission denied: admin required"));
    }

    let name = data.name.trim();
    if name.is_empty() {
        return Ok(IpcResponse::error("Reward name cannot be empty"));
    }
    if data.cost_points <= 0 {
        return Ok(IpcResponse::error("Reward cost points must be positive"));
    }

    let state_guard = state.read();
    let db_guard = state_guard.db.read();
    let Some(conn) = db_guard.as_ref() else {
        return Ok(IpcResponse::error("Database not connected"));
    };

    let existing = reward_settings::Entity::find()
        .filter(reward_settings::Column::Name.eq(name))
        .one(conn)
        .await
        .map_err(|e| e.to_string())?;

    if existing.is_some() {
        return Ok(IpcResponse::error("Reward with this name already exists"));
    }

    let now = chrono::Utc::now()
        .format("%Y-%m-%dT%H:%M:%S%.3fZ")
        .to_string();

    let inserted = reward_settings::ActiveModel {
        id: sea_orm::ActiveValue::NotSet,
        name: Set(name.to_string()),
        cost_points: Set(data.cost_points),
        created_at: Set(now.clone()),
        updated_at: Set(now),
    }
    .insert(conn)
    .await
    .map_err(|e| e.to_string())?;

    realtime_dual_write_sync(state.inner()).await?;
    Ok(IpcResponse::success(inserted.id))
}

#[tauri::command]
pub async fn reward_setting_update(
    state: State<'_, Arc<RwLock<AppState>>>,
    id: i32,
    data: UpdateRewardSettingData,
) -> Result<IpcResponse<()>, String> {
    if require_permission(&state, PermissionLevel::Admin).is_err() {
        return Ok(IpcResponse::error("Permission denied: admin required"));
    }

    let state_guard = state.read();
    let db_guard = state_guard.db.read();
    let Some(conn) = db_guard.as_ref() else {
        return Ok(IpcResponse::error("Database not connected"));
    };

    let Some(row) = reward_settings::Entity::find_by_id(id)
        .one(conn)
        .await
        .map_err(|e| e.to_string())?
    else {
        return Ok(IpcResponse::error("Reward not found"));
    };

    let mut active: reward_settings::ActiveModel = row.into();

    if let Some(name) = data.name {
        let name = name.trim().to_string();
        if name.is_empty() {
            return Ok(IpcResponse::error("Reward name cannot be empty"));
        }
        let existing = reward_settings::Entity::find()
            .filter(reward_settings::Column::Name.eq(&name))
            .filter(reward_settings::Column::Id.ne(id))
            .one(conn)
            .await
            .map_err(|e| e.to_string())?;
        if existing.is_some() {
            return Ok(IpcResponse::error("Reward with this name already exists"));
        }
        active.name = Set(name);
    }

    if let Some(cost_points) = data.cost_points {
        if cost_points <= 0 {
            return Ok(IpcResponse::error("Reward cost points must be positive"));
        }
        active.cost_points = Set(cost_points);
    }

    let now = chrono::Utc::now()
        .format("%Y-%m-%dT%H:%M:%S%.3fZ")
        .to_string();
    active.updated_at = Set(now);

    active.update(conn).await.map_err(|e| e.to_string())?;
    realtime_dual_write_sync(state.inner()).await?;
    Ok(IpcResponse::success_empty())
}

#[tauri::command]
pub async fn reward_setting_delete(
    state: State<'_, Arc<RwLock<AppState>>>,
    id: i32,
) -> Result<IpcResponse<()>, String> {
    if require_permission(&state, PermissionLevel::Admin).is_err() {
        return Ok(IpcResponse::error("Permission denied: admin required"));
    }

    let state_guard = state.read();
    let db_guard = state_guard.db.read();
    let Some(conn) = db_guard.as_ref() else {
        return Ok(IpcResponse::error("Database not connected"));
    };

    let deleted = reward_settings::Entity::delete_by_id(id)
        .exec(conn)
        .await
        .map_err(|e| e.to_string())?;

    if deleted.rows_affected == 0 {
        return Ok(IpcResponse::error("Reward not found"));
    }

    realtime_dual_write_sync(state.inner()).await?;
    Ok(IpcResponse::success_empty())
}

#[tauri::command]
pub async fn reward_redeem(
    state: State<'_, Arc<RwLock<AppState>>>,
    data: RedeemRewardData,
) -> Result<IpcResponse<RedeemRewardResult>, String> {
    if require_permission(&state, PermissionLevel::Points).is_err() {
        return Ok(IpcResponse::error("Permission denied: points required"));
    }

    let student_name = data.student_name.trim();
    if student_name.is_empty() {
        return Ok(IpcResponse::error("Student name cannot be empty"));
    }

    let state_guard = state.read();
    let db_guard = state_guard.db.read();
    let Some(conn) = db_guard.as_ref() else {
        return Ok(IpcResponse::error("Database not connected"));
    };

    let txn = conn.begin().await.map_err(|e| e.to_string())?;

    let Some(student) = students::Entity::find()
        .filter(students::Column::Name.eq(student_name))
        .one(&txn)
        .await
        .map_err(|e| e.to_string())?
    else {
        return Ok(IpcResponse::error("Student not found"));
    };

    let Some(reward) = reward_settings::Entity::find_by_id(data.reward_id)
        .one(&txn)
        .await
        .map_err(|e| e.to_string())?
    else {
        return Ok(IpcResponse::error("Reward not found"));
    };

    if student.reward_points < reward.cost_points {
        return Ok(IpcResponse::error("Insufficient reward points"));
    }

    let remaining = student.reward_points - reward.cost_points;
    let now = chrono::Utc::now()
        .format("%Y-%m-%dT%H:%M:%S%.3fZ")
        .to_string();
    let uuid = Uuid::new_v4().to_string();

    let redemption = reward_redemptions::ActiveModel {
        id: sea_orm::ActiveValue::NotSet,
        uuid: Set(uuid),
        student_name: Set(student_name.to_string()),
        reward_id: Set(reward.id),
        reward_name: Set(reward.name.clone()),
        cost_points: Set(reward.cost_points),
        redeemed_at: Set(now.clone()),
    }
    .insert(&txn)
    .await
    .map_err(|e| e.to_string())?;

    let mut active_student: students::ActiveModel = student.into();
    active_student.reward_points = Set(remaining);
    active_student.updated_at = Set(now);
    active_student
        .update(&txn)
        .await
        .map_err(|e| e.to_string())?;

    txn.commit().await.map_err(|e| e.to_string())?;
    realtime_dual_write_sync(state.inner()).await?;

    Ok(IpcResponse::success(RedeemRewardResult {
        redemption_id: redemption.id,
        remaining_reward_points: remaining,
    }))
}

#[tauri::command]
pub async fn reward_redemption_query(
    state: State<'_, Arc<RwLock<AppState>>>,
    params: Option<QueryRewardRedemptionsParams>,
) -> Result<IpcResponse<Vec<RewardRedemptionDto>>, String> {
    if require_permission(&state, PermissionLevel::View).is_err() {
        return Ok(IpcResponse::error("Permission denied: view required"));
    }

    let state_guard = state.read();
    let db_guard = state_guard.db.read();
    let Some(conn) = db_guard.as_ref() else {
        return Ok(IpcResponse::error("Database not connected"));
    };

    let limit = params.and_then(|p| p.limit).unwrap_or(100);

    let rows = reward_redemptions::Entity::find()
        .order_by_desc(reward_redemptions::Column::RedeemedAt)
        .limit(limit)
        .all(conn)
        .await
        .map_err(|e| e.to_string())?;

    let data = rows
        .into_iter()
        .map(|row| RewardRedemptionDto {
            id: row.id,
            uuid: row.uuid,
            student_name: row.student_name,
            reward_id: row.reward_id,
            reward_name: row.reward_name,
            cost_points: row.cost_points,
            redeemed_at: row.redeemed_at,
        })
        .collect();

    Ok(IpcResponse::success(data))
}
