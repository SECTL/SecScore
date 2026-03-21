use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Tag {
    pub id: i32,
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExportData {
    pub version: String,
    pub export_time: String,
    pub settings: serde_json::Value,
    pub students: Vec<StudentExport>,
    pub events: Vec<EventExport>,
    pub tags: Vec<Tag>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StudentExport {
    pub id: i32,
    pub name: String,
    pub tags: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EventExport {
    pub id: i32,
    pub student_id: i32,
    pub student_name: String,
    pub score_change: i32,
    pub reason: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportResult {
    pub success: bool,
    pub message: Option<String>,
    pub students_imported: Option<usize>,
    pub events_imported: Option<usize>,
}

pub struct DataService {
    tags: Vec<Tag>,
}

impl Default for DataService {
    fn default() -> Self {
        Self::new()
    }
}

impl DataService {
    pub fn new() -> Self {
        Self { tags: Vec::new() }
    }

    pub fn get_all_tags(&self) -> &[Tag] {
        &self.tags
    }

    pub fn find_tag_by_id(&self, id: i32) -> Option<&Tag> {
        self.tags.iter().find(|t| t.id == id)
    }

    pub fn find_tag_by_name(&self, name: &str) -> Option<&Tag> {
        self.tags.iter().find(|t| t.name == name)
    }

    pub fn create_tag(&mut self, name: &str) -> Tag {
        let id = self.tags.iter().map(|t| t.id).max().unwrap_or(0) + 1;
        let tag = Tag {
            id,
            name: name.to_string(),
        };
        self.tags.push(tag.clone());
        tag
    }

    pub fn find_or_create_tag(&mut self, name: &str) -> Tag {
        if let Some(tag) = self.find_tag_by_name(name) {
            tag.clone()
        } else {
            self.create_tag(name)
        }
    }

    pub fn delete_tag(&mut self, id: i32) -> bool {
        let before_len = self.tags.len();
        self.tags.retain(|t| t.id != id);
        self.tags.len() < before_len
    }

    pub fn load_tags(&mut self, tags: Vec<Tag>) {
        self.tags = tags;
    }

    pub fn export_json(
        &self,
        settings: serde_json::Value,
        students: Vec<StudentExport>,
        events: Vec<EventExport>,
    ) -> ExportData {
        ExportData {
            version: env!("CARGO_PKG_VERSION").to_string(),
            export_time: chrono::Local::now().to_rfc3339(),
            settings,
            students,
            events,
            tags: self.tags.clone(),
        }
    }

    pub fn import_json(&mut self, json: &str) -> ImportResult {
        match serde_json::from_str::<ExportData>(json) {
            Ok(data) => {
                if !data.tags.is_empty() {
                    self.tags = data.tags;
                }

                ImportResult {
                    success: true,
                    message: Some("Import successful".to_string()),
                    students_imported: Some(data.students.len()),
                    events_imported: Some(data.events.len()),
                }
            }
            Err(e) => ImportResult {
                success: false,
                message: Some(format!("Failed to parse import data: {}", e)),
                students_imported: None,
                events_imported: None,
            },
        }
    }

    pub fn validate_import_data(json: &str) -> Result<ExportData, String> {
        serde_json::from_str(json).map_err(|e| format!("Invalid import data: {}", e))
    }
}
