use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PluginManifest {
    pub id: String,
    pub name: String,
    pub version: String,
    pub description: Option<String>,
    pub author: Option<String>,
    pub main: Option<String>,
    pub assets: Option<Vec<String>>,
    pub permissions: Option<Vec<String>>,
    pub enabled: bool,
}

impl Default for PluginManifest {
    fn default() -> Self {
        Self {
            id: String::new(),
            name: String::new(),
            version: "1.0.0".to_string(),
            description: None,
            author: None,
            main: None,
            assets: None,
            permissions: None,
            enabled: true,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Plugin {
    pub id: String,
    pub name: String,
    pub version: String,
    pub description: Option<String>,
    pub author: Option<String>,
    pub main: Option<String>,
    pub permissions: Option<Vec<String>>,
    pub enabled: bool,
    pub installed_at: String,
    pub manifest_path: String,
}

impl From<PluginManifest> for Plugin {
    fn from(manifest: PluginManifest) -> Self {
        Self {
            id: manifest.id,
            name: manifest.name,
            version: manifest.version,
            description: manifest.description,
            author: manifest.author,
            main: manifest.main,
            permissions: manifest.permissions,
            enabled: manifest.enabled,
            installed_at: chrono::Utc::now().to_rfc3339(),
            manifest_path: String::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PluginRuntimeModule {
    pub id: String,
    pub name: String,
    pub version: String,
    pub description: Option<String>,
    pub author: Option<String>,
    pub main: String,
    pub code: String,
    pub permissions: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct PluginStats {
    pub total_plugins: usize,
    pub enabled_plugins: usize,
    pub disabled_plugins: usize,
}

pub struct PluginService {
    plugins: Vec<Plugin>,
    plugin_dirs: HashMap<String, PathBuf>,
}

impl Default for PluginService {
    fn default() -> Self {
        Self::new()
    }
}

impl PluginService {
    pub fn new() -> Self {
        Self {
            plugins: Vec::new(),
            plugin_dirs: HashMap::new(),
        }
    }

    pub fn get_plugins_dir(app_handle: &AppHandle) -> PathBuf {
        app_handle
            .path()
            .app_data_dir()
            .unwrap_or_else(|_| PathBuf::from("."))
            .join("plugins")
    }

    pub fn initialize(&mut self, app_handle: &AppHandle) -> Result<(), String> {
        let plugins_dir = Self::get_plugins_dir(app_handle);

        if !plugins_dir.exists() {
            fs::create_dir_all(&plugins_dir).map_err(|e| format!("Failed to create plugins directory: {}", e))?;
        }

        self.plugins.clear();
        self.plugin_dirs.clear();
        self.load_plugins_from_dir(&plugins_dir)?;
        Ok(())
    }

    fn load_plugins_from_dir(&mut self, dir: &Path) -> Result<(), String> {
        if !dir.exists() {
            return Ok(());
        }

        for entry in fs::read_dir(dir).map_err(|e| format!("Failed to read plugins directory: {}", e))? {
            let entry = entry.map_err(|e| format!("Failed to read directory entry: {}", e))?;
            let path = entry.path();

            if path.is_dir() {
                let manifest_path = path.join("manifest.json");
                if manifest_path.exists() {
                    match Self::load_plugin_manifest_from_file(&manifest_path) {
                        Ok(manifest) => {
                            if let Err(error) = Self::validate_manifest(&manifest) {
                                eprintln!(
                                    "Skip invalid plugin manifest at {}: {}",
                                    manifest_path.to_string_lossy(),
                                    error
                                );
                                continue;
                            }
                            if self.plugins.iter().any(|existing| existing.id == manifest.id) {
                                eprintln!(
                                    "Skip duplicated plugin id {} at {}",
                                    manifest.id,
                                    manifest_path.to_string_lossy()
                                );
                                continue;
                            }
                            let mut plugin: Plugin = manifest.into();
                            plugin.manifest_path = manifest_path.to_string_lossy().to_string();
                            let plugin_id = plugin.id.clone();
                            self.plugins.push(plugin);
                            self.plugin_dirs.insert(plugin_id, path);
                        }
                        Err(error) => {
                            eprintln!(
                                "Skip plugin with invalid manifest at {}: {}",
                                manifest_path.to_string_lossy(),
                                error
                            );
                        }
                    }
                }
            }
        }

        Ok(())
    }

    fn validate_manifest(manifest: &PluginManifest) -> Result<(), String> {
        let id = manifest.id.trim();
        let name = manifest.name.trim();
        let version = manifest.version.trim();

        if id.is_empty() {
            return Err("Plugin id cannot be empty".to_string());
        }
        if !id
            .chars()
            .all(|ch| ch.is_ascii_alphanumeric() || ch == '.' || ch == '_' || ch == '-')
        {
            return Err("Plugin id can only contain letters, numbers, dot, underscore, hyphen".to_string());
        }
        if name.is_empty() {
            return Err("Plugin name cannot be empty".to_string());
        }
        if version.is_empty() {
            return Err("Plugin version cannot be empty".to_string());
        }

        if let Some(main) = manifest.main.as_ref() {
            let entry = main.trim();
            if entry.is_empty() {
                return Err("Plugin main cannot be empty".to_string());
            }
            if Path::new(entry).is_absolute() {
                return Err("Plugin main must be a relative path".to_string());
            }
        }

        Ok(())
    }

    fn copy_dir_recursive(source: &Path, target: &Path) -> Result<(), String> {
        if !source.exists() || !source.is_dir() {
            return Err(format!(
                "Plugin source directory does not exist: {}",
                source.to_string_lossy()
            ));
        }

        fs::create_dir_all(target)
            .map_err(|e| format!("Failed to create plugin target directory: {}", e))?;

        for entry in fs::read_dir(source)
            .map_err(|e| format!("Failed to read plugin source directory: {}", e))?
        {
            let entry = entry.map_err(|e| format!("Failed to read plugin file entry: {}", e))?;
            let source_path = entry.path();
            let target_path = target.join(entry.file_name());

            if source_path.is_dir() {
                Self::copy_dir_recursive(&source_path, &target_path)?;
            } else {
                fs::copy(&source_path, &target_path).map_err(|e| {
                    format!(
                        "Failed to copy plugin file from {} to {}: {}",
                        source_path.to_string_lossy(),
                        target_path.to_string_lossy(),
                        e
                    )
                })?;
            }
        }

        Ok(())
    }

    fn load_plugin_manifest_from_file(manifest_path: &Path) -> Result<PluginManifest, String> {
        let content = fs::read_to_string(manifest_path)
            .map_err(|e| format!("Failed to read manifest.json: {}", e))?;

        serde_json::from_str(&content).map_err(|e| format!("Failed to parse manifest.json: {}", e))
    }

    fn persist_manifest_enabled(manifest_path: &Path, enabled: bool) -> Result<(), String> {
        let mut manifest = Self::load_plugin_manifest_from_file(manifest_path)?;
        manifest.enabled = enabled;
        let serialized =
            serde_json::to_string_pretty(&manifest).map_err(|e| format!("Failed to serialize manifest.json: {}", e))?;
        fs::write(manifest_path, format!("{}\n", serialized))
            .map_err(|e| format!("Failed to write manifest.json: {}", e))?;
        Ok(())
    }

    fn resolve_plugin_relative_path(plugin_dir: &Path, relative_path: &str) -> Result<PathBuf, String> {
        let relative_path = relative_path.trim();
        if relative_path.is_empty() {
            return Err("Plugin entry file path cannot be empty".to_string());
        }
        if Path::new(relative_path).is_absolute() {
            return Err("Plugin entry file must be a relative path".to_string());
        }

        let plugin_dir_canonical = fs::canonicalize(plugin_dir).map_err(|e| {
            format!(
                "Failed to resolve plugin directory {}: {}",
                plugin_dir.to_string_lossy(),
                e
            )
        })?;
        let entry_path = plugin_dir.join(relative_path);
        let entry_path_canonical = fs::canonicalize(&entry_path).map_err(|e| {
            format!(
                "Failed to resolve plugin entry {}: {}",
                entry_path.to_string_lossy(),
                e
            )
        })?;

        if !entry_path_canonical.starts_with(&plugin_dir_canonical) {
            return Err("Plugin entry file must stay inside plugin directory".to_string());
        }
        if !entry_path_canonical.is_file() {
            return Err(format!(
                "Plugin entry file not found: {}",
                entry_path_canonical.to_string_lossy()
            ));
        }

        Ok(entry_path_canonical)
    }

    pub fn install_plugin(
        &mut self,
        app_handle: &AppHandle,
        manifest: PluginManifest,
        plugin_dir: PathBuf,
    ) -> Result<Plugin, String> {
        Self::validate_manifest(&manifest)?;
        if self.plugins.iter().any(|existing| existing.id == manifest.id) {
            return Err("Plugin already installed".to_string());
        }
        if !plugin_dir.exists() || !plugin_dir.is_dir() {
            return Err(format!(
                "Plugin directory not found: {}",
                plugin_dir.to_string_lossy()
            ));
        }

        let source_manifest = Self::load_plugin_manifest(&plugin_dir)?;
        Self::validate_manifest(&source_manifest)?;
        if source_manifest.id != manifest.id {
            return Err("Manifest mismatch: plugin id in folder does not match selected plugin".to_string());
        }

        let plugins_dir = Self::get_plugins_dir(app_handle);
        if !plugins_dir.exists() {
            fs::create_dir_all(&plugins_dir)
                .map_err(|e| format!("Failed to create plugins directory: {}", e))?;
        }
        let target_dir = plugins_dir.join(&source_manifest.id);
        if target_dir.exists() {
            return Err(format!(
                "Plugin target directory already exists: {}",
                target_dir.to_string_lossy()
            ));
        }

        Self::copy_dir_recursive(&plugin_dir, &target_dir)?;

        let target_manifest_path = target_dir.join("manifest.json");
        let mut plugin: Plugin = source_manifest.into();
        plugin.manifest_path = target_manifest_path.to_string_lossy().to_string();
        let plugin_id = plugin.id.clone();

        self.plugins.push(plugin.clone());
        self.plugin_dirs.insert(plugin_id, target_dir);

        Ok(plugin)
    }

    pub fn uninstall_plugin(&mut self, plugin_id: &str) -> Result<(), String> {
        let exists = self.plugins.iter().any(|plugin| plugin.id == plugin_id);
        if !exists {
            return Err("Plugin not found".to_string());
        }

        if let Some(plugin_dir) = self.plugin_dirs.get(plugin_id) {
            if plugin_dir.exists() {
                fs::remove_dir_all(plugin_dir).map_err(|e| {
                    format!(
                        "Failed to remove plugin directory {}: {}",
                        plugin_dir.to_string_lossy(),
                        e
                    )
                })?;
            }
        }

        self.plugins.retain(|plugin| plugin.id != plugin_id);
        self.plugin_dirs.remove(plugin_id);
        Ok(())
    }

    pub fn toggle_plugin(&mut self, plugin_id: &str, enabled: bool) -> Result<(), String> {
        let manifest_path = self
            .plugin_dirs
            .get(plugin_id)
            .ok_or_else(|| "Plugin directory not found".to_string())?
            .join("manifest.json");
        let plugin = self
            .plugins
            .iter_mut()
            .find(|plugin| plugin.id == plugin_id)
            .ok_or_else(|| "Plugin not found".to_string())?;
        plugin.enabled = enabled;
        Self::persist_manifest_enabled(&manifest_path, enabled)?;
        Ok(())
    }

    pub fn get_plugin(&self, plugin_id: &str) -> Option<&Plugin> {
        self.plugins.iter().find(|p| p.id == plugin_id)
    }

    pub fn get_all_plugins(&self) -> &[Plugin] {
        &self.plugins
    }

    pub fn get_plugin_stats(&self) -> PluginStats {
        let total_plugins = self.plugins.len();
        let enabled_plugins = self.plugins.iter().filter(|p| p.enabled).count();
        let disabled_plugins = total_plugins - enabled_plugins;

        PluginStats {
            total_plugins,
            enabled_plugins,
            disabled_plugins,
        }
    }

    pub fn get_plugin_dir(&self, plugin_id: &str) -> Option<&PathBuf> {
        self.plugin_dirs.get(plugin_id)
    }

    pub fn get_runtime_modules(&self) -> Result<Vec<PluginRuntimeModule>, String> {
        let mut runtime_modules = Vec::new();

        for plugin in self.plugins.iter().filter(|plugin| plugin.enabled) {
            let Some(main) = plugin.main.clone() else {
                continue;
            };
            let Some(plugin_dir) = self.plugin_dirs.get(&plugin.id) else {
                eprintln!(
                    "Skip plugin runtime loading because plugin directory missing: {}",
                    plugin.id
                );
                continue;
            };
            let entry_path = match Self::resolve_plugin_relative_path(plugin_dir, &main) {
                Ok(path) => path,
                Err(error) => {
                    eprintln!(
                        "Skip plugin runtime loading for {} because entry path is invalid: {}",
                        plugin.id, error
                    );
                    continue;
                }
            };
            let code = match fs::read_to_string(&entry_path) {
                Ok(code) => code,
                Err(error) => {
                    eprintln!(
                        "Skip plugin runtime loading for {} because entry file cannot be read: {}",
                        plugin.id, error
                    );
                    continue;
                }
            };

            runtime_modules.push(PluginRuntimeModule {
                id: plugin.id.clone(),
                name: plugin.name.clone(),
                version: plugin.version.clone(),
                description: plugin.description.clone(),
                author: plugin.author.clone(),
                main,
                code,
                permissions: plugin.permissions.clone().unwrap_or_default(),
            });
        }

        Ok(runtime_modules)
    }

    pub fn load_plugin_manifest(path: &PathBuf) -> Result<PluginManifest, String> {
        let manifest_path = path.join("manifest.json");

        if !manifest_path.exists() {
            return Err("manifest.json not found".to_string());
        }

        let manifest = Self::load_plugin_manifest_from_file(&manifest_path)?;
        Self::validate_manifest(&manifest)?;
        Ok(manifest)
    }
}
