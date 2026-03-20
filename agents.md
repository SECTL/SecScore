# 项目知识库（SecScore）

**生成时间：** 2026-03-21 01:41:11  
**分支：** `tauri-dev`  
**基线提交：** `517ce1e`

## 概览

SecScore 当前主线为 Tauri 桌面应用：前端 `React + TypeScript + Vite`，后端 `Rust + Tauri + SeaORM`。  
仓库中存在 `old-ss/`（Electron 历史代码），默认按遗留参考处理，不作为本分支主实现目标。

## 目录结构

```text
.
├── src/                 # 前端 UI、状态与共享逻辑
├── src-tauri/           # Rust/Tauri 后端与数据库
├── old-ss/              # 历史 Electron 代码（遗留）
├── scripts/             # 本分支启动脚本（如 tauri-dev）
└── .github/workflows/   # 构建/发布流程
```

## 去哪里找

| 任务                 | 位置                                 | 说明                                      |
| -------------------- | ------------------------------------ | ----------------------------------------- |
| 前端入口与全局初始化 | `src/main.tsx`                       | 注入 `window.api`、日志桥接、平台标识     |
| 主应用路由与页面容器 | `src/App.tsx`                        | 页面切换、权限与流程协调                  |
| Tauri 启动入口       | `src-tauri/src/main.rs`              | 仅调用 `secscore_lib::run()`              |
| 后端命令注册总线     | `src-tauri/src/lib.rs`               | `invoke_handler` 注册命令与初始化流程     |
| 数据库连接/同步核心  | `src-tauri/src/commands/database.rs` | 复杂热点文件，改动需重点回归              |
| 前端构建配置         | `vite.config.ts`                     | `@` 别名、端口 `1420`、排除 `old-ss` 扫描 |
| Tauri 构建配置       | `src-tauri/tauri.conf.json`          | `beforeDevCommand`、窗口/打包/插件设置    |

## 关键约束

- 当前开发目标：优先 Tauri 版本；不要把 Electron 新功能落在主线目录。
- 提交信息使用中文；提交后需推送远程（按仓库现有协作约束执行）。
- 包管理器默认使用 `pnpm`（注意：`src-tauri/tauri.conf.json` 的 `before*Command` 当前仍为 `npm run ...`）。
- 代码风格以配置文件为准：`.editorconfig`、`eslint.config.mjs`、`.prettierrc.yaml`。

## 反模式

- 不要在 `src-tauri/src/commands/database.rs`、`src/components/Home.tsx` 等超大文件里继续堆叠新职责；先拆分再扩展。
- 不要将 `old-ss/` 作为新功能主实现目录。
- 不要绕过静态检查直接交付（至少通过 `lint` 与 `typecheck`）。

## 常用命令

```bash
pnpm install
pnpm dev
pnpm tauri:dev
pnpm lint
pnpm typecheck
pnpm build
pnpm tauri:build
```

## 分层文档

- 前端细则：`src/AGENTS.md`
- Tauri/Rust 细则：`src-tauri/AGENTS.md`
- 遗留目录边界：`old-ss/AGENTS.md`
