# 前端知识库（src）

## 作用域

本文件仅约束 `src/` 前端实现，不覆盖 `src-tauri/` Rust 后端规则。

## 核心入口

- `src/main.tsx`：前端启动、`window.api` 注入、日志桥接、平台 class 注入。
- `src/App.tsx`：主流程编排（权限、页面路由、同步流程）。
- `src/preload/types.ts`：前后端 API 类型契约（改动需双端联调）。

## 关键目录

- `src/components/`：主 UI 组件（含多个大文件热点）。
- `src/contexts/`：全局上下文与服务注入。
- `src/services/`：前端服务封装。
- `src/shared/`：共享内核与自动评分规则引擎。
- `src/i18n/`：国际化文本。

## 前端约束

- 新增功能优先复用已有模式：`Context + Service`，避免平行新架构。
- 变更 `src/preload/types.ts` 时，必须同步核对后端命令与参数。
- 对 `Home.tsx`、`Settings.tsx`、`BoardManager.tsx` 等超大组件的改动，优先拆分子组件/Hook，避免继续膨胀。
- 避免把后端业务判断塞入前端 UI；业务规则优先落在 `src-tauri/`。

## 前端反模式

- 不要在组件内重复实现同一业务规则（统一收敛到 service/shared）。
- 不要直接写“魔法字符串”调用后端接口，统一走类型化 API。
- 不要绕过 `i18n` 直接硬编码用户可见文本。

## 前端验证

```bash
pnpm lint
pnpm typecheck
pnpm build
```

若改动涉及界面交互流程，再执行：

```bash
pnpm tauri:dev
```
