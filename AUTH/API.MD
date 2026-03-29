# SECTL Auth API 参考

本文档详细说明 SECTL Auth 提供的所有 API 接口。

## 基础信息

- **基础 URL**: `https://sectl.top`
- **认证方式**: OAuth 2.0 + Bearer Token
- **数据格式**: JSON

## 接口概览

| 接口                    | 方法 | 说明                | 对应页面                 |
| ----------------------- | ---- | ------------------- | ------------------------ |
| `/oauth/authorize`      | GET  | 获取授权码          | OAuthAuthorizeView.vue   |
| `/api/oauth/token`      | POST | 换取/刷新令牌       | AuthCallbackView.vue     |
| `/api/oauth/userinfo`   | GET  | 获取用户信息        | PlatformUsersView.vue    |
| `/api/oauth/config`     | POST | 配置 Token 过期时间 | PlatformSettingsView.vue |
| `/api/oauth/revoke`     | POST | 撤销令牌            | SecurityView.vue         |
| `/api/oauth/introspect` | POST | 验证令牌            | -                        |

---

## OAuth 接口

### 1. 获取授权码

引导用户跳转到授权页面。

```http
GET /oauth/authorize
```

**请求参数：**

| 参数名        | 类型   | 必填 | 说明             |
| ------------- | ------ | ---- | ---------------- |
| client_id     | string | ✅   | 平台 ID          |
| redirect_uri  | string | ✅   | 回调 URL         |
| response_type | string | ✅   | 固定值 `code`    |
| state         | string | ❌   | 防 CSRF 状态参数 |

**示例请求：**

```
https://sectl.top/oauth/authorize?client_id=pf_AHmIhAiptyLFxk8x&redirect_uri=http://localhost:5000/callback&response_type=code
```

**成功响应：**

- 重定向到 `redirect_uri?code={authorization_code}&state={state}`

**错误响应：**

- 重定向到 `redirect_uri?error={error_code}&error_description={description}`

**错误码：**

| 错误码                    | 说明               |
| ------------------------- | ------------------ |
| invalid_request           | 请求参数缺失或无效 |
| unauthorized_client       | 客户端未授权       |
| access_denied             | 用户拒绝授权       |
| unsupported_response_type | 不支持的响应类型   |
| invalid_scope             | 无效的权限范围     |
| server_error              | 服务器内部错误     |

**相关页面：**

- [OAuthAuthorizeView.vue](../../src/views/OAuthAuthorizeView.vue) - 授权页面
- [LoginView.vue](../../src/views/LoginView.vue) - 登录页面

---

### 2. 获取访问令牌

使用授权码换取访问令牌。

```http
POST /api/oauth/token
```

**请求头：**

```
Content-Type: application/json
```

**请求体：**

| 参数名        | 类型   | 必填 | 说明                                             |
| ------------- | ------ | ---- | ------------------------------------------------ |
| grant_type    | string | ✅   | `authorization_code` 或 `refresh_token`          |
| code          | string | 条件 | 授权码（grant_type=authorization_code 时必填）   |
| refresh_token | string | 条件 | 刷新令牌（grant_type=refresh_token 时必填）      |
| client_id     | string | ✅   | 平台 ID                                          |
| client_secret | string | ✅   | 平台密钥                                         |
| redirect_uri  | string | 条件 | 回调地址（grant_type=authorization_code 时必填） |

**授权码模式示例：**

```json
{
  "grant_type": "authorization_code",
  "code": "NjliNDIyOTYwMDE4znLUNeWM6J8ye0MC",
  "client_id": "pf_AHmIhAiptyLFxk8x",
  "client_secret": "sk_UyMHuFf6oKXh8ZcHSb7lfOSgzumoOeg1",
  "redirect_uri": "http://localhost:5000/callback"
}
```

**刷新令牌模式示例：**

```json
{
  "grant_type": "refresh_token",
  "refresh_token": "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  "client_id": "pf_AHmIhAiptyLFxk8x",
  "client_secret": "sk_UyMHuFf6oKXh8ZcHSb7lfOSgzumoOeg1"
}
```

**成功响应：**

```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refresh_token": "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  "token_type": "Bearer",
  "expires_in": 3600
}
```

**响应字段：**

| 字段          | 类型   | 说明                    |
| ------------- | ------ | ----------------------- |
| access_token  | string | 访问令牌（JWT）         |
| refresh_token | string | 刷新令牌                |
| token_type    | string | 令牌类型，固定为 Bearer |
| expires_in    | number | 过期时间（秒）          |

**错误响应：**

```json
{
  "error": "invalid_grant",
  "error_description": "Authorization code has expired"
}
```

**错误码：**

| 错误码                 | HTTP 状态 | 说明                     |
| ---------------------- | --------- | ------------------------ |
| invalid_request        | 400       | 请求格式错误             |
| invalid_client         | 401       | 客户端认证失败           |
| invalid_grant          | 400       | 授权码无效或过期         |
| unauthorized_client    | 400       | 客户端无权使用此授权类型 |
| unsupported_grant_type | 400       | 不支持的授权类型         |
| invalid_scope          | 400       | 无效的权限范围           |

**相关页面：**

- [AuthCallbackView.vue](../../src/views/AuthCallbackView.vue) - 回调处理

---

### 3. 获取用户信息

使用访问令牌获取用户信息。

```http
GET /api/oauth/userinfo
```

**请求头：**

```
Authorization: Bearer {access_token}
```

**成功响应：**

```json
{
  "user_id": "69bd422960018cf4d0e5",
  "email": "user@example.com",
  "name": "张三",
  "github_username": "zhangsan",
  "permission": 1
}
```

**响应字段：**

| 字段            | 类型   | 说明                  |
| --------------- | ------ | --------------------- |
| user_id         | string | 用户唯一标识          |
| email           | string | 用户邮箱              |
| name            | string | 用户名称              |
| github_username | string | GitHub 用户名（如有） |
| permission      | number | 用户权限等级          |

**错误响应：**

```json
{
  "error": "invalid_token",
  "error_description": "The access token is invalid or has expired"
}
```

**相关页面：**

- [PlatformUsersView.vue](../../src/views/dashboard/manage/PlatformUsersView.vue) - 平台用户列表

---

### 4. 配置 Token 过期时间

配置平台的 access_token 过期时间（需要管理员权限）。

```http
POST /api/oauth/config
```

**请求头：**

```
Content-Type: application/json
```

**请求体：**

| 参数名       | 类型   | 必填 | 说明                                        |
| ------------ | ------ | ---- | ------------------------------------------- |
| platform_id  | string | ✅   | 平台 ID                                     |
| expires_in   | number | ✅   | 过期时间（秒），-1 表示永不过期，最小 60 秒 |
| admin_secret | string | ✅   | 管理员密钥                                  |

**请求示例：**

```json
{
  "platform_id": "pf_AHmIhAiptyLFxk8x",
  "expires_in": 86400,
  "admin_secret": "your-admin-secret"
}
```

**成功响应：**

```json
{
  "success": true,
  "message": "Token expiration time updated",
  "expires_in": 86400
}
```

**错误响应：**

```json
{
  "error": "unauthorized",
  "error_description": "Invalid admin secret"
}
```

**相关页面：**

- [PlatformSettingsView.vue](../../src/views/dashboard/other/PlatformSettingsView.vue) - 平台设置

---

### 5. 撤销令牌

撤销指定的访问令牌或刷新令牌。

```http
POST /api/oauth/revoke
```

**请求头：**

```
Content-Type: application/json
```

**请求体：**

| 参数名          | 类型   | 必填 | 说明                              |
| --------------- | ------ | ---- | --------------------------------- |
| token           | string | ✅   | 要撤销的令牌                      |
| token_type_hint | string | ❌   | `access_token` 或 `refresh_token` |
| client_id       | string | ✅   | 平台 ID                           |
| client_secret   | string | ✅   | 平台密钥                          |

**请求示例：**

```json
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "token_type_hint": "access_token",
  "client_id": "pf_AHmIhAiptyLFxk8x",
  "client_secret": "sk_UyMHuFf6oKXh8ZcHSb7lfOSgzumoOeg1"
}
```

**成功响应：**

```json
{
  "success": true,
  "message": "Token revoked successfully"
}
```

**相关页面：**

- [SecurityView.vue](../../src/views/dashboard/other/SecurityView.vue) - 安全设置
- [LoginPlatformsView.vue](../../src/views/dashboard/list/LoginPlatformsView.vue) - 登录平台列表

---

### 6. 验证令牌

验证访问令牌的有效性和获取令牌信息。

```http
POST /api/oauth/introspect
```

**请求头：**

```
Content-Type: application/json
```

**请求体：**

| 参数名        | 类型   | 必填 | 说明         |
| ------------- | ------ | ---- | ------------ |
| token         | string | ✅   | 要验证的令牌 |
| client_id     | string | ✅   | 平台 ID      |
| client_secret | string | ✅   | 平台密钥     |

**请求示例：**

```json
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "client_id": "pf_AHmIhAiptyLFxk8x",
  "client_secret": "sk_UyMHuFf6oKXh8ZcHSb7lfOSgzumoOeg1"
}
```

**活跃令牌响应：**

```json
{
  "active": true,
  "user_id": "69bd422960018cf4d0e5",
  "client_id": "pf_AHmIhAiptyLFxk8x",
  "exp": 1704783600,
  "iat": 1704780000
}
```

**非活跃令牌响应：**

```json
{
  "active": false
}
```

**响应字段：**

| 字段      | 类型    | 说明                     |
| --------- | ------- | ------------------------ |
| active    | boolean | 令牌是否有效             |
| user_id   | string  | 用户 ID（仅活跃令牌）    |
| client_id | string  | 平台 ID（仅活跃令牌）    |
| exp       | number  | 过期时间戳（仅活跃令牌） |
| iat       | number  | 签发时间戳（仅活跃令牌） |

---

## 平台管理 API

以下 API 用于管理平台信息，需要通过 Appwrite SDK 调用。

### 获取平台列表

```javascript
// 使用 Appwrite SDK
const result = await databases.listDocuments({
  databaseId: "69bd89d8000304c37368",
  collectionId: "platforms",
  queries: [Query.orderDesc("$createdAt"), Query.limit(100)],
})
```

**相关页面：**

- [PlatformManagementView.vue](../../src/views/dashboard/manage/PlatformManagementView.vue)

### 获取平台详情

```javascript
const platform = await databases.getDocument({
  databaseId: "69bd89d8000304c37368",
  collectionId: "platforms",
  documentId: "platform-document-id",
})
```

**相关页面：**

- [PlatformDetailView.vue](../../src/views/dashboard/detail/PlatformDetailView.vue)

### 更新平台信息

```javascript
await databases.updateDocument({
  databaseId: "69bd89d8000304c37368",
  collectionId: "platforms",
  documentId: "platform-document-id",
  data: {
    callback_url: "http://new-callback.com",
    token_expires_in: 7200,
  },
})
```

**相关页面：**

- [PlatformSettingsView.vue](../../src/views/dashboard/other/PlatformSettingsView.vue)

### 申请创建平台

```javascript
await databases.createDocument({
  databaseId: "69bd89d8000304c37368",
  collectionId: "platform_applications",
  documentId: ID.unique(),
  data: {
    name: "我的应用",
    description: "应用描述",
    callback_url: "http://localhost:5000/callback",
    owner_id: currentUser.$id,
    status: "pending",
    created_at: new Date().toISOString(),
  },
})
```

**相关页面：**

- [PlatformApplyView.vue](../../src/views/dashboard/form/PlatformApplyView.vue)

---

## 用户管理 API

### 获取用户授权的平台列表

```javascript
const result = await databases.listDocuments({
  databaseId: "69bd89d8000304c37368",
  collectionId: "oauth_tokens",
  queries: [Query.equal("user_id", currentUser.$id), Query.equal("revoked", false)],
})
```

**相关页面：**

- [LoginPlatformsView.vue](../../src/views/dashboard/list/LoginPlatformsView.vue)

### 获取平台授权用户列表

```javascript
const result = await databases.listDocuments({
  databaseId: "69bd89d8000304c37368",
  collectionId: "oauth_tokens",
  queries: [Query.equal("platform_id", "pf_xxx"), Query.equal("revoked", false)],
})
```

**相关页面：**

- [PlatformUsersView.vue](../../src/views/dashboard/manage/PlatformUsersView.vue)

---

## 云存储 API

云存储 API 提供文件上传、下载、管理等功能。需要通过 OAuth access_token 进行认证。

### 接口概览

| 接口                            | 方法   | 说明                     | SDK 方法                        |
| ------------------------------- | ------ | ------------------------ | ------------------------------- |
| `/api/cloud/upload`             | POST   | 上传文件                 | `uploadFile()`                  |
| `/api/cloud/files/{file_id}`    | GET    | 获取文件信息             | `getFile()`                     |
| `/api/cloud/download/{file_id}` | GET    | 获取下载链接             | `downloadFile()`                |
| `/api/cloud/view/{file_id}`     | GET    | 查看文件内容             | `viewFile()`                    |
| `/api/cloud/preview/{file_id}`  | GET    | 预览文件（支持图片处理） | `previewFile()`                 |
| `/api/cloud/info`               | GET    | 获取存储信息             | `getStorageInfo()`              |
| `/api/cloud/files`              | GET    | 列出/搜索文件            | `listFiles()` / `searchFiles()` |
| `/api/cloud/files/{file_id}`    | PUT    | 更新文件（重命名）       | `updateFile()`                  |
| `/api/cloud/files/{file_id}`    | DELETE | 删除文件                 | `deleteFile()`                  |

---

### 1. 上传文件

上传文件到云存储，系统会自动验证文件格式和检查存储容量。

```http
POST /api/cloud/upload
```

**请求头：**

```
Authorization: Bearer {access_token}
Content-Type: multipart/form-data
```

**请求参数：**

| 参数名      | 类型   | 必填 | 说明         |
| ----------- | ------ | ---- | ------------ |
| file        | File   | ✅   | 要上传的文件 |
| platform_id | string | ✅   | 平台 ID      |

**请求示例（JavaScript）：**

```javascript
const formData = new FormData()
formData.append("file", fileInput.files[0])
formData.append("platform_id", "pf_AHmIhAiptyLFxk8x")

const response = await fetch("https://sectl.top/api/cloud/upload", {
  method: "POST",
  headers: {
    Authorization: "Bearer eyJhbGciOiJIUzI1NiIs...",
  },
  body: formData,
})
```

**成功响应：**

```json
{
  "success": true,
  "file_id": "cf_xxxxxxxx",
  "filename": "example.jpg",
  "size": 1024567,
  "url": "https://cloud.appwrite.io/v1/storage/buckets/69c869010007b752a9b1/files/xxx/view",
  "storage": {
    "used": "50MB",
    "limit": "100MB",
    "available": "50MB",
    "percentage": 50
  }
}
```

**错误响应 - 格式不允许：**

```json
{
  "error": "invalid_format",
  "error_description": "File format 'exe' is not allowed",
  "allowed_formats": ["jpg", "png", "pdf"]
}
```

**错误响应 - 超出容量：**

```json
{
  "error": "storage_exceeded",
  "error_description": "Upload would exceed storage limit",
  "storage": {
    "used": "95MB",
    "limit": "100MB",
    "available": "5MB",
    "requested": "10MB"
  }
}
```

**相关页面：**

- [CloudServiceView.vue](../../src/views/dashboard/CloudServiceView.vue) - 云服务总览

---

### 2. 下载文件

获取文件的下载链接。

```http
GET /api/cloud/download/{file_id}
```

**请求头：**

```
Authorization: Bearer {access_token}
```

**路径参数：**

| 参数名  | 类型   | 必填 | 说明    |
| ------- | ------ | ---- | ------- |
| file_id | string | ✅   | 文件 ID |

**成功响应：**

```json
{
  "success": true,
  "file_id": "cf_xxxxxxxx",
  "filename": "example.jpg",
  "download_url": "https://cloud.appwrite.io/v1/storage/buckets/69c869010007b752a9b1/files/xxx/download",
  "expires_at": "2025-01-01T01:00:00Z"
}
```

---

### 3. 获取存储信息

获取用户在该平台的存储使用情况和配置信息。

```http
GET /api/cloud/info?platform_id={platform_id}
```

**请求头：**

```
Authorization: Bearer {access_token}
```

**查询参数：**

| 参数名      | 类型   | 必填 | 说明    |
| ----------- | ------ | ---- | ------- |
| platform_id | string | ✅   | 平台 ID |

**成功响应：**

```json
{
  "success": true,
  "platform_id": "pf_xxx",
  "tier": "free",
  "storage": {
    "used": 52428800,
    "used_formatted": "50MB",
    "limit": 104857600,
    "limit_formatted": "100MB",
    "available": 52428800,
    "available_formatted": "50MB",
    "percentage": 50
  },
  "allowed_formats": ["jpg", "png", "pdf"],
  "max_file_size": 10485760
}
```

---

### 4. 列出文件

获取用户在该平台的文件列表。

```http
GET /api/cloud/files?platform_id={platform_id}&limit=20&offset=0
```

**请求头：**

```
Authorization: Bearer {access_token}
```

**查询参数：**

| 参数名      | 类型   | 必填 | 说明              |
| ----------- | ------ | ---- | ----------------- |
| platform_id | string | ✅   | 平台 ID           |
| limit       | number | ❌   | 每页数量，默认 20 |
| offset      | number | ❌   | 偏移量，默认 0    |

**成功响应：**

```json
{
  "success": true,
  "files": [
    {
      "file_id": "cf_xxx",
      "filename": "example.jpg",
      "size": 1024567,
      "size_formatted": "1MB",
      "created_at": "2025-01-01T00:00:00Z"
    }
  ],
  "total": 10,
  "limit": 20,
  "offset": 0
}
```

---

### 5. 删除文件

删除指定的文件。

```http
DELETE /api/cloud/files/{file_id}
```

**请求头：**

```
Authorization: Bearer {access_token}
```

**路径参数：**

| 参数名  | 类型   | 必填 | 说明    |
| ------- | ------ | ---- | ------- |
| file_id | string | ✅   | 文件 ID |

**成功响应：**

```json
{
  "success": true,
  "message": "File deleted successfully",
  "storage": {
    "used": "45MB",
    "limit": "100MB",
    "available": "55MB"
  }
}
```

---

## 云存储 SDK

我们提供了 JavaScript SDK 简化云存储 API 的调用。

### 安装

```html
<script src="https://sectl.top/platform-sdk/cloud-storage.js"></script>
```

或使用 ES6 模块：

```javascript
import CloudStorage from "./cloud-storage.js"
```

### 初始化

```javascript
const cloud = new CloudStorage({
  baseUrl: "https://sectl.top",
  platformId: "your_platform_id",
  accessToken: "your_access_token",
})
```

### 使用示例

```javascript
// 上传文件
try {
  const result = await cloud.uploadFile(fileInput.files[0])
  console.log("文件上传成功:", result.file_id)
  console.log("存储使用情况:", result.storage.percentage + "%")
} catch (error) {
  if (error.code === "invalid_format") {
    console.error("不支持的文件格式:", error.data.allowed_formats)
  } else if (error.code === "storage_exceeded") {
    console.error("存储空间不足")
  }
}

// 获取存储信息
const info = await cloud.getStorageInfo()
console.log("已用空间:", info.storage.used_formatted)
console.log("允许格式:", info.allowed_formats)

// 列出文件
const files = await cloud.listFiles({ limit: 10 })
files.files.forEach((file) => {
  console.log(file.filename, file.size_formatted)
})

// 下载文件
const download = await cloud.downloadFile("cf_xxx")
window.location.href = download.download_url

// 删除文件
await cloud.deleteFile("cf_xxx")
```

**相关文件：**

- [cloud-storage.js](../../platform-sdk/cloud-storage.js) - SDK 源码

---

## 远程退登 API

### 创建退登事件

当用户退出登录时，系统会自动创建退登事件。

```javascript
await databases.createDocument({
  databaseId: "69bd89d8000304c37368",
  collectionId: "logout_events",
  documentId: ID.unique(),
  data: {
    user_id: currentUser.$id,
    platform_id: null, // null 表示全局退出
    global: true,
    created_at: new Date().toISOString(),
  },
})
```

### 订阅退登事件

使用 Appwrite Realtime 订阅退登事件：

```javascript
import { Client } from "appwrite"

const client = new Client()
  .setEndpoint("https://cloud.appwrite.io/v1")
  .setProject("your-project-id")

const unsubscribe = client.subscribe(
  "databases.69bd89d8000304c37368.collections.logout_events.documents",
  (response) => {
    const event = response.payload
    if (event.user_id === currentUserId) {
      // 执行本地退出
      localLogout()
    }
  }
)
```

**相关页面：**

- [SecurityView.vue](../../src/views/dashboard/other/SecurityView.vue)

---

## 错误处理

### HTTP 状态码

| 状态码 | 说明               |
| ------ | ------------------ |
| 200    | 请求成功           |
| 400    | 请求参数错误       |
| 401    | 未授权，认证失败   |
| 403    | 禁止访问，权限不足 |
| 404    | 资源不存在         |
| 500    | 服务器内部错误     |

### 错误响应格式

```json
{
  "error": "error_code",
  "error_description": "详细的错误描述",
  "error_uri": "https://docs.example.com/error/error_code"
}
```

---

## 安全建议

1. **使用 HTTPS** - 所有 API 通信必须使用 HTTPS
2. **保护密钥** - 不要在客户端代码中暴露 client_secret
3. **验证回调地址** - 确保 redirect_uri 与注册时一致
4. **使用状态参数** - 添加 state 参数防止 CSRF 攻击
5. **安全存储令牌** - Token 应安全存储，避免泄露
6. **及时撤销** - 用户退出时及时撤销令牌

---

## 相关页面

- [OAuthAuthorizeView.vue](../../src/views/OAuthAuthorizeView.vue) - OAuth 授权页面
- [AuthCallbackView.vue](../../src/views/AuthCallbackView.vue) - 认证回调
- [PlatformManagementView.vue](../../src/views/dashboard/manage/PlatformManagementView.vue) - 平台管理
- [PlatformDetailView.vue](../../src/views/dashboard/detail/PlatformDetailView.vue) - 平台详情
- [PlatformSettingsView.vue](../../src/views/dashboard/other/PlatformSettingsView.vue) - 平台设置
- [SecurityView.vue](../../src/views/dashboard/other/SecurityView.vue) - 安全设置
- [LoginPlatformsView.vue](../../src/views/dashboard/list/LoginPlatformsView.vue) - 登录平台列表
