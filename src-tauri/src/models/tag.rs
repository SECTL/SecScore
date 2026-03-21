use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Tag {
    pub id: i32,
    pub name: String,
    pub created_at: String,
    pub updated_at: String,
}
