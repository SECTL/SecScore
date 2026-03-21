use parking_lot::RwLock;
use sea_orm::DatabaseConnection;
use std::sync::Arc;
use tauri::AppHandle;

use crate::services::{
    auth::AuthService, auto_score::AutoScoreService, data::DataService, logger::LoggerService,
    permission::PermissionService, security::SecurityService, settings::SettingsService,
    theme::ThemeService,
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
        let db = Arc::new(RwLock::new(None));

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
            app_handle,
        }
    }

    pub async fn initialize(&self) -> Result<(), Box<dyn std::error::Error>> {
        self.settings.write().initialize().await?;
        self.logger.write().initialize(&self.app_handle).await?;
        self.theme.write().initialize(&self.app_handle).await?;
        self.auto_score.write().initialize(&self.app_handle).await?;
        Ok(())
    }
}

pub type SafeAppState = Arc<RwLock<AppState>>;
