use crate::models::{ScoreEvent, CreateScoreEvent};
use sqlx::{SqlitePool, Postgres, Sqlite};
use sqlx::postgres::PgPool;
use chrono::Utc;
use uuid::Uuid;

pub struct EventRepository {
    sqlite_pool: Option<SqlitePool>,
    postgres_pool: Option<PgPool>,
}

impl EventRepository {
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

    pub async fn find_all(&self, limit: i32) -> Result<Vec<ScoreEvent>, sqlx::Error> {
        if let Some(pool) = &self.sqlite_pool {
            sqlx::query_as::<Sqlite, ScoreEvent>(
                r#"SELECT id, uuid, student_name, reason_content, delta, val_prev, val_curr, event_time, settlement_id 
                   FROM score_events 
                   WHERE settlement_id IS NULL 
                   ORDER BY event_time DESC 
                   LIMIT ?"#
            )
            .bind(limit)
            .fetch_all(pool)
            .await
        } else if let Some(pool) = &self.postgres_pool {
            sqlx::query_as::<Postgres, ScoreEvent>(
                r#"SELECT id, uuid, student_name, reason_content, delta, val_prev, val_curr, event_time, settlement_id 
                   FROM score_events 
                   WHERE settlement_id IS NULL 
                   ORDER BY event_time DESC 
                   LIMIT $1"#
            )
            .bind(limit)
            .fetch_all(pool)
            .await
        } else {
            Ok(vec![])
        }
    }

    pub async fn create(&self, event: CreateScoreEvent) -> Result<i32, sqlx::Error> {
        let student_name = event.student_name.trim();
        let reason_content = event.reason_content.trim();
        let delta = event.delta;
        let uuid = Uuid::new_v4().to_string();
        let event_time = Utc::now().format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string();
        let now = Utc::now().format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string();

        if let Some(pool) = &self.sqlite_pool {
            let mut tx = pool.begin().await?;
            
            let student: Option<(i32, i32)> = sqlx::query_as(
                "SELECT id, score FROM students WHERE name = ?"
            )
            .bind(student_name)
            .fetch_optional(&mut *tx)
            .await?;
            
            let student = student.ok_or_else(|| sqlx::Error::RowNotFound)?;
            let val_prev = student.1;
            let val_curr = val_prev + delta;
            
            let result = sqlx::query(
                r#"INSERT INTO score_events (uuid, student_name, reason_content, delta, val_prev, val_curr, event_time, settlement_id) 
                   VALUES (?, ?, ?, ?, ?, ?, ?, NULL)"#
            )
            .bind(&uuid)
            .bind(student_name)
            .bind(reason_content)
            .bind(delta)
            .bind(val_prev)
            .bind(val_curr)
            .bind(&event_time)
            .execute(&mut *tx)
            .await?;
            
            let event_id = result.last_insert_rowid() as i32;
            
            sqlx::query("UPDATE students SET score = ?, updated_at = ? WHERE id = ?")
                .bind(val_curr)
                .bind(&now)
                .bind(student.0)
                .execute(&mut *tx)
                .await?;
            
            tx.commit().await?;
            
            Ok(event_id)
        } else if let Some(pool) = &self.postgres_pool {
            let mut tx = pool.begin().await?;
            
            let student: Option<(i32, i32)> = sqlx::query_as(
                "SELECT id, score FROM students WHERE name = $1"
            )
            .bind(student_name)
            .fetch_optional(&mut *tx)
            .await?;
            
            let student = student.ok_or_else(|| sqlx::Error::RowNotFound)?;
            let val_prev = student.1;
            let val_curr = val_prev + delta;
            
            let event_id = sqlx::query_scalar::<Postgres, i32>(
                r#"INSERT INTO score_events (uuid, student_name, reason_content, delta, val_prev, val_curr, event_time, settlement_id) 
                   VALUES ($1, $2, $3, $4, $5, $6, $7, NULL) 
                   RETURNING id"#
            )
            .bind(&uuid)
            .bind(student_name)
            .bind(reason_content)
            .bind(delta)
            .bind(val_prev)
            .bind(val_curr)
            .bind(&event_time)
            .fetch_one(&mut *tx)
            .await?;
            
            sqlx::query("UPDATE students SET score = $1, updated_at = $2 WHERE id = $3")
                .bind(val_curr)
                .bind(&now)
                .bind(student.0)
                .execute(&mut *tx)
                .await?;
            
            tx.commit().await?;
            
            Ok(event_id)
        } else {
            Err(sqlx::Error::PoolTimedOut)
        }
    }

    pub async fn delete_by_uuid(&self, uuid: &str) -> Result<(), EventError> {
        let uuid = uuid.trim();
        let now = Utc::now().format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string();

        if let Some(pool) = &self.sqlite_pool {
            let mut tx = pool.begin().await?;
            
            let event: Option<ScoreEvent> = sqlx::query_as(
                "SELECT id, uuid, student_name, reason_content, delta, val_prev, val_curr, event_time, settlement_id FROM score_events WHERE uuid = ?"
            )
            .bind(uuid)
            .fetch_optional(&mut *tx)
            .await?;
            
            let event = event.ok_or(EventError::NotFound)?;
            
            if event.settlement_id.is_some() {
                return Err(EventError::AlreadySettled);
            }
            
            let student: Option<(i32, i32)> = sqlx::query_as(
                "SELECT id, score FROM students WHERE name = ?"
            )
            .bind(&event.student_name)
            .fetch_optional(&mut *tx)
            .await?;
            
            if let Some(student) = student {
                let new_score = student.1 - event.delta;
                sqlx::query("UPDATE students SET score = ?, updated_at = ? WHERE id = ?")
                    .bind(new_score)
                    .bind(&now)
                    .bind(student.0)
                    .execute(&mut *tx)
                    .await?;
            }
            
            sqlx::query("DELETE FROM score_events WHERE uuid = ?")
                .bind(uuid)
                .execute(&mut *tx)
                .await?;
            
            tx.commit().await?;
            
            Ok(())
        } else if let Some(pool) = &self.postgres_pool {
            let mut tx = pool.begin().await?;
            
            let event: Option<ScoreEvent> = sqlx::query_as(
                "SELECT id, uuid, student_name, reason_content, delta, val_prev, val_curr, event_time, settlement_id FROM score_events WHERE uuid = $1"
            )
            .bind(uuid)
            .fetch_optional(&mut *tx)
            .await?;
            
            let event = event.ok_or(EventError::NotFound)?;
            
            if event.settlement_id.is_some() {
                return Err(EventError::AlreadySettled);
            }
            
            let student: Option<(i32, i32)> = sqlx::query_as(
                "SELECT id, score FROM students WHERE name = $1"
            )
            .bind(&event.student_name)
            .fetch_optional(&mut *tx)
            .await?;
            
            if let Some(student) = student {
                let new_score = student.1 - event.delta;
                sqlx::query("UPDATE students SET score = $1, updated_at = $2 WHERE id = $3")
                    .bind(new_score)
                    .bind(&now)
                    .bind(student.0)
                    .execute(&mut *tx)
                    .await?;
            }
            
            sqlx::query("DELETE FROM score_events WHERE uuid = $1")
                .bind(uuid)
                .execute(&mut *tx)
                .await?;
            
            tx.commit().await?;
            
            Ok(())
        } else {
            Err(EventError::DatabaseError(sqlx::Error::PoolTimedOut))
        }
    }

    pub async fn query_by_student(
        &self,
        student_name: &str,
        start_time: Option<&str>,
        limit: i32,
    ) -> Result<Vec<ScoreEvent>, sqlx::Error> {
        if let Some(pool) = &self.sqlite_pool {
            if let Some(start) = start_time {
                sqlx::query_as::<Sqlite, ScoreEvent>(
                    r#"SELECT id, uuid, student_name, reason_content, delta, val_prev, val_curr, event_time, settlement_id 
                       FROM score_events 
                       WHERE student_name = ? AND settlement_id IS NULL AND julianday(event_time) >= julianday(?) 
                       ORDER BY event_time DESC 
                       LIMIT ?"#
                )
                .bind(student_name)
                .bind(start)
                .bind(limit)
                .fetch_all(pool)
                .await
            } else {
                sqlx::query_as::<Sqlite, ScoreEvent>(
                    r#"SELECT id, uuid, student_name, reason_content, delta, val_prev, val_curr, event_time, settlement_id 
                       FROM score_events 
                       WHERE student_name = ? AND settlement_id IS NULL 
                       ORDER BY event_time DESC 
                       LIMIT ?"#
                )
                .bind(student_name)
                .bind(limit)
                .fetch_all(pool)
                .await
            }
        } else if let Some(pool) = &self.postgres_pool {
            if let Some(start) = start_time {
                sqlx::query_as::<Postgres, ScoreEvent>(
                    r#"SELECT id, uuid, student_name, reason_content, delta, val_prev, val_curr, event_time, settlement_id 
                       FROM score_events 
                       WHERE student_name = $1 AND settlement_id IS NULL AND event_time >= $2 
                       ORDER BY event_time DESC 
                       LIMIT $3"#
                )
                .bind(student_name)
                .bind(start)
                .bind(limit)
                .fetch_all(pool)
                .await
            } else {
                sqlx::query_as::<Postgres, ScoreEvent>(
                    r#"SELECT id, uuid, student_name, reason_content, delta, val_prev, val_curr, event_time, settlement_id 
                       FROM score_events 
                       WHERE student_name = $1 AND settlement_id IS NULL 
                       ORDER BY event_time DESC 
                       LIMIT $2"#
                )
                .bind(student_name)
                .bind(limit)
                .fetch_all(pool)
                .await
            }
        } else {
            Ok(vec![])
        }
    }

    pub async fn query_leaderboard(&self, range: &str) -> Result<LeaderboardResult, sqlx::Error> {
        let now = Utc::now();
        let start = match range {
            "today" => {
                let mut s = now;
                s = s.with_hour(0).unwrap_or(s);
                s = s.with_minute(0).unwrap_or(s);
                s = s.with_second(0).unwrap_or(s);
                s = s.with_nanosecond(0).unwrap_or(s);
                s
            }
            "week" => {
                let mut s = now;
                let day = s.weekday().num_days_from_monday() as i64;
                s = s - chrono::Duration::days(day);
                s = s.with_hour(0).unwrap_or(s);
                s = s.with_minute(0).unwrap_or(s);
                s = s.with_second(0).unwrap_or(s);
                s = s.with_nanosecond(0).unwrap_or(s);
                s
            }
            "month" => {
                let s = now.with_day0(0).unwrap_or(now);
                let mut s = s.with_hour(0).unwrap_or(s);
                s = s.with_minute(0).unwrap_or(s);
                s = s.with_second(0).unwrap_or(s);
                s = s.with_nanosecond(0).unwrap_or(s);
                s
            }
            _ => {
                let mut s = now;
                s = s.with_hour(0).unwrap_or(s);
                s = s.with_minute(0).unwrap_or(s);
                s = s.with_second(0).unwrap_or(s);
                s = s.with_nanosecond(0).unwrap_or(s);
                s
            }
        };
        
        let start_time = start.format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string();

        if let Some(pool) = &self.sqlite_pool {
            let rows = sqlx::query_as::<Sqlite, LeaderboardRow>(
                r#"SELECT s.id, s.name, s.score, COALESCE(SUM(e.delta), 0) as range_change 
                   FROM students s 
                   LEFT JOIN score_events e ON e.student_name = s.name 
                   AND e.settlement_id IS NULL 
                   AND julianday(e.event_time) >= julianday(?) 
                   GROUP BY s.id, s.name, s.score 
                   ORDER BY s.score DESC, range_change DESC, s.name ASC"#
            )
            .bind(&start_time)
            .fetch_all(pool)
            .await?;
            
            Ok(LeaderboardResult { start_time, rows })
        } else if let Some(pool) = &self.postgres_pool {
            let rows = sqlx::query_as::<Postgres, LeaderboardRow>(
                r#"SELECT s.id, s.name, s.score, COALESCE(SUM(e.delta), 0) as range_change 
                   FROM students s 
                   LEFT JOIN score_events e ON e.student_name = s.name 
                   AND e.settlement_id IS NULL 
                   AND e.event_time >= $1 
                   GROUP BY s.id, s.name, s.score 
                   ORDER BY s.score DESC, range_change DESC, s.name ASC"#
            )
            .bind(&start_time)
            .fetch_all(pool)
            .await?;
            
            Ok(LeaderboardResult { start_time, rows })
        } else {
            Ok(LeaderboardResult {
                start_time,
                rows: vec![],
            })
        }
    }

    pub async fn get_last_score_time_by_students(
        &self,
        student_names: &[String],
    ) -> Result<std::collections::HashMap<String, String>, sqlx::Error> {
        if student_names.is_empty() {
            return Ok(std::collections::HashMap::new());
        }

        if let Some(pool) = &self.sqlite_pool {
            let placeholders: Vec<String> = student_names.iter().map(|_| "?".to_string()).collect();
            let sql = format!(
                "SELECT student_name, MAX(event_time) as last_time FROM score_events WHERE student_name IN ({}) GROUP BY student_name",
                placeholders.join(", ")
            );
            
            let mut query = sqlx::query_as::<Sqlite, (String, String)>(&sql);
            for name in student_names {
                query = query.bind(name);
            }
            
            let results = query.fetch_all(pool).await?;
            
            Ok(results.into_iter().collect())
        } else if let Some(pool) = &self.postgres_pool {
            let placeholders: Vec<String> = student_names.iter().enumerate().map(|(i, _)| format!("${}", i + 1)).collect();
            let sql = format!(
                "SELECT student_name, MAX(event_time) as last_time FROM score_events WHERE student_name IN ({}) GROUP BY student_name",
                placeholders.join(", ")
            );
            
            let mut query = sqlx::query_as::<Postgres, (String, String)>(&sql);
            for name in student_names {
                query = query.bind(name);
            }
            
            let results = query.fetch_all(pool).await?;
            
            Ok(results.into_iter().collect())
        } else {
            Ok(std::collections::HashMap::new())
        }
    }

    pub async fn count_unsettled(&self) -> Result<i64, sqlx::Error> {
        if let Some(pool) = &self.sqlite_pool {
            let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM score_events WHERE settlement_id IS NULL")
                .fetch_one(pool)
                .await?;
            Ok(count)
        } else if let Some(pool) = &self.postgres_pool {
            let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM score_events WHERE settlement_id IS NULL")
                .fetch_one(pool)
                .await?;
            Ok(count)
        } else {
            Ok(0)
        }
    }

    pub async fn mark_all_as_settled(&self, settlement_id: i32) -> Result<(), sqlx::Error> {
        if let Some(pool) = &self.sqlite_pool {
            sqlx::query("UPDATE score_events SET settlement_id = ? WHERE settlement_id IS NULL")
                .bind(settlement_id)
                .execute(pool)
                .await?;
        } else if let Some(pool) = &self.postgres_pool {
            sqlx::query("UPDATE score_events SET settlement_id = $1 WHERE settlement_id IS NULL")
                .bind(settlement_id)
                .execute(pool)
                .await?;
        }
        Ok(())
    }

    pub async fn get_min_event_time(&self) -> Result<Option<String>, sqlx::Error> {
        if let Some(pool) = &self.sqlite_pool {
            sqlx::query_scalar("SELECT MIN(event_time) FROM score_events WHERE settlement_id IS NULL")
                .fetch_optional(pool)
                .await
        } else if let Some(pool) = &self.postgres_pool {
            sqlx::query_scalar("SELECT MIN(event_time) FROM score_events WHERE settlement_id IS NULL")
                .fetch_optional(pool)
                .await
        } else {
            Ok(None)
        }
    }
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct LeaderboardRow {
    pub id: i32,
    pub name: String,
    pub score: i32,
    pub range_change: i64,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct LeaderboardResult {
    pub start_time: String,
    pub rows: Vec<LeaderboardRow>,
}

#[derive(Debug)]
pub enum EventError {
    NotFound,
    AlreadySettled,
    DatabaseError(sqlx::Error),
}

impl From<sqlx::Error> for EventError {
    fn from(err: sqlx::Error) -> Self {
        EventError::DatabaseError(err)
    }
}

impl std::fmt::Display for EventError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            EventError::NotFound => write!(f, "Event not found"),
            EventError::AlreadySettled => write!(f, "该记录已结算，无法撤销"),
            EventError::DatabaseError(e) => write!(f, "Database error: {}", e),
        }
    }
}

impl std::error::Error for EventError {}
