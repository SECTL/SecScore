/**
 * OAuth 登录状态持久化 Hook
 * 用于保存、恢复和清除 OAuth 登录状态
 */

import { useState, useEffect, useCallback } from "react"

export interface OAuthUserInfo {
  user_id: string
  email: string
  name: string
  github_username?: string
}

export interface OAuthLoginState {
  access_token: string
  refresh_token: string
  token_type: string
  expires_in: number
  user_id: string
  email: string
  name: string
  github_username?: string
  login_time: string
}

export function useOAuthPersist() {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [userInfo, setUserInfo] = useState<OAuthUserInfo | null>(null)
  const [loginState, setLoginState] = useState<OAuthLoginState | null>(null)

  // 初始化时尝试恢复登录状态
  useEffect(() => {
    const initAuth = async () => {
      try {
        const api = (window as any).api
        if (!api) {
          console.error("[OAuth Persist] API 不可用")
          setIsLoading(false)
          return
        }

        console.log("[OAuth Persist] 尝试恢复登录状态...")
        const result = await api.oauthLoadLoginState()

        if (result.success && result.data) {
          console.log("[OAuth Persist] 找到保存的登录状态:", result.data.user_id)
          setLoginState(result.data)
          setUserInfo({
            user_id: result.data.user_id,
            email: result.data.email,
            name: result.data.name,
            github_username: result.data.github_username,
          })
          setIsAuthenticated(true)
        } else {
          console.log("[OAuth Persist] 没有找到登录状态")
        }
      } catch (error) {
        console.error("[OAuth Persist] 恢复登录状态失败:", error)
      } finally {
        setIsLoading(false)
      }
    }

    initAuth()
  }, [])

  // 保存登录状态
  const saveLoginState = useCallback(
    async (
      tokenData: {
        access_token: string
        refresh_token: string
        token_type: string
        expires_in: number
      },
      userData: OAuthUserInfo
    ) => {
      try {
        const api = (window as any).api
        if (!api) {
          console.error("[OAuth Persist] API 不可用")
          return
        }

        const state: OAuthLoginState = {
          ...tokenData,
          ...userData,
          login_time: new Date().toISOString(),
        }

        await api.oauthSaveLoginState(state)
        setLoginState(state)
        setUserInfo(userData)
        setIsAuthenticated(true)
        console.log("[OAuth Persist] 登录状态已保存")
      } catch (error) {
        console.error("[OAuth Persist] 保存登录状态失败:", error)
      }
    },
    []
  )

  // 清除登录状态
  const clearLoginState = useCallback(async () => {
    try {
      const api = (window as any).api
      if (!api) {
        console.error("[OAuth Persist] API 不可用")
        return
      }

      await api.oauthClearLoginState()
      setLoginState(null)
      setUserInfo(null)
      setIsAuthenticated(false)
      console.log("[OAuth Persist] 登录状态已清除")
    } catch (error) {
      console.error("[OAuth Persist] 清除登录状态失败:", error)
    }
  }, [])

  // 登出
  const logout = useCallback(async () => {
    await clearLoginState()
  }, [clearLoginState])

  return {
    isAuthenticated,
    isLoading,
    userInfo,
    loginState,
    saveLoginState,
    clearLoginState,
    logout,
  }
}
