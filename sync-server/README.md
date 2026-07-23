# SecScore Sync Server

本目录是第一版本地同步后端，使用 Rust + Axum + PostgreSQL。

## 启动

```bash
cd sync-server
./scripts/start-local.sh
```

脚本会启动 PostgreSQL 16 容器，映射到本机 `54329` 端口，数据库、用户名和密码都是 `secscore`，然后启动 API 服务 `127.0.0.1:8787`。如果 Docker 尚未启动，需要先启动 Docker Desktop。

如果本机已经有 PostgreSQL 容器，建议为同步服务单独创建数据库，不要直接使用当前 SecScore 旧数据库，避免表名冲突。例如：

```bash
docker exec pg-secscore psql -U secscore -d postgres \
  -c "CREATE DATABASE secscore_sync OWNER secscore;"

DATABASE_URL='postgres://secscore:你的密码@127.0.0.1:5432/secscore_sync' \
DEV_AUTH=true \
cargo run --manifest-path sync-server/Cargo.toml
```

本地开发模式下，服务使用 `X-Dev-User-Id` 区分账号；生产模式必须关闭 `DEV_AUTH`，改用 SECTL access token。

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

新同步模式会额外调用 `POST /v1/snapshot`，同步学生、理由、奖励、标签、学生标签关系、历史积分事件、兑换记录、结算记录、看板配置和用户级业务设置。积分调整仍通过 `POST /v1/sync` 的增量操作合并，避免并发加分丢失。设备 ID、认证信息、服务器地址和数据库连接配置不会同步。

脚本会模拟设备 A 离线产生 `+5`、设备 B 离线产生 `+3`，最终余额应为 `score=8`、`reward_points=8`，再重复上传设备 A 的操作验证幂等性。

## 同步接口

```http
POST /v1/sync
```

请求中的 `operations` 会以 `op_id` 幂等写入，`score.adjust`、`reward.redeem` 和 `balance.adjust` 会同时更新 `student_balances` 投影。`last_server_change_seq` 用于拉取客户端缺失的远端操作。
