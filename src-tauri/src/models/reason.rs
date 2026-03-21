use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Reason {
    pub id: i32,
    pub content: String,
    pub category: String,
    pub delta: i32,
    pub is_system: i32,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateReason {
    pub content: String,
    pub category: String,
    pub delta: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateReason {
    pub content: Option<String>,
    pub category: Option<String>,
    pub delta: Option<i32>,
}
