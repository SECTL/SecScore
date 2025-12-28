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
│   │   ├── AppCore.h/cpp  # 应用核心，管理所有服务
│   │   └── ThemeService.h/cpp  # 主题服务
│   ├── db/                # 数据库层
│   │   ├── Database.h/cpp       # SQLite 数据库初始化
│   │   ├── StudentRepository.h/cpp
│   │   ├── EventRepository.h/cpp
│   │   └── ReasonRepository.h
│   ├── network/           # 网络层
│   │   ├── WsClient.h/cpp       # WebSocket 客户端
│   │   └── SyncEngine.h       # 同步引擎
│   └── models/            # 数据模型
│       ├── Student.h/cpp
│       ├── Event.h/cpp
│       └── Reason.h
└── app/                   # QML 资源
    └── qml/
        ├── App.qml               # 主应用
        ├── pages/                # 页面组件
        ├── components/           # 可复用组件
        └── themes/               # 主题文件
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

### 待实现（后续步骤）
- ⏳ ThemeService 完整实现 + QML 绑定
- ⏳ SQLite 完整表结构 + CRUD 操作
- ⏳ 学生管理页面（增删改查）
- ⏳ 事件记录页面（加减分 + 事件流水）
- ⏳ WebSocket 客户端（seq 匹配、超时、重连）
- ⏳ 同步引擎（outbox 队列、入站拉取）
- ⏺ 首次运行向导完整版（Remote 模式）
- ⏺ 设置页面（模式切换、主题选择）

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
- 主题文件位置：`app/qml/themes/*.json`
- 支持 QFileSystemWatcher 热加载
- 默认提供：default.json、dark.json

## 数据库表设计（预计）

```
students(id, name, score, extra_json)
groups(id, name, extra_json)
events(id, type, ref_id, desc, val_prev, val_curr, erased, timestamp, remote_id, sync_state)
reasons(name, sort, enabled, updated_at, sync_state)
sync_outbox(seq, payload_json, retries, last_error)
sync_state(key, value)
```

## 许可证

MIT License
