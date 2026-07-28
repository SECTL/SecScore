# 同步后端开发说明

同步后端已拆分到私有仓库：[SECTL/SecScore-Sync-Server](https://github.com/SECTL/SecScore-Sync-Server)。主仓库只包含客户端、同步服务器地址配置和客户端云存储代理调用。

## 本地运行

先克隆后端仓库到主项目同级目录：

```bash
git clone https://github.com/SECTL/SecScore-Sync-Server.git ../SecScore-Sync-Server
```

复制 `.env.sync-server.development.example` 为 `.env.sync-server.development.local`，配置 PostgreSQL、MinIO 和本地管理 API Key，然后运行：

```bash
pnpm sync-server:dev
```

启动脚本按以下顺序寻找后端：

1. `SYNC_SERVER_DIR` 指定的目录；
2. 主项目同级的 `../SecScore-Sync-Server`；
3. 兼容旧工作区的 `sync-server` 目录（如果本地仍有备份）。

如果后端已经运行，可设置 `SYNC_SERVER_ONLY=true`，脚本不会停止或启动已有服务。客户端通过 `ss_sync_server_url` 或 `VITE_SYNC_SERVER_URL` 访问后端，默认地址为 `http://127.0.0.1:8787`。

## 云存储边界

同步数据、同步操作和文件元数据由后端写入 PostgreSQL；文件正文由后端写入私有 S3/MinIO。客户端云存储页面只调用后端 `/v1/cloud/*`，不会保存 SECTL service client secret、M2M Token、管理 API Key、bucket 地址或预签名 URL。

后端仓库中的 `POST /objects` 和 `GET /objects/{object_id}` 是给 SECTL 平台存储服务调用的管理 API，不是客户端 API。
