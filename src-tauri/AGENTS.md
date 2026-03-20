# 后端知识库（src-tauri）

## 作用域

本文件仅约束 `src-tauri/`（Rust + Tauri）后端实现。

## 关键入口

- `src-tauri/src/main.rs`：二进制入口，调用 `secscore_lib::run()`。
- `src-tauri/src/lib.rs`：应用装配中心（`setup`、`invoke_handler`、托盘/窗口、数据库启动）。
- `src-tauri/src/state.rs`：全局状态容器。

## 模块分层

- `src-tauri/src/commands/`：Tauri IPC 命令边界层。
- `src-tauri/src/services/`：业务服务层（鉴权、设置、主题、数据等）。
- `src-tauri/src/db/`：连接、迁移、实体与仓储。
- `src-tauri/src/models/`：模型与 DTO。

## 后端约束

- 新命令必须在 `commands/mod.rs` 导出，并在 `lib.rs` 的 `invoke_handler` 注册。
- 命令层优先做参数校验与权限校验，业务细节下沉至 `services/`。
- 涉及数据库结构或同步策略变更时，必须同步审阅 `db/migration.rs` 与 `commands/database.rs`。
- 变更 `board`/SQL 查询相关能力时，优先白名单策略，避免扩散动态 SQL 风险面。

## 后端反模式

- 不要在 `commands/database.rs` 继续堆新职责；优先拆分为更小模块。
- 不要把 UI 或前端状态逻辑迁入 Rust 命令层。
- 不要绕过统一状态容器直接创建长期悬挂资源。

## 后端验证

在仓库根目录执行：

```bash
pnpm lint
pnpm typecheck
pnpm tauri:build
```

CI/发布场景还需参考：`.github/workflows/build.yml`。

## 说明

- 当前 `src-tauri/tauri.conf.json` 的 `beforeDevCommand`/`beforeBuildCommand` 使用 `npm run ...`，与仓库默认 `pnpm` 并存；修改构建链路时请同步评估。
