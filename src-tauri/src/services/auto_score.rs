use chrono::{DateTime, Months, Utc};
use sea_orm::{
    ActiveModelTrait, ColumnTrait, ConnectionTrait, DatabaseConnection, EntityTrait, QueryFilter,
    Set, Statement, TransactionTrait,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value as JsonValue};
use std::collections::{HashMap, HashSet};
use tauri::{AppHandle, Emitter, Manager};
use tokio::time::{interval, Duration};
use uuid::Uuid;

use crate::db::entities::{score_events, student_tags, students, tags};
use crate::services::settings::{SettingsKey, SettingsValue};
use crate::state::SafeAppState;

const DEFAULT_INTERVAL_MINUTES: i64 = 30;
const AUTO_SCORE_TICK_SECONDS: u64 = 15;
const AUTO_SCORE_SQL_LIMIT: u64 = 5000;
const AUTO_SCORE_REASON_PREFIX: &str = "自动化";
const AUTO_SCORE_BACKFILL_MAX_RUNS_PER_RULE: i64 = 500;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct AutoScoreTrigger {
    pub event: String,
    pub value: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct AutoScoreAction {
    pub event: String,
    pub value: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub struct AutoScoreExecutionConfig {
    pub cooldown_minutes: Option<i64>,
    pub max_runs_per_day: Option<i64>,
    pub max_score_delta_per_day: Option<i64>,
    pub start_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub struct AutoScoreFilterConfig {
    pub groups: Vec<String>,
    pub grades: Vec<String>,
    pub min_score: Option<i32>,
    pub max_score: Option<i32>,
    pub recent_event_days: Option<i64>,
    pub min_recent_event_count: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AutoScoreExecutionBatch {
    pub id: String,
    pub rule_id: i32,
    pub rule_name: String,
    pub run_at: String,
    pub affected_students: usize,
    pub affected_student_names: Vec<String>,
    pub created_event_ids: Vec<i32>,
    pub added_student_tag_ids: Vec<i32>,
    pub score_delta_total: i64,
    pub settled: bool,
    pub rolled_back: bool,
    pub rollback_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AutoScoreBackfillItem {
    pub rule_id: i32,
    pub runs: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub struct AutoScoreBackfillResult {
    pub applied_rules: usize,
    pub applied_runs: i64,
    pub affected_students: usize,
    pub created_events: usize,
    pub score_delta_total: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
enum IntervalUnit {
    Minute,
    Day,
    Month,
}

#[derive(Debug, Clone, PartialEq, Eq)]
enum IntervalTriggerValue {
    Legacy { amount: i64, unit: IntervalUnit },
    Composite { days: i64, hours: i64, minutes: i64 },
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct AutoScoreRule {
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
    #[serde(rename = "lastExecuted")]
    pub last_executed: Option<String>,
}

#[derive(Debug, Clone)]
enum PlannedAction {
    AddScore(i32),
    AddTags(Vec<String>),
    SettleScore,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ExecutionMode {
    Normal,
    Backfill,
}

#[derive(Debug, Default, Clone)]
struct StudentRefs {
    ids: HashSet<i32>,
    names: HashSet<String>,
}

#[derive(Debug, Default, Clone)]
struct RuleExecutionStats {
    affected_students: usize,
    affected_student_names: Vec<String>,
    created_events: usize,
    added_tags: usize,
    score_delta_total: i64,
    created_event_ids: Vec<i32>,
    added_student_tag_ids: Vec<i32>,
    settled: bool,
}

impl Default for AutoScoreRule {
    fn default() -> Self {
        Self {
            id: 0,
            name: String::new(),
            enabled: true,
            student_names: Vec::new(),
            triggers: Vec::new(),
            trigger_tree: None,
            actions: Vec::new(),
            execution: AutoScoreExecutionConfig::default(),
            filters: AutoScoreFilterConfig::default(),
            last_executed: None,
        }
    }
}

pub struct AutoScoreService {
    rules: Vec<AutoScoreRule>,
    initialized: bool,
}

impl Default for AutoScoreService {
    fn default() -> Self {
        Self::new()
    }
}

impl AutoScoreService {
    pub fn new() -> Self {
        Self {
            rules: Vec::new(),
            initialized: false,
        }
    }

    pub fn from_rules(rules: Vec<AutoScoreRule>) -> Self {
        Self {
            rules,
            initialized: true,
        }
    }

    pub async fn initialize(
        &mut self,
        app_handle: &AppHandle,
    ) -> Result<(), Box<dyn std::error::Error>> {
        if self.initialized {
            return Ok(());
        }

        self.initialized = true;
        Self::spawn_scheduler(app_handle.clone());
        Ok(())
    }

    pub fn deserialize_rules(rules_json: &JsonValue) -> Vec<AutoScoreRule> {
        let JsonValue::Array(items) = rules_json else {
            return Vec::new();
        };

        items
            .iter()
            .filter_map(|item| serde_json::from_value::<AutoScoreRule>(item.clone()).ok())
            .filter_map(|rule| normalize_rule(rule).ok())
            .collect()
    }

    pub fn serialize_rules(rules: &[AutoScoreRule]) -> Result<JsonValue, String> {
        serde_json::to_value(rules)
            .map_err(|error| format!("Failed to serialize auto score rules: {}", error))
    }

    pub fn load_rules(&mut self, rules_json: JsonValue) {
        self.rules = Self::deserialize_rules(&rules_json);
    }

    pub fn replace_rules(&mut self, rules: Vec<AutoScoreRule>) {
        self.rules = rules;
    }

    pub fn into_rules(self) -> Vec<AutoScoreRule> {
        self.rules
    }

    pub fn get_rules_json(&self) -> serde_json::Value {
        Self::serialize_rules(&self.rules).unwrap_or(JsonValue::Array(vec![]))
    }

    pub fn get_rules(&self) -> &[AutoScoreRule] {
        &self.rules
    }

    pub fn add_rule(&mut self, rule: AutoScoreRule) -> Result<i32, String> {
        let mut normalized_rule = normalize_rule(rule)?;
        let new_id = self.rules.iter().map(|item| item.id).max().unwrap_or(0) + 1;
        normalized_rule.id = new_id;
        normalized_rule.last_executed = None;
        self.rules.push(normalized_rule);
        Ok(new_id)
    }

    pub fn update_rule(&mut self, rule: AutoScoreRule) -> Result<(), String> {
        let Some(index) = self.rules.iter().position(|item| item.id == rule.id) else {
            return Err("Rule not found".to_string());
        };

        let last_executed = self.rules[index].last_executed.clone();
        let mut normalized_rule = normalize_rule(rule)?;
        normalized_rule.id = self.rules[index].id;
        normalized_rule.last_executed = normalize_last_executed(last_executed);
        self.rules[index] = normalized_rule;
        Ok(())
    }

    pub fn delete_rule(&mut self, rule_id: i32) -> Result<(), String> {
        let before_len = self.rules.len();
        self.rules.retain(|rule| rule.id != rule_id);
        if self.rules.len() == before_len {
            return Err("Rule not found".to_string());
        }
        Ok(())
    }

    pub fn toggle_rule(&mut self, rule_id: i32, enabled: bool) -> Result<(), String> {
        let Some(rule) = self.rules.iter_mut().find(|item| item.id == rule_id) else {
            return Err("Rule not found".to_string());
        };

        rule.enabled = enabled;
        Ok(())
    }

    pub fn sort_rules(&mut self, rule_ids: &[i32]) {
        let mut ordered_rules = Vec::with_capacity(self.rules.len());
        let mut consumed = HashSet::new();

        for rule_id in rule_ids {
            if !consumed.insert(*rule_id) {
                continue;
            }

            if let Some(rule) = self.rules.iter().find(|item| item.id == *rule_id).cloned() {
                ordered_rules.push(rule);
            }
        }

        for rule in &self.rules {
            if consumed.insert(rule.id) {
                ordered_rules.push(rule.clone());
            }
        }

        self.rules = ordered_rules;
    }

    pub fn is_enabled(&self) -> bool {
        self.rules.iter().any(|rule| rule.enabled)
    }

    pub fn get_rule_by_id(&self, id: i32) -> Option<&AutoScoreRule> {
        self.rules.iter().find(|rule| rule.id == id)
    }

    pub fn mark_rule_executed(&mut self, rule_id: i32) {
        if let Some(rule) = self.rules.iter_mut().find(|item| item.id == rule_id) {
            rule.last_executed = Some(Utc::now().to_rfc3339());
        }
    }

    pub fn check_interval_trigger(&self, rule: &AutoScoreRule) -> Option<i64> {
        check_interval_trigger(rule)
    }

    pub async fn notify_rules_changed(&self, app_handle: &AppHandle) {
        let _ = app_handle.emit("auto-score:rulesChanged", &self.rules);
    }

    fn spawn_scheduler(app_handle: AppHandle) {
        tauri::async_runtime::spawn(async move {
            let mut ticker = interval(Duration::from_secs(AUTO_SCORE_TICK_SECONDS));
            loop {
                ticker.tick().await;
                if let Err(error) = Self::run_scheduler_tick(&app_handle).await {
                    eprintln!("auto score scheduler tick failed: {}", error);
                }
            }
        });
    }

    async fn run_scheduler_tick(app_handle: &AppHandle) -> Result<(), String> {
        let state = app_handle.state::<SafeAppState>().inner().clone();
        let mut execution_batches = load_batches_from_settings(&state).await?;

        let rules_snapshot = {
            let state_guard = state.read();
            let auto_score = state_guard.auto_score.read();
            auto_score.get_rules().to_vec()
        };

        if !rules_snapshot.iter().any(|rule| rule.enabled) {
            return Ok(());
        }

        let conn = {
            let state_guard = state.read();
            let db_conn = state_guard.db.read().clone();
            db_conn
        }
        .ok_or_else(|| "Database not connected".to_string())?;

        let mut next_rules = rules_snapshot.clone();
        let mut changed = false;

        for rule in next_rules.iter_mut().filter(|rule| rule.enabled) {
            let Some(delay_ms) = check_interval_trigger(rule) else {
                continue;
            };
            if delay_ms > 0 {
                continue;
            }

            match execute_rule(&conn, rule, &execution_batches, ExecutionMode::Normal).await {
                Ok(stats) => {
                    if stats.affected_students == 0 {
                        Self::log_rule_skipped(&state, rule, "no matched students");
                        continue;
                    }
                    rule.last_executed = Some(Utc::now().to_rfc3339());
                    changed = true;
                    Self::log_rule_executed(&state, rule, &stats);
                    let batch = AutoScoreExecutionBatch {
                        id: Uuid::new_v4().to_string(),
                        rule_id: rule.id,
                        rule_name: rule.name.clone(),
                        run_at: now_iso(),
                        affected_students: stats.affected_students,
                        affected_student_names: stats.affected_student_names.clone(),
                        created_event_ids: stats.created_event_ids.clone(),
                        added_student_tag_ids: stats.added_student_tag_ids.clone(),
                        score_delta_total: stats.score_delta_total,
                        settled: stats.settled,
                        rolled_back: false,
                        rollback_at: None,
                    };
                    execution_batches.push(batch);
                }
                Err(error) => {
                    Self::log_rule_failed(&state, rule, &error);
                }
            }
        }

        if !changed {
            return Ok(());
        }

        persist_rules_to_settings(&state, &next_rules).await?;
        save_batches_to_settings(&state, &execution_batches).await?;

        {
            let state_guard = state.read();
            let mut auto_score = state_guard.auto_score.write();
            auto_score.replace_rules(next_rules.clone());
        }

        let enabled = next_rules.iter().any(|rule| rule.enabled);
        let _ = app_handle.emit("auto-score:rulesChanged", &next_rules);
        let _ = app_handle.emit(
            "settings:changed",
            json!({
                "key": "auto_score_enabled",
                "value": enabled,
            }),
        );

        Ok(())
    }

    fn log_rule_executed(state: &SafeAppState, rule: &AutoScoreRule, stats: &RuleExecutionStats) {
        let state_guard = state.read();
        let logger = state_guard.logger.read();
        logger.info_with_meta(
            "auto_score:rule_executed",
            json!({
                "rule_id": rule.id,
                "rule_name": rule.name,
                "affected_students": stats.affected_students,
                "created_events": stats.created_events,
                "added_tags": stats.added_tags,
                "score_delta_total": stats.score_delta_total,
                "settled": stats.settled,
            }),
        );
    }

    fn log_rule_failed(state: &SafeAppState, rule: &AutoScoreRule, error: &str) {
        let state_guard = state.read();
        let logger = state_guard.logger.read();
        logger.warn_with_meta(
            "auto_score:rule_failed",
            json!({
                "rule_id": rule.id,
                "rule_name": rule.name,
                "error": error,
            }),
        );
    }

    fn log_rule_skipped(state: &SafeAppState, rule: &AutoScoreRule, reason: &str) {
        let state_guard = state.read();
        let logger = state_guard.logger.read();
        logger.info_with_meta(
            "auto_score:rule_skipped",
            json!({
                "rule_id": rule.id,
                "rule_name": rule.name,
                "reason": reason,
            }),
        );
    }
}

fn normalize_rule(mut rule: AutoScoreRule) -> Result<AutoScoreRule, String> {
    rule.name = normalize_required_string(rule.name, "automation name")?;
    rule.student_names = dedupe_trimmed_strings(rule.student_names);

    if rule.triggers.is_empty() && rule.trigger_tree.is_none() {
        return Err("At least one trigger is required".to_string());
    }
    if rule.actions.is_empty() {
        return Err("At least one action is required".to_string());
    }

    let normalized_triggers = rule
        .triggers
        .into_iter()
        .map(normalize_trigger)
        .collect::<Result<Vec<_>, _>>()?;
    let normalized_tree = if let Some(tree) = rule.trigger_tree.take() {
        normalize_trigger_tree(tree)?
    } else {
        build_trigger_tree_from_triggers(&normalized_triggers)
    };
    let tree_triggers = collect_triggers_from_tree(&normalized_tree)?;
    if tree_triggers.is_empty() {
        return Err("At least one trigger is required".to_string());
    }

    rule.triggers = tree_triggers;
    rule.trigger_tree = Some(normalized_tree);
    rule.actions = rule
        .actions
        .into_iter()
        .map(normalize_action)
        .collect::<Result<Vec<_>, _>>()?;
    rule.execution = normalize_execution_config(rule.execution)?;
    rule.filters = normalize_filter_config(rule.filters)?;
    rule.last_executed = normalize_last_executed(rule.last_executed);

    Ok(rule)
}

fn normalize_execution_config(
    mut config: AutoScoreExecutionConfig,
) -> Result<AutoScoreExecutionConfig, String> {
    config.cooldown_minutes = config.cooldown_minutes.filter(|value| *value > 0);
    config.max_runs_per_day = config.max_runs_per_day.filter(|value| *value > 0);
    config.max_score_delta_per_day = config.max_score_delta_per_day.filter(|value| *value > 0);
    config.start_at = normalize_datetime_rfc3339(config.start_at);
    Ok(config)
}

fn normalize_filter_config(
    mut config: AutoScoreFilterConfig,
) -> Result<AutoScoreFilterConfig, String> {
    config.groups = dedupe_trimmed_strings(config.groups);
    config.grades = dedupe_trimmed_strings(config.grades);
    if let (Some(min_score), Some(max_score)) = (config.min_score, config.max_score) {
        if min_score > max_score {
            return Err("minScore cannot be greater than maxScore".to_string());
        }
    }
    config.recent_event_days = config.recent_event_days.filter(|value| *value > 0);
    config.min_recent_event_count = config.min_recent_event_count.filter(|value| *value >= 0);
    Ok(config)
}

fn build_trigger_tree_from_triggers(triggers: &[AutoScoreTrigger]) -> JsonValue {
    JsonValue::Object(
        [
            (
                "id".to_string(),
                JsonValue::String(Uuid::new_v4().to_string()),
            ),
            ("type".to_string(), JsonValue::String("group".to_string())),
            (
                "properties".to_string(),
                json!({
                    "conjunction": "AND"
                }),
            ),
            (
                "children1".to_string(),
                JsonValue::Array(
                    triggers
                        .iter()
                        .map(build_trigger_rule_node)
                        .collect::<Vec<JsonValue>>(),
                ),
            ),
        ]
        .into_iter()
        .collect(),
    )
}

fn build_trigger_rule_node(trigger: &AutoScoreTrigger) -> JsonValue {
    let (field, operator, value) = match trigger.event.as_str() {
        "interval_time_passed" => (
            "interval_minutes",
            "equal",
            JsonValue::Array(vec![JsonValue::String(
                trigger.value.clone().unwrap_or_default(),
            )]),
        ),
        "student_has_tag" => {
            let tag_values = parse_tag_values(trigger.value.as_deref())
                .into_iter()
                .map(JsonValue::String)
                .collect::<Vec<JsonValue>>();
            (
                "student_tag",
                "multiselect_contains",
                JsonValue::Array(vec![JsonValue::Array(tag_values)]),
            )
        }
        "query_sql" | "student_query_sql" | "student_sql" => (
            "student_sql",
            "equal",
            JsonValue::Array(vec![JsonValue::String(
                trigger.value.clone().unwrap_or_default(),
            )]),
        ),
        "student_score_gt" => (
            "student_score",
            "greater",
            JsonValue::Array(vec![JsonValue::String(
                trigger.value.clone().unwrap_or_default(),
            )]),
        ),
        "student_score_lt" => (
            "student_score",
            "less",
            JsonValue::Array(vec![JsonValue::String(
                trigger.value.clone().unwrap_or_default(),
            )]),
        ),
        _ => (
            "student_sql",
            "equal",
            JsonValue::Array(vec![JsonValue::String(
                trigger.value.clone().unwrap_or_default(),
            )]),
        ),
    };

    JsonValue::Object(
        [
            (
                "id".to_string(),
                JsonValue::String(Uuid::new_v4().to_string()),
            ),
            ("type".to_string(), JsonValue::String("rule".to_string())),
            (
                "properties".to_string(),
                json!({
                    "field": field,
                    "operator": operator,
                    "value": value,
                }),
            ),
        ]
        .into_iter()
        .collect(),
    )
}

fn normalize_trigger_tree(tree: JsonValue) -> Result<JsonValue, String> {
    let normalized = normalize_trigger_tree_node(tree)?;
    if !matches!(
        normalized
            .get("type")
            .and_then(JsonValue::as_str)
            .unwrap_or_default(),
        "group"
    ) {
        return Err("Trigger tree root must be a group".to_string());
    }
    Ok(normalized)
}

fn normalize_trigger_tree_node(node: JsonValue) -> Result<JsonValue, String> {
    let Some(node_type) = node.get("type").and_then(JsonValue::as_str) else {
        return Err("Trigger tree node type is required".to_string());
    };

    match node_type {
        "group" => normalize_trigger_tree_group(node),
        "rule" => normalize_trigger_tree_rule(node),
        _ => Err(format!("Unsupported trigger tree node type: {}", node_type)),
    }
}

fn normalize_trigger_tree_group(node: JsonValue) -> Result<JsonValue, String> {
    let conjunction = node
        .get("properties")
        .and_then(|value| value.get("conjunction"))
        .and_then(JsonValue::as_str)
        .unwrap_or("AND")
        .to_uppercase();
    if conjunction != "AND" && conjunction != "OR" {
        return Err("Trigger tree group conjunction must be AND or OR".to_string());
    }

    let not = node
        .get("properties")
        .and_then(|value| value.get("not"))
        .and_then(JsonValue::as_bool)
        .unwrap_or(false);

    let children = node
        .get("children1")
        .and_then(JsonValue::as_array)
        .cloned()
        .unwrap_or_default();
    if children.is_empty() {
        return Err("Trigger tree group must contain at least one child".to_string());
    }

    let normalized_children = children
        .into_iter()
        .map(normalize_trigger_tree_node)
        .collect::<Result<Vec<_>, _>>()?;

    Ok(JsonValue::Object(
        [
            (
                "id".to_string(),
                JsonValue::String(
                    node.get("id")
                        .and_then(JsonValue::as_str)
                        .filter(|value| !value.trim().is_empty())
                        .map(str::to_string)
                        .unwrap_or_else(|| Uuid::new_v4().to_string()),
                ),
            ),
            ("type".to_string(), JsonValue::String("group".to_string())),
            (
                "properties".to_string(),
                json!({
                    "conjunction": conjunction,
                    "not": not,
                }),
            ),
            (
                "children1".to_string(),
                JsonValue::Array(normalized_children),
            ),
        ]
        .into_iter()
        .collect(),
    ))
}

fn normalize_trigger_tree_rule(node: JsonValue) -> Result<JsonValue, String> {
    let trigger = trigger_from_rule_node(&node)?;

    Ok(JsonValue::Object(
        [
            (
                "id".to_string(),
                JsonValue::String(
                    node.get("id")
                        .and_then(JsonValue::as_str)
                        .filter(|value| !value.trim().is_empty())
                        .map(str::to_string)
                        .unwrap_or_else(|| Uuid::new_v4().to_string()),
                ),
            ),
            ("type".to_string(), JsonValue::String("rule".to_string())),
            (
                "properties".to_string(),
                build_trigger_rule_node(&trigger)
                    .get("properties")
                    .cloned()
                    .unwrap_or_else(|| json!({})),
            ),
        ]
        .into_iter()
        .collect(),
    ))
}

fn collect_triggers_from_tree(tree: &JsonValue) -> Result<Vec<AutoScoreTrigger>, String> {
    let mut collected = Vec::new();
    collect_triggers_from_tree_node(tree, &mut collected)?;
    Ok(collected)
}

fn collect_triggers_from_tree_node(
    node: &JsonValue,
    collected: &mut Vec<AutoScoreTrigger>,
) -> Result<(), String> {
    let Some(node_type) = node.get("type").and_then(JsonValue::as_str) else {
        return Err("Trigger tree node type is required".to_string());
    };

    match node_type {
        "group" => {
            let children = node
                .get("children1")
                .and_then(JsonValue::as_array)
                .ok_or_else(|| "Trigger tree group children1 must be an array".to_string())?;
            for child in children {
                collect_triggers_from_tree_node(child, collected)?;
            }
            Ok(())
        }
        "rule" => {
            collected.push(trigger_from_rule_node(node)?);
            Ok(())
        }
        _ => Err(format!("Unsupported trigger tree node type: {}", node_type)),
    }
}

fn trigger_from_rule_node(node: &JsonValue) -> Result<AutoScoreTrigger, String> {
    let field = node
        .get("properties")
        .and_then(|value| value.get("field"))
        .and_then(JsonValue::as_str)
        .unwrap_or_default();
    let operator = node
        .get("properties")
        .and_then(|value| value.get("operator"))
        .and_then(JsonValue::as_str)
        .unwrap_or_default();
    let first_value = node
        .get("properties")
        .and_then(|value| value.get("value"))
        .and_then(JsonValue::as_array)
        .and_then(|values| values.first())
        .cloned();

    match field {
        "interval_minutes" => {
            let trigger = AutoScoreTrigger {
                event: "interval_time_passed".to_string(),
                value: first_value
                    .as_ref()
                    .and_then(JsonValue::as_str)
                    .map(str::to_string),
            };
            normalize_trigger(trigger)
        }
        "student_tag" => {
            let tags = match first_value {
                Some(JsonValue::Array(items)) => items
                    .into_iter()
                    .filter_map(|item| item.as_str().map(str::to_string))
                    .collect::<Vec<String>>(),
                Some(JsonValue::String(value)) => vec![value],
                _ => Vec::new(),
            };
            let trigger = AutoScoreTrigger {
                event: "student_has_tag".to_string(),
                value: stringify_tag_values(&tags),
            };
            normalize_trigger(trigger)
        }
        "student_sql" => {
            let trigger = AutoScoreTrigger {
                event: "query_sql".to_string(),
                value: first_value
                    .as_ref()
                    .and_then(JsonValue::as_str)
                    .map(str::to_string),
            };
            normalize_trigger(trigger)
        }
        "student_score" | "student_score_gt" | "student_score_lt" => {
            let score = match first_value {
                Some(JsonValue::Number(value)) => value.to_string(),
                Some(JsonValue::String(value)) => value,
                _ => String::new(),
            };
            let event = if operator.eq_ignore_ascii_case("less") || field == "student_score_lt" {
                "student_score_lt"
            } else {
                "student_score_gt"
            };
            let trigger = AutoScoreTrigger {
                event: event.to_string(),
                value: if score.trim().is_empty() {
                    None
                } else {
                    Some(score)
                },
            };
            normalize_trigger(trigger)
        }
        _ => Err(format!("Unsupported trigger tree field: {}", field)),
    }
}

fn normalize_trigger(trigger: AutoScoreTrigger) -> Result<AutoScoreTrigger, String> {
    let event = normalize_required_string(trigger.event, "trigger event")?;

    match event.as_str() {
        "interval_time_passed" => {
            let interval = parse_interval_trigger_value(trigger.value.as_deref())
                .ok_or_else(|| "Invalid interval trigger value".to_string())?;
            let value = stringify_interval_trigger_value(&interval)
                .ok_or_else(|| "Invalid interval trigger value".to_string())?;

            Ok(AutoScoreTrigger {
                event,
                value: Some(value),
            })
        }
        "student_has_tag" => {
            let tag_values = parse_tag_values(trigger.value.as_deref());
            let value = stringify_tag_values(&tag_values)
                .ok_or_else(|| "Student tag trigger requires at least one tag".to_string())?;

            Ok(AutoScoreTrigger {
                event,
                value: Some(value),
            })
        }
        "query_sql" | "student_query_sql" | "student_sql" => {
            let raw_sql = trigger
                .value
                .map(|value| value.trim().to_string())
                .filter(|value| !value.is_empty())
                .ok_or_else(|| "SQL trigger requires non-empty SQL".to_string())?;
            if !is_valid_auto_score_sql(&raw_sql) {
                return Err("Only read-only SQL expression/query is allowed".to_string());
            }

            Ok(AutoScoreTrigger {
                event,
                value: Some(raw_sql),
            })
        }
        "student_score_gt" | "student_score_lt" => {
            let threshold = normalize_integer_string(trigger.value.as_deref())
                .ok_or_else(|| "Student score trigger requires an integer value".to_string())?;
            Ok(AutoScoreTrigger {
                event,
                value: Some(threshold),
            })
        }
        _ => Err(format!("Unsupported trigger event: {}", event)),
    }
}

fn normalize_action(action: AutoScoreAction) -> Result<AutoScoreAction, String> {
    let event = normalize_required_string(action.event, "action event")?;

    match event.as_str() {
        "add_score" => {
            let value = normalize_non_zero_integer_string(action.value.as_deref())
                .ok_or_else(|| "Add score action requires a non-zero integer value".to_string())?;

            Ok(AutoScoreAction {
                event,
                value: Some(value),
            })
        }
        "add_tag" => {
            let tag_values = parse_tag_values(action.value.as_deref());
            let value = stringify_tag_values(&tag_values)
                .ok_or_else(|| "Add tag action requires at least one tag".to_string())?;

            Ok(AutoScoreAction {
                event,
                value: Some(value),
            })
        }
        "settle_score" => Ok(AutoScoreAction { event, value: None }),
        _ => Err(format!("Unsupported action event: {}", event)),
    }
}

fn normalize_required_string(value: String, field_name: &str) -> Result<String, String> {
    let normalized = value.trim().to_string();
    if normalized.is_empty() {
        return Err(format!("{} is required", field_name));
    }
    Ok(normalized)
}

fn dedupe_trimmed_strings(values: Vec<String>) -> Vec<String> {
    let mut seen = HashSet::new();
    let mut normalized = Vec::new();

    for value in values {
        let trimmed = value.trim();
        if trimmed.is_empty() {
            continue;
        }

        let owned = trimmed.to_string();
        if seen.insert(owned.clone()) {
            normalized.push(owned);
        }
    }

    normalized
}

fn parse_tag_values(value: Option<&str>) -> Vec<String> {
    let Some(raw_value) = value.map(str::trim) else {
        return Vec::new();
    };

    if raw_value.is_empty() {
        return Vec::new();
    }

    if raw_value.starts_with('[') {
        if let Ok(parsed_values) = serde_json::from_str::<Vec<String>>(raw_value) {
            return dedupe_trimmed_strings(parsed_values);
        }
    }

    dedupe_trimmed_strings(vec![raw_value.to_string()])
}

fn stringify_tag_values(values: &[String]) -> Option<String> {
    if values.is_empty() {
        return None;
    }

    if values.len() == 1 {
        return values.first().cloned();
    }

    serde_json::to_string(values).ok()
}

fn normalize_non_zero_integer_string(value: Option<&str>) -> Option<String> {
    let normalized = value?.trim();
    if normalized.is_empty() {
        return None;
    }

    let parsed = normalized.parse::<i32>().ok()?;
    if parsed == 0 {
        return None;
    }

    Some(parsed.to_string())
}

fn normalize_integer_string(value: Option<&str>) -> Option<String> {
    let normalized = value?.trim();
    if normalized.is_empty() {
        return None;
    }
    let parsed = normalized.parse::<i32>().ok()?;
    Some(parsed.to_string())
}

fn normalize_datetime_rfc3339(value: Option<String>) -> Option<String> {
    value
        .as_deref()
        .and_then(|raw_value| DateTime::parse_from_rfc3339(raw_value).ok())
        .map(|parsed| parsed.with_timezone(&Utc).to_rfc3339())
}

fn normalize_last_executed(value: Option<String>) -> Option<String> {
    normalize_datetime_rfc3339(value)
}

fn parse_positive_i64(value: &JsonValue) -> Option<i64> {
    match value {
        JsonValue::Number(number) => number.as_i64().filter(|parsed| *parsed > 0),
        JsonValue::String(text) => text.trim().parse::<i64>().ok().filter(|parsed| *parsed > 0),
        _ => None,
    }
}

fn parse_non_negative_i64(value: &JsonValue) -> Option<i64> {
    match value {
        JsonValue::Number(number) => number.as_i64().filter(|parsed| *parsed >= 0),
        JsonValue::String(text) => text
            .trim()
            .parse::<i64>()
            .ok()
            .filter(|parsed| *parsed >= 0),
        _ => None,
    }
}

fn parse_interval_trigger_value(value: Option<&str>) -> Option<IntervalTriggerValue> {
    let raw_value = value.map(str::trim)?;
    if raw_value.is_empty() {
        return None;
    }

    if let Ok(minutes) = raw_value.parse::<i64>() {
        if minutes > 0 {
            return Some(IntervalTriggerValue::Legacy {
                amount: minutes,
                unit: IntervalUnit::Minute,
            });
        }
    }

    let parsed_value = serde_json::from_str::<JsonValue>(raw_value).ok()?;
    let object = parsed_value.as_object()?;

    if let (Some(days), Some(hours), Some(minutes)) = (
        object.get("days").and_then(parse_non_negative_i64),
        object.get("hours").and_then(parse_non_negative_i64),
        object.get("minutes").and_then(parse_non_negative_i64),
    ) {
        if days > 0 || hours > 0 || minutes > 0 {
            return Some(IntervalTriggerValue::Composite {
                days,
                hours,
                minutes,
            });
        }
    }

    let amount = object.get("amount").and_then(parse_positive_i64)?;
    let unit = match object.get("unit").and_then(JsonValue::as_str) {
        Some("minute") => IntervalUnit::Minute,
        Some("day") => IntervalUnit::Day,
        Some("month") => IntervalUnit::Month,
        _ => return None,
    };

    Some(IntervalTriggerValue::Legacy { amount, unit })
}

fn stringify_interval_trigger_value(value: &IntervalTriggerValue) -> Option<String> {
    match value {
        IntervalTriggerValue::Legacy { amount, unit } => {
            if *amount <= 0 {
                return None;
            }

            match unit {
                IntervalUnit::Minute => Some(amount.to_string()),
                IntervalUnit::Day | IntervalUnit::Month => serde_json::to_string(&json!({
                    "amount": amount,
                    "unit": unit,
                }))
                .ok(),
            }
        }
        IntervalTriggerValue::Composite {
            days,
            hours,
            minutes,
        } => {
            if *days <= 0 && *hours <= 0 && *minutes <= 0 {
                return None;
            }

            serde_json::to_string(&json!({
                "days": days,
                "hours": hours,
                "minutes": minutes,
            }))
            .ok()
        }
    }
}

fn add_interval_to_time(
    base_time: DateTime<Utc>,
    interval: &IntervalTriggerValue,
) -> Option<DateTime<Utc>> {
    match interval {
        IntervalTriggerValue::Legacy { amount, unit } => match unit {
            IntervalUnit::Minute => {
                base_time.checked_add_signed(chrono::Duration::minutes(*amount))
            }
            IntervalUnit::Day => base_time.checked_add_signed(chrono::Duration::days(*amount)),
            IntervalUnit::Month => {
                let months = u32::try_from(*amount).ok()?;
                base_time.checked_add_months(Months::new(months))
            }
        },
        IntervalTriggerValue::Composite {
            days,
            hours,
            minutes,
        } => {
            let total_minutes = days
                .saturating_mul(24 * 60)
                .saturating_add(hours.saturating_mul(60))
                .saturating_add(*minutes);
            if total_minutes <= 0 {
                return None;
            }
            base_time.checked_add_signed(chrono::Duration::minutes(total_minutes))
        }
    }
}

fn check_interval_trigger(rule: &AutoScoreRule) -> Option<i64> {
    let delays = rule
        .triggers
        .iter()
        .filter(|trigger| trigger.event == "interval_time_passed")
        .map(|trigger| get_interval_delay_ms(rule, trigger.value.as_deref()))
        .collect::<Vec<Option<i64>>>();

    if delays.is_empty() {
        return None;
    }

    delays.into_iter().flatten().min()
}

fn get_interval_delay_ms(rule: &AutoScoreRule, value: Option<&str>) -> Option<i64> {
    let now = Utc::now();
    let interval = parse_interval_trigger_value(value).unwrap_or(IntervalTriggerValue::Legacy {
        amount: DEFAULT_INTERVAL_MINUTES,
        unit: IntervalUnit::Minute,
    });

    let last_executed = rule
        .last_executed
        .as_ref()
        .and_then(|raw| DateTime::parse_from_rfc3339(raw).ok())
        .map(|parsed| parsed.with_timezone(&Utc));
    let start_at = rule
        .execution
        .start_at
        .as_ref()
        .and_then(|raw| DateTime::parse_from_rfc3339(raw).ok())
        .map(|parsed| parsed.with_timezone(&Utc));

    let base_time = match (last_executed, start_at) {
        (Some(last), Some(start)) => Some(if last > start { last } else { start }),
        (Some(last), None) => Some(last),
        (None, Some(start)) => Some(start),
        (None, None) => None,
    };

    let Some(base_time) = base_time else {
        return Some(0);
    };

    let next_execute_time = add_interval_to_time(base_time, &interval)?;
    Some((next_execute_time - now).num_milliseconds().max(0))
}

fn is_interval_due(rule: &AutoScoreRule, value: Option<&str>) -> bool {
    get_interval_delay_ms(rule, value).unwrap_or(0) <= 0
}

fn contains_forbidden_keyword(sql: &str) -> bool {
    let forbidden: HashSet<&str> = [
        "insert", "update", "delete", "drop", "alter", "create", "truncate", "reindex", "vacuum",
        "grant", "revoke", "commit", "rollback", "begin", "attach", "detach", "pragma", "analyze",
        "merge", "call", "execute",
    ]
    .into_iter()
    .collect();

    let mut token = String::new();
    for ch in sql.chars() {
        if ch.is_ascii_alphanumeric() || ch == '_' {
            token.push(ch);
            continue;
        }

        if !token.is_empty() {
            if forbidden.contains(token.as_str()) {
                return true;
            }
            token.clear();
        }
    }

    !token.is_empty() && forbidden.contains(token.as_str())
}

fn starts_with_select_or_with(sql: &str) -> bool {
    sql.split_whitespace()
        .next()
        .map(|first| {
            let first_lower = first.to_ascii_lowercase();
            first_lower == "select" || first_lower == "with"
        })
        .unwrap_or(false)
}

fn has_sql_comment_or_multi_statement(sql: &str) -> bool {
    sql.contains(';') || sql.contains("--") || sql.contains("/*") || sql.contains("*/")
}

fn is_readonly_query(sql: &str) -> bool {
    let trimmed = sql.trim();
    if trimmed.is_empty() {
        return false;
    }

    if has_sql_comment_or_multi_statement(trimmed) {
        return false;
    }

    if !starts_with_select_or_with(trimmed) {
        return false;
    }

    !contains_forbidden_keyword(&trimmed.to_ascii_lowercase())
}

fn is_safe_sql_expression(sql: &str) -> bool {
    let trimmed = sql.trim();
    if trimmed.is_empty() {
        return false;
    }

    if has_sql_comment_or_multi_statement(trimmed) {
        return false;
    }

    !contains_forbidden_keyword(&trimmed.to_ascii_lowercase())
}

fn is_valid_auto_score_sql(sql: &str) -> bool {
    let trimmed = sql.trim();
    if trimmed.is_empty() {
        return false;
    }

    if starts_with_select_or_with(trimmed) {
        is_readonly_query(trimmed)
    } else {
        is_safe_sql_expression(trimmed)
    }
}

fn build_readonly_student_query(sql_or_expression: &str) -> Result<String, String> {
    let trimmed = sql_or_expression.trim();
    if trimmed.is_empty() {
        return Err("Empty SQL".to_string());
    }

    let normalized = if starts_with_select_or_with(trimmed) {
        if !is_readonly_query(trimmed) {
            return Err("Only read-only SELECT/CTE query is allowed".to_string());
        }
        trimmed.to_string()
    } else {
        if !is_safe_sql_expression(trimmed) {
            return Err("Only safe SQL expression is allowed".to_string());
        }
        format!("SELECT id, name FROM students WHERE ({})", trimmed)
    };

    Ok(format!(
        "SELECT * FROM ({}) AS ss_auto_score_query LIMIT {}",
        normalized, AUTO_SCORE_SQL_LIMIT
    ))
}

async fn persist_rules_to_settings(
    state: &SafeAppState,
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

fn deserialize_batches(value: &JsonValue) -> Vec<AutoScoreExecutionBatch> {
    let JsonValue::Array(items) = value else {
        return Vec::new();
    };

    items
        .iter()
        .filter_map(|item| serde_json::from_value::<AutoScoreExecutionBatch>(item.clone()).ok())
        .collect()
}

async fn load_batches_from_settings(
    state: &SafeAppState,
) -> Result<Vec<AutoScoreExecutionBatch>, String> {
    let state_guard = state.read();
    let db_conn = state_guard.db.read().clone();
    let mut settings = state_guard.settings.write();
    settings.attach_db(db_conn);
    settings.initialize().await?;
    let raw = match settings.get_value(SettingsKey::AutoScoreBatches) {
        SettingsValue::Json(value) => value,
        _ => JsonValue::Array(vec![]),
    };
    Ok(deserialize_batches(&raw))
}

async fn save_batches_to_settings(
    state: &SafeAppState,
    batches: &[AutoScoreExecutionBatch],
) -> Result<(), String> {
    let encoded = serde_json::to_value(batches).map_err(|e| e.to_string())?;
    let state_guard = state.read();
    let db_conn = state_guard.db.read().clone();
    let mut settings = state_guard.settings.write();
    settings.attach_db(db_conn);
    settings.initialize().await?;
    settings
        .set_value(SettingsKey::AutoScoreBatches, SettingsValue::Json(encoded))
        .await?;
    Ok(())
}

pub async fn query_execution_batches(
    state: &SafeAppState,
) -> Result<Vec<AutoScoreExecutionBatch>, String> {
    let mut batches = load_batches_from_settings(state).await?;
    batches.sort_by(|a, b| b.run_at.cmp(&a.run_at));
    Ok(batches)
}

pub async fn rollback_execution_batch(
    state: &SafeAppState,
    batch_id: &str,
) -> Result<AutoScoreExecutionBatch, String> {
    let conn = {
        let state_guard = state.read();
        let db_conn = state_guard.db.read().clone();
        db_conn
    }
    .ok_or_else(|| "Database not connected".to_string())?;

    let mut batches = load_batches_from_settings(state).await?;
    let Some(index) = batches.iter().position(|batch| batch.id == batch_id) else {
        return Err("Execution batch not found".to_string());
    };

    if batches[index].rolled_back {
        return Err("Execution batch already rolled back".to_string());
    }
    if batches[index].settled {
        return Err("Cannot rollback settled execution batch".to_string());
    }

    let mut batch = batches[index].clone();
    let txn = conn.begin().await.map_err(|e| e.to_string())?;

    for event_id in &batch.created_event_ids {
        let event = score_events::Entity::find_by_id(*event_id)
            .one(&txn)
            .await
            .map_err(|e| e.to_string())?;
        let Some(event) = event else {
            continue;
        };
        if event.settlement_id.is_some() {
            return Err("Cannot rollback batch containing settled events".to_string());
        }
        score_events::Entity::delete_by_id(*event_id)
            .exec(&txn)
            .await
            .map_err(|e| e.to_string())?;

        if let Some(student) = students::Entity::find()
            .filter(students::Column::Name.eq(event.student_name.clone()))
            .one(&txn)
            .await
            .map_err(|e| e.to_string())?
        {
            let current_score = student.score;
            let current_reward_points = student.reward_points;
            let mut student_active: students::ActiveModel = student.into();
            let next_score = current_score - event.delta;
            let next_reward = current_reward_points - event.delta;
            student_active.score = Set(next_score);
            student_active.reward_points = Set(next_reward);
            student_active.updated_at = Set(now_iso());
            student_active
                .update(&txn)
                .await
                .map_err(|e| e.to_string())?;
        }
    }

    for link_id in &batch.added_student_tag_ids {
        student_tags::Entity::delete_by_id(*link_id)
            .exec(&txn)
            .await
            .map_err(|e| e.to_string())?;
    }

    txn.commit().await.map_err(|e| e.to_string())?;

    batch.rolled_back = true;
    batch.rollback_at = Some(now_iso());
    batches[index] = batch.clone();
    save_batches_to_settings(state, &batches).await?;
    Ok(batch)
}

fn interval_base_time(rule: &AutoScoreRule) -> Option<DateTime<Utc>> {
    let last_executed = rule
        .last_executed
        .as_ref()
        .and_then(|raw| DateTime::parse_from_rfc3339(raw).ok())
        .map(|parsed| parsed.with_timezone(&Utc));
    let start_at = rule
        .execution
        .start_at
        .as_ref()
        .and_then(|raw| DateTime::parse_from_rfc3339(raw).ok())
        .map(|parsed| parsed.with_timezone(&Utc));

    match (last_executed, start_at) {
        (Some(last), Some(start)) => Some(if last > start { last } else { start }),
        (Some(last), None) => Some(last),
        (None, Some(start)) => Some(start),
        (None, None) => None,
    }
}

fn interval_value_for_backfill(rule: &AutoScoreRule) -> Option<IntervalTriggerValue> {
    let value = rule
        .triggers
        .iter()
        .find(|trigger| trigger.event == "interval_time_passed")
        .and_then(|trigger| trigger.value.as_deref());

    parse_interval_trigger_value(value)
}

fn calculate_rule_backfill_runs(rule: &AutoScoreRule, now: DateTime<Utc>) -> i64 {
    if !rule.enabled {
        return 0;
    }

    let Some(base_time) = interval_base_time(rule) else {
        return 0;
    };
    if base_time >= now {
        return 0;
    }

    let Some(interval) = interval_value_for_backfill(rule) else {
        return 0;
    };

    let Some(mut next) = add_interval_to_time(base_time, &interval) else {
        return 0;
    };

    let mut runs = 0_i64;
    while next <= now {
        runs += 1;
        if runs >= AUTO_SCORE_BACKFILL_MAX_RUNS_PER_RULE {
            break;
        }
        let Some(next_value) = add_interval_to_time(next, &interval) else {
            break;
        };
        next = next_value;
    }

    runs
}

pub async fn apply_offline_backfill(
    state: &SafeAppState,
    items: &[AutoScoreBackfillItem],
) -> Result<AutoScoreBackfillResult, String> {
    if items.is_empty() {
        return Ok(AutoScoreBackfillResult::default());
    }

    let mut requested_runs_by_rule: HashMap<i32, i64> = HashMap::new();
    for item in items {
        if item.runs <= 0 {
            continue;
        }
        let capped = item.runs.min(AUTO_SCORE_BACKFILL_MAX_RUNS_PER_RULE);
        if capped <= 0 {
            continue;
        }
        requested_runs_by_rule
            .entry(item.rule_id)
            .and_modify(|value| *value = (*value + capped).min(AUTO_SCORE_BACKFILL_MAX_RUNS_PER_RULE))
            .or_insert(capped);
    }
    if requested_runs_by_rule.is_empty() {
        return Ok(AutoScoreBackfillResult::default());
    }

    let conn = {
        let state_guard = state.read();
        let db_conn = state_guard.db.read().clone();
        db_conn
    }
    .ok_or_else(|| "Database not connected".to_string())?;

    let mut execution_batches = load_batches_from_settings(state).await?;
    let rules_snapshot = {
        let state_guard = state.read();
        let auto_score = state_guard.auto_score.read();
        auto_score.get_rules().to_vec()
    };
    let mut next_rules = rules_snapshot.clone();
    let mut result = AutoScoreBackfillResult::default();
    let now = Utc::now();
    let mut changed = false;

    for rule in next_rules.iter_mut().filter(|rule| rule.enabled) {
        let Some(requested_runs) = requested_runs_by_rule.get(&rule.id).copied() else {
            continue;
        };
        if requested_runs <= 0 {
            continue;
        }

        let available_runs = calculate_rule_backfill_runs(rule, now);
        let replay_runs = requested_runs.min(available_runs);
        if replay_runs <= 0 {
            continue;
        }

        result.applied_rules += 1;
        changed = true;

        for _ in 0..replay_runs {
            let stats = execute_rule(&conn, rule, &execution_batches, ExecutionMode::Backfill).await?;
            result.applied_runs += 1;
            result.affected_students += stats.affected_students;
            result.created_events += stats.created_events;
            result.score_delta_total += stats.score_delta_total;

            if stats.affected_students == 0 {
                continue;
            }

            let batch = AutoScoreExecutionBatch {
                id: Uuid::new_v4().to_string(),
                rule_id: rule.id,
                rule_name: rule.name.clone(),
                run_at: now_iso(),
                affected_students: stats.affected_students,
                affected_student_names: stats.affected_student_names.clone(),
                created_event_ids: stats.created_event_ids.clone(),
                added_student_tag_ids: stats.added_student_tag_ids.clone(),
                score_delta_total: stats.score_delta_total,
                settled: stats.settled,
                rolled_back: false,
                rollback_at: None,
            };
            execution_batches.push(batch);
        }

        rule.last_executed = Some(Utc::now().to_rfc3339());
    }

    if !changed {
        return Ok(result);
    }

    persist_rules_to_settings(state, &next_rules).await?;
    save_batches_to_settings(state, &execution_batches).await?;
    {
        let state_guard = state.read();
        let mut auto_score = state_guard.auto_score.write();
        auto_score.replace_rules(next_rules);
    }

    Ok(result)
}

async fn execute_rule(
    conn: &DatabaseConnection,
    rule: &AutoScoreRule,
    execution_batches: &[AutoScoreExecutionBatch],
    mode: ExecutionMode,
) -> Result<RuleExecutionStats, String> {
    let mut target_students = resolve_target_students(conn, rule).await?;

    if !rule.student_names.is_empty() {
        let whitelist: HashSet<String> = rule
            .student_names
            .iter()
            .map(|name| name.trim())
            .filter(|name| !name.is_empty())
            .map(str::to_string)
            .collect();
        target_students.retain(|student| whitelist.contains(&student.name));
    }

    if target_students.is_empty() {
        return Ok(RuleExecutionStats::default());
    }

    if mode == ExecutionMode::Normal {
        if let Some(max_runs) = rule.execution.max_runs_per_day {
            let today_runs = execution_batches
                .iter()
                .filter(|batch| batch.rule_id == rule.id && !batch.rolled_back && is_same_utc_day(&batch.run_at))
                .count() as i64;
            if today_runs >= max_runs {
                return Ok(RuleExecutionStats::default());
            }
        }
    }

    let planned_actions = plan_actions(&rule.actions)?;
    if planned_actions.is_empty() {
        return Err("No executable action".to_string());
    }
    let should_settle = planned_actions
        .iter()
        .any(|action| matches!(action, PlannedAction::SettleScore));

    let mut daily_score_delta_used: i64 = execution_batches
        .iter()
        .filter(|batch| batch.rule_id == rule.id && !batch.rolled_back && is_same_utc_day(&batch.run_at))
        .map(|batch| batch.score_delta_total.abs())
        .sum();

    let txn = conn.begin().await.map_err(|e| e.to_string())?;
    let mut stats = RuleExecutionStats::default();

    let mut all_action_tags = Vec::new();
    for action in &planned_actions {
        if let PlannedAction::AddTags(tags) = action {
            all_action_tags.extend(tags.iter().cloned());
        }
    }
    let all_action_tags = dedupe_trimmed_strings(all_action_tags);

    let mut tag_name_to_id = std::collections::HashMap::new();
    for tag_name in all_action_tags {
        let tag_id = ensure_tag_exists_in_txn(&txn, &tag_name).await?;
        tag_name_to_id.insert(tag_name, tag_id);
    }

    for mut student in target_students {
        if mode == ExecutionMode::Normal {
            if !is_student_pass_cooldown(
                conn,
                execution_batches,
                rule,
                student.id,
                student.name.as_str(),
            )
            .await?
            {
                continue;
            }
        }
        let mut touched = false;
        for action in &planned_actions {
            match action {
                PlannedAction::AddScore(delta) => {
                    if mode == ExecutionMode::Normal {
                        if let Some(max_delta) = rule.execution.max_score_delta_per_day {
                            let next = daily_score_delta_used + (*delta as i64).abs();
                            if next > max_delta {
                                continue;
                            }
                            daily_score_delta_used = next;
                        }
                    }
                    let now = now_iso();
                    let val_prev = student.score;
                    let val_curr = val_prev + delta;
                    let reward_points = student.reward_points + delta;

                    let event = score_events::ActiveModel {
                        id: sea_orm::ActiveValue::NotSet,
                        uuid: Set(Uuid::new_v4().to_string()),
                        student_name: Set(student.name.clone()),
                        reason_content: Set(build_auto_score_reason(rule.id, &rule.name, *delta)),
                        delta: Set(*delta),
                        val_prev: Set(val_prev),
                        val_curr: Set(val_curr),
                        event_time: Set(now.clone()),
                        settlement_id: Set(None),
                    };
                    let inserted_event = event.insert(&txn).await.map_err(|e| e.to_string())?;
                    stats.created_events += 1;
                    stats.created_event_ids.push(inserted_event.id);
                    stats.score_delta_total += *delta as i64;

                    let mut student_active: students::ActiveModel = student.clone().into();
                    student_active.score = Set(val_curr);
                    student_active.reward_points = Set(reward_points);
                    student_active.updated_at = Set(now);
                    student_active
                        .update(&txn)
                        .await
                        .map_err(|e| e.to_string())?;

                    student.score = val_curr;
                    student.reward_points = reward_points;
                    touched = true;
                }
                PlannedAction::AddTags(tag_names) => {
                    for tag_name in tag_names {
                        let Some(tag_id) = tag_name_to_id.get(tag_name).copied() else {
                            continue;
                        };
                        let inserted =
                            attach_tag_to_student_if_missing(&txn, student.id, tag_id).await?;
                        if let Some(link_id) = inserted {
                            stats.added_tags += 1;
                            stats.added_student_tag_ids.push(link_id);
                            touched = true;
                        }
                    }
                }
                PlannedAction::SettleScore => {}
            }
        }
        if touched {
            stats.affected_students += 1;
            stats.affected_student_names.push(student.name.clone());
        }
    }

    txn.commit().await.map_err(|e| e.to_string())?;
    if should_settle {
        execute_settlement(conn).await?;
        stats.settled = true;
    }
    Ok(stats)
}

fn plan_actions(actions: &[AutoScoreAction]) -> Result<Vec<PlannedAction>, String> {
    let mut planned = Vec::new();
    for action in actions {
        match action.event.as_str() {
            "add_score" => {
                let delta = action
                    .value
                    .as_deref()
                    .and_then(|value| value.trim().parse::<i32>().ok())
                    .filter(|value| *value != 0)
                    .ok_or_else(|| "Invalid add_score value".to_string())?;
                planned.push(PlannedAction::AddScore(delta));
            }
            "add_tag" => {
                let tags = parse_tag_values(action.value.as_deref());
                if tags.is_empty() {
                    return Err("Invalid add_tag value".to_string());
                }
                planned.push(PlannedAction::AddTags(tags));
            }
            "settle_score" => {
                planned.push(PlannedAction::SettleScore);
            }
            _ => {}
        }
    }
    Ok(planned)
}

async fn execute_settlement(conn: &DatabaseConnection) -> Result<(), String> {
    let backend = conn.get_database_backend();
    let count_stmt = Statement::from_string(
        backend,
        "SELECT COUNT(*) AS cnt FROM score_events WHERE settlement_id IS NULL",
    );
    let count_row = conn
        .query_one(count_stmt)
        .await
        .map_err(|e| e.to_string())?;
    let Some(count_row) = count_row else {
        return Ok(());
    };
    let unsettled_count = try_get_i64(&count_row, "cnt").unwrap_or(0);
    if unsettled_count <= 0 {
        return Ok(());
    }

    let last_end_sql = match backend {
        sea_orm::DatabaseBackend::Sqlite => {
            "SELECT end_time AS end_time FROM settlements ORDER BY julianday(end_time) DESC LIMIT 1"
        }
        sea_orm::DatabaseBackend::Postgres => {
            "SELECT end_time AS end_time FROM settlements ORDER BY end_time DESC LIMIT 1"
        }
        _ => "SELECT end_time AS end_time FROM settlements ORDER BY end_time DESC LIMIT 1",
    };
    let min_event_sql =
        "SELECT MIN(event_time) AS min_event_time FROM score_events WHERE settlement_id IS NULL";

    let last_end = conn
        .query_one(Statement::from_string(backend, last_end_sql))
        .await
        .map_err(|e| e.to_string())?
        .and_then(|row| try_get_string(&row, "end_time"));

    let min_event_time = conn
        .query_one(Statement::from_string(backend, min_event_sql))
        .await
        .map_err(|e| e.to_string())?
        .and_then(|row| try_get_string(&row, "min_event_time"));

    let end_time = now_iso();
    let start_time = last_end
        .or(min_event_time)
        .unwrap_or_else(|| end_time.clone());
    let created_at = end_time.clone();

    match backend {
        sea_orm::DatabaseBackend::Postgres => {
            let insert_stmt = Statement::from_string(
        backend,
        format!(
          "INSERT INTO settlements (start_time, end_time, created_at) VALUES ('{}', '{}', '{}') RETURNING id",
          start_time.replace('\'', "''"),
          end_time.replace('\'', "''"),
          created_at.replace('\'', "''")
        ),
      );
            let row = conn
                .query_one(insert_stmt)
                .await
                .map_err(|e| e.to_string())?
                .ok_or_else(|| "Failed to create settlement".to_string())?;
            let settlement_id = try_get_i32(&row, "id")
                .ok_or_else(|| "Failed to read settlement id".to_string())?;

            let update_events_stmt = Statement::from_string(
                backend,
                format!(
                    "UPDATE score_events SET settlement_id = {} WHERE settlement_id IS NULL",
                    settlement_id
                ),
            );
            conn.execute(update_events_stmt)
                .await
                .map_err(|e| e.to_string())?;

            let update_students_stmt = Statement::from_string(
                backend,
                format!(
                    "UPDATE students SET score = 0, updated_at = '{}' ",
                    end_time.replace('\'', "''")
                ),
            );
            conn.execute(update_students_stmt)
                .await
                .map_err(|e| e.to_string())?;
        }
        _ => {
            let insert_stmt = Statement::from_string(
                backend,
                format!(
          "INSERT INTO settlements (start_time, end_time, created_at) VALUES ('{}', '{}', '{}')",
          start_time.replace('\'', "''"),
          end_time.replace('\'', "''"),
          created_at.replace('\'', "''")
        ),
            );
            conn.execute(insert_stmt).await.map_err(|e| e.to_string())?;

            let id_stmt = Statement::from_string(backend, "SELECT last_insert_rowid() AS id");
            let row = conn
                .query_one(id_stmt)
                .await
                .map_err(|e| e.to_string())?
                .ok_or_else(|| "Failed to read settlement id".to_string())?;
            let settlement_id = try_get_i32(&row, "id")
                .ok_or_else(|| "Failed to read settlement id".to_string())?;

            let update_events_stmt = Statement::from_string(
                backend,
                format!(
                    "UPDATE score_events SET settlement_id = {} WHERE settlement_id IS NULL",
                    settlement_id
                ),
            );
            conn.execute(update_events_stmt)
                .await
                .map_err(|e| e.to_string())?;

            let update_students_stmt = Statement::from_string(
                backend,
                format!(
                    "UPDATE students SET score = 0, updated_at = '{}'",
                    end_time.replace('\'', "''")
                ),
            );
            conn.execute(update_students_stmt)
                .await
                .map_err(|e| e.to_string())?;
        }
    }

    Ok(())
}

#[derive(Debug, Default)]
struct TriggerEvalContext {
    student_tags_by_id: HashMap<i32, HashSet<String>>,
    sql_refs_by_query: HashMap<String, StudentRefs>,
}

fn collect_sql_queries_from_tree(
    node: &JsonValue,
    queries: &mut Vec<String>,
) -> Result<(), String> {
    let Some(node_type) = node.get("type").and_then(JsonValue::as_str) else {
        return Err("Trigger tree node type is required".to_string());
    };

    match node_type {
        "group" => {
            let children = node
                .get("children1")
                .and_then(JsonValue::as_array)
                .ok_or_else(|| "Trigger tree group children1 must be an array".to_string())?;
            for child in children {
                collect_sql_queries_from_tree(child, queries)?;
            }
            Ok(())
        }
        "rule" => {
            let trigger = trigger_from_rule_node(node)?;
            if matches!(
                trigger.event.as_str(),
                "query_sql" | "student_query_sql" | "student_sql"
            ) {
                if let Some(sql) = trigger
                    .value
                    .as_deref()
                    .map(str::trim)
                    .filter(|value| !value.is_empty())
                {
                    queries.push(sql.to_string());
                }
            }
            Ok(())
        }
        _ => Err(format!("Unsupported trigger tree node type: {}", node_type)),
    }
}

async fn load_student_tags_by_student_id(
    conn: &DatabaseConnection,
) -> Result<HashMap<i32, HashSet<String>>, String> {
    let tag_models = tags::Entity::find()
        .all(conn)
        .await
        .map_err(|e| e.to_string())?;
    if tag_models.is_empty() {
        return Ok(HashMap::new());
    }

    let tag_name_by_id: HashMap<i32, String> = tag_models
        .into_iter()
        .map(|tag| (tag.id, tag.name))
        .collect();
    let links = student_tags::Entity::find()
        .all(conn)
        .await
        .map_err(|e| e.to_string())?;

    let mut student_tags_by_id: HashMap<i32, HashSet<String>> = HashMap::new();
    for link in links {
        let Some(tag_name) = tag_name_by_id.get(&link.tag_id) else {
            continue;
        };
        student_tags_by_id
            .entry(link.student_id)
            .or_default()
            .insert(tag_name.clone());
    }

    Ok(student_tags_by_id)
}

fn evaluate_trigger_tree_for_student(
    node: &JsonValue,
    student: &students::Model,
    rule: &AutoScoreRule,
    ctx: &TriggerEvalContext,
) -> Result<bool, String> {
    let Some(node_type) = node.get("type").and_then(JsonValue::as_str) else {
        return Err("Trigger tree node type is required".to_string());
    };

    match node_type {
        "group" => {
            let conjunction = node
                .get("properties")
                .and_then(|value| value.get("conjunction"))
                .and_then(JsonValue::as_str)
                .unwrap_or("AND")
                .to_uppercase();
            let not = node
                .get("properties")
                .and_then(|value| value.get("not"))
                .and_then(JsonValue::as_bool)
                .unwrap_or(false);
            let children = node
                .get("children1")
                .and_then(JsonValue::as_array)
                .ok_or_else(|| "Trigger tree group children1 must be an array".to_string())?;
            if children.is_empty() {
                return Ok(false);
            }

            let base = if conjunction == "OR" {
                children.iter().try_fold(false, |matched, child| {
                    if matched {
                        return Ok(true);
                    }
                    evaluate_trigger_tree_for_student(child, student, rule, ctx)
                })?
            } else {
                children.iter().try_fold(true, |matched, child| {
                    if !matched {
                        return Ok(false);
                    }
                    evaluate_trigger_tree_for_student(child, student, rule, ctx)
                })?
            };

            Ok(if not { !base } else { base })
        }
        "rule" => {
            let trigger = trigger_from_rule_node(node)?;
            let matched = match trigger.event.as_str() {
                "interval_time_passed" => is_interval_due(rule, trigger.value.as_deref()),
                "student_has_tag" => {
                    let required_tags = parse_tag_values(trigger.value.as_deref());
                    let student_tags = ctx.student_tags_by_id.get(&student.id);
                    required_tags.iter().any(|tag| {
                        student_tags
                            .map(|values| values.contains(tag))
                            .unwrap_or(false)
                    })
                }
                "query_sql" | "student_query_sql" | "student_sql" => {
                    let sql = trigger
                        .value
                        .as_deref()
                        .map(str::trim)
                        .unwrap_or_default()
                        .to_string();
                    ctx.sql_refs_by_query
                        .get(&sql)
                        .map(|refs| {
                            refs.ids.contains(&student.id) || refs.names.contains(&student.name)
                        })
                        .unwrap_or(false)
                }
                "student_score_gt" => trigger
                    .value
                    .as_deref()
                    .and_then(|value| value.trim().parse::<i32>().ok())
                    .map(|threshold| student.score > threshold)
                    .unwrap_or(false),
                "student_score_lt" => trigger
                    .value
                    .as_deref()
                    .and_then(|value| value.trim().parse::<i32>().ok())
                    .map(|threshold| student.score < threshold)
                    .unwrap_or(false),
                _ => false,
            };
            Ok(matched)
        }
        _ => Err(format!("Unsupported trigger tree node type: {}", node_type)),
    }
}

async fn resolve_target_students(
    conn: &DatabaseConnection,
    rule: &AutoScoreRule,
) -> Result<Vec<students::Model>, String> {
    let all_students = students::Entity::find()
        .all(conn)
        .await
        .map_err(|e| e.to_string())?;
    if all_students.is_empty() {
        return Ok(vec![]);
    }

    let fallback_tree = build_trigger_tree_from_triggers(&rule.triggers);
    let trigger_tree = rule.trigger_tree.as_ref().unwrap_or(&fallback_tree);

    let mut sql_queries = Vec::new();
    collect_sql_queries_from_tree(trigger_tree, &mut sql_queries)?;
    let sql_queries = dedupe_trimmed_strings(sql_queries);

    let mut sql_refs_by_query = HashMap::new();
    for sql in sql_queries {
        let refs = query_student_refs_by_sql(conn, &sql).await?;
        sql_refs_by_query.insert(sql, refs);
    }

    let ctx = TriggerEvalContext {
        student_tags_by_id: load_student_tags_by_student_id(conn).await?,
        sql_refs_by_query,
    };

    let mut matched = Vec::new();
    for student in all_students {
        if evaluate_trigger_tree_for_student(trigger_tree, &student, rule, &ctx)? {
            matched.push(student);
        }
    }

    Ok(matched)
}

async fn is_student_pass_cooldown(
    conn: &DatabaseConnection,
    execution_batches: &[AutoScoreExecutionBatch],
    rule: &AutoScoreRule,
    student_id: i32,
    student_name: &str,
) -> Result<bool, String> {
    let Some(cooldown_minutes) = rule.execution.cooldown_minutes else {
        return Ok(true);
    };
    if cooldown_minutes <= 0 {
        return Ok(true);
    }

    let _ = student_id;
    let cutoff = Utc::now() - chrono::Duration::minutes(cooldown_minutes);
    for batch in execution_batches
        .iter()
        .filter(|batch| batch.rule_id == rule.id && !batch.rolled_back)
    {
        let run_at = DateTime::parse_from_rfc3339(batch.run_at.as_str())
            .map(|value| value.with_timezone(&Utc))
            .unwrap_or_else(|_| Utc::now() - chrono::Duration::days(3650));
        if run_at >= cutoff
            && batch
                .affected_student_names
                .iter()
                .any(|name| name == student_name)
        {
            return Ok(false);
        }
    }

    let prefix = format!("{}#{}:", AUTO_SCORE_REASON_PREFIX, rule.id);
    let since = cutoff.format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string();

    let exists = score_events::Entity::find()
        .filter(score_events::Column::StudentName.eq(student_name.to_string()))
        .filter(score_events::Column::ReasonContent.like(format!("{}%", prefix)))
        .filter(score_events::Column::EventTime.gte(since))
        .one(conn)
        .await
        .map_err(|e| e.to_string())?;
    Ok(exists.is_none())
}

fn is_same_utc_day(timestamp: &str) -> bool {
    DateTime::parse_from_rfc3339(timestamp)
        .map(|value| value.with_timezone(&Utc).date_naive() == Utc::now().date_naive())
        .unwrap_or(false)
}

async fn query_student_refs_by_sql(
    conn: &DatabaseConnection,
    sql_or_expression: &str,
) -> Result<StudentRefs, String> {
    let wrapped_sql = build_readonly_student_query(sql_or_expression)?;
    let rows = conn
        .query_all(Statement::from_string(
            conn.get_database_backend(),
            wrapped_sql,
        ))
        .await
        .map_err(|e| e.to_string())?;

    let mut refs = StudentRefs::default();
    for row in &rows {
        if let Some(id) = try_get_i32(row, "id").or_else(|| try_get_i32(row, "student_id")) {
            refs.ids.insert(id);
        }
        if let Some(name) =
            try_get_string(row, "name").or_else(|| try_get_string(row, "student_name"))
        {
            refs.names.insert(name);
        }
    }

    Ok(refs)
}

fn try_get_i32(row: &sea_orm::QueryResult, column: &str) -> Option<i32> {
    row.try_get::<i32>("", column)
        .ok()
        .or_else(|| {
            row.try_get::<i64>("", column)
                .ok()
                .and_then(|value| i32::try_from(value).ok())
        })
        .or_else(|| {
            row.try_get::<String>("", column)
                .ok()
                .and_then(|value| value.trim().parse::<i32>().ok())
        })
}

fn try_get_i64(row: &sea_orm::QueryResult, column: &str) -> Option<i64> {
    row.try_get::<i64>("", column)
        .ok()
        .or_else(|| {
            row.try_get::<i32>("", column)
                .ok()
                .map(|value| value as i64)
        })
        .or_else(|| {
            row.try_get::<String>("", column)
                .ok()
                .and_then(|value| value.trim().parse::<i64>().ok())
        })
}

fn try_get_string(row: &sea_orm::QueryResult, column: &str) -> Option<String> {
    row.try_get::<String>("", column).ok().and_then(|value| {
        let trimmed = value.trim().to_string();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed)
        }
    })
}

async fn ensure_tag_exists_in_txn(
    txn: &sea_orm::DatabaseTransaction,
    tag_name: &str,
) -> Result<i32, String> {
    if let Some(existing) = tags::Entity::find()
        .filter(tags::Column::Name.eq(tag_name))
        .one(txn)
        .await
        .map_err(|e| e.to_string())?
    {
        return Ok(existing.id);
    }

    let now = now_iso();
    let inserted = tags::ActiveModel {
        id: sea_orm::ActiveValue::NotSet,
        name: Set(tag_name.to_string()),
        created_at: Set(now.clone()),
        updated_at: Set(now),
    }
    .insert(txn)
    .await
    .map_err(|e| e.to_string())?;

    Ok(inserted.id)
}

async fn attach_tag_to_student_if_missing(
    txn: &sea_orm::DatabaseTransaction,
    student_id: i32,
    tag_id: i32,
) -> Result<Option<i32>, String> {
    let existing = student_tags::Entity::find()
        .filter(student_tags::Column::StudentId.eq(student_id))
        .filter(student_tags::Column::TagId.eq(tag_id))
        .one(txn)
        .await
        .map_err(|e| e.to_string())?;

    if existing.is_some() {
        return Ok(None);
    }

    let now = now_iso();
    let inserted = student_tags::ActiveModel {
        id: sea_orm::ActiveValue::NotSet,
        student_id: Set(student_id),
        tag_id: Set(tag_id),
        created_at: Set(now),
    }
    .insert(txn)
    .await
    .map_err(|e| e.to_string())?;

    Ok(Some(inserted.id))
}

fn now_iso() -> String {
    Utc::now().format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string()
}

fn build_auto_score_reason(rule_id: i32, rule_name: &str, delta: i32) -> String {
    if delta > 0 {
        format!(
            "{}#{}: {} (+{})",
            AUTO_SCORE_REASON_PREFIX, rule_id, rule_name, delta
        )
    } else {
        format!(
            "{}#{}: {} ({})",
            AUTO_SCORE_REASON_PREFIX, rule_id, rule_name, delta
        )
    }
}
