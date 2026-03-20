# 遗留目录说明（old-ss）

## 作用域

本文件仅说明 `old-ss/` 的边界：该目录为 Electron 历史实现，默认仅作参考。

## 目录定位

- `old-ss/src/main/`：历史主进程实现。
- `old-ss/src/renderer/`：历史渲染层实现。
- `old-ss/src/mobile/`：历史移动端实验实现。
- `old-ss/src/preload/`：历史预加载桥接实现。
- `old-ss/src/shared/`：历史共享内核与规则引擎。

## 工作边界

- 当前主线开发默认不在 `old-ss/` 落新功能。
- 仅在“迁移对照、行为回溯、数据兼容核对”场景读取本目录。
- 若必须修改本目录，请在变更说明中标记“遗留修复”。

## 反模式

- 不要把新业务逻辑先实现到 `old-ss/` 再回迁。
- 不要把 `old-ss/` 的旧模式直接复制到 Tauri 主线。
- 不要把 `old-ss/` 构建问题当作主线发布阻塞项。

## 参考命令（仅遗留排查）

```bash
pnpm --dir old-ss install
pnpm --dir old-ss dev
```
