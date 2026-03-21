use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct ScoreEvent {
    pub id: i32,
    pub uuid: String,
    pub student_name: String,
    pub reason_content: String,
    pub delta: i32,
    pub val_prev: i32,
    pub val_curr: i32,
    pub event_time: String,
    pub settlement_id: Option<i32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateScoreEvent {
    pub student_name: String,
    pub reason_content: String,
    pub delta: i32,
}
