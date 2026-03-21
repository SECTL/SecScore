use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct StudentTag {
    pub id: i32,
    pub student_id: i32,
    pub tag_id: i32,
    pub created_at: String,
}
