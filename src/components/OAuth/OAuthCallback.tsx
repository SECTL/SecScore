import { useEffect, useState } from "react"
import { useSearchParams, useNavigate } from "react-router-dom"
import { sectlAuth } from "../../services/sectlAuth"

export function OAuthCallback() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [status, setStatus] = useState<"processing" | "success" | "error">("processing")
  const [errorMessage, setErrorMessage] = useState<string>("")

  useEffect(() => {
    const handleCallback = async () => {
      const code = searchParams.get("code")
      const error = searchParams.get("error")
      const errorDescription = searchParams.get("error_description")

      if (error) {
        setStatus("error")
        setErrorMessage(errorDescription || error)
        setTimeout(() => navigate("/"), 3000)
        return
      }

      if (code) {
        try {
          await sectlAuth.exchangeCodeForToken(code)
          setStatus("success")
          setTimeout(() => navigate("/"), 1500)
        } catch (err: any) {
          setStatus("error")
          setErrorMessage(err.message || "Token 交换失败")
          setTimeout(() => navigate("/"), 3000)
        }
      } else {
        setStatus("error")
        setErrorMessage("未收到授权码")
        setTimeout(() => navigate("/"), 3000)
      }
    }

    handleCallback()
  }, [searchParams, navigate])

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        height: "100vh",
        background: "var(--ss-bg-color)",
        color: "var(--ss-text-main)",
      }}
    >
      <div style={{ textAlign: "center" }}>
        {status === "processing" && <div>正在处理登录...</div>}
        {status === "success" && <div>登录成功，正在跳转...</div>}
        {status === "error" && (
          <div>
            <div style={{ color: "#ff4d4f" }}>登录失败</div>
            <div style={{ fontSize: "12px", marginTop: "8px", color: "var(--ss-text-secondary)" }}>
              {errorMessage}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
