use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

/// 应用数据目录布局。
///
/// 安装版（release）使用 Tauri 的 `app_data_dir`，目录结构为：
/// `<app_data_dir>/data/data.sql` 与 `<app_data_dir>/data/workspace/`。
///
/// 开发版默认沿用原有的本地隔离布局：`data.sql` 与 `.secscore-workspace/`。
/// 通过环境变量可显式切换到安装版数据目录：
/// - `SECSCORE_DATA_DIR`：直接指向包含 `data.sql` 与 `workspace/` 的数据根目录；
/// - `SECSCORE_USE_INSTALLED_DATA`：任意非空值即让 debug 构建使用标准 `app_data_dir/data`。
pub struct StorageLayout {
    data_root: PathBuf,
    workspace_root: PathBuf,
}

impl StorageLayout {
    /// `data.sql` 所在的数据根目录。
    ///
    /// 开发隔离模式下为空路径，表示当前工作目录。
    pub fn data_root(&self) -> &Path {
        &self.data_root
    }

    pub fn workspace_root(&self) -> &Path {
        &self.workspace_root
    }

    pub fn legacy_db_path(&self) -> PathBuf {
        self.data_root.join("data.sql")
    }

    pub fn ensure_data_dir(&self) -> Result<(), String> {
        if self.data_root.as_os_str().is_empty() {
            return Ok(());
        }
        fs::create_dir_all(&self.data_root)
            .map_err(|e| format!("Failed to create data directory: {}", e))
    }
}

pub fn resolve_storage_layout(app_handle: &AppHandle) -> Result<StorageLayout, String> {
    if let Some(custom_root) = env::var_os("SECSCORE_DATA_DIR") {
        let root = PathBuf::from(custom_root);
        return Ok(StorageLayout {
            data_root: root.clone(),
            workspace_root: root.join("workspace"),
        });
    }

    let installed_data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data directory: {}", e))?
        .join("data");

    let use_installed_data = !cfg!(all(debug_assertions, desktop))
        || env::var_os("SECSCORE_USE_INSTALLED_DATA").is_some();

    if use_installed_data {
        Ok(StorageLayout {
            data_root: installed_data_dir.clone(),
            workspace_root: installed_data_dir.join("workspace"),
        })
    } else {
        Ok(StorageLayout {
            data_root: PathBuf::new(),
            workspace_root: PathBuf::from(".secscore-workspace"),
        })
    }
}

pub fn local_sqlite_path(app_handle: &AppHandle) -> Result<String, String> {
    let layout = resolve_storage_layout(app_handle)?;
    layout.ensure_data_dir()?;
    let db_path = layout.legacy_db_path();
    db_path
        .to_str()
        .map(|s| s.to_string())
        .ok_or_else(|| "Invalid sqlite database path".to_string())
}
