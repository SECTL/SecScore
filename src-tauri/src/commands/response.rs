use serde::Serialize;

#[derive(Serialize)]
pub struct IpcResponse<T> {
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<T>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
}

impl<T> IpcResponse<T> {
    pub fn success(data: T) -> Self {
        Self {
            success: true,
            data: Some(data),
            message: None,
        }
    }

    pub fn error(message: &str) -> Self {
        Self {
            success: false,
            data: None,
            message: Some(message.to_string()),
        }
    }

    pub fn failure_with_type(message: &str) -> Self {
        Self {
            success: false,
            data: None,
            message: Some(message.to_string()),
        }
    }
}

impl IpcResponse<()> {
    pub fn success_empty() -> Self {
        IpcResponse {
            success: true,
            data: None,
            message: None,
        }
    }
}

#[derive(Serialize)]
pub struct ImportResult {
    pub inserted: usize,
    pub skipped: usize,
    pub total: usize,
}

#[derive(Serialize)]
pub struct TagResponse {
    pub id: i32,
    pub name: String,
}
