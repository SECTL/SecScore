use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tauri::{AppHandle, Emitter};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AutoScoreTrigger {
    pub event: String,
    pub value: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AutoScoreAction {
    pub event: String,
    pub value: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
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

    pub fn load_rules(&mut self, rules_json: serde_json::Value) {
        if let serde_json::Value::Array(arr) = rules_json {
            self.rules = arr
                .into_iter()
                .filter_map(|v| serde_json::from_value(v).ok())
                .collect();
        } else {
            self.rules = Vec::new();
        }
    }

    pub fn get_rules_json(&self) -> serde_json::Value {
        serde_json::to_value(&self.rules).unwrap_or(serde_json::Value::Array(vec![]))
    }

    pub fn get_rules(&self) -> &[AutoScoreRule] {
        &self.rules
    }

    pub fn get_rules_mut(&mut self) -> &mut Vec<AutoScoreRule> {
        &mut self.rules
    }

    pub fn add_rule(&mut self, mut rule: AutoScoreRule) -> i32 {
        let new_id = self.rules.iter().map(|r| r.id).max().unwrap_or(0) + 1;
        rule.id = new_id;
        rule.last_executed = None;
        self.rules.push(rule);
        new_id
    }

    pub fn update_rule(&mut self, rule: AutoScoreRule) -> bool {
        if let Some(existing) = self.rules.iter_mut().find(|r| r.id == rule.id) {
            *existing = rule;
            true
        } else {
            false
        }
    }

    pub fn delete_rule(&mut self, rule_id: i32) -> bool {
        let before_len = self.rules.len();
        self.rules.retain(|r| r.id != rule_id);
        self.rules.len() < before_len
    }

    pub fn toggle_rule(&mut self, rule_id: i32, enabled: bool) -> bool {
        if let Some(rule) = self.rules.iter_mut().find(|r| r.id == rule_id) {
            rule.enabled = enabled;
            true
        } else {
            false
        }
    }

    pub fn sort_rules(&mut self, rule_ids: &[i32]) -> bool {
        let rule_map: HashMap<i32, AutoScoreRule> =
            self.rules.drain(..).map(|r| (r.id, r)).collect();

        let mut sorted_rules: Vec<AutoScoreRule> = Vec::new();
        for id in rule_ids {
            if let Some(rule) = rule_map.get(id) {
                sorted_rules.push(rule.clone());
            }
        }

        for (_, rule) in rule_map {
            if !rule_ids.contains(&rule.id) {
                sorted_rules.push(rule);
            }
        }

        self.rules = sorted_rules;
        true
    }

    pub fn is_enabled(&self) -> bool {
        self.rules.iter().any(|r| r.enabled)
    }

    pub fn get_rule_by_id(&self, id: i32) -> Option<&AutoScoreRule> {
        self.rules.iter().find(|r| r.id == id)
    }

    pub fn get_rule_by_id_mut(&mut self, id: i32) -> Option<&mut AutoScoreRule> {
        self.rules.iter_mut().find(|r| r.id == id)
    }

    pub fn mark_rule_executed(&mut self, rule_id: i32) {
        if let Some(rule) = self.rules.iter_mut().find(|r| r.id == rule_id) {
            rule.last_executed = Some(Utc::now().to_rfc3339());
        }
    }

    pub fn check_interval_trigger(&self, rule: &AutoScoreRule) -> Option<i64> {
        let now = Utc::now();

        for trigger in &rule.triggers {
            if trigger.event == "interval_time_passed" {
                let minutes = trigger
                    .value
                    .as_ref()
                    .and_then(|v| v.parse::<i64>().ok())
                    .unwrap_or(30);
                let interval_ms = minutes * 60 * 1000;

                if let Some(last_executed_str) = &rule.last_executed {
                    if let Ok(last_executed) = DateTime::parse_from_rfc3339(last_executed_str) {
                        let last_executed_utc: DateTime<Utc> = last_executed.with_timezone(&Utc);
                        let next_execute_time =
                            last_executed_utc + chrono::Duration::milliseconds(interval_ms);
                        let delay_ms = (next_execute_time - now).num_milliseconds();
                        return Some(delay_ms.max(0));
                    }
                }
                return Some(interval_ms);
            }
        }
        None
    }

    pub async fn notify_rules_changed(&self, app_handle: &AppHandle) {
        let _ = app_handle.emit("auto-score:rulesChanged", &self.rules);
    }
}
