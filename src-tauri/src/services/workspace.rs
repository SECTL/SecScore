use crate::db::{create_sqlite_connection, run_migration, DatabaseType};
use sea_orm::{ConnectionTrait, DatabaseConnection, DbBackend, Statement};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use tracing::{info, warn};
use uuid::Uuid;

const LOCAL_ACCOUNT_ID: &str = "local-account";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AccountRecord {
    pub id: String,
    pub kind: String,
    pub user_id: Option<String>,
    pub name: String,
    pub email: Option<String>,
    pub is_active: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClassRecord {
    pub id: String,
    pub name: String,
    pub kind: String,
    pub remote_id: Option<String>,
    pub join_code: Option<String>,
    pub status: String,
    pub db_path: String,
    pub is_current: bool,
    pub is_member: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkspaceState {
    pub current_account_id: String,
    pub current_class_id: String,
    pub accounts: Vec<AccountRecord>,
    pub classes: Vec<ClassRecord>,
}

#[derive(Debug, Clone)]
pub struct WorkspaceService {
    catalog: DatabaseConnection,
    root: PathBuf,
    current_account_id: String,
    current_class_id: String,
}

fn quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', "''"))
}

fn now() -> String {
    chrono::Utc::now().to_rfc3339()
}

fn masked_identifier(value: &str) -> String {
    let chars: Vec<char> = value.chars().collect();
    if chars.len() <= 8 {
        return "***".to_string();
    }
    format!(
        "{}…{}",
        chars[..4].iter().collect::<String>(),
        chars[chars.len() - 4..].iter().collect::<String>()
    )
}

fn masked_join_code(value: &str) -> String {
    let chars: Vec<char> = value.chars().collect();
    if chars.len() <= 2 {
        return "**".to_string();
    }
    format!(
        "{}…{}",
        chars[..2].iter().collect::<String>(),
        chars[chars.len() - 1]
    )
}

impl WorkspaceService {
    pub async fn initialize(
        root: PathBuf,
        legacy_path: &Path,
    ) -> Result<(Self, DatabaseConnection), String> {
        info!(
            event = "workspace_initialize_start",
            root = %root.display(),
            legacy_exists = legacy_path.exists(),
            "初始化本地工作空间"
        );
        fs::create_dir_all(root.join("classes")).map_err(|e| e.to_string())?;
        let catalog_path = root.join("workspace.sql");
        let catalog = create_sqlite_connection(
            catalog_path
                .to_str()
                .ok_or_else(|| "目录数据库路径无效".to_string())?,
        )
        .await
        .map_err(|e| e.to_string())?;

        catalog
            .execute(Statement::from_string(
                DbBackend::Sqlite,
                r#"
                CREATE TABLE IF NOT EXISTS workspace_accounts (
                    id TEXT PRIMARY KEY,
                    kind TEXT NOT NULL,
                    user_id TEXT UNIQUE,
                    name TEXT NOT NULL,
                    email TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS workspace_classes (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    kind TEXT NOT NULL,
                    remote_id TEXT UNIQUE,
                    join_code TEXT UNIQUE,
                    status TEXT NOT NULL DEFAULT 'active',
                    db_path TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS workspace_memberships (
                    account_id TEXT NOT NULL,
                    class_id TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    PRIMARY KEY (account_id, class_id),
                    FOREIGN KEY (account_id) REFERENCES workspace_accounts(id),
                    FOREIGN KEY (class_id) REFERENCES workspace_classes(id)
                );
                CREATE TABLE IF NOT EXISTS workspace_state (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL
                );
                "#,
            ))
            .await
            .map_err(|e| e.to_string())?;

        let account_count: i64 = catalog
            .query_one(Statement::from_string(
                DbBackend::Sqlite,
                "SELECT COUNT(*) AS count FROM workspace_accounts",
            ))
            .await
            .map_err(|e| e.to_string())?
            .and_then(|row| row.try_get_by::<i64, _>("count").ok())
            .unwrap_or(0);

        if account_count == 0 {
            let timestamp = now();
            catalog
                .execute(Statement::from_string(
                    DbBackend::Sqlite,
                    &format!(
                        "INSERT INTO workspace_accounts (id, kind, name, created_at, updated_at) VALUES ({}, 'local', '本地账号', {}, {})",
                        quote(LOCAL_ACCOUNT_ID),
                        quote(&timestamp),
                        quote(&timestamp)
                    ),
                ))
                .await
                .map_err(|e| e.to_string())?;
        }

        let account_id = Self::get_state(&catalog, "current_account_id")
            .await
            .unwrap_or_else(|| LOCAL_ACCOUNT_ID.to_string());
        let account_exists = catalog
            .query_one(Statement::from_string(
                DbBackend::Sqlite,
                &format!(
                    "SELECT id FROM workspace_accounts WHERE id = {}",
                    quote(&account_id)
                ),
            ))
            .await
            .map_err(|e| e.to_string())?
            .is_some();
        let current_account_id = if account_exists {
            account_id
        } else {
            LOCAL_ACCOUNT_ID.to_string()
        };

        let class_id = if let Some(id) = Self::get_state(&catalog, "current_class_id").await {
            let exists = catalog
                .query_one(Statement::from_string(
                    DbBackend::Sqlite,
                    &format!(
                        "SELECT id FROM workspace_classes WHERE id = {} AND status <> 'deleted'",
                        quote(&id)
                    ),
                ))
                .await
                .map_err(|e| e.to_string())?
                .is_some();
            if exists {
                id
            } else {
                String::new()
            }
        } else {
            String::new()
        };

        let current_class_id = if class_id.is_empty() {
            let id = Uuid::new_v4().to_string();
            let class_path = root.join("classes").join(format!("{}.sql", id));
            if legacy_path.exists() && !class_path.exists() {
                fs::copy(legacy_path, &class_path).map_err(|e| e.to_string())?;
                info!(
                    event = "workspace_legacy_data_migrated",
                    class_id = %masked_identifier(&id),
                    source = %legacy_path.display(),
                    target = %class_path.display(),
                    "已将旧本地数据迁移到默认班级"
                );
            }
            let timestamp = now();
            catalog
                .execute(Statement::from_string(
                    DbBackend::Sqlite,
                    &format!(
                        "INSERT INTO workspace_classes (id, name, kind, status, db_path, created_at, updated_at) VALUES ({}, '我的班级', 'local', 'active', {}, {}, {})",
                        quote(&id),
                        quote(class_path.to_str().ok_or_else(|| "班级数据库路径无效".to_string())?),
                        quote(&timestamp),
                        quote(&timestamp)
                    ),
                ))
                .await
                .map_err(|e| e.to_string())?;
            catalog
                .execute(Statement::from_string(
                    DbBackend::Sqlite,
                    &format!(
                        "INSERT OR IGNORE INTO workspace_memberships (account_id, class_id, created_at) VALUES ({}, {}, {})",
                        quote(&current_account_id), quote(&id), quote(&timestamp)
                    ),
                ))
                .await
                .map_err(|e| e.to_string())?;
            id
        } else {
            class_id
        };

        Self::set_state(&catalog, "current_account_id", &current_account_id).await?;
        Self::set_state(&catalog, "current_class_id", &current_class_id).await?;

        let service = Self {
            catalog,
            root,
            current_account_id,
            current_class_id,
        };
        let connection = service.open_current_class().await?;
        info!(
            event = "workspace_initialize_complete",
            account_id = %masked_identifier(&service.current_account_id),
            class_id = %masked_identifier(&service.current_class_id),
            "本地工作空间初始化完成"
        );
        Ok((service, connection))
    }

    async fn get_state(catalog: &DatabaseConnection, key: &str) -> Option<String> {
        catalog
            .query_one(Statement::from_string(
                DbBackend::Sqlite,
                &format!(
                    "SELECT value FROM workspace_state WHERE key = {}",
                    quote(key)
                ),
            ))
            .await
            .ok()
            .flatten()
            .and_then(|row| row.try_get_by::<String, _>("value").ok())
    }

    async fn set_state(catalog: &DatabaseConnection, key: &str, value: &str) -> Result<(), String> {
        catalog
            .execute(Statement::from_string(
                DbBackend::Sqlite,
                &format!(
                    "INSERT INTO workspace_state (key, value) VALUES ({}, {}) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                    quote(key), quote(value)
                ),
            ))
            .await
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    async fn current_class_path(&self) -> Result<PathBuf, String> {
        let row = self
            .catalog
            .query_one(Statement::from_string(
                DbBackend::Sqlite,
                &format!(
                    "SELECT db_path FROM workspace_classes WHERE id = {}",
                    quote(&self.current_class_id)
                ),
            ))
            .await
            .map_err(|e| e.to_string())?
            .ok_or_else(|| "当前班级不存在".to_string())?;
        let path = row
            .try_get_by::<String, _>("db_path")
            .map_err(|e| e.to_string())?;
        Ok(PathBuf::from(path))
    }

    async fn open_current_class(&self) -> Result<DatabaseConnection, String> {
        let path = self.current_class_path().await?;
        info!(
            event = "workspace_open_class_database",
            account_id = %masked_identifier(&self.current_account_id),
            class_id = %masked_identifier(&self.current_class_id),
            path = %path.display(),
            "打开当前班级数据库"
        );
        let connection = create_sqlite_connection(
            path.to_str()
                .ok_or_else(|| "班级数据库路径无效".to_string())?,
        )
        .await
        .map_err(|e| e.to_string())?;
        run_migration(&connection, DatabaseType::SQLite)
            .await
            .map_err(|e| e.to_string())?;
        Ok(connection)
    }

    pub async fn open_class(&mut self, class_id: &str) -> Result<DatabaseConnection, String> {
        info!(
            event = "workspace_switch_class_start",
            account_id = %masked_identifier(&self.current_account_id),
            class_id = %masked_identifier(class_id),
            "开始切换班级"
        );
        let permitted = self
            .catalog
            .query_one(Statement::from_string(
                DbBackend::Sqlite,
                &format!(
                    "SELECT 1 FROM workspace_memberships m JOIN workspace_classes c ON c.id = m.class_id WHERE m.account_id = {} AND c.id = {} AND c.status <> 'deleted'",
                    quote(&self.current_account_id), quote(class_id)
                ),
            ))
            .await
            .map_err(|e| e.to_string())?
            .is_some();
        if !permitted {
            warn!(
                event = "workspace_switch_class_denied",
                account_id = %masked_identifier(&self.current_account_id),
                class_id = %masked_identifier(class_id),
                "当前账号未关联目标班级"
            );
            return Err("当前账号未关联该班级".to_string());
        }
        self.current_class_id = class_id.to_string();
        Self::set_state(&self.catalog, "current_class_id", class_id).await?;
        let connection = self.open_current_class().await?;
        info!(
            event = "workspace_switch_class_complete",
            account_id = %masked_identifier(&self.current_account_id),
            class_id = %masked_identifier(class_id),
            "班级切换完成"
        );
        Ok(connection)
    }

    pub async fn create_local_class(&mut self, name: String) -> Result<DatabaseConnection, String> {
        let trimmed = name.trim();
        if trimmed.is_empty() {
            return Err("班级名称不能为空".to_string());
        }
        let id = Uuid::new_v4().to_string();
        info!(
            event = "workspace_create_local_class_start",
            account_id = %masked_identifier(&self.current_account_id),
            class_id = %masked_identifier(&id),
            "创建本地班级"
        );
        let path = self.root.join("classes").join(format!("{}.sql", id));
        let timestamp = now();
        self.catalog
            .execute(Statement::from_string(
                DbBackend::Sqlite,
                &format!(
                    "INSERT INTO workspace_classes (id, name, kind, status, db_path, created_at, updated_at) VALUES ({}, {}, 'local', 'active', {}, {}, {})",
                    quote(&id), quote(trimmed), quote(path.to_str().ok_or_else(|| "班级数据库路径无效".to_string())?), quote(&timestamp), quote(&timestamp)
                ),
            ))
            .await
            .map_err(|e| e.to_string())?;
        self.catalog
            .execute(Statement::from_string(
                DbBackend::Sqlite,
                &format!(
                    "INSERT INTO workspace_memberships (account_id, class_id, created_at) VALUES ({}, {}, {})",
                    quote(&self.current_account_id), quote(&id), quote(&timestamp)
                ),
            ))
            .await
            .map_err(|e| e.to_string())?;
        let connection = self.open_class(&id).await?;
        info!(
            event = "workspace_create_local_class_complete",
            account_id = %masked_identifier(&self.current_account_id),
            class_id = %masked_identifier(&id),
            "本地班级创建完成"
        );
        Ok(connection)
    }

    pub async fn upsert_sectl_account(
        &mut self,
        user_id: String,
        name: String,
        email: Option<String>,
    ) -> Result<DatabaseConnection, String> {
        let account_id = format!("sectl:{}", user_id);
        info!(
            event = "workspace_upsert_sectl_account_start",
            account_id = %masked_identifier(&account_id),
            user_id = %masked_identifier(&user_id),
            "保存 SECTL 账号"
        );
        let timestamp = now();
        self.catalog
            .execute(Statement::from_string(
                DbBackend::Sqlite,
                &format!(
                    "INSERT INTO workspace_accounts (id, kind, user_id, name, email, created_at, updated_at) VALUES ({}, 'sectl', {}, {}, {}, {}, {}) ON CONFLICT(id) DO UPDATE SET name = excluded.name, email = excluded.email, updated_at = excluded.updated_at",
                    quote(&account_id), quote(&user_id), quote(name.trim()), email.as_deref().map(quote).unwrap_or_else(|| "NULL".into()), quote(&timestamp), quote(&timestamp)
                ),
            ))
            .await
            .map_err(|e| e.to_string())?;
        if self.current_account_id == LOCAL_ACCOUNT_ID {
            self.catalog
                .execute(Statement::from_string(
                    DbBackend::Sqlite,
                    &format!(
                        "INSERT OR IGNORE INTO workspace_memberships (account_id, class_id, created_at) SELECT {}, class_id, {} FROM workspace_memberships WHERE account_id = {}",
                        quote(&account_id), quote(&timestamp), quote(LOCAL_ACCOUNT_ID)
                    ),
                ))
                .await
                .map_err(|e| e.to_string())?;
            self.current_account_id = account_id.clone();
            Self::set_state(&self.catalog, "current_account_id", &account_id).await?;
        }
        Self::set_state(&self.catalog, "current_class_id", &self.current_class_id).await?;
        let connection = self.open_current_class().await?;
        info!(
            event = "workspace_upsert_sectl_account_complete",
            account_id = %masked_identifier(&account_id),
            current_class_id = %masked_identifier(&self.current_class_id),
            "SECTL 账号保存完成"
        );
        Ok(connection)
    }

    pub async fn add_online_class(
        &mut self,
        name: String,
        remote_id: String,
        join_code: String,
    ) -> Result<DatabaseConnection, String> {
        let class_id = self
            .upsert_online_class(name, remote_id, join_code, "active".to_string())
            .await?;
        self.open_class(&class_id).await
    }

    pub async fn upsert_online_class(
        &mut self,
        name: String,
        remote_id: String,
        join_code: String,
        status: String,
    ) -> Result<String, String> {
        let trimmed_name = name.trim();
        let trimmed_remote_id = remote_id.trim();
        let trimmed_join_code = join_code.trim().to_uppercase();
        if trimmed_name.is_empty() || trimmed_remote_id.is_empty() || trimmed_join_code.len() != 6 {
            return Err("在线班级信息不完整".to_string());
        }
        let normalized_status = if status.trim() == "deleted" {
            "deleted"
        } else {
            "active"
        };
        let existing_id = self
            .catalog
            .query_one(Statement::from_string(
                DbBackend::Sqlite,
                &format!(
                    "SELECT id FROM workspace_classes WHERE remote_id = {}",
                    quote(trimmed_remote_id)
                ),
            ))
            .await
            .map_err(|e| e.to_string())?
            .and_then(|row| row.try_get_by::<String, _>("id").ok());
        let is_existing = existing_id.is_some();
        let id = existing_id.unwrap_or_else(|| Uuid::new_v4().to_string());
        info!(
            event = "workspace_upsert_online_class_start",
            account_id = %masked_identifier(&self.current_account_id),
            class_id = %masked_identifier(&id),
            remote_id = %masked_identifier(trimmed_remote_id),
            join_code = %masked_join_code(&trimmed_join_code),
            status = normalized_status,
            is_existing,
            "同步远端在线班级到本地目录"
        );
        let timestamp = now();
        if is_existing {
            self.catalog
                .execute(Statement::from_string(
                    DbBackend::Sqlite,
                    &format!(
                        "UPDATE workspace_classes SET name = {}, kind = 'online', join_code = {}, status = {}, updated_at = {} WHERE id = {}",
                        quote(trimmed_name), quote(&trimmed_join_code), quote(normalized_status), quote(&timestamp), quote(&id)
                    ),
                ))
                .await
                .map_err(|e| e.to_string())?;
        } else {
            let path = self.root.join("classes").join(format!("{}.sql", id));
            self.catalog
                .execute(Statement::from_string(
                    DbBackend::Sqlite,
                    &format!(
                        "INSERT INTO workspace_classes (id, name, kind, remote_id, join_code, status, db_path, created_at, updated_at) VALUES ({}, {}, 'online', {}, {}, {}, {}, {}, {})",
                        quote(&id), quote(trimmed_name), quote(trimmed_remote_id), quote(&trimmed_join_code), quote(normalized_status), quote(path.to_str().ok_or_else(|| "班级数据库路径无效".to_string())?), quote(&timestamp), quote(&timestamp)
                    ),
                ))
                .await
                .map_err(|e| e.to_string())?;
        }
        self.catalog
            .execute(Statement::from_string(
                DbBackend::Sqlite,
                &format!(
                    "INSERT OR IGNORE INTO workspace_memberships (account_id, class_id, created_at) VALUES ({}, {}, {})",
                    quote(&self.current_account_id), quote(&id), quote(&timestamp)
                ),
            ))
            .await
            .map_err(|e| e.to_string())?;
        info!(
            event = "workspace_upsert_online_class_complete",
            account_id = %masked_identifier(&self.current_account_id),
            class_id = %masked_identifier(&id),
            remote_id = %masked_identifier(trimmed_remote_id),
            "远端在线班级已写入本地目录"
        );
        Ok(id)
    }

    pub async fn mark_class_online(
        &mut self,
        class_id: String,
        remote_id: String,
        join_code: String,
    ) -> Result<DatabaseConnection, String> {
        info!(
            event = "workspace_mark_class_online_start",
            account_id = %masked_identifier(&self.current_account_id),
            class_id = %masked_identifier(&class_id),
            remote_id = %masked_identifier(remote_id.trim()),
            join_code = %masked_join_code(&join_code),
            "发布本地班级并绑定云端班级"
        );
        let timestamp = now();
        self.catalog
            .execute(Statement::from_string(
                DbBackend::Sqlite,
                &format!(
                    "UPDATE workspace_classes SET kind = 'online', remote_id = {}, join_code = {}, updated_at = {} WHERE id = {}",
                    quote(remote_id.trim()), quote(&join_code.trim().to_uppercase()), quote(&timestamp), quote(&class_id)
                ),
            ))
            .await
            .map_err(|e| e.to_string())?;
        let connection = self.open_class(&class_id).await?;
        info!(
            event = "workspace_mark_class_online_complete",
            account_id = %masked_identifier(&self.current_account_id),
            class_id = %masked_identifier(&class_id),
            "本地班级已绑定云端班级"
        );
        Ok(connection)
    }

    pub async fn switch_account(&mut self, account_id: &str) -> Result<DatabaseConnection, String> {
        info!(
            event = "workspace_switch_account_start",
            from_account_id = %masked_identifier(&self.current_account_id),
            to_account_id = %masked_identifier(account_id),
            "开始切换账号"
        );
        let exists = self
            .catalog
            .query_one(Statement::from_string(
                DbBackend::Sqlite,
                &format!(
                    "SELECT id FROM workspace_accounts WHERE id = {}",
                    quote(account_id)
                ),
            ))
            .await
            .map_err(|e| e.to_string())?
            .is_some();
        if !exists {
            return Err("账号不存在".to_string());
        }
        let class_row = self
            .catalog
            .query_one(Statement::from_string(
                DbBackend::Sqlite,
                &format!(
                    "SELECT class_id FROM workspace_memberships m JOIN workspace_classes c ON c.id = m.class_id WHERE m.account_id = {} AND c.status <> 'deleted' ORDER BY m.created_at DESC LIMIT 1",
                    quote(account_id)
                ),
            ))
            .await
            .map_err(|e| e.to_string())?;
        let class_id = class_row
            .and_then(|row| row.try_get_by::<String, _>("class_id").ok())
            .ok_or_else(|| "该账号尚未关联任何班级".to_string())?;
        self.current_account_id = account_id.to_string();
        self.current_class_id = class_id;
        Self::set_state(&self.catalog, "current_account_id", account_id).await?;
        Self::set_state(&self.catalog, "current_class_id", &self.current_class_id).await?;
        let connection = self.open_current_class().await?;
        info!(
            event = "workspace_switch_account_complete",
            account_id = %masked_identifier(&self.current_account_id),
            class_id = %masked_identifier(&self.current_class_id),
            "账号切换完成"
        );
        Ok(connection)
    }

    pub async fn remove_account(&mut self, account_id: &str) -> Result<(), String> {
        info!(
            event = "workspace_remove_account_start",
            account_id = %masked_identifier(account_id),
            current_account_id = %masked_identifier(&self.current_account_id),
            "移除本机账号"
        );
        if account_id == LOCAL_ACCOUNT_ID {
            return Err("本地账号不能移除".to_string());
        }
        self.catalog
            .execute(Statement::from_string(
                DbBackend::Sqlite,
                &format!(
                    "DELETE FROM workspace_memberships WHERE account_id = {}",
                    quote(account_id)
                ),
            ))
            .await
            .map_err(|e| e.to_string())?;
        self.catalog
            .execute(Statement::from_string(
                DbBackend::Sqlite,
                &format!(
                    "DELETE FROM workspace_accounts WHERE id = {}",
                    quote(account_id)
                ),
            ))
            .await
            .map_err(|e| e.to_string())?;
        if self.current_account_id == account_id {
            self.current_account_id = LOCAL_ACCOUNT_ID.to_string();
            Self::set_state(&self.catalog, "current_account_id", LOCAL_ACCOUNT_ID).await?;
        }
        info!(
            event = "workspace_remove_account_complete",
            account_id = %masked_identifier(account_id),
            current_account_id = %masked_identifier(&self.current_account_id),
            "本机账号已移除"
        );
        Ok(())
    }

    pub async fn list_state(&self) -> Result<WorkspaceState, String> {
        let account_rows = self
            .catalog
            .query_all(Statement::from_string(
                DbBackend::Sqlite,
                "SELECT id, kind, user_id, name, email FROM workspace_accounts ORDER BY kind, name",
            ))
            .await
            .map_err(|e| e.to_string())?;
        let accounts = account_rows
            .into_iter()
            .map(|row| AccountRecord {
                id: row.try_get_by("id").unwrap_or_default(),
                kind: row
                    .try_get_by("kind")
                    .unwrap_or_else(|_| "local".to_string()),
                user_id: row.try_get_by("user_id").ok(),
                name: row.try_get_by("name").unwrap_or_default(),
                email: row.try_get_by("email").ok(),
                is_active: row.try_get_by::<String, _>("id").unwrap_or_default()
                    == self.current_account_id,
            })
            .collect();
        let class_rows = self
            .catalog
            .query_all(Statement::from_string(
                DbBackend::Sqlite,
                &format!(
                    "SELECT c.id, c.name, c.kind, c.remote_id, c.join_code, c.status, c.db_path, EXISTS(SELECT 1 FROM workspace_memberships m WHERE m.account_id = {} AND m.class_id = c.id) AS is_member FROM workspace_classes c ORDER BY c.updated_at DESC",
                    quote(&self.current_account_id)
                ),
            ))
            .await
            .map_err(|e| e.to_string())?;
        let classes = class_rows
            .into_iter()
            .map(|row| ClassRecord {
                id: row.try_get_by("id").unwrap_or_default(),
                name: row.try_get_by("name").unwrap_or_default(),
                kind: row
                    .try_get_by("kind")
                    .unwrap_or_else(|_| "local".to_string()),
                remote_id: row.try_get_by("remote_id").ok(),
                join_code: row.try_get_by("join_code").ok(),
                status: row
                    .try_get_by("status")
                    .unwrap_or_else(|_| "active".to_string()),
                db_path: row.try_get_by("db_path").unwrap_or_default(),
                is_current: row.try_get_by::<String, _>("id").unwrap_or_default()
                    == self.current_class_id,
                is_member: row.try_get_by::<i64, _>("is_member").unwrap_or(0) != 0,
            })
            .filter(|class| class.is_member && class.status != "deleted")
            .collect();
        Ok(WorkspaceState {
            current_account_id: self.current_account_id.clone(),
            current_class_id: self.current_class_id.clone(),
            accounts,
            classes,
        })
    }

    pub async fn current_db_path(&self) -> Result<String, String> {
        Ok(self
            .current_class_path()
            .await?
            .to_string_lossy()
            .to_string())
    }

    pub async fn rename_class(
        &mut self,
        class_id: String,
        name: String,
    ) -> Result<WorkspaceState, String> {
        info!(
            event = "workspace_rename_class_start",
            account_id = %masked_identifier(&self.current_account_id),
            class_id = %masked_identifier(&class_id),
            "重命名班级"
        );
        let trimmed = name.trim();
        if trimmed.is_empty() {
            return Err("班级名称不能为空".to_string());
        }
        self.catalog
            .execute(Statement::from_string(
                DbBackend::Sqlite,
                &format!(
                    "UPDATE workspace_classes SET name = {}, updated_at = {} WHERE id = {}",
                    quote(trimmed),
                    quote(&now()),
                    quote(&class_id)
                ),
            ))
            .await
            .map_err(|e| e.to_string())?;
        let state = self.list_state().await?;
        info!(event = "workspace_rename_class_complete", class_id = %masked_identifier(&class_id), "班级重命名完成");
        Ok(state)
    }

    pub async fn update_class_code(
        &mut self,
        class_id: String,
        join_code: String,
    ) -> Result<WorkspaceState, String> {
        info!(
            event = "workspace_update_class_code_start",
            account_id = %masked_identifier(&self.current_account_id),
            class_id = %masked_identifier(&class_id),
            join_code = %masked_join_code(&join_code),
            "更新本地班级邀请码"
        );
        self.catalog
            .execute(Statement::from_string(
                DbBackend::Sqlite,
                &format!(
                    "UPDATE workspace_classes SET join_code = {}, updated_at = {} WHERE id = {}",
                    quote(&join_code.trim().to_uppercase()),
                    quote(&now()),
                    quote(&class_id)
                ),
            ))
            .await
            .map_err(|e| e.to_string())?;
        let state = self.list_state().await?;
        info!(event = "workspace_update_class_code_complete", class_id = %masked_identifier(&class_id), "本地班级邀请码已更新");
        Ok(state)
    }

    pub async fn mark_class_deleted(&mut self, class_id: String) -> Result<WorkspaceState, String> {
        info!(
            event = "workspace_mark_class_deleted_start",
            account_id = %masked_identifier(&self.current_account_id),
            class_id = %masked_identifier(&class_id),
            "将本地班级标记为已删除"
        );
        self.catalog
            .execute(Statement::from_string(
                DbBackend::Sqlite,
                &format!(
                    "UPDATE workspace_classes SET status = 'deleted', updated_at = {} WHERE id = {}",
                    quote(&now()),
                    quote(&class_id)
                ),
            ))
            .await
            .map_err(|e| e.to_string())?;
        let state = self.list_state().await?;
        info!(event = "workspace_mark_class_deleted_complete", class_id = %masked_identifier(&class_id), "本地班级已标记为已删除");
        Ok(state)
    }

    pub async fn leave_class(&mut self, class_id: String) -> Result<DatabaseConnection, String> {
        info!(
            event = "workspace_leave_class_start",
            account_id = %masked_identifier(&self.current_account_id),
            class_id = %masked_identifier(&class_id),
            "退出班级"
        );
        let current = class_id == self.current_class_id;
        self.catalog
            .execute(Statement::from_string(
                DbBackend::Sqlite,
                &format!(
                    "DELETE FROM workspace_memberships WHERE account_id = {} AND class_id = {}",
                    quote(&self.current_account_id),
                    quote(&class_id)
                ),
            ))
            .await
            .map_err(|e| e.to_string())?;
        if !current {
            return self.open_current_class().await;
        }
        let row = self
            .catalog
            .query_one(Statement::from_string(
                DbBackend::Sqlite,
                &format!(
                    "SELECT m.class_id FROM workspace_memberships m JOIN workspace_classes c ON c.id = m.class_id WHERE m.account_id = {} AND c.status <> 'deleted' ORDER BY m.created_at DESC LIMIT 1",
                    quote(&self.current_account_id)
                ),
            ))
            .await
            .map_err(|e| e.to_string())?;
        if let Some(row) = row {
            self.current_class_id = row.try_get_by("class_id").map_err(|e| e.to_string())?;
        } else {
            let id = Uuid::new_v4().to_string();
            let path = self.root.join("classes").join(format!("{}.sql", id));
            let timestamp = now();
            self.catalog
                .execute(Statement::from_string(
                    DbBackend::Sqlite,
                    &format!(
                        "INSERT INTO workspace_classes (id, name, kind, status, db_path, created_at, updated_at) VALUES ({}, '我的班级', 'local', 'active', {}, {}, {})",
                        quote(&id),
                        quote(path.to_str().ok_or_else(|| "班级数据库路径无效".to_string())?),
                        quote(&timestamp),
                        quote(&timestamp)
                    ),
                ))
                .await
                .map_err(|e| e.to_string())?;
            self.catalog
                .execute(Statement::from_string(
                    DbBackend::Sqlite,
                    &format!(
                        "INSERT INTO workspace_memberships (account_id, class_id, created_at) VALUES ({}, {}, {})",
                        quote(&self.current_account_id),
                        quote(&id),
                        quote(&timestamp)
                    ),
                ))
                .await
                .map_err(|e| e.to_string())?;
            self.current_class_id = id;
        }
        Self::set_state(&self.catalog, "current_class_id", &self.current_class_id).await?;
        let connection = self.open_current_class().await?;
        info!(
            event = "workspace_leave_class_complete",
            account_id = %masked_identifier(&self.current_account_id),
            current_class_id = %masked_identifier(&self.current_class_id),
            "退出班级完成"
        );
        Ok(connection)
    }
}
