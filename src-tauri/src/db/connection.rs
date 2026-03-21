use sea_orm::{ConnectOptions, Database, DatabaseConnection, DbErr};
use std::str::FromStr;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::RwLock;
use tracing::{info, warn};

const DB_MAX_CONNECTIONS: u32 = 20;
const DB_MIN_CONNECTIONS: u32 = 1;
const DB_CONNECT_TIMEOUT_SECS: u64 = 12;
const DB_ACQUIRE_TIMEOUT_SECS: u64 = 12;
const DB_IDLE_TIMEOUT_SECS: u64 = 30;

fn apply_default_connect_options(opt: &mut ConnectOptions) {
    opt.max_connections(DB_MAX_CONNECTIONS)
        .min_connections(DB_MIN_CONNECTIONS)
        .connect_timeout(Duration::from_secs(DB_CONNECT_TIMEOUT_SECS))
        .acquire_timeout(Duration::from_secs(DB_ACQUIRE_TIMEOUT_SECS))
        .idle_timeout(Duration::from_secs(DB_IDLE_TIMEOUT_SECS))
        .sqlx_logging(true)
        .sqlx_logging_level(tracing::log::LevelFilter::Info);
}

#[derive(Debug, Clone, PartialEq)]
pub enum DatabaseType {
    SQLite,
    PostgreSQL,
}

impl FromStr for DatabaseType {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.to_lowercase().as_str() {
            "sqlite" => Ok(Self::SQLite),
            "postgres" | "postgresql" => Ok(Self::PostgreSQL),
            _ => Err(format!("Unknown database type: {}", s)),
        }
    }
}

#[derive(Debug, Clone)]
pub struct DatabaseConfig {
    pub db_type: DatabaseType,
    pub sqlite_path: String,
    pub postgres_url: Option<String>,
}

impl Default for DatabaseConfig {
    fn default() -> Self {
        Self {
            db_type: DatabaseType::SQLite,
            sqlite_path: "secscore.db".to_string(),
            postgres_url: None,
        }
    }
}

impl DatabaseConfig {
    pub fn sqlite(path: String) -> Self {
        Self {
            db_type: DatabaseType::SQLite,
            sqlite_path: path,
            postgres_url: None,
        }
    }

    pub fn postgres(url: String) -> Self {
        Self {
            db_type: DatabaseType::PostgreSQL,
            sqlite_path: String::new(),
            postgres_url: Some(url),
        }
    }

    pub fn connection_url(&self) -> String {
        match self.db_type {
            DatabaseType::SQLite => format!("sqlite://{}?mode=rwc", self.sqlite_path),
            DatabaseType::PostgreSQL => self.postgres_url.clone().unwrap_or_default(),
        }
    }
}

#[derive(Debug)]
pub struct ConnectionManager {
    connection: Arc<RwLock<Option<DatabaseConnection>>>,
    config: Arc<RwLock<DatabaseConfig>>,
}

impl Clone for ConnectionManager {
    fn clone(&self) -> Self {
        Self {
            connection: self.connection.clone(),
            config: self.config.clone(),
        }
    }
}

impl Default for ConnectionManager {
    fn default() -> Self {
        Self::new()
    }
}

impl ConnectionManager {
    pub fn new() -> Self {
        Self {
            connection: Arc::new(RwLock::new(None)),
            config: Arc::new(RwLock::new(DatabaseConfig::default())),
        }
    }

    pub async fn connect(&self, config: DatabaseConfig) -> Result<(), DbErr> {
        let url = config.connection_url();
        info!(
            "Connecting to database: {} (type: {:?})",
            if config.db_type == DatabaseType::PostgreSQL {
                "postgresql://***"
            } else {
                &url
            },
            config.db_type
        );

        let mut opt = ConnectOptions::new(&url);
        apply_default_connect_options(&mut opt);

        let conn = Database::connect(opt).await?;

        let mut connection_guard = self.connection.write().await;
        *connection_guard = Some(conn);

        let mut config_guard = self.config.write().await;
        *config_guard = config;

        info!("Database connection established successfully");
        Ok(())
    }

    pub async fn connect_sqlite(&self, path: &str) -> Result<(), DbErr> {
        let config = DatabaseConfig::sqlite(path.to_string());
        self.connect(config).await
    }

    pub async fn connect_postgres(&self, url: &str) -> Result<(), DbErr> {
        let config = DatabaseConfig::postgres(url.to_string());
        self.connect(config).await
    }

    pub async fn disconnect(&self) -> Result<(), DbErr> {
        let mut connection_guard = self.connection.write().await;
        if let Some(conn) = connection_guard.take() {
            conn.close().await?;
            info!("Database connection closed");
        }
        Ok(())
    }

    pub async fn get_connection(&self) -> Option<DatabaseConnection> {
        let guard = self.connection.read().await;
        guard.clone()
    }

    pub async fn is_connected(&self) -> bool {
        let guard = self.connection.read().await;
        guard.is_some()
    }

    pub async fn get_config(&self) -> DatabaseConfig {
        let guard = self.config.read().await;
        guard.clone()
    }

    pub async fn get_database_type(&self) -> DatabaseType {
        let guard = self.config.read().await;
        guard.db_type.clone()
    }

    pub async fn test_connection(&self) -> Result<bool, DbErr> {
        let conn = self.get_connection().await;
        if let Some(conn) = conn {
            match conn.ping().await {
                Ok(_) => {
                    info!("Database connection test successful");
                    Ok(true)
                }
                Err(e) => {
                    warn!("Database connection test failed: {}", e);
                    Err(e)
                }
            }
        } else {
            warn!("No database connection available");
            Ok(false)
        }
    }

    pub async fn switch_database(&self, config: DatabaseConfig) -> Result<(), DbErr> {
        info!("Switching database to type: {:?}", config.db_type);

        self.disconnect().await?;

        self.connect(config).await?;

        Ok(())
    }
}

pub async fn create_sqlite_connection(path: &str) -> Result<DatabaseConnection, DbErr> {
    let url = format!("sqlite://{}?mode=rwc", path);
    let mut opt = ConnectOptions::new(&url);
    apply_default_connect_options(&mut opt);

    Database::connect(opt).await
}

pub async fn create_postgres_connection(url: &str) -> Result<DatabaseConnection, DbErr> {
    let mut opt = ConnectOptions::new(url);
    apply_default_connect_options(&mut opt);

    Database::connect(opt).await
}

pub async fn test_sqlite_connection(path: &str) -> Result<bool, DbErr> {
    let conn = create_sqlite_connection(path).await?;
    conn.ping().await?;
    conn.close().await?;
    Ok(true)
}

pub async fn test_postgres_connection(url: &str) -> Result<bool, DbErr> {
    let conn = create_postgres_connection(url).await?;
    conn.ping().await?;
    conn.close().await?;
    Ok(true)
}
