use chrono::Local;
use serde::{Deserialize, Serialize};
use std::fs::{self, File, OpenOptions};
use std::io::{BufRead, BufReader, Write};
use std::path::PathBuf;
use tauri::{AppHandle, Emitter, Manager};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum LogLevel {
    Debug,
    Info,
    Warn,
    Error,
}

impl LogLevel {
    pub fn as_str(&self) -> &'static str {
        match self {
            LogLevel::Debug => "debug",
            LogLevel::Info => "info",
            LogLevel::Warn => "warn",
            LogLevel::Error => "error",
        }
    }

    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "debug" => Some(LogLevel::Debug),
            "info" => Some(LogLevel::Info),
            "warn" => Some(LogLevel::Warn),
            "error" => Some(LogLevel::Error),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LogEntry {
    pub timestamp: String,
    pub level: String,
    pub message: String,
    pub source: Option<String>,
    pub meta: Option<serde_json::Value>,
}

pub struct LoggerService {
    log_dir: PathBuf,
    current_level: LogLevel,
    #[allow(dead_code)]
    max_files: usize,
    #[allow(dead_code)]
    max_size_mb: u64,
}

impl Default for LoggerService {
    fn default() -> Self {
        Self::new()
    }
}

impl LoggerService {
    pub fn new() -> Self {
        Self {
            log_dir: PathBuf::from("logs"),
            current_level: LogLevel::Info,
            max_files: 30,
            max_size_mb: 20,
        }
    }

    pub async fn initialize(&mut self, app_handle: &AppHandle) -> Result<(), String> {
        let app_data_dir = app_handle
            .path()
            .app_data_dir()
            .map_err(|e| format!("Failed to get app data directory: {}", e))?;
        self.log_dir = app_data_dir.join("logs");
        fs::create_dir_all(&self.log_dir).map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn set_log_dir(&mut self, dir: PathBuf) {
        self.log_dir = dir;
        let _ = fs::create_dir_all(&self.log_dir);
    }

    pub fn set_level(&mut self, level: LogLevel) {
        self.current_level = level;
    }

    pub fn get_level(&self) -> LogLevel {
        self.current_level
    }

    fn get_log_file_path(&self) -> PathBuf {
        let date = Local::now().format("%Y-%m-%d").to_string();
        self.log_dir.join(format!("secscore-{}.log", date))
    }

    fn should_log(&self, level: LogLevel) -> bool {
        let current_rank = match self.current_level {
            LogLevel::Debug => 0,
            LogLevel::Info => 1,
            LogLevel::Warn => 2,
            LogLevel::Error => 3,
        };
        let level_rank = match level {
            LogLevel::Debug => 0,
            LogLevel::Info => 1,
            LogLevel::Warn => 2,
            LogLevel::Error => 3,
        };
        level_rank >= current_rank
    }

    pub fn log(
        &self,
        level: LogLevel,
        message: &str,
        source: Option<&str>,
        meta: Option<serde_json::Value>,
    ) {
        if !self.should_log(level) {
            return;
        }

        let timestamp = Local::now().format("%Y-%m-%d %H:%M:%S%.3f").to_string();
        let entry = LogEntry {
            timestamp: timestamp.clone(),
            level: level.as_str().to_string(),
            message: message.to_string(),
            source: source.map(|s| s.to_string()),
            meta,
        };

        let log_line = match serde_json::to_string(&entry) {
            Ok(s) => s,
            Err(_) => format!(
                r#"{{"timestamp":"{}","level":"{}","message":"{}"}}"#,
                timestamp,
                level.as_str(),
                message
            ),
        };

        if let Ok(file) = OpenOptions::new()
            .create(true)
            .append(true)
            .open(self.get_log_file_path())
        {
            let mut writer = std::io::BufWriter::new(file);
            let _ = writeln!(writer, "{}", log_line);
        }

        let console_output = format!(
            "{} {} {}{}",
            timestamp,
            level.as_str().to_uppercase(),
            message,
            if let Some(s) = source {
                format!(" [{}]", s)
            } else {
                String::new()
            }
        );
        match level {
            LogLevel::Debug => tracing::debug!("{}", console_output),
            LogLevel::Info => tracing::info!("{}", console_output),
            LogLevel::Warn => tracing::warn!("{}", console_output),
            LogLevel::Error => tracing::error!("{}", console_output),
        }
    }

    pub fn debug(&self, message: &str) {
        self.log(LogLevel::Debug, message, None, None);
    }

    pub fn info(&self, message: &str) {
        self.log(LogLevel::Info, message, None, None);
    }

    pub fn warn(&self, message: &str) {
        self.log(LogLevel::Warn, message, None, None);
    }

    pub fn error(&self, message: &str) {
        self.log(LogLevel::Error, message, None, None);
    }

    pub fn debug_with_meta(&self, message: &str, meta: serde_json::Value) {
        self.log(LogLevel::Debug, message, None, Some(meta));
    }

    pub fn info_with_meta(&self, message: &str, meta: serde_json::Value) {
        self.log(LogLevel::Info, message, None, Some(meta));
    }

    pub fn warn_with_meta(&self, message: &str, meta: serde_json::Value) {
        self.log(LogLevel::Warn, message, None, Some(meta));
    }

    pub fn error_with_meta(&self, message: &str, meta: serde_json::Value) {
        self.log(LogLevel::Error, message, None, Some(meta));
    }

    pub fn read_logs(&self, lines: usize) -> Vec<String> {
        let mut result: Vec<String> = Vec::new();
        let files = self.get_log_files();

        for file_path in files.into_iter().rev() {
            if result.len() >= lines {
                break;
            }
            if let Ok(file) = File::open(&file_path) {
                let reader = BufReader::new(file);
                let file_lines: Vec<String> = reader.lines().filter_map(|l| l.ok()).collect();

                for line in file_lines.into_iter().rev() {
                    if result.len() >= lines {
                        break;
                    }
                    if !line.trim().is_empty() {
                        result.push(line);
                    }
                }
            }
        }

        result.reverse();
        result
    }

    pub fn clear_logs(&self) -> Result<(), String> {
        let files = self.get_log_files();
        for file_path in files {
            let _ = fs::remove_file(file_path);
        }
        Ok(())
    }

    fn get_log_files(&self) -> Vec<PathBuf> {
        if !self.log_dir.exists() {
            return Vec::new();
        }

        let mut files: Vec<PathBuf> = match fs::read_dir(&self.log_dir) {
            Ok(entries) => entries
                .filter_map(|entry| entry.ok())
                .filter(|entry| entry.path().extension().map_or(false, |ext| ext == "log"))
                .map(|entry| entry.path())
                .collect(),
            Err(_) => Vec::new(),
        };

        files.sort_by(|a, b| {
            let meta_a = fs::metadata(a).ok();
            let meta_b = fs::metadata(b).ok();
            match (meta_a, meta_b) {
                (Some(ma), Some(mb)) => ma
                    .modified()
                    .unwrap_or(std::time::SystemTime::UNIX_EPOCH)
                    .cmp(&mb.modified().unwrap_or(std::time::SystemTime::UNIX_EPOCH)),
                _ => std::cmp::Ordering::Equal,
            }
        });

        files
    }

    pub async fn notify_level_changed(&self, app_handle: &AppHandle) {
        let _ = app_handle.emit("log:levelChanged", self.current_level.as_str());
    }
}
