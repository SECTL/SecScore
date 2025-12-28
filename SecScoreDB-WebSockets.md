# SecScoreDB WebSocket JSON Protocol Specification v1.0

## 1. 协议概述 (Overview)

- **传输层**: WebSocket
- **数据格式**: JSON (UTF-8)
- **通信模式**: 全双工异步通信 (Request-Response)
- **匹配机制**: 客户端生成唯一 `seq`，服务端在响应中原样返回，用于关联请求与响应。

---

## 2. 通信信封 (Message Envelope)

所有通信消息必须包含以下基础字段。

### 2.1 客户端请求 (Request)

| 字段 | 类型 | 必填 | 说明 |
| :--- | :--- | :--- | :--- |
| **`seq`** | String | Yes | 请求唯一序列号 (如 UUID) |
| **`category`** | String | Yes | 资源类别: `"system"`, `"student"`, `"group"`, `"event"` |
| **`action`** | String | Yes | 操作动作: `"define"`, `"create"`, `"query"`, `"update"`, `"delete"` |
| **`payload`** | Object | Yes | 具体操作参数，结构依 `action` 而定 |

### 2.2 服务端响应 (Response)

| 字段 | 类型 | 必填 | 说明 |
| :--- | :--- | :--- | :--- |
| **`seq`** | String | Yes | 对应请求的 `seq` |
| **`status`** | String | Yes | `"ok"` 或 `"error"` |
| **`code`** | Int | Yes | 状态码 (见第 6 节) |
| **`message`** | String | No | 错误描述或提示信息 |
| **`data`** | Object | No | 成功时的返回数据 |

---

## 3. 系统管理 (System Category)

### 3.1 定义 Schema (Define)

在操作数据前，必须定义动态字段结构。

**Request:**

```json
{
    "category": "system",
    "action": "define",
    "payload": {
        "target": "student",  // 或 "group"
        "schema": {
            "name": "string",
            "age": "int",
            "score": "double",
            "active": "int"
        }
    }
}
```

---

## 4. 数据资源操作 (Student & Group Category)

以下示例以 `category: "student"` 为例，`group` 同理。

### 4.1 批量创建/导入 (Batch Create)

**核心规则**:

1. `id` 为 `null` 时，服务端自动分配 ID。
2. `id` 有值时，强制使用该 ID (导入模式)。
3. 使用 `index` 锚定请求项，确保批量回包的对应关系。

**Request:**

```json
{
    "category": "student",
    "action": "create",
    "payload": {
        "items": [
            {
                "index": 0,      // 客户端临时索引
                "id": null,      // [请求分配ID]
                "data": { "name": "Alice", "age": 18, "score": 95.5 }
            },
            {
                "index": 1,
                "id": 10086,     // [强制指定ID]
                "data": { "name": "Bob", "age": 20 }
            }
        ]
    }
}
```

**Response Data:**

```json
{
    "count": 2, // 成功数量
    "results": [
        {
            "index": 0,
            "success": true,
            "id": 1001 // 服务端分配的新 ID
        },
        {
            "index": 1,
            "success": true,
            "id": 10086
        }
    ]
}
```

### 4.2 逻辑查询 (Query)

基于 AST 将 JSON 映射为 C++ Lambda。

**Request:**

```json
{
    "category": "student",
    "action": "query",
    "payload": {
        "logic": {
            "op": "AND", // 根节点逻辑: AND, OR
            "rules": [
                { "field": "score", "op": ">=", "val": 90.0 },
                { 
                    "op": "OR", 
                    "rules": [
                        { "field": "age", "op": "<", "val": 20 },
                        { "field": "name", "op": "==", "val": "Alice" }
                    ]
                }
            ]
        }
    }
}
```

*支持的操作符 (`op`): `==`, `!=`, `>`, `<`, `>=`, `<=`*

**Response Data:**

```json
{
    "items": [
        {
            "id": 1001,
            "data": { "name": "Alice", "age": 18, "score": 95.5 }
        }
    ]
}
```

### 4.3 更新 (Update)

**Request:**

```json
{
    "category": "student",
    "action": "update",
    "payload": {
        "id": 1001,
        "set": {
            "score": 98.0, // 仅更新指定字段
            "age": 19
        }
    }
}
```

### 4.4 删除 (Delete)

**Request:**

```json
{
    "category": "student",
    "action": "delete",
    "payload": {
        "id": 1001
    }
}
```

---

## 5. 事件操作 (Event Category)

### 5.1 添加事件 (Create)

**Request:**

```json
{
    "category": "event",
    "action": "create",
    "payload": {
        "id": null,     // 必须为 null
        "type": 1,      // 1=Student, 2=Group
        "ref_id": 1001, // 关联对象的 ID
        "desc": "Score adjustment",
        "val_prev": 95.5,
        "val_curr": 98.0
    }
}
```

**Response Data:**

```json
{
    "id": 501,       // 新生成的 Event ID
    "timestamp": 1710000000
}
```

### 5.2 标记擦除 (Update)

**Request:**

```json
{
    "category": "event",
    "action": "update",
    "payload": {
        "id": 501,
        "erased": true
    }
}
```

---

## 6. 状态码定义 (Status Codes)

| Code | Meaning | Description |
| :--- | :--- | :--- |
| **200** | OK | 请求成功执行 |
| **400** | Bad Request | JSON 格式错误、缺少必填字段或 `action` 不支持 |
| **404** | Not Found | 指定的 ID 不存在 |
| **422** | Unprocessable | 数据类型不匹配 (如给 Int 字段传 String) |
| **500** | Internal Error | 核心内部 C++ 异常 |
