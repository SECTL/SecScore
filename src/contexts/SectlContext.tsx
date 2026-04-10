/**
 * SECTL Context
 * 提供 SECTL 服务的全局状态管理
 */

import React, { createContext, useContext, useState, useEffect, ReactNode } from "react"
import { sectlAuth, UserInfo, TokenData } from "../services/sectlAuth"

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
  initialPlatformId = "",
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
            await loadUserInfo()
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
            } catch {
              setIsAuthenticated(false)
              setToken(null)
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
    setPlatformIdState(id)
    sectlAuth.initialize(id)
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
