use parking_lot::RwLock;
use reqwest::Client;
use sea_orm::DatabaseConnection;
use std::sync::Arc;
use tauri::AppHandle;

use crate::services::{
    auth::AuthService, auto_score::AutoScoreService, data::DataService, logger::LoggerService,
    permission::PermissionService, plugin::PluginService, security::SecurityService,
    settings::SettingsService, theme::ThemeService, SettingsKey, SettingsValue,
};

pub struct AppState {
    pub db: Arc<RwLock<Option<DatabaseConnection>>>,
    pub settings: Arc<RwLock<SettingsService>>,
    pub security: Arc<RwLock<SecurityService>>,
    pub permissions: Arc<RwLock<PermissionService>>,
    pub auth: Arc<RwLock<AuthService>>,
    pub theme: Arc<RwLock<ThemeService>>,
    pub auto_score: Arc<RwLock<AutoScoreService>>,
    pub logger: Arc<RwLock<LoggerService>>,
    pub data: Arc<RwLock<DataService>>,
    pub plugins: Arc<RwLock<PluginService>>,
    pub http_client: Client,
    pub app_handle: AppHandle,
}

impl AppState {
    pub fn new(app_handle: AppHandle) -> Self {
        let settings = Arc::new(RwLock::new(SettingsService::new()));
        let security = Arc::new(RwLock::new(SecurityService::new()));
        let permissions = Arc::new(RwLock::new(PermissionService::new()));
        let auth = Arc::new(RwLock::new(AuthService::new()));
        let theme = Arc::new(RwLock::new(ThemeService::new()));
        let auto_score = Arc::new(RwLock::new(AutoScoreService::new()));
        let logger = Arc::new(RwLock::new(LoggerService::new()));
        let data = Arc::new(RwLock::new(DataService::new()));
        let plugins = Arc::new(RwLock::new(PluginService::new()));
        let db = Arc::new(RwLock::new(None));

        let http_client = Client::builder()
            .timeout(std::time::Duration::from_secs(30))
            .build()
            .expect("Failed to create HTTP client");

        Self {
            db,
            settings,
            security,
            permissions,
            auth,
            theme,
            auto_score,
            logger,
            data,
            plugins,
            http_client,
            app_handle,
        }
    }

    pub async fn initialize(&self) -> Result<(), Box<dyn std::error::Error>> {
        self.settings.write().initialize().await?;
        self.logger.write().initialize(&self.app_handle).await?;

        {
            let settings = self.settings.read();
            let current_theme_id = match settings.get_value(SettingsKey::CurrentThemeId) {
                SettingsValue::String(s) => s,
                _ => "light-default".to_string(),
            };
            let themes_custom = match settings.get_value(SettingsKey::ThemesCustom) {
                SettingsValue::Json(j) => j,
                _ => serde_json::Value::Array(vec![]),
            };
            let mut theme = self.theme.write();
            theme.load_custom_themes(themes_custom);
            theme.load_saved_theme(&current_theme_id);
        }

        let auto_score_rules = {
            let settings = self.settings.read();
            match settings.get_value(SettingsKey::AutoScoreRules) {
                SettingsValue::Json(value) => value,
                _ => serde_json::Value::Array(vec![]),
            }
        };
        {
            let mut auto_score = self.auto_score.write();
            auto_score.load_rules(auto_score_rules);
            auto_score.initialize(&self.app_handle).await?;
        }

        {
            let mut plugins = self.plugins.write();
            plugins.initialize(&self.app_handle)?;
        }

        Ok(())
    }
}

pub type SafeAppState = Arc<RwLock<AppState>>;
