# OAuth 流程故障排查指南

本文档汇总了 SECTL Auth OAuth 流程中的常见问题及解决方案。

## 目录

- [授权阶段问题](#授权阶段问题)
- [Token 换取问题](#token-换取问题)
- [用户信息获取问题](#用户信息获取问题)
- [远程退登问题](#远程退登问题)
- [平台管理问题](#平台管理问题)
- [网络与 CORS 问题](#网络与-cors-问题)

---

## 授权阶段问题

### 1. 授权页面无法打开

**现象：** 访问授权 URL 返回 404 或空白页面

**排查步骤：**

1. 检查 URL 格式是否正确
   ```
   https://auth.sectl.top/oauth/authorize?client_id=xxx&redirect_uri=xxx&response_type=code
   ```
2. 确认必要参数是否齐全
   - `client_id` - 平台 ID
   - `redirect_uri` - 回调地址
   - `response_type` - 固定值 `code`
3. 检查平台是否存在且状态为 `active`
   - 登录 SECTL Auth 管理后台
   - 查看 [PlatformManagementView.vue](../../src/views/dashboard/manage/PlatformManagementView.vue)
   - 确认平台状态不是 `pending` 或 `disabled`

**相关页面：**

- [OAuthAuthorizeView.vue](../../src/views/OAuthAuthorizeView.vue)
- [PlatformManagementView.vue](../../src/views/dashboard/manage/PlatformManagementView.vue)

---

### 2. 授权后没有记录到登录平台

**现象：** 用户授权后，在"登录平台"页面 ([LoginPlatformsView.vue](../../src/views/dashboard/list/LoginPlatformsView.vue)) 看不到记录

**排查步骤：**

1. 检查浏览器控制台是否有错误
2. 检查 `user_data` 集合是否有该用户的记录
3. 检查 `user_data.login_platforms` 字段是否正确更新
4. 检查 `oauth_tokens` 集合是否有对应的令牌记录

**可能原因：**

- 用户未登录 SECTL Auth
- `user_data` 集合权限问题
- 网络请求失败
- 平台状态为 `disabled`

**相关页面：**

- [LoginPlatformsView.vue](../../src/views/dashboard/list/LoginPlatformsView.vue)
- [SecurityView.vue](../../src/views/dashboard/other/SecurityView.vue)

---

### 3. 用户已登录但授权页面仍要求登录

**现象：** 用户已登录 SECTL Auth，但授权页面仍跳转到登录页

**排查步骤：**

1. 检查登录状态是否正确保持
2. 检查浏览器 Cookie 是否被阻止
3. 检查是否跨域问题

**解决方案：**

- 确保浏览器允许第三方 Cookie
- 检查 `rememberMe` 选项是否勾选
- 查看 [LoginView.vue](../../src/views/LoginView.vue) 中的登录逻辑

---

## Token 换取问题

### 1. 换取 token 时提示 "Invalid authorization code"

**现象：** 用 code 换取 token 返回 400 错误

```json
{
  "error": "invalid_grant",
  "error_description": "Invalid authorization code"
}
```

**排查步骤：**

1. 检查 code 是否已过期（10分钟有效期）
2. 检查 code 是否已被使用过
3. 检查 `redirect_uri` 是否与授权时一致
4. 检查 `client_id` 和 `client_secret` 是否正确

**可能原因：**

- Code 已过期
- Code 已被使用（一次性）
- 回调地址不匹配
- 平台密钥错误

**相关代码：** [AuthCallbackView.vue](../../src/views/AuthCallbackView.vue)

---

### 2. 换取 token 时提示 "Invalid client"

**现象：** 返回 401 错误

```json
{
  "error": "invalid_client",
  "error_description": "Client authentication failed"
}
```

**排查步骤：**

1. 确认 `client_id` 正确
2. 确认 `client_secret` 正确且未泄露
3. 检查平台状态是否为 `active`

**解决方案：**

- 在 [PlatformManagementView.vue](../../src/views/dashboard/manage/PlatformManagementView.vue) 查看平台信息
- 如密钥泄露，在 [PlatformSettingsView.vue](../../src/views/dashboard/other/PlatformSettingsView.vue) 重置密钥

---

### 3. Access Token 过期后无法刷新

**现象：** 使用 refresh_token 换取新 token 失败

**排查步骤：**

1. 检查 refresh_token 是否有效
2. 检查 refresh_token 是否被撤销
3. 检查平台是否被禁用

**请求示例：**

```http
POST /api/oauth/token
{
  "grant_type": "refresh_token",
  "refresh_token": "your-refresh-token",
  "client_id": "your-platform-id",
  "client_secret": "your-platform-secret"
}
```

---

## 用户信息获取问题

### 1. 获取用户信息返回 401

**现象：** 调用 `/api/oauth/userinfo` 返回未授权错误

**排查步骤：**

1. 检查 access_token 是否过期
2. 检查 Authorization 头格式是否正确
   ```
   Authorization: Bearer {access_token}
   ```
3. 检查 token 是否被撤销

**解决方案：**

- 使用 refresh_token 获取新的 access_token
- 重新走授权流程

**相关页面：** [PlatformUsersView.vue](../../src/views/dashboard/manage/PlatformUsersView.vue)

---

### 2. 用户信息字段缺失

**现象：** 返回的用户信息缺少某些字段

**排查步骤：**

1. 检查用户是否设置了该字段
2. 检查数据库中 `user_data` 集合是否有该字段

**响应示例：**

```json
{
  "user_id": "69bd422960018cf4d0e5",
  "email": "user@example.com",
  "name": "张三",
  "github_username": "zhangsan",
  "permission": 1
}
```

---

## 远程退登问题

### 1. 远程退登不生效

**现象：** 用户在 SECTL Auth 退出后，第三方平台没有自动退出

**排查步骤：**

1. 检查是否正确订阅了 `logout_events` 集合
2. 检查 user_id 是否匹配
3. 确认 Appwrite Realtime 连接正常
4. 查看浏览器控制台是否有错误

**订阅代码示例：**

```javascript
client.subscribe(
  "databases.69bd89d8000304c37368.collections.logout_events.documents",
  (response) => {
    const event = response.payload
    if (event.user_id === currentUserId) {
      localLogout()
    }
  }
)
```

**相关页面：**

- [SecurityView.vue](../../src/views/dashboard/other/SecurityView.vue)
- [PlatformManagementView.vue](../../src/views/dashboard/manage/PlatformManagementView.vue)

---

### 2. Realtime 连接断开

**现象：** 退登事件偶尔收不到

**排查步骤：**

1. 检查网络连接稳定性
2. 检查是否有心跳机制保持连接
3. 检查浏览器是否进入休眠状态

**解决方案：**

- 实现重连机制
- 定期检查连接状态
- 使用 Service Worker 保持后台连接

---

## 平台管理问题

### 1. 平台管理的"登录用户"为空

**现象：** 在平台管理页面查看登录用户，显示为空

**排查步骤：**

1. 检查 `oauth_tokens` 集合是否有记录
2. 检查记录是否有 `user_id` 字段
3. 检查 `oauth_tokens` 集合权限

**解决方案：**

如果 `oauth_tokens` 没有 `user_id` 字段，需要在 Appwrite Console 中添加：

1. 进入 Database → 选择数据库
2. 找到 `oauth_tokens` 集合
3. 添加字段：`user_id`（String 类型，非必填）

**相关页面：**

- [PlatformManagementView.vue](../../src/views/dashboard/manage/PlatformManagementView.vue)
- [PlatformUsersView.vue](../../src/views/dashboard/manage/PlatformUsersView.vue)

---

### 2. 平台状态显示"审核中"

**现象：** 新创建的平台无法使用，状态为 `pending`

**排查步骤：**

1. 检查是否已提交平台申请
2. 联系管理员审核
3. 在 [MyPlatformApplicationsView.vue](../../src/views/dashboard/manage/MyPlatformApplicationsView.vue) 查看申请状态

**解决方案：**

- 等待管理员审核
- 管理员在 [PlatformApplicationsView.vue](../../src/views/dashboard/manage/PlatformApplicationsView.vue) 中批准申请

---

### 3. 无法修改平台回调地址

**现象：** 在平台设置中修改回调地址失败

**排查步骤：**

1. 检查是否有权限修改（所有者或管理员）
2. 检查回调地址格式是否正确
3. 检查数据库权限配置

**相关页面：** [PlatformSettingsView.vue](../../src/views/dashboard/other/PlatformSettingsView.vue)

---

## 网络与 CORS 问题

### 1. CORS 错误

**现象：** 浏览器控制台显示 CORS 错误

**错误信息：**

```
Access to fetch at 'https://auth.sectl.top/...' from origin 'https://auth.sectl.top' has been blocked by CORS policy
```

**解决方案：**

已在 OAuth API 中添加 CORS 头：

```javascript
res.setHeader("Access-Control-Allow-Origin", "*")
res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization")
```

**排查步骤：**

1. 确认请求头是否正确
2. 确认是否为预检请求（OPTIONS）问题
3. 检查服务器 CORS 配置

---

### 2. 授权码中的用户ID解码失败

**现象：** 换取 token 后 `user_id` 为 "anonymous"

**排查步骤：**

1. 检查授权码格式（应为 32 位：前16位 base64 用户ID + 后16位随机）
2. 检查 `oauth_codes` 集合是否有 `user_id` 字段

**代码逻辑：**

```javascript
// 生成授权码时编码用户ID
const userIdHash = Buffer.from(userId)
  .toString("base64")
  .replace(/[^a-zA-Z0-9]/g, "")
  .substring(0, 16)
const code = userIdHash + randomPart

// 换取 token 时解码
try {
  const userIdHash = code.substring(0, 16)
  const base64Str = userIdHash.replace(/_/g, "/").replace(/-/g, "+") + "=="
  const decoded = Buffer.from(base64Str, "base64").toString("utf8")
  tokenUserId = decoded
} catch (e) {
  tokenUserId = "anonymous"
}
```

---

### 3. 网络超时

**现象：** 请求 OAuth API 超时

**排查步骤：**

1. 检查网络连接
2. 检查服务器状态
3. 增加请求超时时间

**解决方案：**

```javascript
// 增加超时时间
const response = await fetch(url, {
  ...options,
  signal: AbortSignal.timeout(30000), // 30秒超时
})
```

---

## 调试技巧

### 1. 浏览器开发者工具

使用浏览器开发者工具排查问题：

1. **Network 面板** - 查看请求和响应
2. **Console 面板** - 查看错误日志
3. **Application 面板** - 查看 Cookie 和 LocalStorage

### 2. Appwrite Console

在 Appwrite Console 中检查：

1. **Database** - 检查集合数据和权限
2. **Auth** - 检查用户和会话
3. **Functions** - 查看函数日志
4. **Realtime** - 检查实时连接

### 3. 日志记录

在关键位置添加日志：

```javascript
// 授权流程日志
console.log("OAuth params:", { client_id, redirect_uri, response_type })
console.log("Authorization code:", code)
console.log("Token response:", tokenData)

// 退登事件日志
console.log("Logout event received:", event)
console.log("Current user ID:", currentUserId)
```

---

## 常见问题速查表

| 问题           | 可能原因             | 解决方案                |
| :------------- | :------------------- | :---------------------- |
| 授权页面 404   | 平台不存在或状态异常 | 检查平台状态和 ID       |
| Invalid code   | Code 过期或已使用    | 重新授权获取新 code     |
| Invalid client | 密钥错误             | 检查 client_secret      |
| Token 过期     | 超过 expires_in      | 使用 refresh_token 刷新 |
| 用户信息 401   | Token 无效           | 检查 Token 格式和有效期 |
| 退登不生效     | Realtime 未连接      | 检查订阅代码            |
| CORS 错误      | 跨域配置问题         | 检查服务器 CORS 头      |

---

## 获取帮助

如果以上方案无法解决问题：

1. 查看 [API 参考](../platform-integration/API_REFERENCE.md)
2. 查看 [平台接入指南](../platform-integration/README.md)
3. 提交 Issue 到项目仓库
4. 联系管理员

---

## 相关页面

- [OAuthAuthorizeView.vue](../../src/views/OAuthAuthorizeView.vue) - OAuth 授权页面
- [AuthCallbackView.vue](../../src/views/AuthCallbackView.vue) - 认证回调
- [LoginView.vue](../../src/views/LoginView.vue) - 登录页面
- [PlatformManagementView.vue](../../src/views/dashboard/manage/PlatformManagementView.vue) - 平台管理
- [PlatformSettingsView.vue](../../src/views/dashboard/other/PlatformSettingsView.vue) - 平台设置
- [SecurityView.vue](../../src/views/dashboard/other/SecurityView.vue) - 安全设置
- [LoginPlatformsView.vue](../../src/views/dashboard/list/LoginPlatformsView.vue) - 登录平台列表
