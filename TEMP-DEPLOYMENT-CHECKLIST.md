# SecScore 同步后端上线前临时清单

> 临时文档：完成线上部署后可删除。文档不保存任何 Secret、密码、SSH 私钥或 S3 密钥。

## 当前已完成

- [x] 同步后端已拆分到私有仓库：<https://github.com/SECTL/SecScore-Sync-Server>
- [x] 保留 PostgreSQL 作为同步数据和文件元数据存储。
- [x] 增加 S3/MinIO 对象存储适配。
- [x] 增加 SECTL 平台管理 API：`GET /health`、`POST /objects`、`GET /objects/{object_id}`。
- [x] 增加对象大小、SHA-256、状态和幂等记录。
- [x] 客户端云存储文件操作改为调用后端 `/v1/cloud/*`。
- [x] 客户端不再提交 `user_id` 作为身份依据。
- [x] 本地 MinIO、数据库迁移、Docker、CI 和 SSH 自动部署 workflow 已加入新仓库。
- [x] 本地真实测试通过：健康检查、401 鉴权、上传、幂等重试、409 内容冲突、对象核验。
- [x] 前端 `pnpm run typecheck` 和 18 个前端测试通过。
- [x] Rust `cargo check`、`cargo test` 和格式检查通过。
- [x] 部署 workflow 已增加生产环境变量预检。
- [x] SECTL service client 已创建，Secret 已重新生成并保存。
- [x] 最新 GitHub Actions 部署任务成功（commit `b7b8419`）。
- [x] GitHub Actions 所需的 `DEPLOY_KNOWN_HOSTS`、`DEPLOY_PORT`、`DEPLOY_SSH_KEY`、`DEPLOY_USER` 已配置。

## 需要人工完成的配置

### 1. 生产服务器

后端最新部署任务已经成功，但仍需确认服务器实际运行的是同步模式还是已启用对象存储模式。

确定以下信息：

```text
服务器公网 IP 或域名：<例如 sync.example.com>
部署用户：<例如 secscore>
部署目录：<例如 /opt/secscore-sync-server>
```

服务器需要安装：

- Docker Engine
- Docker Compose Plugin
- Git
- Caddy 或 Nginx（用于 HTTPS 反向代理）

服务器部署用户需要能够执行 Docker，并提前克隆：

```bash
git clone https://github.com/SECTL/SecScore-Sync-Server.git \
  /opt/secscore-sync-server
```

### 2. S3/MinIO

生产对象存储需要人工创建：

- 私有 bucket，例如 `secscore-private`。
- 只允许访问该 bucket 的专用 access key/secret key。
- 禁止匿名读取和公开 bucket。

需要填入服务器 `.env.production` 的配置：

```env
S3_ENDPOINT=https://<private-s3-endpoint>
S3_BUCKET=secscore-private
S3_REGION=us-east-1
S3_ACCESS_KEY=<s3 access key>
S3_SECRET_KEY=<s3 secret key>
S3_ALLOW_HTTP=false
S3_PATH_STYLE=true
```

### 3. 服务器环境文件

在服务器上创建 `/opt/secscore-sync-server/.env.production`，根据 `.env.production.example` 填写：

- PostgreSQL 用户、密码和 `DATABASE_URL`。
- SECTL introspection URL、Client ID、Platform ID。
- S3 endpoint、bucket 和密钥。
- 新的 SECTL service client ID/Secret。
- `STORAGE_MANAGEMENT_API_KEY`。
- `STORAGE_PLATFORM_ID`。
- `PUBLIC_STORAGE_BASE_URL`。

生产环境必须满足：

```env
DEV_AUTH=false
STORAGE_ENABLED=true
S3_ALLOW_HTTP=false
```

### 4. SECTL 平台存储管理 API

等服务器已部署并通过 HTTPS 访问后，在 SECTL 平台设置中配置：

```text
平台存储管理 API 地址：https://<同步服务器域名>
平台 ID：<当前 SECTL 平台 ID>
API Key：与服务器 STORAGE_MANAGEMENT_API_KEY 相同
```

SECTL 会访问：

```text
GET  /health
POST /objects
GET  /objects/{object_id}
```

API 地址必须是公网 HTTPS 地址，不能填 `127.0.0.1`、`localhost` 或内网 IP。

### 5. GitHub Actions Secrets

在仓库 `Settings → Environments → production → Secrets` 配置：

```text
DEPLOY_HOST=<服务器域名或公网 IP>
DEPLOY_USER=<服务器部署用户>
DEPLOY_SSH_KEY=<部署用 SSH 私钥完整内容>
DEPLOY_PATH=/opt/secscore-sync-server
```

SSH 公钥需要提前加入服务器部署用户的 `~/.ssh/authorized_keys`。

以下内容不要放进 GitHub Secrets，直接放服务器 `.env.production`：

- PostgreSQL 密码
- S3 access key/secret key
- SECTL service client secret
- `STORAGE_MANAGEMENT_API_KEY`

## 上线顺序

1. [ ] 准备生产服务器、部署用户、SSH 公钥和部署目录。
2. [ ] 准备 DNS 和 HTTPS 反向代理域名。
3. [ ] 创建私有 S3 bucket 和专用访问密钥。
4. [ ] 在服务器填写 `.env.production`。
5. [ ] 运行服务器上的环境预检：

   ```bash
   cd /opt/secscore-sync-server
   ./scripts/validate-production-env.sh
   ```

6. [ ] 配置 GitHub `DEPLOY_*` Environment Secrets。
7. [ ] 推送一次后端 `main`，触发 GitHub Actions 自动部署。
8. [ ] 确认服务器健康检查通过：

   ```bash
   docker compose ps
   docker compose logs --tail=200 sync-server
   ```

9. [ ] 在 SECTL 平台设置中填入平台存储管理 API 地址和管理 API Key。
10. [ ] 通过 SECTL 云存储页面上传一个小文件。
11. [ ] 验证文件出现在私有 bucket，且客户端可以列表、下载、重命名、分享和删除。
12. [ ] 删除测试文件，并确认 SECTL 配额用量正确减少。

## 当前未完成且不能假装已验证

- [ ] 尚未确认线上 `.env.production` 的 `STORAGE_ENABLED` 是 `true` 还是 `false`。
- [ ] 尚未确认真实生产 S3/MinIO 已连接。
- [ ] 尚未在服务器配置真实 SECTL service client。
- [ ] 尚未在 SECTL 平台配置线上 `/health`、`/objects` 地址和管理 API Key。
- [ ] 尚未执行真实用户 OAuth + M2M Token 的完整上传链路。
- [ ] 主项目客户端的后端代理改动尚未提交并推送到 `SECTL/SecScore`。
