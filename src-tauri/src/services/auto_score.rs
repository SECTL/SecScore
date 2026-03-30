use chrono::{DateTime, Months, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value as JsonValue;
use std::collections::HashSet;
use tauri::{AppHandle, Emitter};

const DEFAULT_INTERVAL_MINUTES: i64 = 30;

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
        _app_handle: &AppHandle,
    ) -> Result<(), Box<dyn std::error::Error>> {
        if self.initialized {
            return Ok(());
        }
        self.initialized = true;
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

            let base_time = rule
                .last_executed
                .as_ref()
                .and_then(|value| DateTime::parse_from_rfc3339(value).ok())
                .map(|value| value.with_timezone(&Utc))
                .unwrap_or(now);

            let next_execute_time = add_interval_to_time(base_time, &interval)?;
            let delay_ms = (next_execute_time - now).num_milliseconds();
            return Some(delay_ms.max(0));
        }

        None
    }

    pub async fn notify_rules_changed(&self, app_handle: &AppHandle) {
        let _ = app_handle.emit("auto-score:rulesChanged", &self.rules);
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
        _ => Err(format!("Unsupported trigger event: {}", event)),
    }
}

fn normalize_action(action: AutoScoreAction) -> Result<AutoScoreAction, String> {
    let event = normalize_required_string(action.event, "action event")?;

    match event.as_str() {
        "add_score" => {
            let value = normalize_non_zero_numeric_string(action.value.as_deref())
                .ok_or_else(|| "Add score action requires a non-zero numeric value".to_string())?;

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

fn normalize_non_zero_numeric_string(value: Option<&str>) -> Option<String> {
    let normalized = value?.trim();
    if normalized.is_empty() {
        return None;
    }

    let parsed = normalized.parse::<f64>().ok()?;
    if !parsed.is_finite() || parsed == 0.0 {
        return None;
    }

    Some(normalized.to_string())
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
