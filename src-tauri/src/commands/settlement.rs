use parking_lot::RwLock;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::State;

use crate::models::{SettlementResult, SettlementSummary};
use crate::services::permission::PermissionLevel;
use crate::state::AppState;

use super::response::IpcResponse;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SettlementInfo {
    pub id: i32,
    pub start_time: String,
    pub end_time: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SettlementLeaderboardRow {
    pub name: String,
    pub score: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SettlementLeaderboard {
    pub settlement: SettlementInfo,
    pub rows: Vec<SettlementLeaderboardRow>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SettlementLeaderboardParams {
    pub settlement_id: i32,
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
pub async fn db_settlement_query(
    state: State<'_, Arc<RwLock<AppState>>>,
) -> Result<IpcResponse<Vec<SettlementSummary>>, String> {
    let state_guard = state.read();
    let db_guard = state_guard.db.read();
    if db_guard.is_none() {
        return Ok(IpcResponse::success(Vec::new()));
    }

    let summaries: Vec<SettlementSummary> = Vec::new();

    Ok(IpcResponse::success(summaries))
}

#[tauri::command]
pub async fn db_settlement_create(
    state: State<'_, Arc<RwLock<AppState>>>,
) -> Result<IpcResponse<SettlementResult>, String> {
    check_admin_permission(&state)?;

    let state_guard = state.read();
    let db_guard = state_guard.db.read();
    if db_guard.is_none() {
        return Ok(IpcResponse::failure_with_type("No database connection"));
    }

    let result = SettlementResult {
        settlement_id: 0,
        start_time: chrono::Local::now().to_rfc3339(),
        end_time: chrono::Local::now().to_rfc3339(),
        event_count: 0,
    };

    Ok(IpcResponse::success(result))
}

#[tauri::command]
pub async fn db_settlement_leaderboard(
    params: SettlementLeaderboardParams,
    state: State<'_, Arc<RwLock<AppState>>>,
) -> Result<IpcResponse<SettlementLeaderboard>, String> {
    let state_guard = state.read();
    let db_guard = state_guard.db.read();
    if db_guard.is_none() {
        return Ok(IpcResponse::failure_with_type("No database connection"));
    }

    let leaderboard = SettlementLeaderboard {
        settlement: SettlementInfo {
            id: params.settlement_id,
            start_time: String::new(),
            end_time: String::new(),
        },
        rows: Vec::new(),
    };

    Ok(IpcResponse::success(leaderboard))
}
