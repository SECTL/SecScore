import { Button, message, Modal, Space, Spin } from "antd"
import { useEffect, useState } from "react"
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

// 全局锁，确保同一时间只有一个回调在处理
let isProcessingCallback = false
// 全局监听器引用，确保只有一个监听器
let globalUnlisten: UnlistenFn | null = null

export function OAuthLogin({ visible, onClose, onSuccess }: OAuthLoginProps) {
  const { t } = useTranslation()
  const [loading, setLoading] = useState(false)
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
    // 全局锁检查，防止重复处理
    if (isProcessingCallback) {
      console.log("[OAuth] 回调正在处理中，跳过")
      return
    }

    console.log("[OAuth] 收到回调:", result)
    const config = getOAuthConfig()
    if (!config) {
      console.error("[OAuth] 配置不存在")
      return
    }

    try {
      isProcessingCallback = true

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

        // 获取存储的 code_verifier
        const codeVerifier = sessionStorage.getItem("oauth_code_verifier")
        if (!codeVerifier) {
          message.error("安全验证失败：缺少 code_verifier")
          setLoading(false)
          return
        }

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
          setLoading(false)
          return
        }

        console.log("[OAuth] 开始获取用户信息...")
        const userRes = await api.oauthGetUserInfo(tokenRes.data.access_token)
        console.log("[OAuth] 用户信息响应:", userRes)

        if (!userRes.success) {
          message.error(userRes.message || "获取用户信息失败")
          setLoading(false)
          return
        }

        console.log("[OAuth] 登录成功，清理资源...")
        await api.oauthStopCallbackServer()
        clearExpectedState()
        sessionStorage.removeItem("oauth_code_verifier")
        console.log("[OAuth] 调用 onSuccess...")
        onSuccess(userRes.data)
        console.log("[OAuth] 调用 onClose...")
        onClose()
      }
    } catch (error: any) {
      console.error("[OAuth] 处理回调时发生错误:", error)
      message.error(error.message || "登录失败")
    } finally {
      console.log("[OAuth] 回调处理完成，重置状态")
      setLoading(false)
      // 延迟释放锁，确保其他可能的重复事件被忽略
      setTimeout(() => {
        isProcessingCallback = false
        console.log("[OAuth] 全局锁已释放")
      }, 1000)
    }
  }

  useEffect(() => {
    const setupListener = async () => {
      // 如果已经有全局监听器，不再创建新的
      if (globalUnlisten) {
        console.log("[OAuth] 全局监听器已存在，跳过创建")
        return
      }

      try {
        const unlisten = await listen<OAuthCallbackResult>("oauth-callback", async (event) => {
          console.log("[OAuth] Event listener 收到 payload:", event.payload)
          if (event.payload) {
            await handleOAuthCallback(event.payload)
          }
        })
        globalUnlisten = unlisten
        console.log("[OAuth] 全局监听器已创建")
      } catch (error) {
        console.error("Failed to setup OAuth callback listener:", error)
      }
    }

    setupListener()

    // 组件卸载时不取消监听，保持全局监听
    // 只在应用完全关闭时才清理
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

      // 存储 code_verifier 用于后续换取 token
      sessionStorage.setItem("oauth_code_verifier", urlRes.data.code_verifier)
      console.log("[OAuth] code_verifier 已存储")

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
