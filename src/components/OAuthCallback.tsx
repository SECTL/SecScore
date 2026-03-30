import { useEffect } from "react"
import { useSearchParams, useNavigate } from "react-router-dom"

export function OAuthCallback() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()

  useEffect(() => {
    const code = searchParams.get("code")
    const error = searchParams.get("error")
    const errorDescription = searchParams.get("error_description")

    if (error) {
      window.postMessage(
        {
          error: errorDescription || error,
        },
        window.location.origin
      )
      navigate("/")
      return
    }

    if (code) {
      window.postMessage(
        {
          code,
        },
        window.location.origin
      )
      navigate("/")
    }
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
      <div>正在处理登录...</div>
    </div>
  )
}
