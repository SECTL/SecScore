use serde::{Deserialize, Serialize};
use serde_json::Value as JsonValue;
use sea_orm::{ConnectionTrait, DatabaseConnection, Statement};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SettingsSpec {
    pub is_wizard_completed: bool,
    pub log_level: String,
    pub window_zoom: f64,
    pub search_keyboard_layout: String,
    pub themes_custom: JsonValue,
    pub auto_score_enabled: bool,
    pub auto_score_rules: JsonValue,
    pub current_theme_id: String,
    pub pg_connection_string: String,
    pub pg_connection_status: JsonValue,
}

impl Default for SettingsSpec {
    fn default() -> Self {
        Self {
            is_wizard_completed: false,
            log_level: "info".to_string(),
            window_zoom: 1.0,
            search_keyboard_layout: "qwerty26".to_string(),
            themes_custom: JsonValue::Array(vec![]),
            auto_score_enabled: false,
            auto_score_rules: JsonValue::Array(vec![]),
            current_theme_id: "light-default".to_string(),
            pg_connection_string: String::new(),
            pg_connection_status: serde_json::json!({"connected": false, "type": "sqlite"}),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum SettingsKey {
    IsWizardCompleted,
    LogLevel,
    WindowZoom,
    SearchKeyboardLayout,
    ThemesCustom,
    AutoScoreEnabled,
    AutoScoreRules,
    CurrentThemeId,
    PgConnectionString,
    PgConnectionStatus,
}

impl SettingsKey {
    pub fn as_str(&self) -> &'static str {
        match self {
            SettingsKey::IsWizardCompleted => "is_wizard_completed",
            SettingsKey::LogLevel => "log_level",
            SettingsKey::WindowZoom => "window_zoom",
            SettingsKey::SearchKeyboardLayout => "search_keyboard_layout",
            SettingsKey::ThemesCustom => "themes_custom",
            SettingsKey::AutoScoreEnabled => "auto_score_enabled",
            SettingsKey::AutoScoreRules => "auto_score_rules",
            SettingsKey::CurrentThemeId => "current_theme_id",
            SettingsKey::PgConnectionString => "pg_connection_string",
            SettingsKey::PgConnectionStatus => "pg_connection_status",
        }
    }

    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "is_wizard_completed" => Some(SettingsKey::IsWizardCompleted),
            "log_level" => Some(SettingsKey::LogLevel),
            "window_zoom" => Some(SettingsKey::WindowZoom),
            "search_keyboard_layout" => Some(SettingsKey::SearchKeyboardLayout),
            "themes_custom" => Some(SettingsKey::ThemesCustom),
            "auto_score_enabled" => Some(SettingsKey::AutoScoreEnabled),
            "auto_score_rules" => Some(SettingsKey::AutoScoreRules),
            "current_theme_id" => Some(SettingsKey::CurrentThemeId),
            "pg_connection_string" => Some(SettingsKey::PgConnectionString),
            "pg_connection_status" => Some(SettingsKey::PgConnectionStatus),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum SettingValueKind {
    Boolean,
    String,
    Number,
    Json,
}

pub struct SettingDefinition {
    pub kind: SettingValueKind,
    pub default_value: SettingsValue,
    pub write_permission: PermissionRequirement,
    pub validate: Option<fn(&SettingsValue) -> bool>,
}

#[derive(Debug, Clone)]
pub enum SettingsValue {
    Boolean(bool),
    String(String),
    Number(f64),
    Json(JsonValue),
}

impl SettingsValue {
    pub fn to_raw(&self) -> String {
        match self {
            SettingsValue::Boolean(b) => if *b { "1" } else { "0" }.to_string(),
            SettingsValue::String(s) => s.clone(),
            SettingsValue::Number(n) => n.to_string(),
            SettingsValue::Json(j) => j.to_string(),
        }
    }

    pub fn from_raw(kind: SettingValueKind, raw: &str) -> Self {
        match kind {
            SettingValueKind::Boolean => {
                SettingsValue::Boolean(raw == "1" || raw.to_lowercase() == "true")
            }
            SettingValueKind::String => SettingsValue::String(raw.to_string()),
            SettingValueKind::Number => SettingsValue::Number(raw.parse().unwrap_or(0.0)),
            SettingValueKind::Json => {
                SettingsValue::Json(serde_json::from_str(raw).unwrap_or(JsonValue::Null))
            }
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum PermissionRequirement {
    Any,
    Admin,
    Points,
    View,
}

pub struct SettingsService {
    cache: HashMap<String, String>,
    initialized: bool,
    db_loaded: bool,
    db_conn: Option<DatabaseConnection>,
}

impl Default for SettingsService {
    fn default() -> Self {
        Self::new()
    }
}

impl SettingsService {
    pub fn new() -> Self {
        Self {
            cache: HashMap::new(),
            initialized: false,
            db_loaded: false,
            db_conn: None,
        }
    }

    pub fn attach_db(&mut self, conn: Option<DatabaseConnection>) {
        if conn.is_some() {
            self.db_conn = conn;
        }
    }

    pub async fn initialize(&mut self) -> Result<(), String> {
        if self.initialized && (self.db_loaded || self.db_conn.is_none()) {
            return Ok(());
        }

        if let Some(conn) = self.db_conn.clone() {
            if !self.db_loaded {
                self.load_cache_from_db(&conn).await?;
                self.ensure_defaults_in_db(&conn).await?;
                self.db_loaded = true;
            }
        } else {
            self.ensure_defaults();
        }
        self.initialized = true;
        Ok(())
    }

    fn escape_sql(value: &str) -> String {
        value.replace('\'', "''")
    }

    async fn load_cache_from_db(&mut self, conn: &DatabaseConnection) -> Result<(), String> {
        let sql = "SELECT key, value FROM settings".to_string();
        let rows = conn
            .query_all(Statement::from_string(conn.get_database_backend(), sql))
            .await
            .map_err(|e| e.to_string())?;

        self.cache.clear();
        for row in rows {
            let key: String = row.try_get("", "key").map_err(|e| e.to_string())?;
            let value: String = row.try_get("", "value").map_err(|e| e.to_string())?;
            self.cache.insert(key, value);
        }

        Ok(())
    }

    async fn upsert_raw_db(
        &self,
        conn: &DatabaseConnection,
        key: &str,
        value: &str,
    ) -> Result<(), String> {
        let key_escaped = Self::escape_sql(key);
        let value_escaped = Self::escape_sql(value);
        let sql = format!(
            "INSERT INTO settings (key, value) VALUES ('{}', '{}') ON CONFLICT(key) DO UPDATE SET value = EXCLUDED.value",
            key_escaped, value_escaped
        );

        conn.execute(Statement::from_string(conn.get_database_backend(), sql))
            .await
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    async fn ensure_defaults_in_db(&mut self, conn: &DatabaseConnection) -> Result<(), String> {
        let definitions = Self::get_definitions();
        for (key, def) in definitions.iter() {
            let key_str = key.as_str();
            if !self.cache.contains_key(key_str) {
                let raw = def.default_value.to_raw();
                self.upsert_raw_db(conn, key_str, &raw).await?;
                self.cache.insert(key_str.to_string(), raw);
            }
        }
        Ok(())
    }

    pub fn get_definitions() -> HashMap<SettingsKey, SettingDefinition> {
        let mut defs = HashMap::new();

        defs.insert(
            SettingsKey::IsWizardCompleted,
            SettingDefinition {
                kind: SettingValueKind::Boolean,
                default_value: SettingsValue::Boolean(false),
                write_permission: PermissionRequirement::Any,
                validate: None,
            },
        );

        defs.insert(
            SettingsKey::LogLevel,
            SettingDefinition {
                kind: SettingValueKind::String,
                default_value: SettingsValue::String("info".to_string()),
                write_permission: PermissionRequirement::Admin,
                validate: Some(|v| {
                    if let SettingsValue::String(s) = v {
                        matches!(s.as_str(), "debug" | "info" | "warn" | "error")
                    } else {
                        false
                    }
                }),
            },
        );

        defs.insert(
            SettingsKey::WindowZoom,
            SettingDefinition {
                kind: SettingValueKind::Number,
                default_value: SettingsValue::Number(1.0),
                write_permission: PermissionRequirement::Admin,
                validate: None,
            },
        );

        defs.insert(
            SettingsKey::SearchKeyboardLayout,
            SettingDefinition {
                kind: SettingValueKind::String,
                default_value: SettingsValue::String("qwerty26".to_string()),
                write_permission: PermissionRequirement::Admin,
                validate: Some(|v| {
                    if let SettingsValue::String(s) = v {
                        matches!(s.as_str(), "t9" | "qwerty26")
                    } else {
                        false
                    }
                }),
            },
        );

        defs.insert(
            SettingsKey::ThemesCustom,
            SettingDefinition {
                kind: SettingValueKind::Json,
                default_value: SettingsValue::Json(JsonValue::Array(vec![])),
                write_permission: PermissionRequirement::Admin,
                validate: None,
            },
        );

        defs.insert(
            SettingsKey::AutoScoreEnabled,
            SettingDefinition {
                kind: SettingValueKind::Boolean,
                default_value: SettingsValue::Boolean(false),
                write_permission: PermissionRequirement::Admin,
                validate: None,
            },
        );

        defs.insert(
            SettingsKey::AutoScoreRules,
            SettingDefinition {
                kind: SettingValueKind::Json,
                default_value: SettingsValue::Json(JsonValue::Array(vec![])),
                write_permission: PermissionRequirement::Admin,
                validate: None,
            },
        );

        defs.insert(
            SettingsKey::CurrentThemeId,
            SettingDefinition {
                kind: SettingValueKind::String,
                default_value: SettingsValue::String("light-default".to_string()),
                write_permission: PermissionRequirement::Admin,
                validate: None,
            },
        );

        defs.insert(
            SettingsKey::PgConnectionString,
            SettingDefinition {
                kind: SettingValueKind::String,
                default_value: SettingsValue::String(String::new()),
                write_permission: PermissionRequirement::Admin,
                validate: None,
            },
        );

        defs.insert(
            SettingsKey::PgConnectionStatus,
            SettingDefinition {
                kind: SettingValueKind::Json,
                default_value: SettingsValue::Json(
                    serde_json::json!({"connected": false, "type": "sqlite"}),
                ),
                write_permission: PermissionRequirement::Admin,
                validate: None,
            },
        );

        defs
    }

    fn ensure_defaults(&mut self) {
        let definitions = Self::get_definitions();
        for (key, def) in definitions.iter() {
            let key_str = key.as_str();
            if !self.cache.contains_key(key_str) {
                self.cache
                    .insert(key_str.to_string(), def.default_value.to_raw());
            }
        }
    }

    pub fn get_raw(&self, key: &str) -> String {
        self.cache.get(key).cloned().unwrap_or_default()
    }

    pub async fn set_raw(&mut self, key: &str, value: &str) -> Result<(), String> {
        self.initialize().await?;

        if let Some(settings_key) = SettingsKey::from_str(key) {
            let definitions = Self::get_definitions();
            if let Some(def) = definitions.get(&settings_key) {
                let parsed = SettingsValue::from_raw(def.kind, value);
                let validated = if let Some(validate_fn) = def.validate {
                    if validate_fn(&parsed) {
                        parsed.to_raw()
                    } else {
                        def.default_value.to_raw()
                    }
                } else {
                    parsed.to_raw()
                };
                self.cache.insert(key.to_string(), validated.clone());
                if let Some(conn) = self.db_conn.clone() {
                    self.upsert_raw_db(&conn, key, &validated).await?;
                }
                return Ok(());
            }
        }
        self.cache.insert(key.to_string(), value.to_string());
        if let Some(conn) = self.db_conn.clone() {
            self.upsert_raw_db(&conn, key, value).await?;
        }
        Ok(())
    }

    pub fn get_value(&self, key: SettingsKey) -> SettingsValue {
        let definitions = Self::get_definitions();
        let raw = self.cache.get(key.as_str()).cloned().unwrap_or_default();
        if let Some(def) = definitions.get(&key) {
            let parsed = SettingsValue::from_raw(def.kind, &raw);
            if let Some(validate_fn) = def.validate {
                if validate_fn(&parsed) {
                    return parsed;
                } else {
                    return def.default_value.clone();
                }
            }
            return parsed;
        }
        SettingsValue::String(raw)
    }

    pub async fn set_value(
        &mut self,
        key: SettingsKey,
        value: SettingsValue,
    ) -> Result<(), String> {
        self.initialize().await?;

        let definitions = Self::get_definitions();
        if let Some(def) = definitions.get(&key) {
            if let Some(validate_fn) = def.validate {
                if !validate_fn(&value) {
                    return Err(format!("Invalid value for setting: {:?}", key));
                }
            }
            let raw = value.to_raw();
            self.cache.insert(key.as_str().to_string(), raw.clone());
            if let Some(conn) = self.db_conn.clone() {
                self.upsert_raw_db(&conn, key.as_str(), &raw).await?;
            }
        }
        Ok(())
    }

    pub fn get_all(&self) -> SettingsSpec {
        SettingsSpec {
            is_wizard_completed: match self.get_value(SettingsKey::IsWizardCompleted) {
                SettingsValue::Boolean(b) => b,
                _ => false,
            },
            log_level: match self.get_value(SettingsKey::LogLevel) {
                SettingsValue::String(s) => s,
                _ => "info".to_string(),
            },
            window_zoom: match self.get_value(SettingsKey::WindowZoom) {
                SettingsValue::Number(n) => n,
                _ => 1.0,
            },
            search_keyboard_layout: match self.get_value(SettingsKey::SearchKeyboardLayout) {
                SettingsValue::String(s) => s,
                _ => "qwerty26".to_string(),
            },
            themes_custom: match self.get_value(SettingsKey::ThemesCustom) {
                SettingsValue::Json(j) => j,
                _ => JsonValue::Array(vec![]),
            },
            auto_score_enabled: match self.get_value(SettingsKey::AutoScoreEnabled) {
                SettingsValue::Boolean(b) => b,
                _ => false,
            },
            auto_score_rules: match self.get_value(SettingsKey::AutoScoreRules) {
                SettingsValue::Json(j) => j,
                _ => JsonValue::Array(vec![]),
            },
            current_theme_id: match self.get_value(SettingsKey::CurrentThemeId) {
                SettingsValue::String(s) => s,
                _ => "light-default".to_string(),
            },
            pg_connection_string: match self.get_value(SettingsKey::PgConnectionString) {
                SettingsValue::String(s) => s,
                _ => String::new(),
            },
            pg_connection_status: match self.get_value(SettingsKey::PgConnectionStatus) {
                SettingsValue::Json(j) => j,
                _ => serde_json::json!({"connected": false, "type": "sqlite"}),
            },
        }
    }

    pub fn get_all_raw(&self) -> HashMap<String, String> {
        self.cache.clone()
    }

    pub fn has_secret(&self, key: &str) -> bool {
        if let Some(v) = self.cache.get(key) {
            !v.trim().is_empty()
        } else {
            false
        }
    }
}
