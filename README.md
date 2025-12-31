# SecScore - 教育场景个人积分管理软件

基于 Qt6/QML 的个人积分管理系统，支持本地和远程数据源。

## 快速开始

### 前置要求
- CMake 3.24+
- Qt 6.4+ (Core, Quick, Qml, Sql, Network, WebSockets)
- C++20 compatible compiler

### 构建步骤

#### Windows
```batch
build.bat
```

#### Linux/Mac
```bash
chmod +x build.sh
./build.sh
```

### 运行
```
build/bin/SecScore
```

## 项目结构

```
SecScore/
├── CMakeLists.txt         # CMake 配置
├── main.cpp               # 应用入口
├── src/                   # C++ 源代码
│   ├── core/              # 核心服务
│   │   ├── App.h/cpp      # 应用核心，管理所有服务
│   │   └── ThemeService.h/cpp  # 主题服务
│   ├── data/              # 数据库层
│   │   ├── Database.h/cpp       # SQLite 数据库初始化
│   │   └── Repositories/        # 数据仓库
│   │       ├── StudentRepo.h/cpp
│   │       ├── EventRepo.h/cpp
│   │       └── ReasonRepo.h/cpp
│   ├── network/           # 网络层
│   │   └── WsClient.h/cpp       # WebSocket 客户端
│   └── sync/              # 同步引擎
│       └── SyncEngine.h/cpp     # 同步引擎
└── qml/                   # QML 资源
    ├── App.qml               # 主应用
    ├── pages/                # 页面组件
    │   ├── StudentsPage.qml  # 学生管理页面
    │   ├── EventsPage.qml    # 事件记录页面
    │   ├── LeaderboardPage.qml # 排行榜页面
    │   ├── SyncPage.qml      # 同步状态页面
    │   └── SettingsPage.qml  # 设置页面
    └── qmldir               # QML 模块定义
```

## 功能特性

### 已实现（步骤 1）
- ✅ 项目结构和 CMake 配置
- ✅ Qt6 应用框架
- ✅ 基本的 AppCore（初始化、设置管理）
- ✅ ThemeService 骨架
- ✅ SQLite 数据库连接
- ✅ QML 界面框架（侧边栏 + 主内容区）
- ✅ 首次运行向导（本地模式）
- ✅ 占位网络类（WsClient, SyncEngine）

### 已实现（步骤 2）
- ✅ ThemeService 完整实现 + QML 绑定
- ✅ SQLite 完整表结构 + CRUD 操作
- ✅ 学生管理页面（增删改查）
- ✅ 事件记录页面（加减分 + 事件流水）
- ✅ WebSocket 客户端（seq 匹配、超时、重连）
- ✅ 同步引擎（outbox 队列、入站拉取）
- ✅ 首次运行向导完整版（Remote 模式）
- ✅ 设置页面（模式切换、主题选择）

### 待实现（后续步骤）
- ⏳ 主题文件热加载优化
- ⏳ 排行榜页面功能增强
- ⏳ 同步冲突处理策略优化
- ⏳ 数据备份与恢复功能
- ⏳ 多语言支持
- ⏳ 统计报表功能

## 数据模式

### 本地模式 (Local)
- 所有数据存储在本地 SQLite（`data/app.db`）
- 离线完全使用
- 适合同机使用或单用户场景

### 远程模式 (Remote)
- 本地仍存储完整数据副本（离线可用）
- 通过 WebSocket 与远程 SecScoreDB 服务同步
- 写操作先落本地，再异步推送到 outbox 队列
- 冲突策略：本地优先，通过事件流水追踪历史

## 主题系统

- 支持用户编辑主题文件切换
- 主题文件位置：`data/themes/*.json`
- 支持 QFileSystemWatcher 热加载
- 默认提供：default.json、dark.json
- 主题属性：colors、radius、spacing、fonts

## 数据库表设计

```sql
-- 学生表
students(id INTEGER PRIMARY KEY, name TEXT, score REAL, extra_json TEXT)

-- 分组表
groups(id INTEGER PRIMARY KEY, name TEXT, data_json TEXT)

-- 事件记录表
events(id INTEGER PRIMARY KEY, type INTEGER, ref_id INTEGER, desc TEXT, 
       val_prev REAL, val_curr REAL, erased INTEGER, timestamp INTEGER, 
       remote_id INTEGER, sync_state TEXT)

-- 评分理由表
reasons(id INTEGER PRIMARY KEY, name TEXT UNIQUE, sort INTEGER, 
        enabled INTEGER, updated_at INTEGER, sync_state TEXT)

-- 同步出队表
sync_outbox(seq TEXT PRIMARY KEY, payload_json TEXT, retries INTEGER, 
           last_error TEXT, created_at INTEGER)

-- 同步状态表
sync_state(key TEXT PRIMARY KEY, value TEXT)
```

## 同步机制

### Outbox 队列
- 所有写操作先写入本地数据库
- 同时生成同步事件到 outbox 队列
- 网络可用时异步推送到服务器

### 入站拉取
- 定期从服务器拉取最新变更
- 基于时间戳的增量同步
- 冲突处理：本地优先策略

### WebSocket 协议
- 基于 seq 的请求-响应匹配
- 支持超时和重试机制
- 自动重连功能

## 许可证

MIT License
