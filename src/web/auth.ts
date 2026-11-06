// SECTL OAuth 2.0 + PKCE（同域回调）。流程与桌面端 sectlAuth.ts 一致。
const BASE_URL = "https://appwrite.sectl.cn"
const AUTH_URL = "https://sectl.cn"
const PLATFORM_ID = String(import.meta.env.VITE_OAUTH_PLATFORM_ID || "").trim()
const TOKEN_KEY = "ssw_token"
const VERIFIER_KEY = "ssw_verifier"
const STATE_KEY = "ssw_state"
const DEVICE_KEY = "ssw_device_uuid"

export interface Session {
  access_token: string
  refresh_token?: string
  expires_at?: number
  user_id?: string
}

export const callbackUrl = () => `${location.origin}/oauth/callback`

const b64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")

const randomString = (len = 32) => b64url(crypto.getRandomValues(new Uint8Array(len)))

const deviceUuid = () => {
  let id = localStorage.getItem(DEVICE_KEY)
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem(DEVICE_KEY, id)
  }
  return id
}

// 服务端有时返回 "JWT|refresh_token" 形式，只取 | 前面作为 access token。
const normalize = (data: any): Session => {
  const parts = String(data.access_token || "").split("|")
  return {
    access_token: parts[0],
    refresh_token: data.refresh_token || parts[1] || undefined,
    user_id: data.user_id || undefined,
    expires_at: data.expires_in ? Date.now() + Number(data.expires_in) * 1000 : undefined,
  }
}

export const getSession = (): Session | null => {
  try {
    const raw = localStorage.getItem(TOKEN_KEY)
    return raw ? (JSON.parse(raw) as Session) : null
  } catch {
    return null
  }
}

const saveSession = (s: Session) => localStorage.setItem(TOKEN_KEY, JSON.stringify(s))
export const logout = () => localStorage.removeItem(TOKEN_KEY)

export const login = async () => {
  if (!PLATFORM_ID) throw new Error("缺少 VITE_OAUTH_PLATFORM_ID，无法登录")
  const verifier = randomString(48)
  const state = randomString(16)
  sessionStorage.setItem(VERIFIER_KEY, verifier)
  sessionStorage.setItem(STATE_KEY, state)
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))
  const params = new URLSearchParams({
    client_id: PLATFORM_ID,
    redirect_uri: callbackUrl(),
    response_type: "code",
    state,
    code_challenge: b64url(new Uint8Array(digest)),
    code_challenge_method: "S256",
  })
  location.href = `${AUTH_URL}/oauth/authorize?${params}`
}

const postJson = async (path: string, body: Record<string, unknown>) => {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = new Error(data.error_description || "认证请求失败") as Error & { status?: number }
    err.status = res.status
    throw err
  }
  return data
}

/** 在 /oauth/callback 页面调用，成功后返回 true。 */
export const handleCallback = async (): Promise<void> => {
  const q = new URLSearchParams(location.search)
  const code = q.get("code")
  const state = q.get("state")
  const verifier = sessionStorage.getItem(VERIFIER_KEY)
  if (q.get("error")) throw new Error(q.get("error_description") || "授权被拒绝")
  if (!code || !state || state !== sessionStorage.getItem(STATE_KEY) || !verifier) {
    throw new Error("OAuth state 校验失败，请重新登录")
  }
  const data = await postJson("/api/oauth/token", {
    grant_type: "authorization_code",
    code,
    client_id: PLATFORM_ID,
    redirect_uri: callbackUrl(),
    code_verifier: verifier,
    device_uuid: deviceUuid(),
  })
  sessionStorage.removeItem(VERIFIER_KEY)
  sessionStorage.removeItem(STATE_KEY)
  saveSession(normalize(data))
}

let refreshing: Promise<Session> | null = null

export const refresh = (): Promise<Session> => {
  refreshing ??= (async () => {
    const current = getSession()
    if (!current?.refresh_token) throw new Error("登录已过期")
    const data = await postJson("/api/oauth/refresh", {
      grant_type: "refresh_token",
      refresh_token: current.refresh_token,
      client_id: PLATFORM_ID,
      device_uuid: deviceUuid(),
    })
    const next = normalize(data)
    next.refresh_token ||= current.refresh_token
    next.user_id ||= current.user_id
    saveSession(next)
    return next
  })().finally(() => {
    refreshing = null
  })
  return refreshing
}

/** 取当前账号 ID；旧会话没有保存时从 userinfo 补齐。 */
export const getUserId = async (): Promise<string | null> => {
  const s = getSession()
  if (!s) return null
  if (s.user_id) return s.user_id
  try {
    const res = await fetch(`${BASE_URL}/api/oauth/userinfo`, {
      headers: { Authorization: `Bearer ${s.access_token}` },
    })
    const id = res.ok ? (await res.json()).user_id : null
    if (id) saveSession({ ...s, user_id: String(id) })
    return id ? String(id) : null
  } catch {
    return null
  }
}
