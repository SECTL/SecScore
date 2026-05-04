# URL 协议注册健壮性增强计划

## 目标

为 SecScore 的 URL 协议注册功能实现完整的健壮性增强，包括：状态检测、注册验证、自动重试（最多7次）、按钮状态自动切换、取消注册、以及全流程日志记录。

---

## 涉及文件

| 文件                             | 操作 | 说明                                                                                           |
| -------------------------------- | ---- | ---------------------------------------------------------------------------------------------- |
| `src-tauri/src/commands/app.rs`  | 修改 | 新增 `check_url_protocol_status`、`unregister_url_protocol` 命令；增强 `register_url_protocol` |
| `src-tauri/src/lib.rs`           | 修改 | 注册新命令到 invoke_handler                                                                    |
| `src/preload/types.ts`           | 修改 | 新增 API 类型定义                                                                              |
| `src/components/Settings.tsx`    | 修改 | 重写 URL 协议 UI，加入状态显示、重试逻辑、按钮切换                                             |
| `src/i18n/locales/*.json` (10个) | 修改 | 新增 i18n 翻译键                                                                               |

---

## 步骤 1：Rust 后端 - 新增 `UrlProtocolStatus` 结构体和 `check_url_protocol_status` 命令

**文件**: `src-tauri/src/commands/app.rs`

### 1.1 新增结构体

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UrlProtocolStatus {
    pub registered: bool,
    pub protocol: String,
    pub platform: String,
    pub details: String,
}
```

### 1.2 实现 `check_url_protocol_status` 命令

按平台实现 URL 协议状态检测：

- **Windows**: 查询注册表 `HKCU\Software\Classes\secscore` 是否存在，检查 `URL Protocol` 值和 `shell\open\command` 中的路径是否指向当前 exe

- **macOS**:
  1. 先尝试通过 `lsregister -dump` 查询 `secscore://` scheme 的注册状态
  2. 检查 `~/Library/LaunchAgents/com.secscore.url-handler.plist` 是否存在（非 .app bundle 场景）

- **Linux**:
  1. 检查 `~/.local/share/applications/secscore.desktop` 是否存在且包含 `x-scheme-handler/secscore`
  2. 通过 `xdg-settings get default-url-scheme-handler secscore` 验证是否为默认处理器

返回 `UrlProtocolStatus` 结构体，包含注册状态、当前平台、检测详情。

---

## 步骤 2：Rust 后端 - 新增 `unregister_url_protocol` 命令

**文件**: `src-tauri/src/commands/app.rs`

按平台实现取消注册：

- **Windows**: 删除注册表 `HKCU\Software\Classes\secscore` 键 (`reg delete "HKCU\Software\Classes\secscore" /f`)

- **macOS**:
  1. 如果存在 .app bundle，通过 `lsregister -u` 取消注册
  2. 删除 `~/Library/LaunchAgents/com.secscore.url-handler.plist`

- **Linux**:
  1. 删除 `~/.local/share/applications/secscore.desktop`
  2. 运行 `update-desktop-database`

---

## 步骤 3：Rust 后端 - 增强 `register_url_protocol` 命令

**文件**: `src-tauri/src/commands/app.rs`

改造现有 `register_url_protocol`：

1. 执行注册操作后，不再盲目返回 `registered: Some(true)`
2. 注册完成后，自动调用状态检测逻辑验证注册是否成功
3. 返回实际检测到的注册状态（`registered` 字段反映真实结果）
4. 在每个关键步骤添加 `eprintln!` 日志输出（Rust 端日志）

---

## 步骤 4：Rust 后端 - 注册新命令

**文件**: `src-tauri/src/lib.rs`

在 `invoke_handler` 中添加：

- `check_url_protocol_status`

- `unregister_url_protocol`

---

## 步骤 5：前端 API 类型定义

**文件**: `src/preload/types.ts`

新增 API 方法：

```typescript
checkUrlProtocolStatus: (): Promise<{
  success: boolean
  data?: {
    registered: boolean
    protocol: string
    platform: string
    details: string
  }
  message?: string
}> => invoke("check_url_protocol_status"),

unregisterUrlProtocol: (): Promise<{
  success: boolean
  data?: { registered: boolean }
  message?: string
}> => invoke("unregister_url_protocol"),
```

---

## 步骤 6：前端 Settings.tsx - 重写 URL 协议卡片 UI

**文件**: `src/components/Settings.tsx`

### 6.1 新增状态变量

```typescript
const [urlStatus, setUrlStatus] = useState<{ registered: boolean; details: string } | null>(null)
const [urlStatusLoading, setUrlStatusLoading] = useState(false)
const [urlOperationLogs, setUrlOperationLogs] = useState<string[]>([])
```

### 6.2 状态检测逻辑

- 组件加载 URL tab 时自动执行一次 `checkUrlProtocolStatus`

- 在 UI 中显示当前注册状态（Tag: 已注册/未注册 + 详情文本）

### 6.3 注册流程（含自动重试）

```
handleRegister():
  1. 记录日志："开始注册 URL 协议..."
  2. 调用 registerUrlProtocol()
  3. 记录日志："注册命令已执行，开始验证..."
  4. 调用 checkUrlProtocolStatus() 验证
  5. IF 注册成功:
     - 记录日志："注册验证成功"
     - 更新状态显示
     - 完成
  6. ELSE (注册失败):
     - FOR retry = 1 TO 7:
       - 记录日志："注册失败，第 {retry}/7 次重试..."
       - 延迟 retry * 1000 ms (递增延迟: 1s, 2s, 3s, ..., 7s)
       - 调用 registerUrlProtocol()
       - 调用 checkUrlProtocolStatus() 验证
       - IF 成功:
         - 记录日志："第 {retry} 次重试成功"
         - 更新状态，退出循环
       - ELSE:
         - 记录日志："第 {retry} 次重试失败"
     - IF 7次全部失败:
       - 记录日志："已达最大重试次数(7次)，注册失败"
       - 显示错误消息
```

### 6.4 按钮状态自动切换

根据 `urlStatus.registered` 动态渲染：

| 状态   | 按钮文本        | 按钮类型 | 点击行为                          |
| ------ | --------------- | -------- | --------------------------------- |
| 未注册 | "注册 URL 协议" | primary  | 执行注册（含重试）                |
| 已注册 | "重新注册"      | default  | 执行注册（覆盖注册+验证）         |
| 已注册 | "取消注册"      | danger   | 执行 unregisterUrlProtocol + 验证 |

### 6.5 操作日志展示

在 URL 协议卡片底部增加一个可折叠的 `<Collapse>` 或简洁的 `<Typography.Paragraph>` 区域，展示最近的操作日志（最多保留最新 20 条），使用 `fontSize: 12px, fontFamily: monospace` 样式。

---

## 步骤 7：i18n 翻译

**文件**: `src/i18n/locales/` 下所有 10 个语言文件

在 `settings.url` 下新增以下键：

| 键                     | zh-CN                         | en-US                                         |
| ---------------------- | ----------------------------- | --------------------------------------------- |
| `checkStatus`          | "检测状态"                    | "Check Status"                                |
| `reRegister`           | "重新注册"                    | "Re-register"                                 |
| `unregister`           | "取消注册"                    | "Unregister"                                  |
| `unregistered`         | "URL 协议已取消注册"          | "URL protocol unregistered"                   |
| `unregisterFailed`     | "取消注册失败"                | "Failed to unregister"                        |
| `statusRegistered`     | "已注册"                      | "Registered"                                  |
| `statusNotRegistered`  | "未注册"                      | "Not Registered"                              |
| `statusCheckFailed`    | "状态检测失败"                | "Status check failed"                         |
| `retrying`             | "重试中 ({current}/{max})"    | "Retrying ({current}/{max})"                  |
| `retryFailed`          | "已达最大重试次数，注册失败"  | "Max retries reached, registration failed"    |
| `retrySuccess`         | "第 {n} 次重试成功"           | "Retry #{n} succeeded"                        |
| `operationLog`         | "操作日志"                    | "Operation Log"                               |
| `logRegisterStart`     | "开始注册 URL 协议..."        | "Starting URL protocol registration..."       |
| `logRegisterVerify`    | "注册命令已执行，正在验证..." | "Registration command executed, verifying..." |
| `logRegisterSuccess`   | "注册验证成功"                | "Registration verified successfully"          |
| `logRegisterFailed`    | "注册验证失败"                | "Registration verification failed"            |
| `logUnregisterStart`   | "正在取消注册..."             | "Unregistering..."                            |
| `logUnregisterSuccess` | "取消注册成功"                | "Unregistered successfully"                   |
| `logUnregisterFailed`  | "取消注册失败"                | "Unregister failed"                           |
| `logMaxRetries`        | "已达最大重试次数 (7次)"      | "Max retries (7) reached"                     |

其余 9 个语言文件同步翻译。

---

## 步骤 8：运行测试与格式化

1. 执行 `pnpm run typecheck`（如有）检查前端类型
2. 执行 `cargo check` 检查 Rust 编译
3. 执行格式化命令
4. 运行测试套件

---

## 实现顺序

1. ✅ 步骤 1：Rust - `check_url_protocol_status`
2. ✅ 步骤 2：Rust - `unregister_url_protocol`
3. ✅ 步骤 3：Rust - 增强 `register_url_protocol`
4. ✅ 步骤 4：Rust - 注册新命令到 lib.rs
5. ✅ 步骤 5：前端 API 类型
6. ✅ 步骤 6：前端 Settings.tsx UI
7. ✅ 步骤 7：i18n 翻译
8. ✅ 步骤 8：测试与格式化
