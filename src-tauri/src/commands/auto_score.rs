use parking_lot::RwLock;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::{AppHandle, Emitter, State};

use crate::services::{
    AutoScoreAction, AutoScoreRule, AutoScoreTrigger, PermissionLevel, SettingsKey, SettingsValue,
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
    pub actions: Vec<AutoScoreAction>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateAutoScoreRule {
    pub id: i32,
    pub name: String,
    pub enabled: bool,
    #[serde(rename = "studentNames")]
    pub student_names: Vec<String>,
    pub triggers: Vec<AutoScoreTrigger>,
    pub actions: Vec<AutoScoreAction>,
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

    let state_guard = state.read();
    let auto_score_service = state_guard.auto_score.read();
    let rules = auto_score_service.get_rules().to_vec();
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

    let new_id = {
        let state_guard = state.read();
        let mut auto_score_service = state_guard.auto_score.write();
        let mut settings = state_guard.settings.write();

        let new_rule = AutoScoreRule {
            id: 0,
            name: rule.name,
            enabled: rule.enabled,
            student_names: rule.student_names,
            triggers: rule.triggers,
            actions: rule.actions,
            last_executed: None,
        };

        let new_id = auto_score_service.add_rule(new_rule);

        let rules_json = auto_score_service.get_rules_json();
        let _ = settings
            .set_value(SettingsKey::AutoScoreRules, SettingsValue::Json(rules_json))
            .await;

        new_id
    };

    {
        let state_guard = state.read();
        let auto_score_service = state_guard.auto_score.read();
        let _ = app_handle.emit("auto-score:rulesChanged", &auto_score_service.get_rules());
    }

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

    let success = {
        let state_guard = state.read();
        let mut auto_score_service = state_guard.auto_score.write();
        let mut settings = state_guard.settings.write();

        let existing = auto_score_service.get_rule_by_id(rule.id);
        let last_executed = existing.and_then(|r| r.last_executed.clone());

        let updated_rule = AutoScoreRule {
            id: rule.id,
            name: rule.name,
            enabled: rule.enabled,
            student_names: rule.student_names,
            triggers: rule.triggers,
            actions: rule.actions,
            last_executed,
        };

        let success = auto_score_service.update_rule(updated_rule);

        if success {
            let rules_json = auto_score_service.get_rules_json();
            let _ = settings
                .set_value(SettingsKey::AutoScoreRules, SettingsValue::Json(rules_json))
                .await;
        }

        success
    };

    if success {
        let state_guard = state.read();
        let auto_score_service = state_guard.auto_score.read();
        let _ = app_handle.emit("auto-score:rulesChanged", &auto_score_service.get_rules());
        Ok(IpcResponse::success(true))
    } else {
        Ok(IpcResponse::error("Rule not found"))
    }
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

    let success = {
        let state_guard = state.read();
        let mut auto_score_service = state_guard.auto_score.write();
        let mut settings = state_guard.settings.write();

        let success = auto_score_service.delete_rule(rule_id);

        if success {
            let rules_json = auto_score_service.get_rules_json();
            let _ = settings
                .set_value(SettingsKey::AutoScoreRules, SettingsValue::Json(rules_json))
                .await;
        }

        success
    };

    if success {
        let state_guard = state.read();
        let auto_score_service = state_guard.auto_score.read();
        let _ = app_handle.emit("auto-score:rulesChanged", &auto_score_service.get_rules());
        Ok(IpcResponse::success(true))
    } else {
        Ok(IpcResponse::error("Rule not found"))
    }
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

    let success = {
        let state_guard = state.read();
        let mut auto_score_service = state_guard.auto_score.write();
        let mut settings = state_guard.settings.write();

        let success = auto_score_service.toggle_rule(params.rule_id, params.enabled);

        if success {
            let rules_json = auto_score_service.get_rules_json();
            let _ = settings
                .set_value(SettingsKey::AutoScoreRules, SettingsValue::Json(rules_json))
                .await;
        }

        success
    };

    if success {
        let state_guard = state.read();
        let auto_score_service = state_guard.auto_score.read();
        let _ = app_handle.emit("auto-score:rulesChanged", &auto_score_service.get_rules());
        Ok(IpcResponse::success(true))
    } else {
        Ok(IpcResponse::error("Rule not found"))
    }
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

    let state_guard = state.read();
    let auto_score_service = state_guard.auto_score.read();
    let enabled = auto_score_service.is_enabled();
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

    {
        let state_guard = state.read();
        let mut auto_score_service = state_guard.auto_score.write();
        let mut settings = state_guard.settings.write();

        auto_score_service.sort_rules(&rule_ids);

        let rules_json = auto_score_service.get_rules_json();
        let _ = settings
            .set_value(SettingsKey::AutoScoreRules, SettingsValue::Json(rules_json))
            .await;
    }

    {
        let state_guard = state.read();
        let auto_score_service = state_guard.auto_score.read();
        let _ = app_handle.emit("auto-score:rulesChanged", &auto_score_service.get_rules());
    }

    Ok(IpcResponse::success(true))
}
