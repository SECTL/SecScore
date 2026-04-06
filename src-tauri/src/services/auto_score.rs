use chrono::{DateTime, Months, Utc};
use sea_orm::{
    ActiveModelTrait, ColumnTrait, Condition, ConnectionTrait, DatabaseConnection, EntityTrait,
    QueryFilter, Set, Statement, TransactionTrait,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value as JsonValue};
use std::collections::HashSet;
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

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
enum IntervalUnit {
    Minute,
    Day,
    Month,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
struct IntervalTriggerValue {
    amount: i64,
    unit: IntervalUnit,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct AutoScoreRule {
    pub id: i32,
    pub name: String,
    pub enabled: bool,
    #[serde(rename = "studentNames")]
    pub student_names: Vec<String>,
    pub triggers: Vec<AutoScoreTrigger>,
    pub actions: Vec<AutoScoreAction>,
    #[serde(rename = "lastExecuted")]
    pub last_executed: Option<String>,
}

#[derive(Debug, Clone)]
enum PlannedAction {
    AddScore(i32),
    AddTags(Vec<String>),
}

#[derive(Debug, Default, Clone)]
struct StudentRefs {
    ids: HashSet<i32>,
    names: HashSet<String>,
}

#[derive(Debug, Default, Clone, Copy)]
struct RuleExecutionStats {
    affected_students: usize,
    created_events: usize,
    added_tags: usize,
}

impl StudentRefs {
    fn is_empty(&self) -> bool {
        self.ids.is_empty() && self.names.is_empty()
    }

    fn intersect(mut self, other: StudentRefs) -> StudentRefs {
        self.ids.retain(|id| other.ids.contains(id));
        self.names.retain(|name| other.names.contains(name));
        self
    }
}

impl Default for AutoScoreRule {
    fn default() -> Self {
        Self {
            id: 0,
            name: String::new(),
            enabled: true,
            student_names: Vec::new(),
            triggers: Vec::new(),
            actions: Vec::new(),
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

            match execute_rule(&conn, rule).await {
                Ok(stats) => {
                    if stats.affected_students == 0 {
                        Self::log_rule_skipped(&state, rule, "no matched students");
                        continue;
                    }
                    rule.last_executed = Some(Utc::now().to_rfc3339());
                    changed = true;
                    Self::log_rule_executed(&state, rule, stats);
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

    fn log_rule_executed(state: &SafeAppState, rule: &AutoScoreRule, stats: RuleExecutionStats) {
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

    if rule.triggers.is_empty() {
        return Err("At least one trigger is required".to_string());
    }
    if rule.actions.is_empty() {
        return Err("At least one action is required".to_string());
    }

    rule.triggers = rule
        .triggers
        .into_iter()
        .map(normalize_trigger)
        .collect::<Result<Vec<_>, _>>()?;
    rule.actions = rule
        .actions
        .into_iter()
        .map(normalize_action)
        .collect::<Result<Vec<_>, _>>()?;
    rule.last_executed = normalize_last_executed(rule.last_executed);

    Ok(rule)
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

fn normalize_last_executed(value: Option<String>) -> Option<String> {
    value
        .as_deref()
        .and_then(|raw_value| DateTime::parse_from_rfc3339(raw_value).ok())
        .map(|parsed| parsed.with_timezone(&Utc).to_rfc3339())
}

fn parse_interval_trigger_value(value: Option<&str>) -> Option<IntervalTriggerValue> {
    let raw_value = value.map(str::trim)?;
    if raw_value.is_empty() {
        return None;
    }

    if let Ok(minutes) = raw_value.parse::<i64>() {
        if minutes > 0 {
            return Some(IntervalTriggerValue {
                amount: minutes,
                unit: IntervalUnit::Minute,
            });
        }
    }

    let parsed_value = serde_json::from_str::<IntervalTriggerValue>(raw_value).ok()?;
    if parsed_value.amount <= 0 {
        return None;
    }

    Some(parsed_value)
}

fn stringify_interval_trigger_value(value: &IntervalTriggerValue) -> Option<String> {
    if value.amount <= 0 {
        return None;
    }

    match value.unit {
        IntervalUnit::Minute => Some(value.amount.to_string()),
        IntervalUnit::Day | IntervalUnit::Month => serde_json::to_string(value).ok(),
    }
}

fn add_interval_to_time(
    base_time: DateTime<Utc>,
    interval: &IntervalTriggerValue,
) -> Option<DateTime<Utc>> {
    match interval.unit {
        IntervalUnit::Minute => {
            base_time.checked_add_signed(chrono::Duration::minutes(interval.amount))
        }
        IntervalUnit::Day => base_time.checked_add_signed(chrono::Duration::days(interval.amount)),
        IntervalUnit::Month => {
            let months = u32::try_from(interval.amount).ok()?;
            base_time.checked_add_months(Months::new(months))
        }
    }
}

fn check_interval_trigger(rule: &AutoScoreRule) -> Option<i64> {
    let now = Utc::now();

    for trigger in &rule.triggers {
        if trigger.event != "interval_time_passed" {
            continue;
        }

        let interval = parse_interval_trigger_value(trigger.value.as_deref()).unwrap_or(
            IntervalTriggerValue {
                amount: DEFAULT_INTERVAL_MINUTES,
                unit: IntervalUnit::Minute,
            },
        );

        let Some(base_time) = rule
            .last_executed
            .as_ref()
            .and_then(|value| DateTime::parse_from_rfc3339(value).ok())
            .map(|value| value.with_timezone(&Utc))
        else {
            return Some(0);
        };

        let next_execute_time = add_interval_to_time(base_time, &interval)?;
        let delay_ms = (next_execute_time - now).num_milliseconds();
        return Some(delay_ms.max(0));
    }

    None
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

async fn execute_rule(
    conn: &DatabaseConnection,
    rule: &AutoScoreRule,
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

    let planned_actions = plan_actions(&rule.actions)?;
    if planned_actions.is_empty() {
        return Err("No executable action".to_string());
    }

    let txn = conn.begin().await.map_err(|e| e.to_string())?;
    let mut stats = RuleExecutionStats {
        affected_students: target_students.len(),
        ..RuleExecutionStats::default()
    };

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
        for action in &planned_actions {
            match action {
                PlannedAction::AddScore(delta) => {
                    let now = now_iso();
                    let val_prev = student.score;
                    let val_curr = val_prev + delta;
                    let reward_points = student.reward_points + delta;

                    let event = score_events::ActiveModel {
                        id: sea_orm::ActiveValue::NotSet,
                        uuid: Set(Uuid::new_v4().to_string()),
                        student_name: Set(student.name.clone()),
                        reason_content: Set(build_auto_score_reason(&rule.name, *delta)),
                        delta: Set(*delta),
                        val_prev: Set(val_prev),
                        val_curr: Set(val_curr),
                        event_time: Set(now.clone()),
                        settlement_id: Set(None),
                    };
                    event.insert(&txn).await.map_err(|e| e.to_string())?;
                    stats.created_events += 1;

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
                }
                PlannedAction::AddTags(tag_names) => {
                    for tag_name in tag_names {
                        let Some(tag_id) = tag_name_to_id.get(tag_name).copied() else {
                            continue;
                        };
                        let inserted =
                            attach_tag_to_student_if_missing(&txn, student.id, tag_id).await?;
                        if inserted {
                            stats.added_tags += 1;
                        }
                    }
                }
            }
        }
    }

    txn.commit().await.map_err(|e| e.to_string())?;
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
            _ => {}
        }
    }
    Ok(planned)
}

async fn resolve_target_students(
    conn: &DatabaseConnection,
    rule: &AutoScoreRule,
) -> Result<Vec<students::Model>, String> {
    let explicit_sql_values: Vec<String> = rule
        .triggers
        .iter()
        .filter(|trigger| {
            matches!(
                trigger.event.as_str(),
                "query_sql" | "student_query_sql" | "student_sql"
            )
        })
        .filter_map(|trigger| trigger.value.as_deref())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
        .collect();

    if !explicit_sql_values.is_empty() {
        let mut refs: Option<StudentRefs> = None;
        for sql_value in explicit_sql_values {
            let next_refs = query_student_refs_by_sql(conn, &sql_value).await?;
            refs = Some(match refs {
                None => next_refs,
                Some(existing) => existing.intersect(next_refs),
            });
        }

        let refs = refs.unwrap_or_default();
        if refs.is_empty() {
            return Ok(vec![]);
        }
        return load_students_from_refs(conn, refs).await;
    }

    let tag_filters: Vec<String> = rule
        .triggers
        .iter()
        .filter(|trigger| trigger.event == "student_has_tag")
        .flat_map(|trigger| parse_tag_values(trigger.value.as_deref()))
        .collect();

    let tag_filters = dedupe_trimmed_strings(tag_filters);
    if tag_filters.is_empty() {
        return students::Entity::find()
            .all(conn)
            .await
            .map_err(|e| e.to_string());
    }

    let tag_models = tags::Entity::find()
        .filter(tags::Column::Name.is_in(tag_filters))
        .all(conn)
        .await
        .map_err(|e| e.to_string())?;
    if tag_models.is_empty() {
        return Ok(vec![]);
    }

    let tag_ids: Vec<i32> = tag_models.iter().map(|tag| tag.id).collect();
    let links = student_tags::Entity::find()
        .filter(student_tags::Column::TagId.is_in(tag_ids))
        .all(conn)
        .await
        .map_err(|e| e.to_string())?;
    if links.is_empty() {
        return Ok(vec![]);
    }

    let student_ids: HashSet<i32> = links.iter().map(|link| link.student_id).collect();
    students::Entity::find()
        .filter(students::Column::Id.is_in(student_ids))
        .all(conn)
        .await
        .map_err(|e| e.to_string())
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

async fn load_students_from_refs(
    conn: &DatabaseConnection,
    refs: StudentRefs,
) -> Result<Vec<students::Model>, String> {
    if refs.is_empty() {
        return Ok(vec![]);
    }

    let mut condition = Condition::any();
    if !refs.ids.is_empty() {
        condition = condition.add(students::Column::Id.is_in(refs.ids));
    }
    if !refs.names.is_empty() {
        condition = condition.add(students::Column::Name.is_in(refs.names));
    }

    students::Entity::find()
        .filter(condition)
        .all(conn)
        .await
        .map_err(|e| e.to_string())
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
) -> Result<bool, String> {
    let existing = student_tags::Entity::find()
        .filter(student_tags::Column::StudentId.eq(student_id))
        .filter(student_tags::Column::TagId.eq(tag_id))
        .one(txn)
        .await
        .map_err(|e| e.to_string())?;

    if existing.is_some() {
        return Ok(false);
    }

    let now = now_iso();
    student_tags::ActiveModel {
        id: sea_orm::ActiveValue::NotSet,
        student_id: Set(student_id),
        tag_id: Set(tag_id),
        created_at: Set(now),
    }
    .insert(txn)
    .await
    .map_err(|e| e.to_string())?;

    Ok(true)
}

fn now_iso() -> String {
    Utc::now().format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string()
}

fn build_auto_score_reason(rule_name: &str, delta: i32) -> String {
    if delta > 0 {
        format!("{}: {} (+{})", AUTO_SCORE_REASON_PREFIX, rule_name, delta)
    } else {
        format!("{}: {} ({})", AUTO_SCORE_REASON_PREFIX, rule_name, delta)
    }
}
