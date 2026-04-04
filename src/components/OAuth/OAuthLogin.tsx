import { Button, message, Modal, Space, Spin } from "antd"
import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { open } from "@tauri-apps/plugin-shell"
import { listen, UnlistenFn } from "@tauri-apps/api/event"

interface OAuthLoginProps {
  visible: boolean
  onClose: () => void
  onSuccess: (userInfo: {
    user_id: string
    email: string
    name: string
    github_username?: string
    permission: number
  }) => void
}

interface OAuthConfig {
  platform_id: string
  platform_secret: string
}

interface OAuthCallbackResult {
  code?: string
  state?: string
  error?: string
  error_description?: string
}

export function OAuthLogin({ visible, onClose, onSuccess }: OAuthLoginProps) {
  const { t } = useTranslation()
  const [loading, setLoading] = useState(false)
  const callbackUnlistenRef = useRef<UnlistenFn | null>(null)
  // 使用 sessionStorage 存储 state，防止组件重新渲染导致丢失
  const getExpectedState = () => sessionStorage.getItem("oauth_expected_state")
  const setExpectedState = (state: string) => sessionStorage.setItem("oauth_expected_state", state)
  const clearExpectedState = () => sessionStorage.removeItem("oauth_expected_state")

  const getOAuthConfig = (): OAuthConfig | null => {
    const api = (window as any).api
    if (!api) return null

    const platformId = import.meta.env.VITE_OAUTH_PLATFORM_ID
    const platformSecret = import.meta.env.VITE_OAUTH_PLATFORM_SECRET

    if (!platformId || !platformSecret) {
      return null
    }

    return {
      platform_id: platformId,
      platform_secret: platformSecret,
    }
  }

  const handleOAuthCallback = async (result: OAuthCallbackResult) => {
    console.log("[OAuth] 收到回调:", result)
    const config = getOAuthConfig()
    if (!config) {
      console.error("[OAuth] 配置不存在")
      return
    }

    try {
      if (result.error) {
        console.error("[OAuth] 错误:", result.error, result.error_description)
        message.error(result.error_description || result.error || "授权失败")
        setLoading(false)
        return
      }

      if (result.code) {
        console.log("[OAuth] 授权码:", result.code)
        console.log("[OAuth] State:", result.state, "期望:", getExpectedState())
        
        // 验证 state 防止 CSRF
        const expectedState = getExpectedState()
        if (expectedState && result.state !== expectedState) {
          message.error("安全验证失败：state 不匹配")
          setLoading(false)
          return
        }

        const api = (window as any).api
        const callbackUrl = "http://127.0.0.1:16888/oauth/callback"

        const tokenRes = await api.oauthExchangeCode(
          result.code,
          config.platform_id,
          config.platform_secret,
          callbackUrl
        )

        if (!tokenRes.success) {
          message.error(tokenRes.message || "获取访问令牌失败")
          setLoading(false)
          return
        }

        const userRes = await api.oauthGetUserInfo(tokenRes.data.access_token)

        if (!userRes.success) {
          message.error(userRes.message || "获取用户信息失败")
          setLoading(false)
          return
        }

        await api.oauthStopCallbackServer()
        clearExpectedState()
        onSuccess(userRes.data)
        onClose()
      }
    } catch (error: any) {
      message.error(error.message || "登录失败")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const setupListener = async () => {
      try {
        const unlisten = await listen<OAuthCallbackResult>("oauth-callback", async (event) => {
          console.log("[OAuth] Event listener 收到 payload:", event.payload)
          if (event.payload) {
            // 立即取消监听，防止重复触发
            if (callbackUnlistenRef.current) {
              callbackUnlistenRef.current()
              callbackUnlistenRef.current = null
            }
            await handleOAuthCallback(event.payload)
          }
        })
        callbackUnlistenRef.current = unlisten
      } catch (error) {
        console.error("Failed to setup OAuth callback listener:", error)
      }
    }

    setupListener()

    return () => {
      if (callbackUnlistenRef.current) {
        callbackUnlistenRef.current()
        callbackUnlistenRef.current = null
      }
    }
  }, [])

  const handleOAuthLogin = async () => {
    const config = getOAuthConfig()
    if (!config) {
      message.error("OAuth 配置未设置")
      return
    }

    setLoading(true)

    try {
      const api = (window as any).api

      const serverRes = await api.oauthStartCallbackServer()
      if (!serverRes.success) {
        message.error(serverRes.message || "启动回调服务器失败")
        setLoading(false)
        return
      }

      const callbackUrl = serverRes.data.url

      // 生成随机 state 防止 CSRF
      const state = generateRandomState()
      console.log("[OAuth] 生成 state:", state)
      setExpectedState(state)
      console.log("[OAuth] state 已设置:", getExpectedState())

      const urlRes = await api.oauthGetAuthorizationUrl(config.platform_id, callbackUrl, state)

      if (!urlRes.success) {
        message.error(urlRes.message || "获取授权链接失败")
        setLoading(false)
        return
      }

      await open(urlRes.data.url)
    } catch (error: any) {
      message.error(error.message || "登录失败")
      setLoading(false)
    }
  }

  // 生成随机 state 字符串
  const generateRandomState = (): string => {
    const array = new Uint8Array(32)
    window.crypto.getRandomValues(array)
    return btoa(String.fromCharCode(...array))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=/g, "")
  }

  return (
    <Modal
      title={t("auth.oauthLogin", "SECTL Auth 登录")}
      open={visible}
      onCancel={onClose}
      footer={null}
      width={400}
      centered
    >
      <div style={{ textAlign: "center", padding: "20px 0" }}>
        {loading ? (
          <Space direction="vertical" size="middle">
            <Spin size="large" />
            <div>{t("auth.oauthLoggingIn", "正在登录...")}</div>
            <div style={{ fontSize: "12px", color: "var(--ss-text-secondary)" }}>
              请在浏览器中完成授权，授权后会自动返回
            </div>
          </Space>
        ) : (
          <Space direction="vertical" size="large" style={{ width: "100%" }}>
            <div style={{ color: "var(--ss-text-secondary)" }}>
              {t("auth.oauthHint", "使用 SECTL Auth 账号登录，享受统一认证和远程退登功能")}
            </div>
            <Button
              type="primary"
              size="large"
              onClick={handleOAuthLogin}
              style={{ width: "100%" }}
            >
              {t("auth.oauthButton", "使用 SECTL Auth 登录")}
            </Button>
          </Space>
        )}
      </div>
    </Modal>
  )
}
