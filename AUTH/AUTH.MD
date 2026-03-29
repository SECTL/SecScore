# 平台接入指南

本文档介绍如何将第三方平台与 SECTL Auth 集成，实现统一认证和远程退登功能。

## 目录

- [概述](#概述)
- [快速开始](#快速开始)
- [管理后台功能](#管理后台功能)
- [OAuth 集成](#oauth-集成)
- [远程退登](#远程退登)
- [代码示例](#代码示例)
- [常见问题](#常见问题)

## 概述

SECTL Auth 提供以下核心功能：

1. **统一认证** - 用户使用 SECTL Auth 账号登录第三方平台
2. **远程退登** - 用户在 SECTL Auth 中心退出后，平台自动退出
3. **用户管理** - 查看已授权用户、统计信息等

### 工作流程

```
┌─────────────┐     登录请求    ┌─────────────┐
│   用户      │ ─────────────> │  SECTL Auth │
│             │                │             │
│   平台A     │ <───────────── │   认证中心   │
│             │   Access Token │             │
└──────┬──────┘                └──────┬──────┘
       │                              │
       │      远程退登通知             │
       │ <─────────────────────────── │
       │      (Realtime)              │
       ▼                              ▼
  自动退出登录                   用户点击退出
```

## 快速开始

### 1. 注册平台

在 SECTL Auth 平台管理页面 ([PlatformManagementView.vue](../../src/views/dashboard/manage/PlatformManagementView.vue)) 申请接入，获取：

| 参数           | 说明         | 示例                                  |
| -------------- | ------------ | ------------------------------------- |
| platform_id    | 平台唯一标识 | `pf_AHmIhAiptyLFxk8x`                 |
| platform_token | 平台认证密钥 | `sk_UyMHuFf6oKXh8ZcHSb7lfOSgzumoOeg1` |
| callback_url   | 回调地址     | `http://localhost:5000/callback`      |

### 2. 平台状态说明

平台在管理后台有以下状态：

| 状态     | 说明   | 可操作   |
| -------- | ------ | -------- |
| active   | 运行中 | 正常授权 |
| pending  | 审核中 | 等待审核 |
| disabled | 已停用 | 无法授权 |

### 3. 查看统计信息

在平台管理页面可以查看：

- **总平台数** - 已创建的平台数量
- **运行中** - 活跃平台数量
- **审核中** - 待审核申请数量
- **总用户数** - 授权用户总数

## 管理后台功能

### 平台列表 ([PlatformManagementView.vue](../../src/views/dashboard/manage/PlatformManagementView.vue))

平台管理页面提供以下功能：

#### 1. 平台卡片展示

每个平台显示：

- 平台名称和描述
- 状态标签（运行中/审核中/已停用）
- 创建时间
- 授权用户数
- 管理按钮

#### 2. 搜索和过滤

- 按名称搜索平台
- 按状态过滤
- 分页展示

#### 3. 快捷操作

- **新建平台** - 跳转到申请页面
- **我的申请** - 查看自己的平台申请
- **审核申请** - 审核其他用户的申请（需 >=18 权限）

### 平台详情 ([PlatformDetailView.vue](../../src/views/dashboard/detail/PlatformDetailView.vue))

查看平台详细信息：

#### 基本信息

- 平台 ID (Client ID)
- 平台密钥 (Client Secret)
- 回调地址
- 创建时间

#### 安全设置

- Token 过期时间配置
- 密钥重置
- 回调地址修改

#### 用户统计

- 授权用户列表
- 登录时间
- 最后活跃时间

### 平台申请 ([PlatformApplyView.vue](../../src/views/dashboard/form/PlatformApplyView.vue))

申请创建新平台：

```javascript
// 申请参数
{
  name: "我的应用",           // 平台名称
  description: "应用描述",   // 平台描述
  callback_url: "http://..." // 回调地址
}
```

申请后状态为 `pending`，等待管理员审核。

### 申请审核 ([PlatformApplicationsView.vue](../../src/views/dashboard/manage/PlatformApplicationsView.vue))

管理员审核平台申请：

- 查看申请详情
- 批准申请（状态变为 `active`）
- 拒绝申请（状态变为 `disabled`）

## OAuth 集成

### 授权流程

#### 1. 引导用户到授权页面

```
GET https://sectl.top/oauth/authorize
```

**参数：**

| 参数名        | 必填 | 说明          |
| ------------- | ---- | ------------- |
| client_id     | ✅   | 平台 ID       |
| redirect_uri  | ✅   | 回调地址      |
| response_type | ✅   | 固定值 `code` |

**示例：**

```
https://sectl.top/oauth/authorize?client_id=pf_xxx&redirect_uri=http://localhost:5000/callback&response_type=code
```

#### 2. 处理回调

用户授权后，会重定向到：

```
{callback_url}?code={authorization_code}
```

#### 3. 换取访问令牌

```http
POST https://sectl.top/api/oauth/token
Content-Type: application/json

{
  "grant_type": "authorization_code",
  "code": "授权码",
  "client_id": "pf_xxx",
  "client_secret": "sk_xxx",
  "redirect_uri": "http://localhost:5000/callback"
}
```

**响应：**

```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIs...",
  "refresh_token": "xxx",
  "token_type": "Bearer",
  "expires_in": 3600
}
```

#### 4. 获取用户信息

```http
GET https://sectl.top/api/oauth/userinfo
Authorization: Bearer {access_token}
```

**响应：**

```json
{
  "user_id": "69bd422960018cf4d0e5",
  "email": "user@example.com",
  "name": "张三",
  "github_username": "zhangsan"
}
```

## 远程退登

### 实现原理

1. 用户在 SECTL Auth 点击退出登录
2. 系统创建 `logout_events` 文档
3. 第三方应用通过 Appwrite Realtime 订阅该集合
4. 收到匹配的事件后执行本地退出

### 集成步骤

#### 1. 安装 Appwrite SDK

**C#**

```bash
dotnet add package Appwrite
```

**Python**

```bash
pip install appwrite
```

#### 2. 配置 Realtime 订阅

**C# 示例：**

```csharp
using Appwrite;
using Appwrite.Services;

var client = new Client()
    .SetEndpoint("https://cloud.appwrite.io/v1")
    .SetProject("your-project-id");

var realtime = new Realtime(client);

// 订阅 logout_events 集合
realtime.Subscribe("databases.{databaseId}.collections.logout_events.documents",
    callback: (message) => {
        var logoutEvent = message.Payload;
        if (logoutEvent.UserId == currentUserId) {
            // 执行本地退出
            LocalLogout();
        }
    });
```

**Python 示例：**

```python
from appwrite.client import Client
from appwrite.services.realtime import Realtime

client = Client()
client.set_endpoint('https://cloud.appwrite.io/v1')
client.set_project('your-project-id')

realtime = Realtime(client)

def on_logout_event(message):
    event = message['payload']
    if event['user_id'] == current_user_id:
        # 执行本地退出
        local_logout()

# 订阅 logout_events 集合
realtime.subscribe(
    'databases.{database_id}.collections.logout_events.documents',
    callback=on_logout_event
)
```

### 数据结构

**logout_events 集合字段：**

| 字段        | 类型    | 说明               |
| ----------- | ------- | ------------------ |
| user_id     | String  | 退出登录的用户ID   |
| platform_id | String  | 特定平台ID（可选） |
| global      | Boolean | 是否全局退出       |
| created_at  | String  | 创建时间           |

## 代码示例

### C# 完整示例

详见 [csharp-example](./csharp-example/) 目录。

```csharp
// SectlAuthClient.cs
public class SectlAuthClient
{
    private readonly string _platformId;
    private readonly string _platformSecret;
    private readonly string _callbackUrl;
    private readonly HttpClient _httpClient;

    public SectlAuthClient(string platformId, string platformSecret, string callbackUrl)
    {
        _platformId = platformId;
        _platformSecret = platformSecret;
        _callbackUrl = callbackUrl;
        _httpClient = new HttpClient();
    }

    // 获取授权 URL
    public string GetAuthorizationUrl()
    {
        return $"https://sectl.top/oauth/authorize?" +
               $"client_id={_platformId}&" +
               $"redirect_uri={Uri.EscapeDataString(_callbackUrl)}&" +
               $"response_type=code";
    }

    // 换取访问令牌
    public async Task<TokenResponse> ExchangeCodeAsync(string code)
    {
        var request = new
        {
            grant_type = "authorization_code",
            code = code,
            client_id = _platformId,
            client_secret = _platformSecret,
            redirect_uri = _callbackUrl
        };

        var response = await _httpClient.PostAsJsonAsync(
            "https://sectl.top/api/oauth/token", request);

        return await response.Content.ReadFromJsonAsync<TokenResponse>();
    }

    // 获取用户信息
    public async Task<UserInfo> GetUserInfoAsync(string accessToken)
    {
        _httpClient.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", accessToken);

        var response = await _httpClient.GetAsync(
            "https://sectl.top/api/oauth/userinfo");

        return await response.Content.ReadFromJsonAsync<UserInfo>();
    }
}
```

### Python 完整示例

详见 [python-example](./python-example/) 目录。

```python
# sectl_auth/client.py
import requests

class SectlAuthClient:
    BASE_URL = "https://sectl.top"
    AUTH_URL = "https://sectl.top"

    def __init__(self, platform_id: str, platform_secret: str, callback_url: str):
        self.platform_id = platform_id
        self.platform_secret = platform_secret
        self.callback_url = callback_url

    def get_authorization_url(self) -> str:
        """获取授权 URL"""
        return (
            f"{self.AUTH_URL}/oauth/authorize?"
            f"client_id={self.platform_id}&"
            f"redirect_uri={self.callback_url}&"
            f"response_type=code"
        )

    def exchange_code(self, code: str) -> dict:
        """用授权码换取访问令牌"""
        response = requests.post(
            f"{self.BASE_URL}/api/oauth/token",
            json={
                "grant_type": "authorization_code",
                "code": code,
                "client_id": self.platform_id,
                "client_secret": self.platform_secret,
                "redirect_uri": self.callback_url
            }
        )
        response.raise_for_status()
        return response.json()

    def get_user_info(self, access_token: str) -> dict:
        """获取用户信息"""
        response = requests.get(
            f"{self.BASE_URL}/api/oauth/userinfo",
            headers={"Authorization": f"Bearer {access_token}"}
        )
        response.raise_for_status()
        return response.json()
```

## 常见问题

### Q: 如何获取 platform_id 和 platform_token？

A: 在 SECTL Auth 平台管理页面申请创建平台，审核通过后会获得：

- platform_id (Client ID)
- platform_token (Client Secret)

### Q: 授权码有效期多久？

A: 授权码有效期为 10 分钟，且只能使用一次。

### Q: Access Token 过期后怎么办？

A: 使用 refresh_token 换取新的 access_token：

```http
POST /api/oauth/token
{
  "grant_type": "refresh_token",
  "refresh_token": "your-refresh-token",
  "client_id": "your-platform-id",
  "client_secret": "your-platform-secret"
}
```

### Q: 如何配置 Token 过期时间？

A: 在平台设置页面 ([PlatformSettingsView.vue](../../src/views/dashboard/other/PlatformSettingsView.vue)) 可以配置：

- access_token 过期时间（默认 3600 秒）
- 设置为 -1 表示永不过期

### Q: 远程退登不生效怎么办？

A: 检查以下几点：

1. 是否正确订阅了 `logout_events` 集合
2. 检查 user_id 是否匹配
3. 确认 Appwrite Realtime 连接正常
4. 查看浏览器控制台是否有错误

### Q: 平台状态显示"审核中"怎么办？

A: 新创建的平台需要管理员审核。审核通过后状态会变为 `active`。

## 相关页面

- [PlatformManagementView.vue](../../src/views/dashboard/manage/PlatformManagementView.vue) - 平台管理
- [PlatformDetailView.vue](../../src/views/dashboard/detail/PlatformDetailView.vue) - 平台详情
- [PlatformApplyView.vue](../../src/views/dashboard/form/PlatformApplyView.vue) - 申请平台
- [PlatformApplicationsView.vue](../../src/views/dashboard/manage/PlatformApplicationsView.vue) - 审核申请
- [PlatformSettingsView.vue](../../src/views/dashboard/other/PlatformSettingsView.vue) - 平台设置
- [LoginPlatformsView.vue](../../src/views/dashboard/list/LoginPlatformsView.vue) - 登录平台列表

## 参考文档

- [OAuth 2.0 流程](./OAUTH_FLOW.MD)
- [API 参考](./API_REFERENCE.md)
- [故障排查](../oauth-flow/TROUBLESHOOTING.md)
