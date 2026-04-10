/**
 * SECTL OAuth 2.0 认证服务
 * 基于 SECTL-One-Stop 项目的 OAuth API 实现
 * 支持 PKCE (Proof Key for Code Exchange) 流程
 */

import { Client, Account } from "appwrite"
import CryptoJS from "crypto-js"

// SECTL API 配置
export const SECTL_CONFIG = {
  baseUrl: "https://appwrite.sectl.top",
  authUrl: "https://sectl.top",
  platformId: "", // 需要在设置中配置
  callbackUrl: "http://localhost:5173/auth/callback",
  callbackPort: 5173,
}

// Token 数据类型
export interface TokenData {
  access_token: string
  refresh_token: string
  token_type: string
  expires_in: number
  user_id: string
}

// 用户信息类型
export interface UserInfo {
  user_id: string
  email: string
  name: string
  github_username?: string
  permission: string
  role: string
  avatar_url?: string
  background_url?: string
  bio: string
  tags: string[]
  platform_id?: string
  login_time?: string
}

// PKCE 相关工具函数
function generateCodeVerifier(): string {
  const array = new Uint8Array(32)
  crypto.getRandomValues(array)
  return base64URLEncode(array)
}

function generateCodeChallenge(verifier: string): string {
  const sha256 = CryptoJS.SHA256(verifier)
  return base64URLEncode(CryptoJS.enc.Base64.parse(sha256.toString(CryptoJS.enc.Base64)))
}

function base64URLEncode(buffer: Uint8Array | CryptoJS.lib.WordArray): string {
  let base64: string
  if (buffer instanceof Uint8Array) {
    base64 = btoa(String.fromCharCode(...buffer))
  } else {
    base64 = buffer.toString(CryptoJS.enc.Base64)
  }
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

class SectlAuthService {
  private client: Client
  private tokenData: TokenData | null = null
  private codeVerifier: string = ""

  constructor() {
    this.client = new Client()
    new Account(this.client)
    this.loadToken()
  }

  /**
   * 初始化客户端配置
   */
  initialize(platformId: string, callbackUrl?: string) {
    SECTL_CONFIG.platformId = platformId
    if (callbackUrl) {
      SECTL_CONFIG.callbackUrl = callbackUrl
    }

    this.client.setEndpoint(SECTL_CONFIG.baseUrl).setProject("sectl-cloud") // 项目 ID

    return this
  }

  /**
   * 生成授权 URL
   */
  getAuthorizationUrl(scope: string[] = ["user:read"]): string {
    this.codeVerifier = generateCodeVerifier()
    const codeChallenge = generateCodeChallenge(this.codeVerifier)

    const params = new URLSearchParams({
      client_id: SECTL_CONFIG.platformId,
      redirect_uri: SECTL_CONFIG.callbackUrl,
      response_type: "code",
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
      scope: scope.join(" "),
    })

    return `${SECTL_CONFIG.authUrl}/oauth/authorize?${params.toString()}`
  }

  /**
   * 执行完整的 OAuth 授权流程
   */
  async authorize(scope: string[] = ["user:read"]): Promise<TokenData> {
    // 生成 PKCE 参数
    this.codeVerifier = generateCodeVerifier()
    // codeChallenge 在 getAuthorizationUrl 中生成

    // 构建授权 URL
    const authUrl = this.getAuthorizationUrl(scope)

    // 在新窗口中打开授权页面
    const authWindow = window.open(authUrl, "_blank", "width=600,height=700")

    // 等待回调
    return new Promise((resolve, reject) => {
      // 监听授权回调
      const checkCallback = async () => {
        try {
          // 检查是否有授权码（通过 postMessage 或 URL 参数）
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

          // 轮询检查窗口关闭
          const checkInterval = setInterval(() => {
            if (authWindow?.closed) {
              clearInterval(checkInterval)
              reject(new Error("授权窗口已关闭"))
            }
          }, 1000)
        } catch (error) {
          reject(error)
        }
      }

      checkCallback()
    })
  }

  /**
   * 使用授权码换取 Token
   */
  async exchangeCodeForToken(code: string, scope: string[] = ["user:read"]): Promise<TokenData> {
    const url = `${SECTL_CONFIG.baseUrl}/api/oauth/token`

    const payload = {
      grant_type: "authorization_code",
      code,
      client_id: SECTL_CONFIG.platformId,
      redirect_uri: SECTL_CONFIG.callbackUrl,
      code_verifier: this.codeVerifier,
      scope: scope.join(" "),
    }

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error_description || "Token 交换失败")
      }

      const data: TokenData = await response.json()
      this.tokenData = data
      this.saveToken()

      return data
    } catch (error) {
      console.error("Token 交换失败:", error)
      throw error
    }
  }

  /**
   * 获取用户信息
   */
  async getUserInfo(): Promise<UserInfo> {
    if (!this.tokenData?.access_token) {
      throw new Error("未授权，请先登录")
    }

    const url = `${SECTL_CONFIG.baseUrl}/api/oauth/userinfo`

    try {
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${this.tokenData.access_token}`,
        },
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

  /**
   * 验证 Token
   */
  async introspectToken(token?: string): Promise<{ active: boolean; user_id?: string }> {
    const tokenToCheck = token || this.tokenData?.access_token

    if (!tokenToCheck) {
      return { active: false }
    }

    const url = `${SECTL_CONFIG.baseUrl}/api/oauth/introspect`

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          token: tokenToCheck,
          client_id: SECTL_CONFIG.platformId,
        }),
      })

      if (!response.ok) {
        return { active: false }
      }

      return await response.json()
    } catch (error) {
      console.error("Token 验证失败:", error)
      return { active: false }
    }
  }

  /**
   * 刷新 Token
   */
  async refreshAccessToken(): Promise<TokenData> {
    if (!this.tokenData?.refresh_token) {
      throw new Error("没有刷新令牌")
    }

    const url = `${SECTL_CONFIG.baseUrl}/api/oauth/token`

    const payload = {
      grant_type: "refresh_token",
      refresh_token: this.tokenData.refresh_token,
      client_id: SECTL_CONFIG.platformId,
    }

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error_description || "Token 刷新失败")
      }

      const data: TokenData = await response.json()
      this.tokenData = data
      this.saveToken()

      return data
    } catch (error) {
      console.error("Token 刷新失败:", error)
      throw error
    }
  }

  /**
   * 登出（撤销 Token）
   */
  async logout(): Promise<void> {
    if (!this.tokenData?.access_token) {
      return
    }

    const url = `${SECTL_CONFIG.baseUrl}/api/oauth/logout`

    try {
      await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.tokenData.access_token}`,
        },
      })
    } catch (error) {
      console.error("登出失败:", error)
    } finally {
      this.tokenData = null
      this.clearToken()
    }
  }

  /**
   * 获取当前 Token
   */
  getToken(): TokenData | null {
    return this.tokenData
  }

  /**
   * 获取 Access Token
   */
  getAccessToken(): string | null {
    return this.tokenData?.access_token || null
  }

  /**
   * 检查是否已授权
   */
  isAuthenticated(): boolean {
    return !!this.tokenData?.access_token
  }

  /**
   * 保存 Token 到本地存储
   */
  private saveToken(): void {
    if (this.tokenData) {
      localStorage.setItem("sectl_token", JSON.stringify(this.tokenData))
      localStorage.setItem("sectl_code_verifier", this.codeVerifier)
    }
  }

  /**
   * 从本地存储加载 Token
   */
  private loadToken(): void {
    try {
      const tokenStr = localStorage.getItem("sectl_token")
      const codeVerifier = localStorage.getItem("sectl_code_verifier")

      if (tokenStr) {
        this.tokenData = JSON.parse(tokenStr)
        this.codeVerifier = codeVerifier || ""
      }
    } catch (error) {
      console.error("加载 Token 失败:", error)
    }
  }

  /**
   * 清除 Token
   */
  private clearToken(): void {
    localStorage.removeItem("sectl_token")
    localStorage.removeItem("sectl_code_verifier")
    this.tokenData = null
    this.codeVerifier = ""
  }
}

// 导出单例
export const sectlAuth = new SectlAuthService()
