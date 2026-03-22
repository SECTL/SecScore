# SecScore MCP 使用说明

本文说明如何在现有 Tauri Rust 后端中使用 MCP 服务（HTTP 方式），并调用 `add_score` 工具完成加分/扣分。

## 1. 功能概览

当前后端已提供以下 Tauri 命令：

- `mcp_server_start(config?)`
- `mcp_server_stop()`
- `mcp_server_status()`

服务启动后会暴露 MCP HTTP 入口：

- `POST /mcp`
- 默认地址：`http://127.0.0.1:3901/mcp`

当前已实现 MCP 工具：

- `add_score`：给指定学生加分或扣分，并写入 `score_events` 记录。
- `list_students`：获取学生列表（姓名、积分、奖励积分、标签）。

## 2. 启动与停止 MCP 服务

你可以在前端通过 Tauri `invoke` 调用：

```ts
import { invoke } from "@tauri-apps/api/core"

await invoke("mcp_server_start", {
  config: {
    host: "127.0.0.1",
    port: 3901,
  },
})

const status = await invoke("mcp_server_status")
console.log(status)

await invoke("mcp_server_stop")
```

说明：

- 不传 `config` 时，默认使用 `127.0.0.1:3901`。
- 只有管理权限（Admin）可调用 `mcp_server_start/stop/status`。

## 3. MCP 请求方式

服务采用 JSON-RPC 2.0 格式，请求头使用 `Content-Type: application/json`。

### 3.1 initialize

```bash
curl -X POST http://127.0.0.1:3901/mcp \
  -H 'Content-Type: application/json' \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "initialize",
    "params": {}
  }'
```

### 3.2 tools/list

```bash
curl -X POST http://127.0.0.1:3901/mcp \
  -H 'Content-Type: application/json' \
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/list"
  }'
```

### 3.3 tools/call（调用 add_score）

```bash
curl -X POST http://127.0.0.1:3901/mcp \
  -H 'Content-Type: application/json' \
  -d '{
    "jsonrpc": "2.0",
    "id": 3,
    "method": "tools/call",
    "params": {
      "name": "add_score",
      "arguments": {
        "student_name": "张三",
        "delta": 5,
        "reason_content": "课堂表现优秀"
      }
    }
  }'
```

`add_score` 参数：

- `student_name`（string，必填）：学生姓名。
- `delta`（integer，必填）：分值变化，正数加分，负数扣分。
- `reason_content`（string，可选）：原因，默认 `MCP 加分`。

### 3.4 tools/call（调用 list_students）

```bash
curl -X POST http://127.0.0.1:3901/mcp \
  -H 'Content-Type: application/json' \
  -d '{
    "jsonrpc": "2.0",
    "id": 4,
    "method": "tools/call",
    "params": {
      "name": "list_students",
      "arguments": {
        "limit": 50
      }
    }
  }'
```

`list_students` 参数：

- `limit`（integer，可选）：最多返回多少条，默认返回全部学生。

## 4. 返回结果说明

调用 `add_score` 成功时：

- `result.isError = false`
- `result.structuredContent` 包含：
  - `event_id`
  - `event_uuid`
  - `student_name`
  - `delta`
  - `val_prev`
  - `val_curr`
  - `reason_content`
  - `event_time`

调用失败时：

- `result.isError = true`
- `result.content[0].text` 含失败原因（例如学生不存在、数据库未连接）。

## 5. 常见问题

### 5.1 调用报 `MCP server is already running`

表示服务已启动，可直接调用 `/mcp`，或先执行 `mcp_server_stop` 再重启。

### 5.2 调用报 `Permission denied: Admin required`

说明当前会话未获得管理权限，先在应用中解锁管理权限再调用服务管理命令。

### 5.3 调用 `add_score` 提示 `Student not found`

请确认学生已在学生列表中存在，且 `student_name` 与库内名称完全一致。

## 6. 安全建议

- 推荐仅绑定到 `127.0.0.1`，避免暴露到局域网。
- 若需要远程访问，建议配合网关鉴权、反向代理白名单或专用内网通道。
