/**
 * SECTL Context
 * 提供 SECTL 服务的全局状态管理
 */

import React, { createContext, useContext, useState, useEffect, ReactNode } from "react"
import { sectlAuth, isRefreshTokenRejected, UserInfo, TokenData } from "../services/sectlAuth"

interface SectlContextType {
  isAuthenticated: boolean
  isLoading: boolean
  userInfo: UserInfo | null
  token: TokenData | null
  platformId: string
  login: (scope?: string[]) => Promise<void>
  logout: () => Promise<void>
  setPlatformId: (platformId: string) => void
  refreshUserInfo: () => Promise<void>
}

const SectlContext = createContext<SectlContextType | undefined>(undefined)

interface SectlProviderProps {
  children: ReactNode
  initialPlatformId?: string
}

export const SectlProvider: React.FC<SectlProviderProps> = ({
  children,
  initialPlatformId = String((import.meta as any).env?.VITE_OAUTH_PLATFORM_ID || "").trim(),
}) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null)
  const [token, setToken] = useState<TokenData | null>(null)
  const [platformId, setPlatformIdState] = useState(initialPlatformId)

  // 初始化时检查是否有已保存的 Token
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (platformId) {
          sectlAuth.initialize(platformId)
        }

        const currentToken = sectlAuth.getToken()
        if (currentToken) {
          setToken(currentToken)
          setIsAuthenticated(true)

          // 验证 Token 是否有效
          const isValid = await sectlAuth.introspectToken()
          if (isValid.active) {
            try {
              await loadUserInfo()
            } catch (error) {
              // 网络抖动只影响用户信息展示，不能把登录态判死。
              console.warn("加载用户信息失败，保留本地登录态:", error)
            }
          } else {
            // Token 无效，尝试刷新
            try {
              await sectlAuth.refreshAccessToken()
              const newToken = sectlAuth.getToken()
              if (newToken) {
                setToken(newToken)
                await loadUserInfo()
              } else {
                setIsAuthenticated(false)
              }
            } catch (error) {
              if (isRefreshTokenRejected(error)) {
                // 服务端明确拒绝：refresh_token 已失效，只能重新登录。
                sectlAuth.clearLocalSession()
                setIsAuthenticated(false)
                setToken(null)
              } else {
                // 网络错误 / 5xx / introspection 暂时不可用：保留本地会话，
                // 由 ensureFreshToken 与同步客户端的重试机制稍后恢复。
                setIsAuthenticated(sectlAuth.isAuthenticated())
                setToken(sectlAuth.getToken())
              }
            }
          }
        }
      } catch (error) {
        console.error("初始化认证失败:", error)
        setIsAuthenticated(false)
      } finally {
        setIsLoading(false)
      }
    }

    initAuth()
  }, [platformId])

  const loadUserInfo = async () => {
    try {
      const info = await sectlAuth.getUserInfo()
      setUserInfo(info)
    } catch (error) {
      console.error("加载用户信息失败:", error)
      throw error
    }
  }

  const login = async (scope: string[] = ["user:read"]) => {
    try {
      const tokenData = await sectlAuth.authorize(scope)
      setToken(tokenData)
      setIsAuthenticated(true)
      await loadUserInfo()
    } catch (error) {
      console.error("登录失败:", error)
      throw error
    }
  }

  const logout = async () => {
    try {
      await sectlAuth.logout()
      setToken(null)
      setUserInfo(null)
      setIsAuthenticated(false)
    } catch (error) {
      console.error("登出失败:", error)
      throw error
    }
  }

  const setPlatformId = (id: string) => {
    const normalizedId = id.trim()
    if (!normalizedId) return
    setPlatformIdState(normalizedId)
    sectlAuth.initialize(normalizedId)
  }

  const refreshUserInfo = async () => {
    await loadUserInfo()
  }

  const value: SectlContextType = {
    isAuthenticated,
    isLoading,
    userInfo,
    token,
    platformId,
    login,
    logout,
    setPlatformId,
    refreshUserInfo,
  }

  return <SectlContext.Provider value={value}>{children}</SectlContext.Provider>
}

export const useSectl = (): SectlContextType => {
  const context = useContext(SectlContext)
  if (context === undefined) {
    throw new Error("useSectl 必须在 SectlProvider 内部使用")
  }
  return context
}
