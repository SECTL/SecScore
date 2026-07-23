# SecScore Sync Server

本目录是第一版本地同步后端，使用 Rust + Axum + PostgreSQL。

## 启动

```bash
export DATABASE_URL='postgres://用户名:密码@127.0.0.1:5432/secscore'
export DEV_AUTH=true
cargo run --manifest-path sync-server/Cargo.toml
```

本地试验时使用 `X-Dev-User-Id` 作为账号身份：

```bash
curl http://127.0.0.1:8787/health
```

真实 SECTL 登录模式需要设置：

```bash
export SECTL_INTROSPECT_URL='https://appwrite.sectl.cn/api/oauth/introspect'
export SECTL_CLIENT_ID='你的 SECTL platform id'
```

客户端请求使用：

```http
Authorization: Bearer <SECTL access token>
```

后端不会访问 SECTL 数据库，只调用 SECTL 的 token introspection 接口验证 token，并使用返回的 `user_id` 作为账号映射依据。

## 同步接口

```http
POST /v1/sync
```

请求中的 `operations` 会以 `op_id` 幂等写入，`score.adjust`、`reward.redeem` 和 `balance.adjust` 会同时更新 `student_balances` 投影。`last_server_change_seq` 用于拉取客户端缺失的远端操作。

