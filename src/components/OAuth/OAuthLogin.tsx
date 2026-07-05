import { Button, message, Modal, Space, Spin } from "antd"
import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { open } from "@tauri-apps/plugin-shell"
import { sectlAuth, SECTL_CONFIG } from "../../services/sectlAuth"

interface OAuthLoginProps {
  visible: boolean
  onClose: () => void
  onSuccess: (userInfo: {
    user_id?: string
    id?: string
    email?: string
    name?: string
    avatar?: string
    avatar_url?: string
  }) => void
}

export function OAuthLogin({ visible, onClose, onSuccess }: OAuthLoginProps) {
  const { t } = useTranslation()
  const [loading, setLoading] = useState(false)
  // 标记本次登录流程是否已完成，避免回调重复触发
  const completedRef = useRef(false)

  useEffect(() => {
    if (!visible) return

    const platformId = import.meta.env.VITE_OAUTH_PLATFORM_ID
    if (platformId) {
      // 使用 deep link 回调地址
      sectlAuth.initialize(platformId, "secscore://oauth/callback")
      SECTL_CONFIG.platformId = platformId
      SECTL_CONFIG.callbackUrl = "secscore://oauth/callback"
    }
  }, [visible])

  // 监听 Deep Link 回调
  useEffect(() => {
    if (!visible || !loading) return
    completedRef.current = false

    const handleDeepLink = async (event: Event) => {
      if (completedRef.current) return
      const customEvent = event as CustomEvent<{ code: string; state: string }>
      const { code, state } = customEvent.detail

      console.log("[OAuthLogin] Received deep link callback:", { code, state })

      try {
        // 使用 code 交换 token
        const result = await sectlAuth.exchangeCode(code, state)
        if (result) {
          completedRef.current = true
          const userInfo = await sectlAuth.getUserInfo()
          onSuccess(userInfo)
          onClose()
        }
      } catch (error: any) {
        completedRef.current = true
        message.error(error.message || "登录失败")
      } finally {
        setLoading(false)
      }
    }

    window.addEventListener("ss:oauth-deep-link", handleDeepLink)
    return () => {
      window.removeEventListener("ss:oauth-deep-link", handleDeepLink)
    }
  }, [visible, loading, onClose, onSuccess])

  const handleOAuthLogin = async () => {
    if (!SECTL_CONFIG.platformId) {
      message.error("OAuth 配置未设置")
      return
    }

    setLoading(true)
    const t0 = performance.now()
    const log = (step: string) =>
      console.log(`[OAuthLogin] ${step} +${Math.round(performance.now() - t0)}ms`)
    log("handleOAuthLogin start")

    try {
      const authUrl = await sectlAuth.getAuthorizationUrl()
      log("after getAuthorizationUrl")
      // 使用 Tauri shell 打开系统浏览器
      await open(authUrl)
      log("after open(authUrl)")

      // 设置超时
      setTimeout(() => {
        if (loading && !completedRef.current) {
          log("login timeout")
          setLoading(false)
          message.warning("登录超时，请重试")
        }
      }, 300000)
    } catch (error: any) {
      log(`handleOAuthLogin error: ${error?.message}`)
      message.error(error.message || "登录失败")
      setLoading(false)
    }
  }

  const handleModalClose = () => {
    setLoading(false)
    onClose()
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
