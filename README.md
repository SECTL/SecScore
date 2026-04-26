# SecScore

<!-- GitHub 徽章 -->
<p align="center">
  <a href="https://github.com/SECTL/SecScore/releases"><img alt="GitHub release (latest by date)" src="https://img.shields.io/github/v/release/SECTL/SecScore?style=flat-square"></a>
  <a href="https://github.com/SECTL/SecScore/releases"><img alt="Downloads" src="https://img.shields.io/github/downloads/SECTL/SecScore/total?style=flat-square"></a>
  <a href="https://github.com/SECTL/SecScore/blob/main/LICENSE"><img alt="License" src="https://img.shields.io/github/license/SECTL/SecScore?style=flat-square"></a>
  <a href="https://github.com/SECTL/SecScore/issues"><img alt="GitHub issues" src="https://img.shields.io/github/issues/SECTL/SecScore?style=flat-square"></a>
  <a href="https://github.com/SECTL/SecScore/pulls"><img alt="GitHub pull requests" src="https://img.shields.io/github/issues-pr/SECTL/SecScore?style=flat-square"></a>
  <img alt="Tauri" src="https://img.shields.io/badge/Tauri-2+-24C8D8?style=flat-square&logo=tauri">
  <img alt="React" src="https://img.shields.io/badge/React-19+-61DAFB?style=flat-square&logo=react">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5+-3178C6?style=flat-square&logo=typescript">
  <img alt="Vite" src="https://img.shields.io/badge/Vite-7+-646CFF?style=flat-square&logo=vite">
  <img alt="Rust" src="https://img.shields.io/badge/Rust-1.8+-000000?style=flat-square&logo=rust">
</p>

SecScore 是一款现代化的教育积分管理软件，基于 **Tauri + React + TypeScript + Rust** 开发，采用可逆插件架构设计，用于管理学生名单、记录加/扣分、查看排行榜与结算历史，并提供权限保护、数据备份与云同步功能。

## 核心特性

### 🔌 内置插件系统

SecScore 将非核心功能设计为**内置插件**，默认不安装，用户可按需启用：

| 插件     | 功能描述                                       | 默认状态 |
| -------- | ---------------------------------------------- | -------- |
| 自动评分 | 基于规则的自动评分系统，支持定时任务和条件触发 | 未安装   |
| 看板管理 | 可视化数据看板，支持自定义布局和实时数据展示   | 未安装   |
| 结算历史 | 积分结算记录管理，支持导出和统计分析           | 未安装   |
| 奖励设置 | 奖励兑换系统配置，管理奖励项目和兑换规则       | 未安装   |
| 云同步   | SECTL 云服务集成，支持数据云同步和跨设备访问   | 未安装   |

**核心功能**（始终可用）：

- 首页（积分操作）
- 学生管理
- 排行榜
- 理由管理
- 设置

### 🔒 安全与权限

- **多级权限**：管理员 / 积分操作员 / 只读
- **密码保护**：支持管理密码和积分密码
- **找回机制**：提供找回字符串用于密码重置
- **本地优先**：所有数据本地存储，无需联网

### ☁️ 云同步（可选）

- **SECTL 云服务**：支持数据云同步和跨设备访问
- **自动同步**：检测到数据变化时自动同步
- **冲突解决**：智能处理本地与远程数据冲突

## 主要功能

### 学生管理

- 添加/删除学生
- 通过 xlsx 批量导入名单（支持导入前预览与选择"姓名列"）
- 支持学生头像自动生成

### 积分管理

- 选择学生并提交加分/扣分
- 支持"预设理由"一键填充理由与分值
- 支持撤销最近的积分记录（撤销后学生积分会回滚）
- 支持沉浸模式，专注积分操作

### 理由管理

- 维护"预设理由"（分类、理由内容、预设分值）
- 支持标签分类管理

### 排行榜

- 支持按"今天 / 本周 / 本月"查看积分变化
- 支持导出排行榜为 XLSX
- 支持查看单个学生的操作记录（文本列表）

### 结算与历史

- "结算并重新开始"：把当前未结算记录归档为一个阶段，并将所有学生当前积分清零
- 在"结算历史"查看每个阶段的排行榜（需安装插件）

### 系统设置

- 主题切换（支持自定义主题）
- 多语言支持（10+ 语言）
- 日志查看/导出/清空
- 数据导入/导出（JSON）
- 密码保护（管理密码 / 积分密码）与找回字符串
- 数据库切换（SQLite / PostgreSQL）

## 使用方法

### 1. 权限与解锁

- 右上角会显示当前权限：管理权限 / 积分权限 / 只读
- 若设置了密码，可通过右上角"输入密码"进行解锁
  - 管理密码：全功能（学生管理、理由管理、结算、数据管理等）
  - 积分密码：仅允许积分相关操作
- 点击"锁定"可切回只读状态
- 无密码时默认视为管理权限

### 2. 安装内置插件

入口：左侧菜单 → 插件管理 → 内置插件

1. 浏览可用的内置插件列表
2. 点击"安装"按钮安装需要的插件
3. 安装后点击"启用"激活插件
4. 插件功能将自动显示在侧边栏菜单中

### 3. 学生管理（导入名单）

入口：左侧菜单 → 学生管理 → 导入名单

- 通过 xlsx 导入
  1. 选择一个 `.xlsx` 文件（默认读取第一个工作表）
  2. 在预览表格里点击表头，选择"姓名列"
  3. 点击"导入"
  4. 导入完成后会提示"新增 / 跳过"数量

建议：姓名列尽量只包含纯姓名文本；同名学生会被视为重复并跳过。

### 4. 积分管理（加分/扣分）

入口：左侧菜单 → 积分管理

1. 在"姓名"选择一个学生（支持搜索）
2. 选择"加分/扣分"，并输入分值
3. 在"理由内容"填写原因（可手动输入）
4. 点击"确认提交"

快捷理由：

- 可在"快捷理由"下拉框中选择预设理由，一键填充理由内容/分值（优先尊重你当前是否已手动输入分值）

撤销最近记录：

- "最近记录"默认折叠，展开后可对记录点击"撤销"
- 撤销会回滚该条记录对学生积分的影响

### 5. 排行榜与导出

入口：左侧菜单 → 排行榜

- 可切换统计范围：今天 / 本周 / 本月
- 点击"导出 XLSX"可导出当前排行榜
- 点击某个学生的"查看"可打开该学生的操作记录

### 6. 结算与数据备份

入口：左侧菜单 → 系统设置 → 数据管理

- 结算并重新开始（需安装"结算历史"插件）
  - 会把当前未结算的积分记录归档为一个阶段
  - 会将所有学生当前积分清零
  - 学生名单不变；结算后的历史在"结算历史"查看
- 导出 JSON（强烈建议定期备份）
  - 导入会覆盖现有学生/理由/积分记录/设置
  - 安全相关设置（密码等）不会随导入写入

## 技术架构

### 前端

- **框架**：React 19 + TypeScript 5
- **构建工具**：Vite 7
- **UI 组件**：Ant Design 5
- **状态管理**：Context API + 自定义 DI 系统
- **国际化**：i18next

### 后端

- **框架**：Tauri 2 + Rust
- **数据库**：SQLite（本地）/ PostgreSQL（远程）
- **ORM**：自定义数据库抽象层

### 架构设计

- **可逆插件系统**：参照 Koishi 的 Disposable 设计，支持热重载
- **依赖注入**：基于 ExamAware 项目的 DI 实现
- **配置管理**：统一的 ConfigService，支持实时同步
- **日志系统**：分级日志，支持多色打印与文件存储
- **窗口管理**：统一的 WindowManager，支持多窗口

## 开发与运行（面向贡献者）

### 环境要求

- Node.js（建议使用 LTS 版本）
- pnpm
- Rust（用于 Tauri 后端）

### 安装依赖

```bash
pnpm install
```

### 开发模式

```bash
pnpm dev
```

### 构建

```bash
pnpm build
```

（可选）打包：

```bash
pnpm build:win
pnpm build:unpack
```

### 常用检查

```bash
pnpm lint
pnpm typecheck
pnpm format
```

## 文档

- [MCP-使用说明](./MCP-使用说明.md)
- [插件开发指南](./plugin-wiki/插件开发指南.md)

## 贡献

欢迎提交 Issue 和 Pull Request！

## 许可证

[MIT License](./LICENSE)

---

<p align="center">
  Made with ❤️ by SECTL
</p>
