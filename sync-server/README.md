# SecScore Sync Server

本目录是 SecScore 班级同步后端，使用 Rust + Axum + PostgreSQL。业务租户是班级，SECTL 用户通过班级成员关系访问数据。

## 启动

### 生产环境

首次部署时复制并填写生产配置：

```bash
cd sync-server
cp .env.production.example .env.production
```

至少需要替换 `POSTGRES_PASSWORD`、`DATABASE_URL` 中对应的密码、
`SECTL_CLIENT_ID` 和 `SECTL_PLATFORM_ID`。密码建议使用 URL-safe 字符，且生产环境必须保持
`DEV_AUTH=false`。随后一键构建并启动后端和 PostgreSQL：

```bash
docker compose up -d --build
```

后端监听宿主机 `8787` 端口，PostgreSQL 只加入 Docker 内部网络，不直接暴露到宿主机。
数据和服务日志分别保存在 Docker volume `secscore_sync_postgres_data` 与
`secscore_sync_server_logs` 中。查看状态和日志：

```bash
docker compose ps
docker compose logs -f sync-server
```

### 本地开发

```bash
cd sync-server
./scripts/start-local.sh
```

脚本会使用开发 compose 文件启动 PostgreSQL 16 容器，映射到本机 `54329` 端口，数据库、用户名和密码都是 `secscore`，然后启动 API 服务 `127.0.0.1:8787`。如果 Docker 尚未启动，需要先启动 Docker Desktop。

如果本机已经有 PostgreSQL 容器，建议为同步服务单独创建数据库，不要直接使用当前 SecScore 旧数据库，避免表名冲突。例如：

```bash
docker exec pg-secscore psql -U secscore -d postgres \
  -c "CREATE DATABASE secscore_sync OWNER secscore;"

DATABASE_URL='postgres://secscore:你的密码@127.0.0.1:5432/secscore_sync' \
DEV_AUTH=true \
cargo run --manifest-path sync-server/Cargo.toml
```

本地开发模式下，服务使用 `X-Dev-User-Id` 区分账号，此模式只允许绑定 loopback 地址；生产模式必须关闭 `DEV_AUTH`，改用 SECTL access token。服务启动时会校验这两个安全条件，配置错误会直接退出。

本地试验时使用 `X-Dev-User-Id` 作为账号身份：

```bash
curl http://127.0.0.1:8787/health
```

真实 SECTL 登录模式需要设置。注意 Client ID 和 Platform ID 是 SECTL 控制台中的两个不同字段：

```bash
export SECTL_INTROSPECT_URL='https://appwrite.sectl.cn/api/oauth/introspect'
export SECTL_CLIENT_ID='你的 SECTL Client ID'
export SECTL_PLATFORM_ID='你的 SECTL 平台 ID'
export DEV_AUTH=false
```

客户端请求使用：

```http
Authorization: Bearer <SECTL access token>
```

后端不会访问 SECTL 数据库，只调用 SECTL 的 token introspection 接口验证 token，并使用返回的 `user_id` 作为账号映射依据。
服务端不会信任客户端提交的 `username`、`user_id` 或 `X-Dev-User-Id` 来覆盖已验证身份；生产请求始终以 introspection 返回的用户和平台归属为准。

## 模拟两个离线设备合并

后端运行后，另开终端执行：

```bash
cd sync-server
./scripts/smoke-sync.sh
```

业务资料与历史记录的多客户端同步烟测：

```bash
./scripts/smoke-multiclient.sh
```

新同步模式会额外调用 `POST /v1/snapshot`，请求必须携带 `class_id`，同步学生、理由、奖励、标签、学生标签关系、历史积分事件、兑换记录、结算记录、看板配置和班级业务设置。积分调整仍通过 `POST /v1/sync` 的增量操作合并，避免并发加分丢失。设备 ID、认证信息、服务器地址和数据库连接配置不会同步。

班级接口包括：`GET/POST /v1/classes`、`POST /v1/classes/join`、`PATCH/DELETE /v1/classes/:class_id`、`POST /v1/classes/:class_id/rotate-code` 和 `POST /v1/classes/:class_id/leave`。班级 ID 为 6 位大写英文字母，加入时不区分大小写。

服务端日志使用结构化 tracing 事件，班级管理、成员校验、租户初始化、增量同步、快照合并和 SSE 长连接都会记录 `event`、`request_id`、脱敏用户/班级标识、设备 ID、游标、数量和结果状态，便于按一次请求串联排查。日志不会记录 access token、refresh token、快照正文或完整班级 ID；邀请码只记录首尾掩码。客户端工作空间和同步日志会写入 SecScore 应用日志，可通过应用的日志查询功能导出对应时间段。

脚本会模拟设备 A 离线产生 `+5`、设备 B 离线产生 `+3`，最终余额应为 `score=8`、`reward_points=8`，再重复上传设备 A 的操作验证幂等性。

## 同步接口

```http
POST /v1/sync
```

请求中的 `operations` 会以 `op_id` 幂等写入，`score.adjust`、`reward.redeem` 和 `balance.adjust` 会同时更新 `student_balances` 投影。`last_server_change_seq` 用于拉取客户端缺失的远端操作。
