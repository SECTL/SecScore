/**
 * SECTL OAuth 2.0 认证服务
 * 基于 SECTL-One-Stop SDK 的 OAuth API 实现
 * 支持 PKCE (Proof Key for Code Exchange) 流程
 */

// SECTL API 配置
export const SECTL_CONFIG = {
  baseUrl: "https://appwrite.sectl.cn",
  authUrl: "https://sectl.cn",
  platformId: String((import.meta as any).env?.VITE_OAUTH_PLATFORM_ID || "").trim(),
  // 回调地址是公开配置；授权请求和 Token 请求必须保持完全一致。
  callbackUrl: String(
    (import.meta as any).env?.VITE_OAUTH_CALLBACK_URL || "http://localhost:51267/oauth/callback"
  ).trim(),
  callbackPort: 51267,
}

// Token 数据类型 (与 SDK TokenData 对齐)
export interface TokenData {
  access_token: string
  refresh_token?: string
  token_type?: string
  expires_in?: number
  expires_at?: string
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

const describeToken = (token: string | null) => ({
  has_token: Boolean(token),
  token_length: token?.length || 0,
  token_kind: token ? (token.split(".").length === 3 ? "jwt_like" : "opaque") : "none",
})

const DEVICE_UUID_KEY = "sectl_device_uuid"

const authLog = (
  level: "info" | "warn" | "error",
  message: string,
  meta: Record<string, unknown> = {}
) => {
  const payload = { ...meta, at: new Date().toISOString() }
  try {
    const writeLog = (window as any).api?.writeLog
    if (writeLog) {
      void Promise.resolve(
        writeLog({
          level,
          message: `[sectl-auth] ${message}`,
          meta: payload,
        })
      ).catch(() => void 0)
      return
    }
  } catch {
    // 日志失败不能影响 OAuth 流程。
  }
  if (level === "error") console.error(`[sectl-auth] ${message}`, payload)
  else if (level === "warn") console.warn(`[sectl-auth] ${message}`, payload)
  else console.info(`[sectl-auth] ${message}`, payload)
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

function extractExpiryFromJwt(accessToken: string): number | null {
  try {
    const parts = accessToken.split(".")
    if (parts.length !== 3) return null
    let payload = parts[1]
    const padding = 4 - (payload.length % 4)
    if (padding !== 4) payload += "=".repeat(padding)
    const decoded = atob(payload.replace(/-/g, "+").replace(/_/g, "/"))
    const exp = JSON.parse(decoded).exp
    return typeof exp === "number" && Number.isFinite(exp) ? exp : null
  } catch {
    return null
  }
}

function getAccessTokenFromData(tokenData: TokenData): string {
  return String(tokenData.access_token || "").split("|")[0]
}

function getTokenExpiry(tokenData: TokenData): number | null {
  if (tokenData.expires_at) {
    const expiresAt = Math.floor(new Date(tokenData.expires_at).getTime() / 1000)
    if (Number.isFinite(expiresAt)) return expiresAt
  }
  return extractExpiryFromJwt(getAccessTokenFromData(tokenData))
}

const PUBLIC_IP_ENDPOINTS = [
  "https://api.ipify.org?format=text",
  "https://ddns.oray.com/checkip",
  "https://myip.ipip.net",
]

function extractPublicIp(text: string): string | null {
  const ipv4 = text.match(/\b(?:\d{1,3}\.){3}\d{1,3}\b/)?.[0]
  if (ipv4 && ipv4.split(".").every((part) => Number(part) >= 0 && Number(part) <= 255)) {
    return ipv4
  }

  const ipv6 = text.match(/\b(?:[0-9a-f]{0,4}:){2,7}[0-9a-f]{0,4}\b/i)?.[0]
  return ipv6 || null
}

async function getPublicIp(): Promise<string | null> {
  for (const endpoint of PUBLIC_IP_ENDPOINTS) {
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), 3000)
    try {
      const response = await fetch(endpoint, { signal: controller.signal })
      if (response.ok) {
        const ip = extractPublicIp(await response.text())
        if (ip) return ip
      }
    } catch {
      // 尝试下一个公网 IP 服务。
    } finally {
      window.clearTimeout(timeout)
    }
  }
  return null
}

class SectlAuthService {
  private accessToken: string | null = null
  private refreshToken: string | null = null
  private tokenExpiresAt: number | null = null
  private refreshPromise: Promise<TokenData> | null = null
  private userId: string | null = null
  private codeVerifier: string | null = null
  private authorizationState: string | null = null
  private tokenGeneration = 0
  private readonly sessionListeners = new Set<() => void>()
  private persistedRestorePromise: Promise<Record<string, any> | null> | null = null

  constructor() {
    this.loadToken()
  }

  async restorePersistedSession(): Promise<boolean> {
    if (this.persistedRestorePromise) return Boolean(await this.persistedRestorePromise)
    this.persistedRestorePromise = (async () => {
      const result = await (window as any).api?.oauthLoadLoginState?.()
      const data = result?.success ? result.data : null
      if (!data?.access_token || !data.user_id) return null
      this.restoreToken(data, { allowExpired: true })
      if (!this.isAuthenticated()) {
        await this.refreshAccessToken()
      }
      return data
    })()
    try {
      await this.persistedRestorePromise
      return this.isAuthenticated()
    } finally {
      this.persistedRestorePromise = null
    }
  }

  subscribeSession(listener: () => void): () => void {
    this.sessionListeners.add(listener)
    return () => this.sessionListeners.delete(listener)
  }

  getTokenGeneration(): number {
    return this.tokenGeneration
  }

  private notifySessionChanged(): void {
    for (const listener of this.sessionListeners) listener()
  }

  initialize(platformId: string, callbackUrl?: string) {
    const normalizedPlatformId = platformId.trim()
    if (normalizedPlatformId) {
      SECTL_CONFIG.platformId = normalizedPlatformId
    }
    if (callbackUrl) {
      SECTL_CONFIG.callbackUrl = callbackUrl
    }
    authLog("info", "OAuth 客户端配置已初始化", {
      platform_id: SECTL_CONFIG.platformId,
      callback_url: SECTL_CONFIG.callbackUrl,
    })
    return this
  }

  async getAuthorizationUrl(scope?: string[]): Promise<string> {
    const t0 = performance.now()
    const log = (step: string) =>
      console.log(
        `[sectlAuth.getAuthorizationUrl] ${step} +${Math.round(performance.now() - t0)}ms`
      )

    const state = this.generateRandomState()
    this.authorizationState = state
    log("after generateRandomState")
    this.codeVerifier = await generateCodeVerifier()
    log("after generateCodeVerifier")
    const codeChallenge = await generateCodeChallenge(this.codeVerifier)
    log("after generateCodeChallenge")

    // 保存 code_verifier 到 localStorage，以便 deep link 回调时使用
    localStorage.setItem("sectl_code_verifier", this.codeVerifier)
    localStorage.setItem("sectl_oauth_state", state)

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

    const url = `${SECTL_CONFIG.authUrl}/oauth/authorize?${params.toString()}`
    authLog("info", "已生成 OAuth 授权地址", {
      platform_id: SECTL_CONFIG.platformId,
      callback_url: SECTL_CONFIG.callbackUrl,
      scope: scope || [],
    })
    log("done")
    return url
  }

  async authorize(scope?: string[]): Promise<TokenData> {
    this.codeVerifier = await generateCodeVerifier()

    const authUrl = await this.getAuthorizationUrl(scope)
    const authWindow = window.open(authUrl, "_blank", "width=600,height=700")
    if (!authWindow) {
      throw new Error("无法打开 OAuth 授权窗口")
    }

    return new Promise((resolve, reject) => {
      let settled = false
      const expectedState = this.authorizationState || localStorage.getItem("sectl_oauth_state")
      const allowedOrigins = new Set([
        new URL(SECTL_CONFIG.authUrl).origin,
        new URL(SECTL_CONFIG.callbackUrl).origin,
        window.location.origin,
      ])

      const cleanup = () => {
        window.removeEventListener("message", onMessage)
        window.clearInterval(checkInterval)
      }
      const fail = (error: unknown) => {
        if (settled) return
        settled = true
        cleanup()
        reject(error instanceof Error ? error : new Error(String(error)))
      }
      const onMessage = async (event: MessageEvent) => {
        if (
          !allowedOrigins.has(event.origin) ||
          event.source !== authWindow ||
          event.data?.type !== "oauth-callback" ||
          !event.data.code ||
          !expectedState ||
          event.data.state !== expectedState
        ) {
          return
        }

        try {
          const token = await this.exchangeCodeForToken(event.data.code, scope)
          if (settled) return
          settled = true
          cleanup()
          authWindow.close()
          resolve(token)
        } catch (error) {
          fail(error)
        }
      }

      window.addEventListener("message", onMessage)

      const checkInterval = setInterval(() => {
        if (authWindow.closed) {
          fail(new Error("授权窗口已关闭"))
        }
      }, 1000)
    })
  }

  async exchangeCodeForToken(code: string, scope?: string[]): Promise<TokenData> {
    if (!this.codeVerifier) {
      throw new Error("缺少 code_verifier，请先调用 getAuthorizationUrl()")
    }

    const deviceUuid = this.generateDeviceUuid()

    const publicIp = await getPublicIp()
    const payload: Record<string, unknown> = {
      grant_type: "authorization_code",
      code,
      client_id: SECTL_CONFIG.platformId,
      redirect_uri: SECTL_CONFIG.callbackUrl,
      code_verifier: this.codeVerifier,
      device_uuid: deviceUuid,
    }
    if (publicIp) payload.ip_address = publicIp

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
      authLog("info", "OAuth 授权码交换已返回", {
        status: response.status,
        platform_id: SECTL_CONFIG.platformId,
        has_public_ip: Boolean(publicIp),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error_description || "Token 交换失败")
      }

      const data: TokenData = await response.json()
      this.saveToken(data)
      return data
    } catch (error) {
      authLog("error", "OAuth 授权码交换失败", { error: String(error) })
      console.error("Token 交换失败:", error)
      throw error
    }
  }

  // 用于 Deep Link 回调的 code 交换
  async exchangeCode(code: string, state: string): Promise<TokenData> {
    const expectedState = this.authorizationState || localStorage.getItem("sectl_oauth_state")
    if (!expectedState || state !== expectedState) {
      throw new Error("OAuth state 校验失败，请重新发起登录")
    }

    // 从 localStorage 恢复 code_verifier
    const savedVerifier = localStorage.getItem("sectl_code_verifier")
    if (savedVerifier) {
      this.codeVerifier = savedVerifier
    }

    if (!this.codeVerifier) {
      throw new Error("缺少 code_verifier，请重新发起登录")
    }

    const deviceUuid = this.generateDeviceUuid()

    const publicIp = await getPublicIp()
    const payload: Record<string, unknown> = {
      grant_type: "authorization_code",
      code,
      client_id: SECTL_CONFIG.platformId,
      redirect_uri: SECTL_CONFIG.callbackUrl,
      code_verifier: this.codeVerifier,
      device_uuid: deviceUuid,
    }
    if (publicIp) payload.ip_address = publicIp

    const url = `${SECTL_CONFIG.baseUrl}/api/oauth/token`

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      authLog("info", "OAuth Deep Link 授权码交换已返回", {
        status: response.status,
        platform_id: SECTL_CONFIG.platformId,
        has_public_ip: Boolean(publicIp),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error_description || "Token 交换失败")
      }

      const data: TokenData = await response.json()
      this.saveToken(data)
      return data
    } catch (error) {
      authLog("error", "OAuth Deep Link 授权码交换失败", { error: String(error) })
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
      authLog("warn", "跳过 OAuth token introspection：本地没有 access token", {
        platform_id: SECTL_CONFIG.platformId,
      })
      return { active: false }
    }

    const url = `${SECTL_CONFIG.baseUrl}/api/oauth/introspect`
    authLog("info", "开始 OAuth token introspection", {
      platform_id: SECTL_CONFIG.platformId,
      ...describeToken(tokenToCheck),
      user_id: this.userId,
    })

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: tokenToCheck,
          client_id: SECTL_CONFIG.platformId,
        }),
      })
      authLog("info", "OAuth token introspection 已返回", {
        status: response.status,
        platform_id: SECTL_CONFIG.platformId,
      })

      if (!response.ok) {
        authLog("warn", "OAuth token introspection HTTP 失败", {
          status: response.status,
          platform_id: SECTL_CONFIG.platformId,
        })
        return { active: false }
      }

      const result = (await response.json()) as TokenIntrospection
      authLog("info", "OAuth token introspection 结果", {
        active: result.active,
        user_id: result.user_id || null,
        client_id: result.client_id || null,
        has_exp: typeof result.exp === "number",
      })
      return result
    } catch (error) {
      authLog("error", "OAuth token introspection 请求异常", { error: String(error) })
      return { active: false }
    }
  }

  async refreshAccessToken(): Promise<TokenData> {
    if (this.refreshPromise) return this.refreshPromise

    const refreshPromise = this.performRefreshAccessToken()
    this.refreshPromise = refreshPromise
    try {
      return await refreshPromise
    } finally {
      if (this.refreshPromise === refreshPromise) this.refreshPromise = null
    }
  }

  private async performRefreshAccessToken(): Promise<TokenData> {
    if (!this.refreshToken) {
      throw new Error("没有 refresh_token，无法刷新")
    }

    const deviceUuid = this.generateDeviceUuid()

    const publicIp = await getPublicIp()
    const payload: Record<string, unknown> = {
      grant_type: "refresh_token",
      refresh_token: this.refreshToken,
      client_id: SECTL_CONFIG.platformId,
      device_uuid: deviceUuid,
    }
    if (publicIp) payload.ip_address = publicIp

    const url = `${SECTL_CONFIG.baseUrl}/api/oauth/refresh`

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      authLog("info", "OAuth token 刷新已返回", {
        status: response.status,
        platform_id: SECTL_CONFIG.platformId,
        user_id: this.userId,
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error_description || "Token 刷新失败")
      }

      const data: TokenData = await response.json()
      this.saveToken(data)
      try {
        const api = (window as any).api
        const userInfo = await this.getUserInfo()
        if (api?.oauthSaveLoginState && userInfo?.user_id) {
          await api.oauthSaveLoginState({
            access_token: this.accessToken || data.access_token,
            refresh_token: this.refreshToken || "",
            token_type: data.token_type || "Bearer",
            expires_in: data.expires_in || 0,
            user_id: userInfo.user_id,
            email: userInfo.email || "",
            name: userInfo.name || userInfo.email || userInfo.user_id,
            login_time: new Date().toISOString(),
          })
        }
      } catch {
        // renderer token remains authoritative for this process; next login can repair native state.
      }
      return data
    } catch (error) {
      authLog("error", "OAuth token 刷新失败", { error: String(error) })
      console.error("Token 刷新失败:", error)
      throw error
    }
  }

  async logout(): Promise<void> {
    const url = `${SECTL_CONFIG.baseUrl}/api/oauth/logout`
    authLog("info", "开始 OAuth 登出", {
      platform_id: SECTL_CONFIG.platformId,
      user_id: this.userId,
      ...describeToken(this.accessToken),
    })

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
      authLog("error", "OAuth 登出请求失败", { error: String(error) })
      console.error("登出失败:", error)
    } finally {
      this.clearToken()
      authLog("info", "OAuth 本地登录状态已清除", {
        platform_id: SECTL_CONFIG.platformId,
      })
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

    // JWT 的 exp 是签发时确定的绝对过期时间。不要在客户端重启或恢复账号
    // 缓存时重新按 expires_in 计算，否则过期 token 会被误认为重新获得一小时有效期。
    this.tokenExpiresAt = getTokenExpiry(tokenData)
    if (!this.tokenExpiresAt && tokenData.expires_in) {
      this.tokenExpiresAt = Math.floor(Date.now() / 1000) + tokenData.expires_in
    }

    const expiresAt = this.tokenExpiresAt
      ? new Date(this.tokenExpiresAt * 1000).toISOString()
      : tokenData.expires_at

    const storableData: TokenData = {
      // 只持久化规范化后的 access token，不能把 JWT|refresh_token
      // 兼容格式原样带入后续 Bearer 请求。
      access_token: this.accessToken,
      refresh_token: this.refreshToken || undefined,
      token_type: tokenData.token_type,
      expires_in: tokenData.expires_in,
      expires_at: expiresAt,
      scope: tokenData.scope,
      user_id: this.userId || undefined,
    }

    localStorage.setItem("sectl_token", JSON.stringify(storableData))
    if (this.userId) {
      localStorage.setItem(`sectl_token:${this.userId}`, JSON.stringify(storableData))
    }
    this.tokenGeneration += 1
    this.notifySessionChanged()
    authLog("info", "OAuth token 已保存", {
      platform_id: SECTL_CONFIG.platformId,
      user_id: this.userId,
      ...describeToken(this.accessToken),
      has_refresh_token: Boolean(this.refreshToken),
      expires_in: tokenData.expires_in || null,
      token_expired: this.isTokenExpired(),
    })
    // 登录成功后清除 code_verifier
    localStorage.removeItem("sectl_code_verifier")
    localStorage.removeItem("sectl_oauth_state")
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

        // 缓存中的 expires_in 是原始响应的相对时长，重启后不能再拿它续期。
        this.tokenExpiresAt = getTokenExpiry(tokenData)
        authLog("info", "已从本地恢复 OAuth token", {
          user_id: this.userId,
          ...describeToken(this.accessToken),
          has_refresh_token: Boolean(this.refreshToken),
          token_expired: this.isTokenExpired(),
        })
      }
    } catch (error) {
      authLog("error", "加载本地 OAuth token 失败", { error: String(error) })
      console.error("加载 Token 失败:", error)
    }
  }

  private clearToken(): void {
    const userId = this.userId
    localStorage.removeItem("sectl_token")
    if (userId) localStorage.removeItem(`sectl_token:${userId}`)
    localStorage.removeItem("sectl_code_verifier")
    localStorage.removeItem("sectl_oauth_state")
    this.accessToken = null
    this.refreshToken = null
    this.tokenExpiresAt = null
    this.userId = null
    this.codeVerifier = null
    this.authorizationState = null
    this.tokenGeneration += 1
    this.notifySessionChanged()
  }

  getToken(): TokenData | null {
    if (!this.accessToken) return null
    return {
      access_token: this.accessToken,
      refresh_token: this.refreshToken || undefined,
      expires_at: this.tokenExpiresAt
        ? new Date(this.tokenExpiresAt * 1000).toISOString()
        : undefined,
      user_id: this.userId || undefined,
    }
  }

  isTokenDataExpired(tokenData: TokenData): boolean {
    const expiresAt = getTokenExpiry(tokenData)
    return expiresAt !== null && Date.now() / 1000 >= expiresAt
  }

  restoreToken(tokenData: TokenData, options: { allowExpired?: boolean } = {}): boolean {
    const expired = this.isTokenDataExpired(tokenData)
    if (expired && !options.allowExpired) {
      authLog("warn", "拒绝恢复已过期 OAuth token", {
        user_id: tokenData.user_id || extractUserIdFromJwt(getAccessTokenFromData(tokenData)),
      })
      return false
    }
    this.saveToken(tokenData)
    return !expired
  }

  getAccessToken(): string | null {
    return this.accessToken
  }

  getUserId(): string | null {
    return this.userId
  }

  isAuthenticated(): boolean {
    return !!this.accessToken && !this.isTokenExpired()
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
    const saved = localStorage.getItem(DEVICE_UUID_KEY)
    if (saved) return saved

    let generated: string
    if (typeof crypto.randomUUID === "function") {
      generated = crypto.randomUUID()
    } else {
      const array = new Uint8Array(16)
      crypto.getRandomValues(array)
      array[6] = (array[6] & 0x0f) | 0x40
      array[8] = (array[8] & 0x3f) | 0x80
      const hex = Array.from(array, (b) => b.toString(16).padStart(2, "0")).join("")
      generated = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
    }
    localStorage.setItem(DEVICE_UUID_KEY, generated)
    authLog("info", "已创建并持久化 OAuth 设备标识", { device_uuid: generated })
    return generated
  }

  clearLocalSession(): void {
    this.clearToken()
    authLog("warn", "已清除本地 OAuth 会话", { platform_id: SECTL_CONFIG.platformId })
  }
}

export const sectlAuth = new SectlAuthService()
