use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Settlement {
    pub id: i32,
    pub start_time: String,
    pub end_time: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SettlementSummary {
    pub id: i32,
    pub start_time: String,
    pub end_time: String,
    pub event_count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SettlementResult {
    pub settlement_id: i32,
    pub start_time: String,
    pub end_time: String,
    pub event_count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct SettlementLeaderboardRow {
    pub name: String,
    pub score: i64,
}
