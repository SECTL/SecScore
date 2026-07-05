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
      // 使用本地 HTTP 回调地址 (http://127.0.0.1:51267/oauth/callback)
      sectlAuth.initialize(platformId, "http://127.0.0.1:51267/oauth/callback")
      SECTL_CONFIG.platformId = platformId
      SECTL_CONFIG.callbackUrl = "http://127.0.0.1:51267/oauth/callback"
    }
  }, [visible])

  // 监听本地 HTTP 回调服务器转发回来的 OAuth 回调
  useEffect(() => {
    if (!visible || !loading) return
    completedRef.current = false

    const api = (window as any).api
    if (!api || typeof api.onOAuthCallback !== "function") return

    let disposed = false
    let unlisten: (() => void) | null = null

    const handleCallback = async (payload: {
      code?: string | null
      state?: string | null
      error?: string | null
      error_description?: string | null
    }) => {
      if (disposed || completedRef.current) return
      console.log("[OAuthLogin] Received http callback:", payload)

      if (payload.error) {
        completedRef.current = true
        message.error("登录失败: " + (payload.error_description || payload.error))
        await stopCallbackServer()
        setLoading(false)
        return
      }

      if (!payload.code) {
        completedRef.current = true
        message.error("登录失败: 未收到授权码")
        await stopCallbackServer()
        setLoading(false)
        return
      }

      try {
        const result = await sectlAuth.exchangeCode(
          payload.code,
          payload.state || ""
        )
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
        await stopCallbackServer()
        setLoading(false)
      }
    }

    api
      .onOAuthCallback(handleCallback)
      .then((fn: () => void) => {
        if (disposed) {
          fn()
          return
        }
        unlisten = fn
      })
      .catch((err: any) => {
        console.error("[OAuthLogin] Failed to listen oauth-callback:", err)
      })

    return () => {
      disposed = true
      if (unlisten) unlisten()
    }
  }, [visible, loading, onClose, onSuccess])

  const stopCallbackServer = async () => {
    const api = (window as any).api
    if (!api || typeof api.oauthStopCallbackServer !== "function") return
    try {
      await api.oauthStopCallbackServer()
    } catch (err) {
      console.warn("[OAuthLogin] stop callback server failed:", err)
    }
  }

  const handleOAuthLogin = async () => {
    if (!SECTL_CONFIG.platformId) {
      message.error("OAuth 配置未设置")
      return
    }

    setLoading(true)

    try {
      // 启动本地 HTTP 回调服务器 (端口 51267，被占用则强杀已有进程)
      const api = (window as any).api
      if (api && typeof api.oauthStartCallbackServer === "function") {
        const res = await api.oauthStartCallbackServer()
        if (!res?.success) {
          throw new Error(res?.message || "启动回调服务器失败")
        }
        // 以服务器实际返回的 URL 作为 redirect_uri
        if (res.data?.url) {
          SECTL_CONFIG.callbackUrl = res.data.url
        }
      }

      const authUrl = await sectlAuth.getAuthorizationUrl()
      // 使用 Tauri shell 打开系统浏览器
      await open(authUrl)

      // 设置超时
      setTimeout(() => {
        if (loading && !completedRef.current) {
          stopCallbackServer()
          setLoading(false)
          message.warning("登录超时，请重试")
        }
      }, 300000)
    } catch (error: any) {
      message.error(error.message || "登录失败")
      await stopCallbackServer()
      setLoading(false)
    }
  }

  const handleModalClose = () => {
    setLoading(false)
    void stopCallbackServer()
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
