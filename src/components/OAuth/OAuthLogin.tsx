import { Button, message, Modal, Space, Spin } from "antd"
import { useCallback, useEffect, useRef, useState } from "react"
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

const OAUTH_EXPECTED_STATE_KEY = "oauth_expected_state"
const OAUTH_CODE_VERIFIER_KEY = "oauth_code_verifier"
const OAUTH_CALLBACK_URL_KEY = "oauth_callback_url"
const DEFAULT_CALLBACK_URL = "http://127.0.0.1:16888/oauth/callback"

const getExpectedState = () => sessionStorage.getItem(OAUTH_EXPECTED_STATE_KEY)
const setExpectedState = (state: string) => sessionStorage.setItem(OAUTH_EXPECTED_STATE_KEY, state)
const clearExpectedState = () => sessionStorage.removeItem(OAUTH_EXPECTED_STATE_KEY)

const getCodeVerifier = () => sessionStorage.getItem(OAUTH_CODE_VERIFIER_KEY)
const setCodeVerifier = (codeVerifier: string) =>
  sessionStorage.setItem(OAUTH_CODE_VERIFIER_KEY, codeVerifier)
const clearCodeVerifier = () => sessionStorage.removeItem(OAUTH_CODE_VERIFIER_KEY)

const getCallbackUrl = () => sessionStorage.getItem(OAUTH_CALLBACK_URL_KEY) || DEFAULT_CALLBACK_URL
const setCallbackUrl = (callbackUrl: string) => sessionStorage.setItem(OAUTH_CALLBACK_URL_KEY, callbackUrl)
const clearCallbackUrl = () => sessionStorage.removeItem(OAUTH_CALLBACK_URL_KEY)

export function OAuthLogin({ visible, onClose, onSuccess }: OAuthLoginProps) {
  const { t } = useTranslation()
  const [loading, setLoading] = useState(false)
  const isProcessingCallbackRef = useRef(false)

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

  const stopCallbackServer = useCallback(async () => {
    const api = (window as any).api
    if (!api?.oauthStopCallbackServer) return
    try {
      await api.oauthStopCallbackServer()
    } catch (error) {
      console.error("[OAuth] 停止回调服务器失败:", error)
    }
  }, [])

  const clearOAuthTempState = useCallback(() => {
    clearExpectedState()
    clearCodeVerifier()
    clearCallbackUrl()
  }, [])

  const handleOAuthCallback = useCallback(
    async (result: OAuthCallbackResult) => {
      if (isProcessingCallbackRef.current) {
        console.log("[OAuth] 回调正在处理中，跳过")
        return
      }

      console.log("[OAuth] 收到回调:", result)
      const config = getOAuthConfig()
      if (!config) {
        console.error("[OAuth] 配置不存在")
        message.error("OAuth 配置未设置")
        setLoading(false)
        return
      }

      const api = (window as any).api
      if (!api) {
        message.error("API 不可用")
        setLoading(false)
        return
      }

      try {
        isProcessingCallbackRef.current = true

        if (result.error) {
          console.error("[OAuth] 错误:", result.error, result.error_description)
          message.error(result.error_description || result.error || "授权失败")
          return
        }

        if (!result.code) return

        console.log("[OAuth] 授权码:", result.code)
        console.log("[OAuth] State:", result.state, "期望:", getExpectedState())

        const expectedState = getExpectedState()
        if (expectedState && result.state !== expectedState) {
          message.error("安全验证失败：state 不匹配")
          return
        }

        const codeVerifier = getCodeVerifier()
        if (!codeVerifier) {
          message.error("安全验证失败：缺少 code_verifier")
          return
        }

        const callbackUrl = getCallbackUrl()
        console.log("[OAuth] 开始换取 token...")
        const tokenRes = await api.oauthExchangeCode(
          result.code,
          config.platform_id,
          config.platform_secret,
          callbackUrl,
          codeVerifier
        )
        console.log("[OAuth] token 响应:", tokenRes)

        if (!tokenRes.success) {
          message.error(tokenRes.message || "获取访问令牌失败")
          return
        }

        console.log("[OAuth] 开始获取用户信息...")
        const userRes = await api.oauthGetUserInfo(tokenRes.data.access_token)
        console.log("[OAuth] 用户信息响应:", userRes)

        if (!userRes.success) {
          message.error(userRes.message || "获取用户信息失败")
          return
        }

        console.log("[OAuth] 登录成功，保存登录状态...")

        const loginState = {
          access_token: tokenRes.data.access_token,
          refresh_token: tokenRes.data.refresh_token,
          token_type: tokenRes.data.token_type,
          expires_in: tokenRes.data.expires_in,
          user_id: userRes.data.user_id,
          email: userRes.data.email,
          name: userRes.data.name,
          github_username: userRes.data.github_username,
          permission: userRes.data.permission,
          login_time: new Date().toISOString(),
        }

        try {
          await api.oauthSaveLoginState(loginState)
          console.log("[OAuth] 登录状态已保存")
        } catch (saveError) {
          console.error("[OAuth] 保存登录状态失败:", saveError)
        }

        window.dispatchEvent(
          new CustomEvent("ss:oauth-user-updated", {
            detail: { user: userRes.data },
          })
        )
        console.log("[OAuth] 调用 onSuccess...")
        onSuccess(userRes.data)
        console.log("[OAuth] 调用 onClose...")
        onClose()
      } catch (error: any) {
        console.error("[OAuth] 处理回调时发生错误:", error)
        message.error(error.message || "登录失败")
      } finally {
        await stopCallbackServer()
        clearOAuthTempState()
        setLoading(false)
        window.setTimeout(() => {
          isProcessingCallbackRef.current = false
          console.log("[OAuth] 局部锁已释放")
        }, 300)
      }
    },
    [clearOAuthTempState, onClose, onSuccess, stopCallbackServer]
  )

  useEffect(() => {
    if (!visible) return

    let unlisten: UnlistenFn | null = null
    let disposed = false

    const setupListener = async () => {
      try {
        unlisten = await listen<OAuthCallbackResult>("oauth-callback", async (event) => {
          console.log("[OAuth] Event listener 收到 payload:", event.payload)
          if (event.payload) {
            await handleOAuthCallback(event.payload)
          }
        })

        if (disposed) {
          unlisten?.()
          unlisten = null
        }
      } catch (error) {
        console.error("Failed to setup OAuth callback listener:", error)
      }
    }

    void setupListener()

    return () => {
      disposed = true
      if (unlisten) {
        unlisten()
        unlisten = null
      }
    }
  }, [handleOAuthCallback, visible])

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
      setCallbackUrl(callbackUrl)

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

      setCodeVerifier(urlRes.data.code_verifier)
      console.log("[OAuth] code_verifier 已存储")

      await open(urlRes.data.url)
    } catch (error: any) {
      message.error(error.message || "登录失败")
      setLoading(false)
    }
  }

  const handleModalClose = () => {
    setLoading(false)
    clearOAuthTempState()
    void stopCallbackServer()
    onClose()
  }

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
      onCancel={handleModalClose}
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
