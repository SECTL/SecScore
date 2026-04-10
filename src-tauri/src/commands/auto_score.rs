use parking_lot::RwLock;
use serde::{Deserialize, Serialize};
use serde_json::Value as JsonValue;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, State};

use crate::services::{
    query_execution_batches, rollback_execution_batch, AutoScoreAction, AutoScoreExecutionBatch,
    AutoScoreExecutionConfig, AutoScoreFilterConfig, AutoScoreRule, AutoScoreService,
    AutoScoreTrigger, PermissionLevel, SettingsKey, SettingsValue,
};
use crate::state::AppState;

use super::response::IpcResponse;

fn check_admin_permission(
    permissions: &mut crate::services::PermissionService,
    sender_id: Option<u32>,
) -> bool {
    let id = sender_id.unwrap_or(0);
    permissions.require_permission(id, PermissionLevel::Admin)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateAutoScoreRule {
    pub name: String,
    pub enabled: bool,
    #[serde(rename = "studentNames")]
    pub student_names: Vec<String>,
    pub triggers: Vec<AutoScoreTrigger>,
    #[serde(rename = "triggerTree", default)]
    pub trigger_tree: Option<JsonValue>,
    pub actions: Vec<AutoScoreAction>,
    #[serde(default)]
    pub execution: AutoScoreExecutionConfig,
    #[serde(default)]
    pub filters: AutoScoreFilterConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateAutoScoreRule {
    pub id: i32,
    pub name: String,
    pub enabled: bool,
    #[serde(rename = "studentNames")]
    pub student_names: Vec<String>,
    pub triggers: Vec<AutoScoreTrigger>,
    #[serde(rename = "triggerTree", default)]
    pub trigger_tree: Option<JsonValue>,
    pub actions: Vec<AutoScoreAction>,
    #[serde(default)]
    pub execution: AutoScoreExecutionConfig,
    #[serde(default)]
    pub filters: AutoScoreFilterConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RollbackBatchParams {
    #[serde(rename = "batchId")]
    pub batch_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToggleRuleParams {
    #[serde(rename = "ruleId")]
    pub rule_id: i32,
    pub enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AutoScoreStatus {
    pub enabled: bool,
}

fn build_rule_from_create(rule: CreateAutoScoreRule) -> AutoScoreRule {
    AutoScoreRule {
        id: 0,
        name: rule.name,
        enabled: rule.enabled,
        student_names: rule.student_names,
        triggers: rule.triggers,
        trigger_tree: rule.trigger_tree,
        actions: rule.actions,
        execution: rule.execution,
        filters: rule.filters,
        last_executed: None,
    }
}

fn build_rule_from_update(rule: UpdateAutoScoreRule) -> AutoScoreRule {
    AutoScoreRule {
        id: rule.id,
        name: rule.name,
        enabled: rule.enabled,
        student_names: rule.student_names,
        triggers: rule.triggers,
        trigger_tree: rule.trigger_tree,
        actions: rule.actions,
        execution: rule.execution,
        filters: rule.filters,
        last_executed: None,
    }
}

async fn load_rules_from_settings(
    state: &Arc<RwLock<AppState>>,
) -> Result<Vec<AutoScoreRule>, String> {
    let state_guard = state.read();
    let db_conn = state_guard.db.read().clone();
    let mut settings = state_guard.settings.write();
    settings.attach_db(db_conn);
    settings.initialize().await?;

    let rules_json = match settings.get_value(SettingsKey::AutoScoreRules) {
        SettingsValue::Json(value) => value,
        _ => JsonValue::Array(vec![]),
    };

    Ok(AutoScoreService::deserialize_rules(&rules_json))
}

async fn persist_rules_to_settings(
    state: &Arc<RwLock<AppState>>,
    rules: &[AutoScoreRule],
) -> Result<(), String> {
    let rules_json = AutoScoreService::serialize_rules(rules)?;
    let enabled = rules.iter().any(|rule| rule.enabled);

    let state_guard = state.read();
    let db_conn = state_guard.db.read().clone();
    let mut settings = state_guard.settings.write();
    settings.attach_db(db_conn);
    settings.initialize().await?;
    settings
        .set_value(SettingsKey::AutoScoreRules, SettingsValue::Json(rules_json))
        .await?;
    settings
        .set_value(
            SettingsKey::AutoScoreEnabled,
            SettingsValue::Boolean(enabled),
        )
        .await?;

    Ok(())
}

fn replace_cached_rules(state: &Arc<RwLock<AppState>>, rules: Vec<AutoScoreRule>) {
    let state_guard = state.read();
    let mut auto_score_service = state_guard.auto_score.write();
    auto_score_service.replace_rules(rules);
}

async fn sync_cached_rules(state: &Arc<RwLock<AppState>>) -> Result<Vec<AutoScoreRule>, String> {
    let rules = load_rules_from_settings(state).await?;
    replace_cached_rules(state, rules.clone());
    Ok(rules)
}

fn emit_rules_changed(app_handle: &AppHandle, state: &Arc<RwLock<AppState>>) {
    let state_guard = state.read();
    let rules = state_guard.auto_score.read().get_rules().to_vec();
    let _ = app_handle.emit("auto-score:rulesChanged", &rules);
}

fn emit_auto_score_status_changed(app_handle: &AppHandle, rules: &[AutoScoreRule]) {
    let enabled = rules.iter().any(|rule| rule.enabled);
    let _ = app_handle.emit(
        "settings:changed",
        serde_json::json!({
            "key": "auto_score_enabled",
            "value": enabled,
        }),
    );
}

#[tauri::command]
pub async fn auto_score_get_rules(
    sender_id: Option<u32>,
    state: State<'_, Arc<RwLock<AppState>>>,
) -> Result<IpcResponse<Vec<AutoScoreRule>>, String> {
    {
        let state_guard = state.read();
        let mut permissions = state_guard.permissions.write();
        if !check_admin_permission(&mut permissions, sender_id) {
            return Ok(IpcResponse::error("Permission denied: admin required"));
        }
    }

    let rules = sync_cached_rules(state.inner()).await?;
    Ok(IpcResponse::success(rules))
}

#[tauri::command]
pub async fn auto_score_add_rule(
    rule: CreateAutoScoreRule,
    sender_id: Option<u32>,
    app_handle: AppHandle,
    state: State<'_, Arc<RwLock<AppState>>>,
) -> Result<IpcResponse<i32>, String> {
    {
        let state_guard = state.read();
        let mut permissions = state_guard.permissions.write();
        if !check_admin_permission(&mut permissions, sender_id) {
            return Ok(IpcResponse::error("Permission denied: admin required"));
        }
    }

    let current_rules = sync_cached_rules(state.inner()).await?;
    let mut working_service = AutoScoreService::from_rules(current_rules);
    let new_id = match working_service.add_rule(build_rule_from_create(rule)) {
        Ok(value) => value,
        Err(message) => return Ok(IpcResponse::error(&message)),
    };

    let next_rules = working_service.into_rules();
    persist_rules_to_settings(state.inner(), &next_rules).await?;
    replace_cached_rules(state.inner(), next_rules);
    let rules = state.read().auto_score.read().get_rules().to_vec();
    emit_auto_score_status_changed(&app_handle, &rules);
    emit_rules_changed(&app_handle, state.inner());

    Ok(IpcResponse::success(new_id))
}

#[tauri::command]
pub async fn auto_score_update_rule(
    rule: UpdateAutoScoreRule,
    sender_id: Option<u32>,
    app_handle: AppHandle,
    state: State<'_, Arc<RwLock<AppState>>>,
) -> Result<IpcResponse<bool>, String> {
    {
        let state_guard = state.read();
        let mut permissions = state_guard.permissions.write();
        if !check_admin_permission(&mut permissions, sender_id) {
            return Ok(IpcResponse::error("Permission denied: admin required"));
        }
    }

    let current_rules = sync_cached_rules(state.inner()).await?;
    let mut working_service = AutoScoreService::from_rules(current_rules);
    if let Err(message) = working_service.update_rule(build_rule_from_update(rule)) {
        return Ok(IpcResponse::error(&message));
    }

    let next_rules = working_service.into_rules();
    persist_rules_to_settings(state.inner(), &next_rules).await?;
    replace_cached_rules(state.inner(), next_rules);
    let rules = state.read().auto_score.read().get_rules().to_vec();
    emit_auto_score_status_changed(&app_handle, &rules);
    emit_rules_changed(&app_handle, state.inner());

    Ok(IpcResponse::success(true))
}

#[tauri::command]
pub async fn auto_score_delete_rule(
    rule_id: i32,
    sender_id: Option<u32>,
    app_handle: AppHandle,
    state: State<'_, Arc<RwLock<AppState>>>,
) -> Result<IpcResponse<bool>, String> {
    {
        let state_guard = state.read();
        let mut permissions = state_guard.permissions.write();
        if !check_admin_permission(&mut permissions, sender_id) {
            return Ok(IpcResponse::error("Permission denied: admin required"));
        }
    }

    let current_rules = sync_cached_rules(state.inner()).await?;
    let mut working_service = AutoScoreService::from_rules(current_rules);
    if let Err(message) = working_service.delete_rule(rule_id) {
        return Ok(IpcResponse::error(&message));
    }

    let next_rules = working_service.into_rules();
    persist_rules_to_settings(state.inner(), &next_rules).await?;
    replace_cached_rules(state.inner(), next_rules);
    let rules = state.read().auto_score.read().get_rules().to_vec();
    emit_auto_score_status_changed(&app_handle, &rules);
    emit_rules_changed(&app_handle, state.inner());

    Ok(IpcResponse::success(true))
}

#[tauri::command]
pub async fn auto_score_toggle_rule(
    params: ToggleRuleParams,
    sender_id: Option<u32>,
    app_handle: AppHandle,
    state: State<'_, Arc<RwLock<AppState>>>,
) -> Result<IpcResponse<bool>, String> {
    {
        let state_guard = state.read();
        let mut permissions = state_guard.permissions.write();
        if !check_admin_permission(&mut permissions, sender_id) {
            return Ok(IpcResponse::error("Permission denied: admin required"));
        }
    }

    let current_rules = sync_cached_rules(state.inner()).await?;
    let mut working_service = AutoScoreService::from_rules(current_rules);
    if let Err(message) = working_service.toggle_rule(params.rule_id, params.enabled) {
        return Ok(IpcResponse::error(&message));
    }

    let next_rules = working_service.into_rules();
    persist_rules_to_settings(state.inner(), &next_rules).await?;
    replace_cached_rules(state.inner(), next_rules);
    let rules = state.read().auto_score.read().get_rules().to_vec();
    emit_auto_score_status_changed(&app_handle, &rules);
    emit_rules_changed(&app_handle, state.inner());

    Ok(IpcResponse::success(true))
}

#[tauri::command]
pub async fn auto_score_get_status(
    sender_id: Option<u32>,
    state: State<'_, Arc<RwLock<AppState>>>,
) -> Result<IpcResponse<AutoScoreStatus>, String> {
    {
        let state_guard = state.read();
        let mut permissions = state_guard.permissions.write();
        if !check_admin_permission(&mut permissions, sender_id) {
            return Ok(IpcResponse::error("Permission denied: admin required"));
        }
    }

    let rules = sync_cached_rules(state.inner()).await?;
    let enabled = rules.iter().any(|rule| rule.enabled);
    Ok(IpcResponse::success(AutoScoreStatus { enabled }))
}

#[tauri::command]
pub async fn auto_score_sort_rules(
    rule_ids: Vec<i32>,
    sender_id: Option<u32>,
    app_handle: AppHandle,
    state: State<'_, Arc<RwLock<AppState>>>,
) -> Result<IpcResponse<bool>, String> {
    {
        let state_guard = state.read();
        let mut permissions = state_guard.permissions.write();
        if !check_admin_permission(&mut permissions, sender_id) {
            return Ok(IpcResponse::error("Permission denied: admin required"));
        }
    }

    let current_rules = sync_cached_rules(state.inner()).await?;
    let mut working_service = AutoScoreService::from_rules(current_rules);
    working_service.sort_rules(&rule_ids);

    let next_rules = working_service.into_rules();
    persist_rules_to_settings(state.inner(), &next_rules).await?;
    replace_cached_rules(state.inner(), next_rules);
    let rules = state.read().auto_score.read().get_rules().to_vec();
    emit_auto_score_status_changed(&app_handle, &rules);
    emit_rules_changed(&app_handle, state.inner());

    Ok(IpcResponse::success(true))
}

#[tauri::command]
pub async fn auto_score_query_batches(
    sender_id: Option<u32>,
    state: State<'_, Arc<RwLock<AppState>>>,
) -> Result<IpcResponse<Vec<AutoScoreExecutionBatch>>, String> {
    {
        let state_guard = state.read();
        let mut permissions = state_guard.permissions.write();
        if !check_admin_permission(&mut permissions, sender_id) {
            return Ok(IpcResponse::error("Permission denied: admin required"));
        }
    }

    let batches = query_execution_batches(state.inner()).await?;
    Ok(IpcResponse::success(batches))
}

#[tauri::command]
pub async fn auto_score_rollback_batch(
    params: RollbackBatchParams,
    sender_id: Option<u32>,
    state: State<'_, Arc<RwLock<AppState>>>,
) -> Result<IpcResponse<AutoScoreExecutionBatch>, String> {
    {
        let state_guard = state.read();
        let mut permissions = state_guard.permissions.write();
        if !check_admin_permission(&mut permissions, sender_id) {
            return Ok(IpcResponse::error("Permission denied: admin required"));
        }
    }

    let batch = rollback_execution_batch(state.inner(), &params.batch_id).await?;
    Ok(IpcResponse::success(batch))
}
