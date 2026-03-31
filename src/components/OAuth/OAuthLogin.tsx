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
  callback_url: string
}

export function OAuthLogin({ visible, onClose, onSuccess }: OAuthLoginProps) {
  const { t } = useTranslation()
  const [loading, setLoading] = useState(false)
  const deepLinkUnlistenRef = useRef<UnlistenFn | null>(null)

  const getOAuthConfig = (): OAuthConfig | null => {
    const api = (window as any).api
    if (!api) return null

    const platformId = import.meta.env.VITE_OAUTH_PLATFORM_ID
    const platformSecret = import.meta.env.VITE_OAUTH_PLATFORM_SECRET
    const callbackUrl = import.meta.env.VITE_OAUTH_CALLBACK_URL || "secscore://oauth/callback"

    if (!platformId || !platformSecret) {
      return null
    }

    return {
      platform_id: platformId,
      platform_secret: platformSecret,
      callback_url: callbackUrl,
    }
  }

  const handleDeepLink = async (url: string) => {
    const config = getOAuthConfig()
    if (!config) return

    try {
      const urlObj = new URL(url)
      const code = urlObj.searchParams.get("code")
      const error = urlObj.searchParams.get("error")

      if (error) {
        message.error(decodeURIComponent(error))
        setLoading(false)
        return
      }

      if (code) {
        const api = (window as any).api
        const tokenRes = await api.oauthExchangeCode(
          code,
          config.platform_id,
          config.platform_secret,
          config.callback_url
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
    const setupDeepLink = async () => {
      try {
        const unlisten = await listen<string>("deep-link://new-url", (event) => {
          if (event.payload) {
            handleDeepLink(event.payload)
          }
        })
        deepLinkUnlistenRef.current = unlisten
      } catch (error) {
        console.error("Failed to setup deep link listener:", error)
      }
    }

    setupDeepLink()

    return () => {
      if (deepLinkUnlistenRef.current) {
        deepLinkUnlistenRef.current()
        deepLinkUnlistenRef.current = null
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
      const urlRes = await api.oauthGetAuthorizationUrl(config.platform_id, config.callback_url)

      if (!urlRes.success) {
        message.error(urlRes.message || "获取授权链接失败")
        setLoading(false)
        return
      }

      await open(urlRes.data)
    } catch (error: any) {
      message.error(error.message || "登录失败")
      setLoading(false)
    }
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
              请在浏览器中完成授权
            </div>
          </Space>
        ) : (
          <Space direction="vertical" size="large" style={{ width: "100%" }}>
            <div style={{ color: "var(--ss-text-secondary)" }}>
              {t("auth.oauthHint", "使用 SECTL Auth 账号登录,享受统一认证和远程退登功能")}
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
