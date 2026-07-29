import { beforeEach, describe, expect, it, vi } from "vitest"

class MemoryStorage {
  private readonly values = new Map<string, string>()

  getItem(key: string): string | null {
    return this.values.get(key) ?? null
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value)
  }

  removeItem(key: string): void {
    this.values.delete(key)
  }
}

const createToken = (userId: string, exp: number): string => {
  const encode = (value: Record<string, unknown>) =>
    Buffer.from(JSON.stringify(value)).toString("base64url")
  return `${encode({ alg: "HS256", typ: "JWT" })}.${encode({
    token_use: "user",
    user_id: userId,
    platform_id: "platform-test",
    exp,
  })}.signature`
}

describe("sectlAuth token persistence", () => {
  let storage: MemoryStorage

  beforeEach(() => {
    storage = new MemoryStorage()
    vi.stubGlobal("localStorage", storage)
    vi.resetModules()
  })

  it("does not extend an expired JWT after restarting", async () => {
    const userId = "user-expired"
    const expiredToken = createToken(userId, Math.floor(Date.now() / 1000) - 60)
    storage.setItem(
      "sectl_token",
      JSON.stringify({ access_token: expiredToken, refresh_token: "refresh", expires_in: 3600, user_id: userId })
    )

    const { sectlAuth } = await import("./sectlAuth")

    expect(sectlAuth.isTokenExpired()).toBe(true)
    expect(sectlAuth.isAuthenticated()).toBe(false)
  })

  it("can restore an expired native token only for refreshing it", async () => {
    const { sectlAuth } = await import("./sectlAuth")
    const userId = "user-native-expired"
    const expiredToken = createToken(userId, Math.floor(Date.now() / 1000) - 60)

    expect(
      sectlAuth.restoreToken(
        { access_token: expiredToken, refresh_token: "refresh", user_id: userId },
        { allowExpired: true }
      )
    ).toBe(false)
    expect(sectlAuth.getAccessToken()).toBe(expiredToken)
    expect(sectlAuth.isAuthenticated()).toBe(false)
  })

  it("persists a fresh login for its account and rejects an expired account cache", async () => {
    const { sectlAuth } = await import("./sectlAuth")
    const userId = "user-current"
    const validToken = createToken(userId, Math.floor(Date.now() / 1000) + 3600)

    expect(sectlAuth.restoreToken({ access_token: validToken, user_id: userId })).toBe(true)
    expect(storage.getItem(`sectl_token:${userId}`)).not.toBeNull()

    const expiredToken = createToken(userId, Math.floor(Date.now() / 1000) - 60)
    expect(sectlAuth.restoreToken({ access_token: expiredToken, user_id: userId })).toBe(false)
    expect(sectlAuth.getAccessToken()).toBe(validToken)
  })

  it("removes the account cache when logging out", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }))
    const { sectlAuth } = await import("./sectlAuth")
    const userId = "user-logout"
    const validToken = createToken(userId, Math.floor(Date.now() / 1000) + 3600)

    expect(sectlAuth.restoreToken({ access_token: validToken, user_id: userId })).toBe(true)
    await sectlAuth.logout()

    expect(storage.getItem("sectl_token")).toBeNull()
    expect(storage.getItem(`sectl_token:${userId}`)).toBeNull()
  })
})
