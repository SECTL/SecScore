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
  const callbackServerPromiseRef = useRef<Promise<{ success: boolean; data?: { url: string }; message?: string }> | null>(null)

  useEffect(() => {
    if (!visible) return

    const platformId = import.meta.env.VITE_OAUTH_PLATFORM_ID
    if (platformId) {
      const callbackUrl = "http://localhost:51267/oauth/callback"
      sectlAuth.initialize(platformId, callbackUrl)

      const api = (window as any).api
      if (api?.oauthStartCallbackServer) {
        callbackServerPromiseRef.current = api.oauthStartCallbackServer()
          .then((result: { success: boolean; data?: { url: string }; message?: string }) => {
            if (result.success && result.data?.url) {
              sectlAuth.initialize(platformId, result.data.url)
            }
            return result
          })
          .catch((error: unknown) => {
            callbackServerPromiseRef.current = null
            throw error
          })
      }
    }

    return () => {
      callbackServerPromiseRef.current = null
    }
  }, [visible])

  // 监听 Deep Link 回调
  useEffect(() => {
    if (!visible || !loading) return
    completedRef.current = false

    const handleDeepLink = async (event: Event) => {
      if (completedRef.current) return
      // 授权码只能使用一次；必须在发起交换前加锁，防止同一回调并发交换。
      completedRef.current = true
      const customEvent = event as CustomEvent<{
        code?: string
        state?: string
        error?: string
        error_description?: string
      }>
      const { code, state, error, error_description } = customEvent.detail

      if (error) {
        message.error(error_description || error)
        setLoading(false)
        return
      }

      if (!code || !state) {
        message.error("OAuth 回调缺少授权码或 state")
        setLoading(false)
        return
      }

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
        void (window as any).api?.oauthLogError?.(error?.message || String(error))
        message.error(error.message || "登录失败")
      } finally {
        setLoading(false)
      }
    }

    window.addEventListener("ss:oauth-deep-link", handleDeepLink)

    // 本地 HTTP 回调服务器通过 Tauri 事件转发 OAuth 回调。
    const api = (window as any).api
    let disposed = false
    let unlistenOAuthCallback: (() => void) | null = null
    if (api?.onOAuthCallback) {
      api
        .onOAuthCallback((payload: {
          code?: string | null
          state?: string | null
          error?: string | null
          error_description?: string | null
        }) => {
          window.dispatchEvent(
            new CustomEvent("ss:oauth-deep-link", {
              detail: {
                code: payload.code || undefined,
                state: payload.state || undefined,
                error: payload.error || undefined,
                error_description: payload.error_description || undefined,
              },
            })
          )
        })
        .then((fn: () => void) => {
          if (disposed) fn()
          else unlistenOAuthCallback = fn
        })
        .catch((error: unknown) => {
          console.error("[OAuthLogin] Failed to listen for local callback:", error)
        })
    }

    return () => {
      disposed = true
      window.removeEventListener("ss:oauth-deep-link", handleDeepLink)
      unlistenOAuthCallback?.()
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
      const api = (window as any).api
      if (!api?.oauthStartCallbackServer) {
        throw new Error("OAuth 本地回调服务器不可用")
      }

      const callbackServer = await (callbackServerPromiseRef.current || api.oauthStartCallbackServer())
      if (!callbackServer.success || !callbackServer.data?.url) {
        throw new Error(callbackServer.message || "启动 OAuth 回调服务器失败")
      }

      // 使用服务器实际监听的地址，确保 redirect_uri 两次请求完全一致。
      sectlAuth.initialize(SECTL_CONFIG.platformId, callbackServer.data.url)

      const authUrl = await sectlAuth.getAuthorizationUrl()
      console.log("[OAuthLogin] OAuth redirect_uri:", SECTL_CONFIG.callbackUrl)
      log("after getAuthorizationUrl")
      // 通过 Rust 启动脱离当前进程的系统浏览器，避免 macOS open 命令等待几十秒。
      const openBrowser = api.oauthOpenBrowser
      if (openBrowser) {
        const result = await openBrowser(authUrl)
        if (!result?.success) throw new Error(result?.message || "无法打开浏览器")
        log("open(authUrl) dispatched")
      } else {
        void open(authUrl)
        log("open(authUrl) dispatched")
      }

      // 设置超时
      setTimeout(() => {
        if (!completedRef.current) {
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
