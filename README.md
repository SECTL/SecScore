# SecScore

<!-- GitHub 徽章 -->
<p align="center">
  <a href="https://github.com/SECTL/SecScore/releases"><img alt="GitHub release (latest by date)" src="https://img.shields.io/github/v/release/SECTL/SecScore?style=flat-square"></a>
  <a href="https://github.com/SECTL/SecScore/actions/workflows/ci.yml"><img alt="CI" src="https://img.shields.io/github/actions/workflow/status/SECTL/SecScore/ci.yml?style=flat-square&logo=github&label=CI"></a>
  <a href="https://github.com/SECTL/SecScore/releases"><img alt="Downloads" src="https://img.shields.io/github/downloads/SECTL/SecScore/total?style=flat-square"></a>
  <a href="https://github.com/SECTL/SecScore/blob/main/LICENSE"><img alt="License" src="https://img.shields.io/github/license/SECTL/SecScore?style=flat-square"></a>
  <a href="https://github.com/SECTL/SecScore/issues"><img alt="GitHub issues" src="https://img.shields.io/github/issues/SECTL/SecScore?style=flat-square"></a>
  <a href="https://github.com/SECTL/SecScore/pulls"><img alt="GitHub pull requests" src="https://img.shields.io/github/issues-pr/SECTL/SecScore?style=flat-square"></a>
  <img alt="Electron" src="https://img.shields.io/badge/Electron-39+-47848F?style=flat-square&logo=electron">
  <img alt="React" src="https://img.shields.io/badge/React-19+-61DAFB?style=flat-square&logo=react">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5+-3178C6?style=flat-square&logo=typescript">
  <img alt="Vite" src="https://img.shields.io/badge/Vite-7+-646CFF?style=flat-square&logo=vite">
</p>

SecScore 是一款教育积分管理软件，基于 Electron  + React + TypeScript 开发，用于管理学生名单、记录加/扣分、查看排行榜与结算历史，并提供权限保护与数据备份。


SecScore 是一款教育积分管理软件，基于 Electron  + React + TypeScript 开发，用于管理学生名单、记录加/扣分、查看排行榜与结算历史，并提供权限保护与数据备份。

## 主要功能

- 学生管理
  - 添加/删除学生
  - 通过 xlsx 批量导入名单（支持导入前预览与选择“姓名列”）
- 积分管理
  - 选择学生并提交加分/扣分
  - 支持“预设理由”一键填充理由与分值
  - 支持撤销最近的积分记录（撤销后学生积分会回滚）
- 理由管理
  - 维护“预设理由”（分类、理由内容、预设分值）
- 排行榜
  - 支持按“今天 / 本周 / 本月”查看积分变化
  - 支持导出排行榜为 XLSX
  - 支持查看单个学生的操作记录（文本列表）
- 结算与历史
  - “结算并重新开始”：把当前未结算记录归档为一个阶段，并将所有学生当前积分清零
  - 在“结算历史”查看每个阶段的排行榜
- 系统设置
  - 主题切换
  - 日志查看/导出/清空
  - 数据导入/导出（JSON）
  - 密码保护（管理密码 / 积分密码）与找回字符串

## 使用方法

### 1. 权限与解锁

- 右上角会显示当前权限：管理权限 / 积分权限 / 只读
- 若设置了密码，可通过右上角“输入密码”进行解锁
  - 管理密码：全功能（学生管理、理由管理、结算、数据管理等）
  - 积分密码：仅允许积分相关操作
- 点击“锁定”可切回只读状态
- 无密码时默认视为管理权限

### 2. 学生管理（导入名单）

入口：左侧菜单 → 学生管理 → 导入名单

- 通过 xlsx 导入
  1. 选择一个 `.xlsx` 文件（默认读取第一个工作表）
  2. 在预览表格里点击表头，选择“姓名列”
  3. 点击“导入”
  4. 导入完成后会提示“新增 / 跳过”数量

建议：姓名列尽量只包含纯姓名文本；同名学生会被视为重复并跳过。

### 3. 积分管理（加分/扣分）

入口：左侧菜单 → 积分管理

1. 在“姓名”选择一个学生（支持搜索）
2. 选择“加分/扣分”，并输入分值
3. 在“理由内容”填写原因（可手动输入）
4. 点击“确认提交”

快捷理由：
- 可在“快捷理由”下拉框中选择预设理由，一键填充理由内容/分值（优先尊重你当前是否已手动输入分值）

撤销最近记录：
- “最近记录”默认折叠，展开后可对记录点击“撤销”
- 撤销会回滚该条记录对学生积分的影响

### 4. 排行榜与导出

入口：左侧菜单 → 排行榜

- 可切换统计范围：今天 / 本周 / 本月
- 点击“导出 XLSX”可导出当前排行榜
- 点击某个学生的“查看”可打开该学生的操作记录

### 5. 结算与数据备份

入口：左侧菜单 → 系统设置 → 数据管理

- 结算并重新开始
  - 会把当前未结算的积分记录归档为一个阶段
  - 会将所有学生当前积分清零
  - 学生名单不变；结算后的历史在“结算历史”查看
- 导出 JSON（强烈建议定期备份）
  - 导入会覆盖现有学生/理由/积分记录/设置
  - 安全相关设置（密码等）不会随导入写入

## 开发与运行（面向贡献者）

### 环境要求

- Node.js（建议使用 LTS 版本）
- pnpm

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
```
