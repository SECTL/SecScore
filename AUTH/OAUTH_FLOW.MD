# OAuth 2.0 授权流程文档

本文档详细说明 SECTL Auth 的 OAuth 2.0 授权流程，帮助第三方应用开发者接入统一认证服务。

## 概述

SECTL Auth 实现了标准的 OAuth 2.0 授权码流程（Authorization Code Flow），允许第三方应用使用 SECTL Auth 账户进行用户认证。

### 流程特点

- **安全性高** - 使用授权码模式，避免 Token 暴露在浏览器端
- **标准化** - 遵循 OAuth 2.0 RFC 6749 规范
- **远程退登** - 支持通过 Realtime 实现跨平台同步退出
- **可配置** - 支持自定义 Token 过期时间

## 授权流程

### 流程图

```
┌─────────┐                                    ┌─────────────┐
│  用户   │                                    │  第三方应用  │
└────┬────┘                                    └──────┬──────┘
     │                                                │
     │  1. 访问应用                                    │
     │───────────────────────────────────────────────>│
     │                                                │
     │  2. 重定向到授权页面                             │
     │<───────────────────────────────────────────────│
     │                                                │
     │  3. 登录并授权 (LoginView.vue / OAuthAuthorizeView.vue)
     │───────────────────────────────────────────────>│
     │                                                │
     │  4. 返回授权码                                   │
     │<───────────────────────────────────────────────│
     │                                                │
     │  5. 用授权码换取 Token                           │
     │                                                │──────┐
     │                                                │      │
     │  6. 返回 Access Token                           │<─────┘
     │                                                │
     │  7. 使用 Token 访问用户资源                       │
     │<───────────────────────────────────────────────│
```

## 详细步骤

### 1. 引导用户到授权页面

当用户需要登录时，第三方应用应将用户重定向到 SECTL Auth 的授权页面。

**请求地址：**

```
GET https://sectl.top/oauth/authorize
```

**请求参数：**

| 参数名        | 必填 | 类型   | 说明                              |
| ------------- | ---- | ------ | --------------------------------- |
| client_id     | ✅   | string | 平台 ID，如 `pf_AHmIhAiptyLFxk8x` |
| redirect_uri  | ✅   | string | 回调地址，必须与平台设置匹配      |
| response_type | ✅   | string | 固定值 `code`                     |

**示例 URL：**

```
https://sectl.top/oauth/authorize?client_id=pf_AHmIhAiptyLFxk8x&redirect_uri=http://localhost:5000/callback&response_type=code
```

**相关代码：** [OAuthAuthorizeView.vue](../../src/views/OAuthAuthorizeView.vue)

### 2. 用户登录与授权

用户将被引导至 SECTL Auth 登录页面（如果未登录）：

1. **登录页面** ([LoginView.vue](../../src/views/LoginView.vue))
   - 用户输入邮箱密码或使用 GitHub 登录
   - 支持记住我功能
   - 检测 OAuth 参数，登录后自动跳转授权页

2. **授权确认页** ([OAuthAuthorizeView.vue](../../src/views/OAuthAuthorizeView.vue))
   - 显示应用名称和图标
   - 列出请求的权限范围
   - 用户可选择"授权"或"拒绝"

**权限范围：**

- 访问用户基本信息（用户名、邮箱、头像）
- 验证用户身份

### 3. 获取授权码

用户授权后，页面将重定向到指定的回调地址：

```
{redirect_uri}?code={authorization_code}
```

**示例：**

```
http://localhost:5000/callback?code=NjliNDIyOTYwMDE4znLUNeWM6J8ye0MC
```

**授权码特性：**

- 有效期：10 分钟
- 一次性使用
- 与 `redirect_uri` 绑定

### 4. 换取访问令牌

第三方应用后端使用授权码向 SECTL Auth 换取访问令牌。

**请求地址：**

```
POST https://sectl.top/api/oauth/token
```

**请求头：**

```
Content-Type: application/json
```

**请求体：**

```json
{
  "grant_type": "authorization_code",
  "code": "NjliNDIyOTYwMDE4znLUNeWM6J8ye0MC",
  "client_id": "pf_AHmIhAiptyLFxk8x",
  "client_secret": "sk_UyMHuFf6oKXh8ZcHSb7lfOSgzumoOeg1",
  "redirect_uri": "http://localhost:5000/callback"
}
```

**参数说明：**

| 参数名        | 必填 | 说明                        |
| ------------- | ---- | --------------------------- |
| grant_type    | ✅   | 固定值 `authorization_code` |
| code          | ✅   | 上一步获取的授权码          |
| client_id     | ✅   | 平台 ID                     |
| client_secret | ✅   | 平台密钥                    |
| redirect_uri  | ✅   | 必须与授权时一致            |

**成功响应：**

```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIs...",
  "refresh_token": "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  "token_type": "Bearer",
  "expires_in": 3600
}
```

**Token 信息：**

| 字段          | 说明                                |
| ------------- | ----------------------------------- |
| access_token  | 访问令牌，用于调用 API              |
| refresh_token | 刷新令牌，用于获取新的 access_token |
| token_type    | 令牌类型，固定为 Bearer             |
| expires_in    | 过期时间（秒）                      |

### 5. 使用访问令牌

获取 access_token 后，可用于调用 SECTL Auth API 获取用户信息。

**获取用户信息：**

```http
GET https://sectl.top/api/oauth/userinfo
Authorization: Bearer {access_token}
```

**响应示例：**

```json
{
  "user_id": "69bd422960018cf4d0e5",
  "email": "user@example.com",
  "name": "张三",
  "github_username": "zhangsan"
}
```

## Token 管理

### 过期时间配置

平台可配置 Token 过期时间：

| 令牌类型      | 默认有效期      | 说明                   |
| ------------- | --------------- | ---------------------- |
| access_token  | 3600 秒 (1小时) | 短期有效，用于访问资源 |
| refresh_token | 长期有效        | 用于刷新 access_token  |
| 授权码        | 600 秒 (10分钟) | 一次性使用             |

**修改过期时间：**

```http
POST https://sectl.top/api/oauth/config
Content-Type: application/json

{
  "expires_in": 86400,
  "admin_secret": "your-admin-secret"
}
```

### 刷新 Token

当 access_token 过期时，使用 refresh_token 获取新的令牌：

```http
POST https://sectl.top/api/oauth/token
Content-Type: application/json

{
  "grant_type": "refresh_token",
  "refresh_token": "your-refresh-token",
  "client_id": "your-platform-id",
  "client_secret": "your-platform-secret"
}
```

## 远程退登

SECTL Auth 支持远程退登功能，当用户在 SECTL Auth 中心退出登录时，已授权的第三方应用会收到通知。

### 实现原理

1. 用户在 SECTL Auth 点击退出登录
2. 系统创建 `logout_events` 文档
3. 第三方应用通过 Appwrite Realtime 订阅该集合
4. 收到退登事件后，应用执行本地退出操作

### 集成方式

详见 [平台接入指南](../platform-integration/README.md)。

## 错误处理

### 授权错误

当授权失败时，将重定向到回调地址并附带错误信息：

```
{redirect_uri}?error=access_denied&error_description=user+denied+authorization
```

**常见错误码：**

| 错误码                    | 说明               |
| ------------------------- | ------------------ |
| invalid_request           | 请求参数缺失或无效 |
| unauthorized_client       | 客户端未授权       |
| access_denied             | 用户拒绝授权       |
| unsupported_response_type | 不支持的响应类型   |
| invalid_scope             | 无效的权限范围     |
| server_error              | 服务器内部错误     |

### Token 错误

换取 Token 时的错误响应：

```json
{
  "error": "invalid_grant",
  "error_description": "Authorization code has expired"
}
```

**常见错误码：**

| 错误码                 | 说明                     |
| ---------------------- | ------------------------ |
| invalid_request        | 请求格式错误             |
| invalid_client         | 客户端认证失败           |
| invalid_grant          | 授权码无效或过期         |
| unauthorized_client    | 客户端无权使用此授权类型 |
| unsupported_grant_type | 不支持的授权类型         |
| invalid_scope          | 无效的权限范围           |

## 安全建议

1. **使用 HTTPS** - 所有 OAuth 通信必须使用 HTTPS
2. **保护 client_secret** - 不要在客户端代码中暴露 client_secret
3. **验证 redirect_uri** - 确保回调地址与注册时一致
4. **使用状态参数** - 建议添加 `state` 参数防止 CSRF 攻击
5. **及时清理** - 使用后的授权码应立即作废
6. **安全存储** - Token 应安全存储，避免泄露

## 相关页面

- [LoginView.vue](../../src/views/LoginView.vue) - 登录页面
- [OAuthAuthorizeView.vue](../../src/views/OAuthAuthorizeView.vue) - OAuth 授权页面
- [AuthCallbackView.vue](../../src/views/AuthCallbackView.vue) - 认证回调处理
- [LoginPlatformsView.vue](../../src/views/dashboard/list/LoginPlatformsView.vue) - 登录平台列表

## 参考文档

- [平台接入指南](../platform-integration/README.md)
- [API 参考](../platform-integration/API_REFERENCE.md)
- [故障排查](./TROUBLESHOOTING.md)
