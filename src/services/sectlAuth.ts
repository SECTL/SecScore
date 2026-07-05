/**
 * SECTL OAuth 2.0 认证服务
 * 基于 SECTL-One-Stop SDK 的 OAuth API 实现
 * 支持 PKCE (Proof Key for Code Exchange) 流程
 */

// SECTL API 配置
export const SECTL_CONFIG = {
  baseUrl: "https://appwrite.sectl.cn",
  authUrl: "https://sectl.cn",
  platformId: "", // 需要在设置中配置
  callbackUrl: "http://127.0.0.1:51267/oauth/callback",
  callbackPort: 51267,
}

// Token 数据类型 (与 SDK TokenData 对齐)
export interface TokenData {
  access_token: string
  refresh_token?: string
  token_type?: string
  expires_in?: number
  scope?: string
  user_id?: string
}

// Token 验证结果 (与 SDK TokenIntrospection 对齐)
export interface TokenIntrospection {
  active: boolean
  scope?: string
  user_id?: string
  client_id?: string
  exp?: number
  iat?: number
}

// 用户信息类型 (与 SDK UserInfoData 对齐)
export interface UserInfo {
  user_id?: string
  id?: string
  email?: string
  name?: string
  avatar?: string
  avatar_url?: string
  created_at?: string
  updated_at?: string
  email_verified?: boolean
  status?: string
  metadata?: Record<string, unknown>
}

// PKCE 相关工具函数
async function generateCodeVerifier(): Promise<string> {
  const array = new Uint8Array(32)
  crypto.getRandomValues(array)
  return base64URLEncode(array)
}

async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(verifier)
  const digest = await crypto.subtle.digest("SHA-256", data)
  return base64URLEncode(new Uint8Array(digest))
}

function base64URLEncode(buffer: Uint8Array): string {
  let binary = ""
  for (let i = 0; i < buffer.length; i++) {
    binary += String.fromCharCode(buffer[i])
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

function extractUserIdFromJwt(accessToken: string): string | null {
  try {
    const parts = accessToken.split(".")
    if (parts.length !== 3) return null
    let payload = parts[1]
    const padding = 4 - (payload.length % 4)
    if (padding !== 4) payload += "=".repeat(padding)
    const decoded = atob(payload.replace(/-/g, "+").replace(/_/g, "/"))
    const claims = JSON.parse(decoded)
    return claims.user_id || null
  } catch {
    return null
  }
}

function extractPlatformIdFromJwt(accessToken: string): string | null {
  try {
    const parts = accessToken.split(".")
    if (parts.length !== 3) return null
    let payload = parts[1]
    const padding = 4 - (payload.length % 4)
    if (padding !== 4) payload += "=".repeat(padding)
    const decoded = atob(payload.replace(/-/g, "+").replace(/_/g, "/"))
    const claims = JSON.parse(decoded)
    return claims.platform_id || null
  } catch {
    return null
  }
}

class SectlAuthService {
  private accessToken: string | null = null
  private refreshToken: string | null = null
  private tokenExpiresAt: number | null = null
  private userId: string | null = null
  private codeVerifier: string | null = null

  constructor() {
    this.loadToken()
  }

  initialize(platformId: string, callbackUrl?: string) {
    SECTL_CONFIG.platformId = platformId
    if (callbackUrl) {
      SECTL_CONFIG.callbackUrl = callbackUrl
    }
    return this
  }

  async getAuthorizationUrl(scope?: string[]): Promise<string> {
    const state = this.generateRandomState()
    this.codeVerifier = await generateCodeVerifier()
    const codeChallenge = await generateCodeChallenge(this.codeVerifier)

    // 保存 code_verifier 到 localStorage，以便 deep link 回调时使用
    localStorage.setItem("sectl_code_verifier", this.codeVerifier)

    const params = new URLSearchParams({
      client_id: SECTL_CONFIG.platformId,
      redirect_uri: SECTL_CONFIG.callbackUrl,
      response_type: "code",
      state,
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
    })

    if (scope && scope.length > 0) {
      params.set("scope", scope.join(" "))
    }

    return `${SECTL_CONFIG.authUrl}/oauth/authorize?${params.toString()}`
  }

  async authorize(scope?: string[]): Promise<TokenData> {
    this.codeVerifier = await generateCodeVerifier()

    const authUrl = await this.getAuthorizationUrl(scope)
    const authWindow = window.open(authUrl, "_blank", "width=600,height=700")

    return new Promise((resolve, reject) => {
      window.addEventListener("message", async (event) => {
        if (event.data.type === "oauth-callback" && event.data.code) {
          try {
            const token = await this.exchangeCodeForToken(event.data.code, scope)
            authWindow?.close()
            resolve(token)
          } catch (error) {
            reject(error)
          }
        }
      })

      const checkInterval = setInterval(() => {
        if (authWindow?.closed) {
          clearInterval(checkInterval)
          reject(new Error("授权窗口已关闭"))
        }
      }, 1000)
    })
  }

  async exchangeCodeForToken(code: string, scope?: string[]): Promise<TokenData> {
    if (!this.codeVerifier) {
      throw new Error("缺少 code_verifier，请先调用 getAuthorizationUrl()")
    }

    const deviceUuid = this.generateDeviceUuid()

    const payload: Record<string, unknown> = {
      grant_type: "authorization_code",
      code,
      client_id: SECTL_CONFIG.platformId,
      redirect_uri: SECTL_CONFIG.callbackUrl,
      code_verifier: this.codeVerifier,
      device_uuid: deviceUuid,
      ip_address: "127.0.0.1",
    }

    if (scope && scope.length > 0) {
      payload.scope = scope.join(" ")
    }

    const url = `${SECTL_CONFIG.baseUrl}/api/oauth/token`

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error_description || "Token 交换失败")
      }

      const data: TokenData = await response.json()
      this.saveToken(data)
      return data
    } catch (error) {
      console.error("Token 交换失败:", error)
      throw error
    }
  }

  // 用于 Deep Link 回调的 code 交换
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async exchangeCode(code: string, _state: string): Promise<TokenData> {
    // 从 localStorage 恢复 code_verifier
    const savedVerifier = localStorage.getItem("sectl_code_verifier")
    if (savedVerifier) {
      this.codeVerifier = savedVerifier
    }

    if (!this.codeVerifier) {
      throw new Error("缺少 code_verifier，请重新发起登录")
    }

    const deviceUuid = this.generateDeviceUuid()

    const payload = {
      grant_type: "authorization_code",
      code,
      client_id: SECTL_CONFIG.platformId,
      redirect_uri: SECTL_CONFIG.callbackUrl,
      code_verifier: this.codeVerifier,
      device_uuid: deviceUuid,
      ip_address: "127.0.0.1",
    }

    const url = `${SECTL_CONFIG.baseUrl}/api/oauth/token`

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error_description || "Token 交换失败")
      }

      const data: TokenData = await response.json()
      this.saveToken(data)
      return data
    } catch (error) {
      console.error("Token 交换失败:", error)
      throw error
    }
  }

  async getUserInfo(): Promise<UserInfo> {
    if (!this.accessToken) {
      throw new Error("未授权，请先登录")
    }

    const url = `${SECTL_CONFIG.baseUrl}/api/oauth/userinfo`

    try {
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${this.accessToken}` },
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error_description || "获取用户信息失败")
      }

      return await response.json()
    } catch (error) {
      console.error("获取用户信息失败:", error)
      throw error
    }
  }

  async introspectToken(token?: string): Promise<TokenIntrospection> {
    const tokenToCheck = token || this.accessToken
    if (!tokenToCheck) {
      return { active: false }
    }

    const url = `${SECTL_CONFIG.baseUrl}/api/oauth/introspect`

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: tokenToCheck,
          client_id: SECTL_CONFIG.platformId,
        }),
      })

      if (!response.ok) {
        return { active: false }
      }

      return await response.json()
    } catch {
      return { active: false }
    }
  }

  async refreshAccessToken(): Promise<TokenData> {
    if (!this.refreshToken) {
      throw new Error("没有 refresh_token，无法刷新")
    }

    const deviceUuid = this.generateDeviceUuid()

    const payload = {
      grant_type: "refresh_token",
      refresh_token: this.refreshToken,
      client_id: SECTL_CONFIG.platformId,
      device_uuid: deviceUuid,
      ip_address: "127.0.0.1",
    }

    const url = `${SECTL_CONFIG.baseUrl}/api/oauth/refresh`

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error_description || "Token 刷新失败")
      }

      const data: TokenData = await response.json()
      this.saveToken(data)
      return data
    } catch (error) {
      console.error("Token 刷新失败:", error)
      throw error
    }
  }

  async logout(): Promise<void> {
    const url = `${SECTL_CONFIG.baseUrl}/api/oauth/logout`

    try {
      if (this.accessToken) {
        await fetch(url, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ client_id: SECTL_CONFIG.platformId }),
        })
      }
    } catch (error) {
      console.error("登出失败:", error)
    } finally {
      this.accessToken = null
      this.refreshToken = null
      this.tokenExpiresAt = null
      this.userId = null
      this.clearToken()
    }
  }

  private saveToken(tokenData: TokenData): void {
    const rawAccessToken = tokenData.access_token
    if (rawAccessToken.includes("|")) {
      const parts = rawAccessToken.split("|")
      this.accessToken = parts[0]
      this.refreshToken = tokenData.refresh_token || parts[1] || null
    } else {
      this.accessToken = rawAccessToken
      this.refreshToken = tokenData.refresh_token || null
    }

    this.userId = tokenData.user_id || extractUserIdFromJwt(this.accessToken)

    const jwtPlatformId = extractPlatformIdFromJwt(this.accessToken)
    if (jwtPlatformId && !SECTL_CONFIG.platformId) {
      SECTL_CONFIG.platformId = jwtPlatformId
    }

    if (tokenData.expires_in) {
      this.tokenExpiresAt = Math.floor(Date.now() / 1000) + tokenData.expires_in
    }

    const storableData: TokenData = {
      access_token: rawAccessToken,
      refresh_token: tokenData.refresh_token,
      token_type: tokenData.token_type,
      expires_in: tokenData.expires_in,
      scope: tokenData.scope,
      user_id: this.userId || undefined,
    }

    localStorage.setItem("sectl_token", JSON.stringify(storableData))
    // 登录成功后清除 code_verifier
    localStorage.removeItem("sectl_code_verifier")
  }

  private loadToken(): void {
    try {
      const tokenStr = localStorage.getItem("sectl_token")
      if (tokenStr) {
        const tokenData: TokenData = JSON.parse(tokenStr)

        const rawAccessToken = tokenData.access_token
        if (rawAccessToken.includes("|")) {
          const parts = rawAccessToken.split("|")
          this.accessToken = parts[0]
          this.refreshToken = tokenData.refresh_token || parts[1] || null
        } else {
          this.accessToken = rawAccessToken
          this.refreshToken = tokenData.refresh_token || null
        }

        this.userId = tokenData.user_id || extractUserIdFromJwt(this.accessToken)

        if (tokenData.expires_in) {
          this.tokenExpiresAt = Math.floor(Date.now() / 1000) + tokenData.expires_in
        }
      }
    } catch (error) {
      console.error("加载 Token 失败:", error)
    }
  }

  private clearToken(): void {
    localStorage.removeItem("sectl_token")
    localStorage.removeItem("sectl_code_verifier")
    this.accessToken = null
    this.refreshToken = null
    this.tokenExpiresAt = null
    this.userId = null
    this.codeVerifier = null
  }

  getToken(): TokenData | null {
    if (!this.accessToken) return null
    return {
      access_token: this.accessToken,
      refresh_token: this.refreshToken || undefined,
      user_id: this.userId || undefined,
    }
  }

  getAccessToken(): string | null {
    return this.accessToken
  }

  getUserId(): string | null {
    return this.userId
  }

  isAuthenticated(): boolean {
    return !!this.accessToken
  }

  isTokenExpired(): boolean {
    if (!this.tokenExpiresAt) return false
    return Date.now() / 1000 >= this.tokenExpiresAt
  }

  private generateRandomState(): string {
    const array = new Uint8Array(32)
    crypto.getRandomValues(array)
    return base64URLEncode(array)
  }

  private generateDeviceUuid(): string {
    if (typeof crypto.randomUUID === "function") {
      return crypto.randomUUID()
    }
    const array = new Uint8Array(16)
    crypto.getRandomValues(array)
    array[6] = (array[6] & 0x0f) | 0x40
    array[8] = (array[8] & 0x3f) | 0x80
    const hex = Array.from(array, (b) => b.toString(16).padStart(2, "0")).join("")
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
  }
}

export const sectlAuth = new SectlAuthService()
