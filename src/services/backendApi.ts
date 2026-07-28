import { sectlAuth } from "./sectlAuth"

const DEFAULT_BACKEND_URL =
  (import.meta as any).env?.VITE_SYNC_SERVER_URL || "http://127.0.0.1:8787"

export const getBackendBaseUrl = (): string => {
  try {
    return (localStorage.getItem("ss_sync_server_url") || DEFAULT_BACKEND_URL).replace(/\/$/, "")
  } catch {
    return DEFAULT_BACKEND_URL
  }
}

export const backendFetch = async (path: string, init: RequestInit = {}): Promise<Response> => {
  const token = sectlAuth.getAccessToken()
  if (!token) throw new Error("未授权，请先登录")

  const headers = new Headers(init.headers)
  headers.set("Authorization", `Bearer ${token}`)
  if (init.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json")
  }

  return fetch(`${getBackendBaseUrl()}${path}`, { ...init, headers })
}

export const backendErrorMessage = async (response: Response, fallback: string): Promise<string> => {
  const error = await response.json().catch(() => ({}))
  return error.error_description || error.error || fallback
}
