use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tauri::{AppHandle, Emitter};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ThemeConfig {
    pub name: String,
    pub id: String,
    pub mode: String,
    pub config: ThemeColors,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ThemeColors {
    #[serde(rename = "tdesign")]
    pub tdesign: HashMap<String, String>,
    #[serde(rename = "custom")]
    pub custom: HashMap<String, String>,
}

impl Default for ThemeColors {
    fn default() -> Self {
        Self {
            tdesign: HashMap::new(),
            custom: HashMap::new(),
        }
    }
}

fn create_builtin_themes() -> Vec<ThemeConfig> {
    vec![
        ThemeConfig {
            name: "极简浅色".to_string(),
            id: "light-default".to_string(),
            mode: "light".to_string(),
            config: ThemeColors {
                tdesign: {
                    let mut m = HashMap::new();
                    m.insert("brandColor".to_string(), "#0052D9".to_string());
                    m.insert("warningColor".to_string(), "#ED7B2F".to_string());
                    m.insert("errorColor".to_string(), "#D54941".to_string());
                    m.insert("successColor".to_string(), "#2BA471".to_string());
                    m
                },
                custom: {
                    let mut m = HashMap::new();
                    m.insert(
                        "--ss-bg-color".to_string(),
                        "linear-gradient(180deg, #f7fbff 0%, #f1f7ff 55%, #f8f9fc 100%)"
                            .to_string(),
                    );
                    m.insert("--ss-card-bg".to_string(), "#ffffff".to_string());
                    m.insert("--ss-text-main".to_string(), "#181818".to_string());
                    m.insert("--ss-text-secondary".to_string(), "#666666".to_string());
                    m.insert("--ss-border-color".to_string(), "#dcdcdc".to_string());
                    m.insert(
                        "--ss-header-bg".to_string(),
                        "linear-gradient(180deg, #ffffff 0%, rgba(255,255,255,0.7) 100%)"
                            .to_string(),
                    );
                    m.insert(
                        "--ss-sidebar-bg".to_string(),
                        "rgba(255, 255, 255, 0.88)".to_string(),
                    );
                    m.insert("--ss-item-hover".to_string(), "#f3f3f3".to_string());
                    m.insert("--ss-sidebar-text".to_string(), "#181818".to_string());
                    m.insert(
                        "--ss-sidebar-active-bg".to_string(),
                        "rgba(0, 0, 0, 0.06)".to_string(),
                    );
                    m.insert(
                        "--ss-sidebar-active-text".to_string(),
                        "#181818".to_string(),
                    );
                    m
                },
            },
        },
        ThemeConfig {
            name: "极客深蓝".to_string(),
            id: "dark-default".to_string(),
            mode: "dark".to_string(),
            config: ThemeColors {
                tdesign: {
                    let mut m = HashMap::new();
                    m.insert("brandColor".to_string(), "#0052D9".to_string());
                    m.insert("warningColor".to_string(), "#E37318".to_string());
                    m.insert("errorColor".to_string(), "#D32029".to_string());
                    m.insert("successColor".to_string(), "#248232".to_string());
                    m
                },
                custom: {
                    let mut m = HashMap::new();
                    m.insert(
                        "--ss-bg-color".to_string(),
                        "linear-gradient(180deg, #0f1220 0%, #101524 55%, #0b0d16 100%)"
                            .to_string(),
                    );
                    m.insert("--ss-card-bg".to_string(), "#1e1e1e".to_string());
                    m.insert("--ss-text-main".to_string(), "#ffffff".to_string());
                    m.insert("--ss-text-secondary".to_string(), "#a0a0a0".to_string());
                    m.insert("--ss-border-color".to_string(), "#333333".to_string());
                    m.insert(
                        "--ss-header-bg".to_string(),
                        "rgba(30, 30, 30, 0.92)".to_string(),
                    );
                    m.insert(
                        "--ss-sidebar-bg".to_string(),
                        "rgba(30, 30, 30, 0.92)".to_string(),
                    );
                    m.insert("--ss-item-hover".to_string(), "#2c2c2c".to_string());
                    m.insert("--ss-sidebar-text".to_string(), "#ffffff".to_string());
                    m.insert(
                        "--ss-sidebar-active-bg".to_string(),
                        "rgba(255, 255, 255, 0.10)".to_string(),
                    );
                    m.insert(
                        "--ss-sidebar-active-text".to_string(),
                        "#ffffff".to_string(),
                    );
                    m
                },
            },
        },
        ThemeConfig {
            name: "冷静青蓝".to_string(),
            id: "dark-cyan".to_string(),
            mode: "dark".to_string(),
            config: ThemeColors {
                tdesign: {
                    let mut m = HashMap::new();
                    m.insert("brandColor".to_string(), "#16A085".to_string());
                    m.insert("warningColor".to_string(), "#F39C12".to_string());
                    m.insert("errorColor".to_string(), "#E74C3C".to_string());
                    m.insert("successColor".to_string(), "#1ABC9C".to_string());
                    m
                },
                custom: {
                    let mut m = HashMap::new();
                    m.insert(
                        "--ss-bg-color".to_string(),
                        "linear-gradient(180deg, #050b10 0%, #06121a 55%, #05070a 100%)"
                            .to_string(),
                    );
                    m.insert("--ss-card-bg".to_string(), "#0f1a23".to_string());
                    m.insert("--ss-text-main".to_string(), "#E5F7FF".to_string());
                    m.insert("--ss-text-secondary".to_string(), "#7FA4B8".to_string());
                    m.insert("--ss-border-color".to_string(), "#1F3645".to_string());
                    m.insert(
                        "--ss-header-bg".to_string(),
                        "rgba(15, 26, 35, 0.92)".to_string(),
                    );
                    m.insert(
                        "--ss-sidebar-bg".to_string(),
                        "rgba(15, 26, 35, 0.92)".to_string(),
                    );
                    m.insert("--ss-item-hover".to_string(), "#182635".to_string());
                    m.insert("--ss-sidebar-text".to_string(), "#E5F7FF".to_string());
                    m.insert("--ss-sidebar-active-bg".to_string(), "#182635".to_string());
                    m.insert(
                        "--ss-sidebar-active-text".to_string(),
                        "#E5F7FF".to_string(),
                    );
                    m
                },
            },
        },
        ThemeConfig {
            name: "清新马卡龙".to_string(),
            id: "light-pastel".to_string(),
            mode: "light".to_string(),
            config: ThemeColors {
                tdesign: {
                    let mut m = HashMap::new();
                    m.insert("brandColor".to_string(), "#FF9AA2".to_string());
                    m.insert("warningColor".to_string(), "#FFB347".to_string());
                    m.insert("errorColor".to_string(), "#FF6F69".to_string());
                    m.insert("successColor".to_string(), "#B5EAD7".to_string());
                    m
                },
                custom: {
                    let mut m = HashMap::new();
                    m.insert(
                        "--ss-bg-color".to_string(),
                        "linear-gradient(180deg, #fff7f1 0%, #fff1f1 55%, #f7f7fb 100%)"
                            .to_string(),
                    );
                    m.insert("--ss-card-bg".to_string(), "#ffffff".to_string());
                    m.insert("--ss-text-main".to_string(), "#3A3A3A".to_string());
                    m.insert("--ss-text-secondary".to_string(), "#8A8A8A".to_string());
                    m.insert("--ss-border-color".to_string(), "#F1D3D3".to_string());
                    m.insert(
                        "--ss-header-bg".to_string(),
                        "rgba(255, 255, 255, 0.88)".to_string(),
                    );
                    m.insert(
                        "--ss-sidebar-bg".to_string(),
                        "rgba(255, 255, 255, 0.90)".to_string(),
                    );
                    m.insert("--ss-item-hover".to_string(), "#FFE7E0".to_string());
                    m.insert("--ss-sidebar-text".to_string(), "#3A3A3A".to_string());
                    m.insert("--ss-sidebar-active-bg".to_string(), "#FFE7E0".to_string());
                    m.insert(
                        "--ss-sidebar-active-text".to_string(),
                        "#3A3A3A".to_string(),
                    );
                    m
                },
            },
        },
    ]
}

pub struct ThemeService {
    current_theme_id: String,
    custom_themes: Vec<ThemeConfig>,
    builtin_themes: Vec<ThemeConfig>,
}

impl Default for ThemeService {
    fn default() -> Self {
        Self::new()
    }
}

impl ThemeService {
    pub fn new() -> Self {
        Self {
            current_theme_id: "light-default".to_string(),
            custom_themes: Vec::new(),
            builtin_themes: create_builtin_themes(),
        }
    }

    pub async fn initialize(&mut self, _app_handle: &AppHandle) -> Result<(), String> {
        Ok(())
    }

    pub fn load_saved_theme(&mut self, theme_id: &str) {
        let themes = self.get_theme_list();
        if themes.iter().any(|t| t.id == theme_id) {
            self.current_theme_id = theme_id.to_string();
        }
    }

    pub fn load_custom_themes(&mut self, themes_json: serde_json::Value) {
        if let serde_json::Value::Array(arr) = themes_json {
            self.custom_themes = arr
                .into_iter()
                .filter_map(|v| serde_json::from_value(v).ok())
                .collect();
        } else {
            self.custom_themes = Vec::new();
        }
    }

    pub fn get_custom_themes_json(&self) -> serde_json::Value {
        serde_json::to_value(&self.custom_themes).unwrap_or(serde_json::Value::Array(vec![]))
    }

    pub fn get_theme_list(&self) -> Vec<ThemeConfig> {
        let mut themes = self.builtin_themes.clone();
        themes.extend(self.custom_themes.clone());
        themes
    }

    pub fn get_current_theme(&self) -> Option<ThemeConfig> {
        let themes = self.get_theme_list();
        themes.into_iter().find(|t| t.id == self.current_theme_id)
    }

    pub fn get_current_theme_id(&self) -> &str {
        &self.current_theme_id
    }

    pub fn set_current_theme(&mut self, theme_id: &str) -> bool {
        let themes = self.get_theme_list();
        if themes.iter().any(|t| t.id == theme_id) {
            self.current_theme_id = theme_id.to_string();
            true
        } else {
            false
        }
    }

    pub fn save_theme(&mut self, theme: ThemeConfig) -> Result<(), String> {
        if theme.id.is_empty() || theme.name.is_empty() {
            return Err("Invalid theme".to_string());
        }

        if self.builtin_themes.iter().any(|t| t.id == theme.id) {
            return Err("Cannot overwrite builtin themes".to_string());
        }

        if let Some(idx) = self.custom_themes.iter().position(|t| t.id == theme.id) {
            self.custom_themes[idx] = theme;
        } else {
            self.custom_themes.insert(0, theme);
        }

        Ok(())
    }

    pub fn delete_theme(&mut self, theme_id: &str) -> Result<(), String> {
        if self.builtin_themes.iter().any(|t| t.id == theme_id) {
            return Err("Cannot delete builtin themes".to_string());
        }

        let before_len = self.custom_themes.len();
        self.custom_themes.retain(|t| t.id != theme_id);

        if self.custom_themes.len() == before_len {
            return Err("Theme not found".to_string());
        }

        if self.current_theme_id == theme_id {
            self.current_theme_id = "light-default".to_string();
        }

        Ok(())
    }

    pub async fn notify_theme_update(&self, app_handle: &AppHandle) {
        if let Some(theme) = self.get_current_theme() {
            let _ = app_handle.emit("theme:updated", &theme);
        }
    }
}
