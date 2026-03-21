use chrono::Local;
use parking_lot::RwLock;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::sync::Arc;
use tauri::State;

use crate::state::AppState;

use super::response::IpcResponse;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConfigFolderStructure {
    pub config_root: String,
    pub automatic: String,
    pub script: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConfigFileInfo {
    pub name: String,
    pub path: String,
    pub size: u64,
    pub modified: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ConfigFolder {
    #[serde(rename = "automatic")]
    Automatic,
    #[serde(rename = "script")]
    Script,
}

impl ConfigFolder {
    pub fn as_str(&self) -> &'static str {
        match self {
            ConfigFolder::Automatic => "automatic",
            ConfigFolder::Script => "script",
        }
    }

    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "automatic" => Some(ConfigFolder::Automatic),
            "script" => Some(ConfigFolder::Script),
            _ => None,
        }
    }
}

fn get_config_root() -> PathBuf {
    let config_dir = dirs::config_dir().unwrap_or_else(|| PathBuf::from("."));
    config_dir.join("SecScore")
}

fn get_folder_path(folder: &ConfigFolder) -> PathBuf {
    let root = get_config_root();
    match folder {
        ConfigFolder::Automatic => root.join("automatic"),
        ConfigFolder::Script => root.join("script"),
    }
}

fn ensure_folder_exists(folder: &ConfigFolder) -> Result<PathBuf, String> {
    let path = get_folder_path(folder);
    if !path.exists() {
        fs::create_dir_all(&path).map_err(|e| e.to_string())?;
    }
    Ok(path)
}

#[tauri::command]
pub async fn fs_get_config_structure(
    _state: State<'_, Arc<RwLock<AppState>>>,
) -> Result<IpcResponse<ConfigFolderStructure>, String> {
    let config_root = get_config_root();
    let _ = fs::create_dir_all(&config_root);

    let automatic = config_root.join("automatic");
    let script = config_root.join("script");

    let _ = fs::create_dir_all(&automatic);
    let _ = fs::create_dir_all(&script);

    Ok(IpcResponse::success(ConfigFolderStructure {
        config_root: config_root.to_string_lossy().to_string(),
        automatic: automatic.to_string_lossy().to_string(),
        script: script.to_string_lossy().to_string(),
    }))
}

#[tauri::command]
pub async fn fs_read_json(
    relative_path: String,
    folder: String,
    _state: State<'_, Arc<RwLock<AppState>>>,
) -> Result<IpcResponse<serde_json::Value>, String> {
    let folder_type = ConfigFolder::from_str(&folder)
        .ok_or_else(|| format!("Invalid folder type: {}", folder))?;

    let folder_path = ensure_folder_exists(&folder_type)?;
    let file_path = folder_path.join(&relative_path);

    if !file_path.exists() {
        return Ok(IpcResponse::success(serde_json::Value::Null));
    }

    let content = fs::read_to_string(&file_path).map_err(|e| e.to_string())?;

    let json: serde_json::Value =
        serde_json::from_str(&content).map_err(|e| format!("Failed to parse JSON: {}", e))?;

    Ok(IpcResponse::success(json))
}

#[tauri::command]
pub async fn fs_write_json(
    relative_path: String,
    data: serde_json::Value,
    folder: String,
    _state: State<'_, Arc<RwLock<AppState>>>,
) -> Result<IpcResponse<()>, String> {
    let folder_type = ConfigFolder::from_str(&folder)
        .ok_or_else(|| format!("Invalid folder type: {}", folder))?;

    let folder_path = ensure_folder_exists(&folder_type)?;
    let file_path = folder_path.join(&relative_path);

    if let Some(parent) = file_path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    let content = serde_json::to_string_pretty(&data)
        .map_err(|e| format!("Failed to serialize JSON: {}", e))?;

    fs::write(&file_path, content).map_err(|e| e.to_string())?;

    Ok(IpcResponse::success_empty())
}

#[tauri::command]
pub async fn fs_read_text(
    relative_path: String,
    folder: String,
    _state: State<'_, Arc<RwLock<AppState>>>,
) -> Result<IpcResponse<Option<String>>, String> {
    let folder_type = ConfigFolder::from_str(&folder)
        .ok_or_else(|| format!("Invalid folder type: {}", folder))?;

    let folder_path = ensure_folder_exists(&folder_type)?;
    let file_path = folder_path.join(&relative_path);

    if !file_path.exists() {
        return Ok(IpcResponse::success(None));
    }

    let content = fs::read_to_string(&file_path).map_err(|e| e.to_string())?;

    Ok(IpcResponse::success(Some(content)))
}

#[tauri::command]
pub async fn fs_write_text(
    content: String,
    relative_path: String,
    folder: String,
    _state: State<'_, Arc<RwLock<AppState>>>,
) -> Result<IpcResponse<()>, String> {
    let folder_type = ConfigFolder::from_str(&folder)
        .ok_or_else(|| format!("Invalid folder type: {}", folder))?;

    let folder_path = ensure_folder_exists(&folder_type)?;
    let file_path = folder_path.join(&relative_path);

    if let Some(parent) = file_path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    fs::write(&file_path, content).map_err(|e| e.to_string())?;

    Ok(IpcResponse::success_empty())
}

#[tauri::command]
pub async fn fs_delete_file(
    relative_path: String,
    folder: String,
    _state: State<'_, Arc<RwLock<AppState>>>,
) -> Result<IpcResponse<()>, String> {
    let folder_type = ConfigFolder::from_str(&folder)
        .ok_or_else(|| format!("Invalid folder type: {}", folder))?;

    let folder_path = ensure_folder_exists(&folder_type)?;
    let file_path = folder_path.join(&relative_path);

    if file_path.exists() {
        if file_path.is_file() {
            fs::remove_file(&file_path).map_err(|e| e.to_string())?;
        } else if file_path.is_dir() {
            fs::remove_dir_all(&file_path).map_err(|e| e.to_string())?;
        }
    }

    Ok(IpcResponse::success_empty())
}

#[tauri::command]
pub async fn fs_list_files(
    folder: String,
    _state: State<'_, Arc<RwLock<AppState>>>,
) -> Result<IpcResponse<Vec<ConfigFileInfo>>, String> {
    let folder_type = ConfigFolder::from_str(&folder)
        .ok_or_else(|| format!("Invalid folder type: {}", folder))?;

    let folder_path = ensure_folder_exists(&folder_type)?;

    let mut files = Vec::new();

    fn collect_files(
        dir: &PathBuf,
        base: &PathBuf,
        files: &mut Vec<ConfigFileInfo>,
    ) -> Result<(), String> {
        if !dir.exists() {
            return Ok(());
        }

        for entry in fs::read_dir(dir).map_err(|e| e.to_string())? {
            let entry = entry.map_err(|e| e.to_string())?;
            let path = entry.path();

            if path.is_file() {
                let metadata = fs::metadata(&path).map_err(|e| e.to_string())?;
                let modified = metadata
                    .modified()
                    .map(|t| {
                        let datetime: chrono::DateTime<Local> = t.into();
                        datetime.format("%Y-%m-%d %H:%M:%S").to_string()
                    })
                    .unwrap_or_default();

                let relative = path
                    .strip_prefix(base)
                    .map(|p| p.to_string_lossy().to_string())
                    .unwrap_or_default();

                files.push(ConfigFileInfo {
                    name: path
                        .file_name()
                        .map(|n| n.to_string_lossy().to_string())
                        .unwrap_or_default(),
                    path: relative,
                    size: metadata.len(),
                    modified,
                });
            } else if path.is_dir() {
                collect_files(&path, base, files)?;
            }
        }

        Ok(())
    }

    collect_files(&folder_path, &folder_path, &mut files)?;

    files.sort_by(|a, b| a.path.cmp(&b.path));

    Ok(IpcResponse::success(files))
}

#[tauri::command]
pub async fn fs_file_exists(
    relative_path: String,
    folder: String,
    _state: State<'_, Arc<RwLock<AppState>>>,
) -> Result<IpcResponse<bool>, String> {
    let folder_type = ConfigFolder::from_str(&folder)
        .ok_or_else(|| format!("Invalid folder type: {}", folder))?;

    let folder_path = ensure_folder_exists(&folder_type)?;
    let file_path = folder_path.join(&relative_path);

    Ok(IpcResponse::success(file_path.exists()))
}
