use crate::models::{Tag, StudentTag};
use sqlx::{SqlitePool, Postgres, Sqlite};
use sqlx::postgres::PgPool;
use chrono::Utc;

pub struct TagRepository {
    sqlite_pool: Option<SqlitePool>,
    postgres_pool: Option<PgPool>,
}

impl TagRepository {
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

    pub async fn find_all(&self) -> Result<Vec<Tag>, sqlx::Error> {
        if let Some(pool) = &self.sqlite_pool {
            sqlx::query_as::<Sqlite, Tag>(
                "SELECT id, name, created_at, updated_at FROM tags ORDER BY created_at ASC"
            )
            .fetch_all(pool)
            .await
        } else if let Some(pool) = &self.postgres_pool {
            sqlx::query_as::<Postgres, Tag>(
                "SELECT id, name, created_at, updated_at FROM tags ORDER BY created_at ASC"
            )
            .fetch_all(pool)
            .await
        } else {
            Ok(vec![])
        }
    }

    pub async fn find_by_name(&self, name: &str) -> Result<Option<Tag>, sqlx::Error> {
        if let Some(pool) = &self.sqlite_pool {
            sqlx::query_as::<Sqlite, Tag>(
                "SELECT id, name, created_at, updated_at FROM tags WHERE name = ?"
            )
            .bind(name)
            .fetch_optional(pool)
            .await
        } else if let Some(pool) = &self.postgres_pool {
            sqlx::query_as::<Postgres, Tag>(
                "SELECT id, name, created_at, updated_at FROM tags WHERE name = $1"
            )
            .bind(name)
            .fetch_optional(pool)
            .await
        } else {
            Ok(None)
        }
    }

    pub async fn create(&self, name: &str) -> Result<Tag, sqlx::Error> {
        let now = Utc::now().format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string();
        
        if let Some(pool) = &self.sqlite_pool {
            let result = sqlx::query(
                "INSERT INTO tags (name, created_at, updated_at) VALUES (?, ?, ?)"
            )
            .bind(name)
            .bind(&now)
            .bind(&now)
            .execute(pool)
            .await?;
            
            Ok(Tag {
                id: result.last_insert_rowid() as i32,
                name: name.to_string(),
                created_at: now,
                updated_at: now,
            })
        } else if let Some(pool) = &self.postgres_pool {
            let id = sqlx::query_scalar::<Postgres, i32>(
                "INSERT INTO tags (name, created_at, updated_at) VALUES ($1, $2, $3) RETURNING id"
            )
            .bind(name)
            .bind(&now)
            .bind(&now)
            .fetch_one(pool)
            .await?;
            
            Ok(Tag {
                id,
                name: name.to_string(),
                created_at: now,
                updated_at: now,
            })
        } else {
            Err(sqlx::Error::PoolTimedOut)
        }
    }

    pub async fn find_or_create(&self, name: &str) -> Result<Tag, sqlx::Error> {
        if let Some(tag) = self.find_by_name(name).await? {
            return Ok(tag);
        }
        self.create(name).await
    }

    pub async fn delete(&self, id: i32) -> Result<bool, sqlx::Error> {
        if let Some(pool) = &self.sqlite_pool {
            let result = sqlx::query("DELETE FROM tags WHERE id = ?")
                .bind(id)
                .execute(pool)
                .await?;
            
            Ok(result.rows_affected() == 1)
        } else if let Some(pool) = &self.postgres_pool {
            let result = sqlx::query("DELETE FROM tags WHERE id = $1")
                .bind(id)
                .execute(pool)
                .await?;
            
            Ok(result.rows_affected() == 1)
        } else {
            Err(sqlx::Error::PoolTimedOut)
        }
    }

    pub async fn find_by_student(&self, student_id: i32) -> Result<Vec<Tag>, sqlx::Error> {
        if let Some(pool) = &self.sqlite_pool {
            sqlx::query_as::<Sqlite, Tag>(
                r#"SELECT t.id, t.name, t.created_at, t.updated_at 
                   FROM tags t 
                   INNER JOIN student_tags st ON t.id = st.tag_id 
                   WHERE st.student_id = ? 
                   ORDER BY st.created_at ASC"#
            )
            .bind(student_id)
            .fetch_all(pool)
            .await
        } else if let Some(pool) = &self.postgres_pool {
            sqlx::query_as::<Postgres, Tag>(
                r#"SELECT t.id, t.name, t.created_at, t.updated_at 
                   FROM tags t 
                   INNER JOIN student_tags st ON t.id = st.tag_id 
                   WHERE st.student_id = $1 
                   ORDER BY st.created_at ASC"#
            )
            .bind(student_id)
            .fetch_all(pool)
            .await
        } else {
            Ok(vec![])
        }
    }

    pub async fn add_tag_to_student(&self, student_id: i32, tag_id: i32) -> Result<(), sqlx::Error> {
        let now = Utc::now().format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string();
        
        if let Some(pool) = &self.sqlite_pool {
            let exists: Option<i32> = sqlx::query_scalar(
                "SELECT id FROM student_tags WHERE student_id = ? AND tag_id = ?"
            )
            .bind(student_id)
            .bind(tag_id)
            .fetch_optional(pool)
            .await?;
            
            if exists.is_none() {
                sqlx::query(
                    "INSERT INTO student_tags (student_id, tag_id, created_at) VALUES (?, ?, ?)"
                )
                .bind(student_id)
                .bind(tag_id)
                .bind(&now)
                .execute(pool)
                .await?;
            }
        } else if let Some(pool) = &self.postgres_pool {
            let exists: Option<i32> = sqlx::query_scalar(
                "SELECT id FROM student_tags WHERE student_id = $1 AND tag_id = $2"
            )
            .bind(student_id)
            .bind(tag_id)
            .fetch_optional(pool)
            .await?;
            
            if exists.is_none() {
                sqlx::query(
                    "INSERT INTO student_tags (student_id, tag_id, created_at) VALUES ($1, $2, $3)"
                )
                .bind(student_id)
                .bind(tag_id)
                .bind(&now)
                .execute(pool)
                .await?;
            }
        }
        
        Ok(())
    }

    pub async fn remove_tag_from_student(&self, student_id: i32, tag_id: i32) -> Result<(), sqlx::Error> {
        if let Some(pool) = &self.sqlite_pool {
            sqlx::query("DELETE FROM student_tags WHERE student_id = ? AND tag_id = ?")
                .bind(student_id)
                .bind(tag_id)
                .execute(pool)
                .await?;
        } else if let Some(pool) = &self.postgres_pool {
            sqlx::query("DELETE FROM student_tags WHERE student_id = $1 AND tag_id = $2")
                .bind(student_id)
                .bind(tag_id)
                .execute(pool)
                .await?;
        }
        
        Ok(())
    }

    pub async fn update_student_tags(&self, student_id: i32, tag_ids: &[i32]) -> Result<(), sqlx::Error> {
        let now = Utc::now().format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string();
        
        if let Some(pool) = &self.sqlite_pool {
            let mut tx = pool.begin().await?;
            
            sqlx::query("DELETE FROM student_tags WHERE student_id = ?")
                .bind(student_id)
                .execute(&mut *tx)
                .await?;
            
            for tag_id in tag_ids {
                sqlx::query(
                    "INSERT INTO student_tags (student_id, tag_id, created_at) VALUES (?, ?, ?)"
                )
                .bind(student_id)
                .bind(tag_id)
                .bind(&now)
                .execute(&mut *tx)
                .await?;
            }
            
            tx.commit().await?;
        } else if let Some(pool) = &self.postgres_pool {
            let mut tx = pool.begin().await?;
            
            sqlx::query("DELETE FROM student_tags WHERE student_id = $1")
                .bind(student_id)
                .execute(&mut *tx)
                .await?;
            
            for tag_id in tag_ids {
                sqlx::query(
                    "INSERT INTO student_tags (student_id, tag_id, created_at) VALUES ($1, $2, $3)"
                )
                .bind(student_id)
                .bind(tag_id)
                .bind(&now)
                .execute(&mut *tx)
                .await?;
            }
            
            tx.commit().await?;
        }
        
        Ok(())
    }

    pub async fn find_by_id(&self, id: i32) -> Result<Option<Tag>, sqlx::Error> {
        if let Some(pool) = &self.sqlite_pool {
            sqlx::query_as::<Sqlite, Tag>(
                "SELECT id, name, created_at, updated_at FROM tags WHERE id = ?"
            )
            .bind(id)
            .fetch_optional(pool)
            .await
        } else if let Some(pool) = &self.postgres_pool {
            sqlx::query_as::<Postgres, Tag>(
                "SELECT id, name, created_at, updated_at FROM tags WHERE id = $1"
            )
            .bind(id)
            .fetch_optional(pool)
            .await
        } else {
            Ok(None)
        }
    }
}
