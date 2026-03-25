use crate::models::{Student, StudentUpdate, StudentWithTags};
use sqlx::{SqlitePool, Postgres, Sqlite, QueryBuilder};
use sqlx::postgres::PgPool;
use chrono::Utc;

pub struct StudentRepository {
    sqlite_pool: Option<SqlitePool>,
    postgres_pool: Option<PgPool>,
}

impl StudentRepository {
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

    pub async fn find_all(&self) -> Result<Vec<StudentWithTags>, sqlx::Error> {
        if let Some(pool) = &self.sqlite_pool {
            let students = sqlx::query_as::<Sqlite, Student>(
                r#"SELECT id, name, group_name, score, reward_points, tags, extra_json, created_at, updated_at 
                   FROM students 
                   ORDER BY score DESC, name ASC"#
            )
            .fetch_all(pool)
            .await?;
            
            Ok(students.into_iter().map(StudentWithTags::from).collect())
        } else if let Some(pool) = &self.postgres_pool {
            let students = sqlx::query_as::<Postgres, Student>(
                r#"SELECT id, name, group_name, score, reward_points, tags, extra_json, created_at, updated_at 
                   FROM students 
                   ORDER BY score DESC, name ASC"#
            )
            .fetch_all(pool)
            .await?;
            
            Ok(students.into_iter().map(StudentWithTags::from).collect())
        } else {
            Ok(vec![])
        }
    }

    pub async fn create(&self, name: &str) -> Result<i32, sqlx::Error> {
        let now = Utc::now().format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string();
        let name = name.trim();
        
        if let Some(pool) = &self.sqlite_pool {
            let result = sqlx::query(
                r#"INSERT INTO students (name, group_name, score, reward_points, tags, extra_json, created_at, updated_at) 
                   VALUES (?, NULL, 0, 0, '[]', NULL, ?, ?)"#
            )
            .bind(name)
            .bind(&now)
            .bind(&now)
            .execute(pool)
            .await?;
            
            Ok(result.last_insert_rowid() as i32)
        } else if let Some(pool) = &self.postgres_pool {
            let result = sqlx::query_scalar::<Postgres, i32>(
                r#"INSERT INTO students (name, group_name, score, reward_points, tags, extra_json, created_at, updated_at) 
                   VALUES ($1, NULL, 0, 0, '[]', NULL, $2, $3) 
                   RETURNING id"#
            )
            .bind(name)
            .bind(&now)
            .bind(&now)
            .fetch_one(pool)
            .await?;
            
            Ok(result)
        } else {
            Err(sqlx::Error::PoolTimedOut)
        }
    }

    pub async fn update(&self, id: i32, data: StudentUpdate) -> Result<(), sqlx::Error> {
        let now = Utc::now().format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string();
        
        if let Some(pool) = &self.sqlite_pool {
            let mut query = QueryBuilder::new("UPDATE students SET updated_at = ");
            query.push_bind(&now);
            
            if let Some(name) = &data.name {
                query.push(", name = ");
                query.push_bind(name);
            }
            if let Some(group_name) = &data.group_name {
                let normalized = group_name.trim();
                query.push(", group_name = ");
                if normalized.is_empty() {
                    query.push("NULL");
                } else {
                    query.push_bind(normalized.to_string());
                }
            }
            if let Some(score) = data.score {
                query.push(", score = ");
                query.push_bind(score);
            }
            if let Some(reward_points) = data.reward_points {
                query.push(", reward_points = ");
                query.push_bind(reward_points);
            }
            if let Some(tags) = &data.tags {
                query.push(", tags = ");
                query.push_bind(serde_json::to_string(tags).unwrap_or_else(|_| "[]".to_string()));
            }
            if let Some(extra_json) = &data.extra_json {
                query.push(", extra_json = ");
                query.push_bind(extra_json);
            }
            
            query.push(" WHERE id = ");
            query.push_bind(id);
            
            query.build().execute(pool).await?;
        } else if let Some(pool) = &self.postgres_pool {
            let mut query = QueryBuilder::new("UPDATE students SET updated_at = ");
            query.push_bind(&now);
            
            if let Some(name) = &data.name {
                query.push(", name = ");
                query.push_bind(name);
            }
            if let Some(group_name) = &data.group_name {
                let normalized = group_name.trim();
                query.push(", group_name = ");
                if normalized.is_empty() {
                    query.push("NULL");
                } else {
                    query.push_bind(normalized.to_string());
                }
            }
            if let Some(score) = data.score {
                query.push(", score = ");
                query.push_bind(score);
            }
            if let Some(reward_points) = data.reward_points {
                query.push(", reward_points = ");
                query.push_bind(reward_points);
            }
            if let Some(tags) = &data.tags {
                query.push(", tags = ");
                query.push_bind(serde_json::to_string(tags).unwrap_or_else(|_| "[]".to_string()));
            }
            if let Some(extra_json) = &data.extra_json {
                query.push(", extra_json = ");
                query.push_bind(extra_json);
            }
            
            query.push(" WHERE id = ");
            query.push_bind(id);
            
            query.build().execute(pool).await?;
        }
        
        Ok(())
    }

    pub async fn delete(&self, id: i32) -> Result<(), sqlx::Error> {
        if let Some(pool) = &self.sqlite_pool {
            let student = sqlx::query_as::<Sqlite, Student>(
                "SELECT id, name, group_name, score, reward_points, tags, extra_json, created_at, updated_at FROM students WHERE id = ?"
            )
            .bind(id)
            .fetch_optional(pool)
            .await?;
            
            if let Some(student) = student {
                let mut tx = pool.begin().await?;
                
                sqlx::query("DELETE FROM score_events WHERE student_name = ?")
                    .bind(&student.name)
                    .execute(&mut *tx)
                    .await?;
                
                sqlx::query("DELETE FROM students WHERE id = ?")
                    .bind(id)
                    .execute(&mut *tx)
                    .await?;
                
                tx.commit().await?;
            }
        } else if let Some(pool) = &self.postgres_pool {
            let student = sqlx::query_as::<Postgres, Student>(
                "SELECT id, name, group_name, score, reward_points, tags, extra_json, created_at, updated_at FROM students WHERE id = $1"
            )
            .bind(id)
            .fetch_optional(pool)
            .await?;
            
            if let Some(student) = student {
                let mut tx = pool.begin().await?;
                
                sqlx::query("DELETE FROM score_events WHERE student_name = $1")
                    .bind(&student.name)
                    .execute(&mut *tx)
                    .await?;
                
                sqlx::query("DELETE FROM students WHERE id = $1")
                    .bind(id)
                    .execute(&mut *tx)
                    .await?;
                
                tx.commit().await?;
            }
        }
        
        Ok(())
    }

    pub async fn import_roster(&self, names: Vec<String>) -> Result<ImportResult, sqlx::Error> {
        let cleaned: Vec<String> = names
            .into_iter()
            .map(|n| n.trim().to_string())
            .filter(|n| !n.is_empty() && n.len() <= 64)
            .collect();
        
        let unique_names: Vec<String> = cleaned
            .into_iter()
            .collect::<std::collections::HashSet<_>>()
            .into_iter()
            .collect();
        
        if unique_names.is_empty() {
            return Ok(ImportResult {
                inserted: 0,
                skipped: 0,
                total: 0,
            });
        }
        
        let now = Utc::now().format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string();
        
        if let Some(pool) = &self.sqlite_pool {
            let mut tx = pool.begin().await?;
            
            let existing: Vec<String> = sqlx::query_scalar("SELECT name FROM students")
                .fetch_all(&mut *tx)
                .await?;
            
            let existing_set: std::collections::HashSet<String> = existing.into_iter().collect();
            
            let to_insert: Vec<&String> = unique_names
                .iter()
                .filter(|n| !existing_set.contains(*n))
                .collect();
            
            let inserted = to_insert.len();
            let skipped = unique_names.len() - inserted;
            
            for name in &to_insert {
                sqlx::query(
                    "INSERT INTO students (name, group_name, score, reward_points, tags, extra_json, created_at, updated_at) VALUES (?, NULL, 0, 0, '[]', NULL, ?, ?)"
                )
                .bind(name)
                .bind(&now)
                .bind(&now)
                .execute(&mut *tx)
                .await?;
            }
            
            tx.commit().await?;
            
            Ok(ImportResult {
                inserted,
                skipped,
                total: unique_names.len(),
            })
        } else if let Some(pool) = &self.postgres_pool {
            let mut tx = pool.begin().await?;
            
            let existing: Vec<String> = sqlx::query_scalar("SELECT name FROM students")
                .fetch_all(&mut *tx)
                .await?;
            
            let existing_set: std::collections::HashSet<String> = existing.into_iter().collect();
            
            let to_insert: Vec<&String> = unique_names
                .iter()
                .filter(|n| !existing_set.contains(*n))
                .collect();
            
            let inserted = to_insert.len();
            let skipped = unique_names.len() - inserted;
            
            for name in &to_insert {
                sqlx::query(
                    "INSERT INTO students (name, group_name, score, reward_points, tags, extra_json, created_at, updated_at) VALUES ($1, NULL, 0, 0, '[]', NULL, $2, $3)"
                )
                .bind(name)
                .bind(&now)
                .bind(&now)
                .execute(&mut *tx)
                .await?;
            }
            
            tx.commit().await?;
            
            Ok(ImportResult {
                inserted,
                skipped,
                total: unique_names.len(),
            })
        } else {
            Err(sqlx::Error::PoolTimedOut)
        }
    }

    pub async fn find_by_name(&self, name: &str) -> Result<Option<Student>, sqlx::Error> {
        if let Some(pool) = &self.sqlite_pool {
            sqlx::query_as::<Sqlite, Student>(
                "SELECT id, name, group_name, score, reward_points, tags, extra_json, created_at, updated_at FROM students WHERE name = ?"
            )
            .bind(name)
            .fetch_optional(pool)
            .await
        } else if let Some(pool) = &self.postgres_pool {
            sqlx::query_as::<Postgres, Student>(
                "SELECT id, name, group_name, score, reward_points, tags, extra_json, created_at, updated_at FROM students WHERE name = $1"
            )
            .bind(name)
            .fetch_optional(pool)
            .await
        } else {
            Ok(None)
        }
    }

    pub async fn update_score(&self, id: i32, score: i32) -> Result<(), sqlx::Error> {
        let now = Utc::now().format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string();
        
        if let Some(pool) = &self.sqlite_pool {
            sqlx::query("UPDATE students SET score = ?, updated_at = ? WHERE id = ?")
                .bind(score)
                .bind(&now)
                .bind(id)
                .execute(pool)
                .await?;
        } else if let Some(pool) = &self.postgres_pool {
            sqlx::query("UPDATE students SET score = $1, updated_at = $2 WHERE id = $3")
                .bind(score)
                .bind(&now)
                .bind(id)
                .execute(pool)
                .await?;
        }
        
        Ok(())
    }

    pub async fn reset_all_scores(&self) -> Result<(), sqlx::Error> {
        let now = Utc::now().format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string();
        
        if let Some(pool) = &self.sqlite_pool {
            sqlx::query("UPDATE students SET score = 0, updated_at = ?")
                .bind(&now)
                .execute(pool)
                .await?;
        } else if let Some(pool) = &self.postgres_pool {
            sqlx::query("UPDATE students SET score = 0, updated_at = $1")
                .bind(&now)
                .execute(pool)
                .await?;
        }
        
        Ok(())
    }
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ImportResult {
    pub inserted: usize,
    pub skipped: usize,
    pub total: usize,
}
