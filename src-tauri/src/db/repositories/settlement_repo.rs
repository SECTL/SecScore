use crate::models::{Settlement, SettlementSummary, SettlementResult, SettlementLeaderboardRow};
use sqlx::{SqlitePool, Postgres, Sqlite};
use sqlx::postgres::PgPool;
use chrono::Utc;

pub struct SettlementRepository {
    sqlite_pool: Option<SqlitePool>,
    postgres_pool: Option<PgPool>,
}

impl SettlementRepository {
    pub fn new_sqlite(pool: SqlitePool) -> Self {
        Self {
            sqlite_pool: Some(pool),
            postgres_pool: None,
        }
    }

    pub fn new_postgres(pool: PgPool) -> Self {
        Self {
            sqlite_pool: None,
            postgres_pool: Some(pool),
        }
    }

    fn is_postgres(&self) -> bool {
        self.postgres_pool.is_some()
    }

    pub async fn find_all(&self) -> Result<Vec<SettlementSummary>, sqlx::Error> {
        if let Some(pool) = &self.sqlite_pool {
            let rows = sqlx::query_as::<Sqlite, SettlementSummary>(
                r#"SELECT s.id, s.start_time, s.end_time, 
                          (SELECT COUNT(1) FROM score_events e WHERE e.settlement_id = s.id) as event_count 
                   FROM settlements s 
                   ORDER BY julianday(s.end_time) DESC"#
            )
            .fetch_all(pool)
            .await?;
            
            Ok(rows)
        } else if let Some(pool) = &self.postgres_pool {
            let rows = sqlx::query_as::<Postgres, SettlementSummary>(
                r#"SELECT s.id, s.start_time, s.end_time, 
                          (SELECT COUNT(1) FROM score_events e WHERE e.settlement_id = s.id) as event_count 
                   FROM settlements s 
                   ORDER BY s.end_time DESC"#
            )
            .fetch_all(pool)
            .await?;
            
            Ok(rows)
        } else {
            Ok(vec![])
        }
    }

    pub async fn create(&self) -> Result<SettlementResult, SettlementError> {
        let now = Utc::now();
        let end_time = now.format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string();
        let created_at = end_time.clone();

        if let Some(pool) = &self.sqlite_pool {
            let mut tx = pool.begin().await?;
            
            let unsettled_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM score_events WHERE settlement_id IS NULL")
                .fetch_one(&mut *tx)
                .await?;
            
            if unsettled_count <= 0 {
                return Err(SettlementError::NoEventsToSettle);
            }
            
            let last_settlement_end_time: Option<String> = sqlx::query_scalar(
                "SELECT end_time FROM settlements ORDER BY julianday(end_time) DESC LIMIT 1"
            )
            .fetch_optional(&mut *tx)
            .await?;
            
            let min_event_time: Option<String> = sqlx::query_scalar(
                "SELECT MIN(event_time) FROM score_events WHERE settlement_id IS NULL"
            )
            .fetch_optional(&mut *tx)
            .await?;
            
            let start_time = last_settlement_end_time
                .or(min_event_time)
                .unwrap_or_else(|| end_time.clone());
            
            let result = sqlx::query(
                "INSERT INTO settlements (start_time, end_time, created_at) VALUES (?, ?, ?)"
            )
            .bind(&start_time)
            .bind(&end_time)
            .bind(&created_at)
            .execute(&mut *tx)
            .await?;
            
            let settlement_id = result.last_insert_rowid() as i32;
            
            sqlx::query("UPDATE score_events SET settlement_id = ? WHERE settlement_id IS NULL")
                .bind(settlement_id)
                .execute(&mut *tx)
                .await?;
            
            sqlx::query("UPDATE students SET score = 0, updated_at = ?")
                .bind(&end_time)
                .execute(&mut *tx)
                .await?;
            
            tx.commit().await?;
            
            Ok(SettlementResult {
                settlement_id,
                start_time,
                end_time,
                event_count: unsettled_count,
            })
        } else if let Some(pool) = &self.postgres_pool {
            let mut tx = pool.begin().await?;
            
            let unsettled_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM score_events WHERE settlement_id IS NULL")
                .fetch_one(&mut *tx)
                .await?;
            
            if unsettled_count <= 0 {
                return Err(SettlementError::NoEventsToSettle);
            }
            
            let last_settlement_end_time: Option<String> = sqlx::query_scalar(
                "SELECT end_time FROM settlements ORDER BY end_time DESC LIMIT 1"
            )
            .fetch_optional(&mut *tx)
            .await?;
            
            let min_event_time: Option<String> = sqlx::query_scalar(
                "SELECT MIN(event_time) FROM score_events WHERE settlement_id IS NULL"
            )
            .fetch_optional(&mut *tx)
            .await?;
            
            let start_time = last_settlement_end_time
                .or(min_event_time)
                .unwrap_or_else(|| end_time.clone());
            
            let settlement_id = sqlx::query_scalar::<Postgres, i32>(
                "INSERT INTO settlements (start_time, end_time, created_at) VALUES ($1, $2, $3) RETURNING id"
            )
            .bind(&start_time)
            .bind(&end_time)
            .bind(&created_at)
            .fetch_one(&mut *tx)
            .await?;
            
            sqlx::query("UPDATE score_events SET settlement_id = $1 WHERE settlement_id IS NULL")
                .bind(settlement_id)
                .execute(&mut *tx)
                .await?;
            
            sqlx::query("UPDATE students SET score = 0, updated_at = $1")
                .bind(&end_time)
                .execute(&mut *tx)
                .await?;
            
            tx.commit().await?;
            
            Ok(SettlementResult {
                settlement_id,
                start_time,
                end_time,
                event_count: unsettled_count,
            })
        } else {
            Err(SettlementError::DatabaseError(sqlx::Error::PoolTimedOut))
        }
    }

    pub async fn get_leaderboard(&self, settlement_id: i32) -> Result<SettlementLeaderboard, SettlementError> {
        if let Some(pool) = &self.sqlite_pool {
            let settlement: Option<Settlement> = sqlx::query_as(
                "SELECT id, start_time, end_time, created_at FROM settlements WHERE id = ?"
            )
            .bind(settlement_id)
            .fetch_optional(pool)
            .await?;
            
            let settlement = settlement.ok_or(SettlementError::NotFound)?;
            
            let rows = sqlx::query_as::<Sqlite, SettlementLeaderboardRow>(
                r#"SELECT student_name as name, COALESCE(SUM(delta), 0) as score 
                   FROM score_events 
                   WHERE settlement_id = ? 
                   GROUP BY student_name 
                   ORDER BY score DESC, name ASC"#
            )
            .bind(settlement_id)
            .fetch_all(pool)
            .await?;
            
            Ok(SettlementLeaderboard {
                settlement: SettlementInfo {
                    id: settlement.id,
                    start_time: settlement.start_time,
                    end_time: settlement.end_time,
                },
                rows,
            })
        } else if let Some(pool) = &self.postgres_pool {
            let settlement: Option<Settlement> = sqlx::query_as(
                "SELECT id, start_time, end_time, created_at FROM settlements WHERE id = $1"
            )
            .bind(settlement_id)
            .fetch_optional(pool)
            .await?;
            
            let settlement = settlement.ok_or(SettlementError::NotFound)?;
            
            let rows = sqlx::query_as::<Postgres, SettlementLeaderboardRow>(
                r#"SELECT student_name as name, COALESCE(SUM(delta), 0) as score 
                   FROM score_events 
                   WHERE settlement_id = $1 
                   GROUP BY student_name 
                   ORDER BY score DESC, name ASC"#
            )
            .bind(settlement_id)
            .fetch_all(pool)
            .await?;
            
            Ok(SettlementLeaderboard {
                settlement: SettlementInfo {
                    id: settlement.id,
                    start_time: settlement.start_time,
                    end_time: settlement.end_time,
                },
                rows,
            })
        } else {
            Err(SettlementError::DatabaseError(sqlx::Error::PoolTimedOut))
        }
    }

    pub async fn find_by_id(&self, id: i32) -> Result<Option<Settlement>, sqlx::Error> {
        if let Some(pool) = &self.sqlite_pool {
            sqlx::query_as::<Sqlite, Settlement>(
                "SELECT id, start_time, end_time, created_at FROM settlements WHERE id = ?"
            )
            .bind(id)
            .fetch_optional(pool)
            .await
        } else if let Some(pool) = &self.postgres_pool {
            sqlx::query_as::<Postgres, Settlement>(
                "SELECT id, start_time, end_time, created_at FROM settlements WHERE id = $1"
            )
            .bind(id)
            .fetch_optional(pool)
            .await
        } else {
            Ok(None)
        }
    }
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct SettlementInfo {
    pub id: i32,
    pub start_time: String,
    pub end_time: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct SettlementLeaderboard {
    pub settlement: SettlementInfo,
    pub rows: Vec<SettlementLeaderboardRow>,
}

#[derive(Debug)]
pub enum SettlementError {
    NotFound,
    NoEventsToSettle,
    DatabaseError(sqlx::Error),
}

impl From<sqlx::Error> for SettlementError {
    fn from(err: sqlx::Error) -> Self {
        SettlementError::DatabaseError(err)
    }
}

impl std::fmt::Display for SettlementError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            SettlementError::NotFound => write!(f, "结算记录不存在"),
            SettlementError::NoEventsToSettle => write!(f, "暂无可结算记录"),
            SettlementError::DatabaseError(e) => write!(f, "Database error: {}", e),
        }
    }
}

impl std::error::Error for SettlementError {}
