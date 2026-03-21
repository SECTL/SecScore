use crate::models::{Reason, CreateReason, UpdateReason};
use sqlx::{SqlitePool, Postgres, Sqlite, QueryBuilder};
use sqlx::postgres::PgPool;
use chrono::Utc;

pub struct ReasonRepository {
    sqlite_pool: Option<SqlitePool>,
    postgres_pool: Option<PgPool>,
}

impl ReasonRepository {
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

    pub async fn find_all(&self) -> Result<Vec<Reason>, sqlx::Error> {
        if let Some(pool) = &self.sqlite_pool {
            sqlx::query_as::<Sqlite, Reason>(
                r#"SELECT id, content, category, delta, is_system, updated_at 
                   FROM reasons 
                   ORDER BY category ASC, content ASC"#
            )
            .fetch_all(pool)
            .await
        } else if let Some(pool) = &self.postgres_pool {
            sqlx::query_as::<Postgres, Reason>(
                r#"SELECT id, content, category, delta, is_system, updated_at 
                   FROM reasons 
                   ORDER BY category ASC, content ASC"#
            )
            .fetch_all(pool)
            .await
        } else {
            Ok(vec![])
        }
    }

    pub async fn create(&self, reason: CreateReason) -> Result<i32, sqlx::Error> {
        let now = Utc::now().format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string();
        let content = reason.content.trim();
        let category = reason.category.trim();
        
        if let Some(pool) = &self.sqlite_pool {
            let result = sqlx::query(
                r#"INSERT INTO reasons (content, category, delta, is_system, updated_at) 
                   VALUES (?, ?, ?, 0, ?)"#
            )
            .bind(content)
            .bind(category)
            .bind(reason.delta)
            .bind(&now)
            .execute(pool)
            .await?;
            
            Ok(result.last_insert_rowid() as i32)
        } else if let Some(pool) = &self.postgres_pool {
            let result = sqlx::query_scalar::<Postgres, i32>(
                r#"INSERT INTO reasons (content, category, delta, is_system, updated_at) 
                   VALUES ($1, $2, $3, 0, $4) 
                   RETURNING id"#
            )
            .bind(content)
            .bind(category)
            .bind(reason.delta)
            .bind(&now)
            .fetch_one(pool)
            .await?;
            
            Ok(result)
        } else {
            Err(sqlx::Error::PoolTimedOut)
        }
    }

    pub async fn update(&self, id: i32, reason: UpdateReason) -> Result<(), sqlx::Error> {
        let now = Utc::now().format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string();
        
        if let Some(pool) = &self.sqlite_pool {
            let mut query = QueryBuilder::new("UPDATE reasons SET updated_at = ");
            query.push_bind(&now);
            
            if let Some(content) = &reason.content {
                query.push(", content = ");
                query.push_bind(content);
            }
            if let Some(category) = &reason.category {
                query.push(", category = ");
                query.push_bind(category);
            }
            if let Some(delta) = reason.delta {
                query.push(", delta = ");
                query.push_bind(delta);
            }
            
            query.push(" WHERE id = ");
            query.push_bind(id);
            
            query.build().execute(pool).await?;
        } else if let Some(pool) = &self.postgres_pool {
            let mut query = QueryBuilder::new("UPDATE reasons SET updated_at = ");
            query.push_bind(&now);
            
            if let Some(content) = &reason.content {
                query.push(", content = ");
                query.push_bind(content);
            }
            if let Some(category) = &reason.category {
                query.push(", category = ");
                query.push_bind(category);
            }
            if let Some(delta) = reason.delta {
                query.push(", delta = ");
                query.push_bind(delta);
            }
            
            query.push(" WHERE id = ");
            query.push_bind(id);
            
            query.build().execute(pool).await?;
        }
        
        Ok(())
    }

    pub async fn delete(&self, id: i32) -> Result<u64, sqlx::Error> {
        if let Some(pool) = &self.sqlite_pool {
            let result = sqlx::query("DELETE FROM reasons WHERE id = ?")
                .bind(id)
                .execute(pool)
                .await?;
            
            Ok(result.rows_affected())
        } else if let Some(pool) = &self.postgres_pool {
            let result = sqlx::query("DELETE FROM reasons WHERE id = $1")
                .bind(id)
                .execute(pool)
                .await?;
            
            Ok(result.rows_affected())
        } else {
            Err(sqlx::Error::PoolTimedOut)
        }
    }

    pub async fn find_by_id(&self, id: i32) -> Result<Option<Reason>, sqlx::Error> {
        if let Some(pool) = &self.sqlite_pool {
            sqlx::query_as::<Sqlite, Reason>(
                "SELECT id, content, category, delta, is_system, updated_at FROM reasons WHERE id = ?"
            )
            .bind(id)
            .fetch_optional(pool)
            .await
        } else if let Some(pool) = &self.postgres_pool {
            sqlx::query_as::<Postgres, Reason>(
                "SELECT id, content, category, delta, is_system, updated_at FROM reasons WHERE id = $1"
            )
            .bind(id)
            .fetch_optional(pool)
            .await
        } else {
            Ok(None)
        }
    }
}
