use axum::{extract::{Path, State}, http::{header::AUTHORIZATION, HeaderMap, StatusCode}, response::IntoResponse, routing::{get, post}, Json, Router};
use chrono::{DateTime, Utc};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sqlx::{postgres::PgPoolOptions, PgPool, Row};
use std::{env, net::SocketAddr, sync::Arc};
use tower_http::{cors::CorsLayer, trace::TraceLayer};
use tracing::{error, info};
use uuid::Uuid;

#[derive(Clone)]
struct AppState {
    pool: PgPool,
    http: Client,
    sectl_introspect_url: Option<String>,
    sectl_client_id: Option<String>,
    dev_auth: bool,
}

#[derive(Debug, Serialize)]
struct ApiError { error: String }

#[derive(Debug, Deserialize)]
struct SyncRequest {
    device_id: Uuid,
    #[serde(default)] last_server_change_seq: i64,
    #[serde(default)] operations: Vec<ClientOperation>,
    #[serde(default = "default_limit")] limit: i64,
}

fn default_limit() -> i64 { 500 }

#[derive(Debug, Clone, Deserialize, Serialize)]
struct ClientOperation {
    op_id: Uuid,
    client_seq: i64,
    lamport: i64,
    entity_type: String,
    entity_id: Uuid,
    operation_type: String,
    payload: Value,
    client_created_at: DateTime<Utc>,
}

#[derive(Debug, Serialize)]
struct SyncResponse {
    server_change_seq: i64,
    accepted_operations: Vec<AcceptedOperation>,
    remote_operations: Vec<RemoteOperation>,
    balances: Vec<Balance>,
    has_more: bool,
}

#[derive(Debug, Serialize)]
struct AcceptedOperation { op_id: Uuid, server_change_seq: i64, status: String }

#[derive(Debug, Serialize)]
struct RemoteOperation {
    op_id: Uuid,
    server_change_seq: i64,
    device_id: Uuid,
    client_seq: i64,
    lamport: i64,
    entity_type: String,
    entity_id: Uuid,
    operation_type: String,
    payload: Value,
    client_created_at: DateTime<Utc>,
    status: String,
}

#[derive(Debug, Serialize)]
struct Balance { student_id: Uuid, score: i32, reward_points: i32 }

#[derive(Debug, Serialize)]
struct Health { status: &'static str, database: &'static str }

#[derive(Debug)]
struct AuthUser { sectl_user_id: String }

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    tracing_subscriber::fmt().with_env_filter(env::var("RUST_LOG").unwrap_or_else(|_| "info".into())).init();
    let database_url = env::var("DATABASE_URL").expect("DATABASE_URL is required");
    let pool = PgPoolOptions::new().max_connections(10).connect(&database_url).await?;
    sqlx::migrate!("./migrations").run(&pool).await?;

    let state = Arc::new(AppState {
        pool,
        http: Client::new(),
        sectl_introspect_url: env::var("SECTL_INTROSPECT_URL").ok(),
        sectl_client_id: env::var("SECTL_CLIENT_ID").ok(),
        dev_auth: env::var("DEV_AUTH").unwrap_or_default() == "true",
    });
    let app = Router::new()
        .route("/health", get(health))
        .route("/v1/sync", post(sync))
        .route("/v1/students/:student_id/balance", get(balance))
        .layer(CorsLayer::permissive())
        .layer(TraceLayer::new_for_http())
        .with_state(state);
    let addr: SocketAddr = env::var("BIND_ADDR").unwrap_or_else(|_| "127.0.0.1:8787".into()).parse()?;
    info!(%addr, "SecScore sync server started");
    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;
    Ok(())
}

async fn health(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    let database = if sqlx::query("SELECT 1").execute(&state.pool).await.is_ok() { "ok" } else { "error" };
    (StatusCode::OK, Json(Health { status: "ok", database }))
}

async fn authenticate(state: &AppState, headers: &HeaderMap) -> Result<AuthUser, (StatusCode, Json<ApiError>)> {
    if state.dev_auth {
        if let Some(user) = headers.get("x-dev-user-id").and_then(|v| v.to_str().ok()) {
            return Ok(AuthUser { sectl_user_id: user.to_string() });
        }
    }
    let token = headers.get(AUTHORIZATION).and_then(|v| v.to_str().ok()).and_then(|v| v.strip_prefix("Bearer "))
        .ok_or_else(|| unauthorized("missing bearer token"))?;
    let url = state.sectl_introspect_url.as_ref().ok_or_else(|| unauthorized("SECTL introspection is not configured"))?;
    let client_id = state.sectl_client_id.as_ref().ok_or_else(|| unauthorized("SECTL client id is not configured"))?;
    let response = state.http.post(url).json(&json!({"token": token, "client_id": client_id})).send().await
        .map_err(|_| unauthorized("SECTL authentication unavailable"))?;
    if !response.status().is_success() { return Err(unauthorized("invalid token")); }
    let data: Value = response.json().await.map_err(|_| unauthorized("invalid SECTL response"))?;
    if data.get("active").and_then(Value::as_bool) != Some(true) { return Err(unauthorized("inactive token")); }
    let user_id = data.get("user_id").and_then(Value::as_str).or_else(|| data.get("sub").and_then(Value::as_str))
        .ok_or_else(|| unauthorized("SECTL response has no user id"))?;
    Ok(AuthUser { sectl_user_id: user_id.to_string() })
}

fn unauthorized(message: &str) -> (StatusCode, Json<ApiError>) { (StatusCode::UNAUTHORIZED, Json(ApiError { error: message.into() })) }
fn bad_request(message: impl Into<String>) -> (StatusCode, Json<ApiError>) { (StatusCode::BAD_REQUEST, Json(ApiError { error: message.into() })) }
fn internal(message: impl Into<String>) -> (StatusCode, Json<ApiError>) { (StatusCode::INTERNAL_SERVER_ERROR, Json(ApiError { error: message.into() })) }

async fn ensure_account(pool: &PgPool, sectl_user_id: &str) -> Result<Uuid, sqlx::Error> {
    let account_id = Uuid::now_v7();
    let row = sqlx::query("INSERT INTO accounts (id, sectl_user_id) VALUES ($1, $2) ON CONFLICT (sectl_user_id) DO UPDATE SET sectl_user_id = EXCLUDED.sectl_user_id RETURNING id")
        .bind(account_id).bind(sectl_user_id).fetch_one(pool).await?;
    row.try_get("id")
}

async fn register_device(pool: &PgPool, account_id: Uuid, device_id: Uuid) -> Result<(), sqlx::Error> {
    sqlx::query("INSERT INTO devices (id, account_id) VALUES ($1, $2) ON CONFLICT (account_id, id) DO UPDATE SET last_seen_at = now()")
        .bind(device_id).bind(account_id).execute(pool).await?;
    Ok(())
}

async fn sync(State(state): State<Arc<AppState>>, headers: HeaderMap, Json(request): Json<SyncRequest>) -> Result<Json<SyncResponse>, (StatusCode, Json<ApiError>)> {
    let user = authenticate(&state, &headers).await?;
    if request.limit <= 0 || request.limit > 2000 { return Err(bad_request("limit must be between 1 and 2000")); }
    let account_id = ensure_account(&state.pool, &user.sectl_user_id).await.map_err(|e| internal(e.to_string()))?;
    register_device(&state.pool, account_id, request.device_id).await.map_err(|e| internal(e.to_string()))?;
    let mut tx = state.pool.begin().await.map_err(|e| internal(e.to_string()))?;
    let mut accepted = Vec::new();
    for operation in request.operations {
        let op_row = sqlx::query("INSERT INTO operations (op_id, account_id, device_id, client_seq, lamport, entity_type, entity_id, operation_type, payload, client_created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT (op_id) DO NOTHING RETURNING op_id")
            .bind(operation.op_id).bind(account_id).bind(request.device_id).bind(operation.client_seq).bind(operation.lamport)
            .bind(&operation.entity_type).bind(operation.entity_id).bind(&operation.operation_type).bind(&operation.payload).bind(operation.client_created_at)
            .fetch_optional(&mut *tx).await.map_err(|e| internal(e.to_string()))?;
        if op_row.is_none() {
            let existing = sqlx::query("SELECT c.change_seq, o.status FROM operations o JOIN account_changes c ON c.operation_id = o.op_id WHERE o.op_id = $1 AND o.account_id = $2")
                .bind(operation.op_id).bind(account_id).fetch_optional(&mut *tx).await.map_err(|e| internal(e.to_string()))?;
            if let Some(row) = existing { accepted.push(AcceptedOperation { op_id: operation.op_id, server_change_seq: row.try_get("change_seq").unwrap_or_default(), status: row.try_get("status").unwrap_or_else(|_| "applied".into()) }); }
            continue;
        }
        let change = sqlx::query("INSERT INTO account_changes (account_id, operation_id) VALUES ($1, $2) RETURNING change_seq")
            .bind(account_id).bind(operation.op_id).fetch_one(&mut *tx).await.map_err(|e| internal(e.to_string()))?;
        let change_seq: i64 = change.try_get("change_seq").map_err(|e| internal(e.to_string()))?;
        apply_operation(&mut tx, account_id, &operation).await?;
        accepted.push(AcceptedOperation { op_id: operation.op_id, server_change_seq: change_seq, status: "applied".into() });
    }
    let max_seq: i64 = sqlx::query_scalar("SELECT COALESCE(MAX(change_seq), 0) FROM account_changes WHERE account_id = $1").bind(account_id).fetch_one(&mut *tx).await.map_err(|e| internal(e.to_string()))?;
    let rows = sqlx::query("SELECT c.change_seq, o.op_id, o.device_id, o.client_seq, o.lamport, o.entity_type, o.entity_id, o.operation_type, o.payload, o.client_created_at, o.status FROM account_changes c JOIN operations o ON o.op_id = c.operation_id WHERE c.account_id = $1 AND c.change_seq > $2 ORDER BY c.change_seq LIMIT $3")
        .bind(account_id).bind(request.last_server_change_seq).bind(request.limit).fetch_all(&mut *tx).await.map_err(|e| internal(e.to_string()))?;
    let remote_operations = rows.into_iter().map(|row| Ok(RemoteOperation { op_id: row.try_get("op_id")?, server_change_seq: row.try_get("change_seq")?, device_id: row.try_get("device_id")?, client_seq: row.try_get("client_seq")?, lamport: row.try_get("lamport")?, entity_type: row.try_get("entity_type")?, entity_id: row.try_get("entity_id")?, operation_type: row.try_get("operation_type")?, payload: row.try_get("payload")?, client_created_at: row.try_get("client_created_at")?, status: row.try_get("status")? })).collect::<Result<Vec<_>, sqlx::Error>>().map_err(|e| internal(e.to_string()))?;
    let has_more = remote_operations.last().map(|op| op.server_change_seq < max_seq).unwrap_or(false);
    let balance_rows = sqlx::query("SELECT student_id, score, reward_points FROM student_balances WHERE account_id = $1").bind(account_id).fetch_all(&mut *tx).await.map_err(|e| internal(e.to_string()))?;
    let balances = balance_rows.into_iter().map(|row| Ok(Balance { student_id: row.try_get("student_id")?, score: row.try_get("score")?, reward_points: row.try_get("reward_points")? })).collect::<Result<Vec<_>, sqlx::Error>>().map_err(|e| internal(e.to_string()))?;
    tx.commit().await.map_err(|e| internal(e.to_string()))?;
    Ok(Json(SyncResponse { server_change_seq: max_seq, accepted_operations: accepted, remote_operations, balances, has_more }))
}

async fn apply_operation(tx: &mut sqlx::Transaction<'_, sqlx::Postgres>, account_id: Uuid, operation: &ClientOperation) -> Result<(), (StatusCode, Json<ApiError>)> {
    let score_delta = operation.payload.get("score_delta").and_then(Value::as_i64).unwrap_or(0) as i32;
    let reward_delta = operation.payload.get("reward_delta").and_then(Value::as_i64).unwrap_or_else(|| if operation.operation_type == "score.adjust" { score_delta as i64 } else { 0 }) as i32;
    let is_ledger_operation = operation.operation_type == "score.adjust" || operation.operation_type == "reward.redeem" || operation.operation_type == "balance.adjust";
    if is_ledger_operation {
        sqlx::query("INSERT INTO ledger_entries (entry_id, operation_id, account_id, student_id, score_delta, reward_delta, effective_at) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (operation_id) DO NOTHING")
            .bind(Uuid::now_v7()).bind(operation.op_id).bind(account_id).bind(operation.entity_id).bind(score_delta).bind(reward_delta).bind(operation.client_created_at)
            .execute(&mut **tx).await.map_err(|e| internal(e.to_string()))?;
        sqlx::query("INSERT INTO student_balances (account_id, student_id, score, reward_points, projection_version) VALUES ($1,$2,$3,$4,1) ON CONFLICT (account_id, student_id) DO UPDATE SET score = student_balances.score + EXCLUDED.score, reward_points = student_balances.reward_points + EXCLUDED.reward_points, projection_version = student_balances.projection_version + 1, updated_at = now()")
            .bind(account_id).bind(operation.entity_id).bind(score_delta).bind(reward_delta).execute(&mut **tx).await.map_err(|e| internal(e.to_string()))?;
    }
    Ok(())
}

async fn balance(State(state): State<Arc<AppState>>, Path(student_id): Path<Uuid>, headers: HeaderMap) -> Result<Json<Balance>, (StatusCode, Json<ApiError>)> {
    let user = authenticate(&state, &headers).await?;
    let account_id = ensure_account(&state.pool, &user.sectl_user_id).await.map_err(|e| internal(e.to_string()))?;
    let row = sqlx::query("SELECT student_id, score, reward_points FROM student_balances WHERE account_id = $1 AND student_id = $2").bind(account_id).bind(student_id).fetch_optional(&state.pool).await.map_err(|e| internal(e.to_string()))?;
    let row = row.ok_or_else(|| (StatusCode::NOT_FOUND, Json(ApiError { error: "student balance not found".into() })))?;
    Ok(Json(Balance { student_id: row.try_get("student_id").map_err(|e| internal(e.to_string()))?, score: row.try_get("score").map_err(|e| internal(e.to_string()))?, reward_points: row.try_get("reward_points").map_err(|e| internal(e.to_string()))? }))
}

