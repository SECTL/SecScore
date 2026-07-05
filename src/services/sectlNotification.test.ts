import { describe, it, expect, vi, beforeEach } from "vitest"
import { sectlNotification } from "./sectlNotification"
import { SECTL_CONFIG, sectlAuth } from "./sectlAuth"

// Mock fetch and sectlAuth
global.fetch = vi.fn()
vi.mock("./sectlAuth", () => ({
  SECTL_CONFIG: {
    baseUrl: "https://api.sectl.cn",
    platformId: "test-platform-id",
  },
  sectlAuth: {
    getAccessToken: vi.fn(),
    getUserId: vi.fn(),
  },
}))

describe("sectlNotification", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(sectlAuth.getAccessToken).mockReturnValue("test-access-token")
    vi.mocked(sectlAuth.getUserId).mockReturnValue("test-user-id")
  })

  describe("getNotifications", () => {
    it("should call correct API endpoint without client_id", async () => {
      const mockResponse = { notifications: [], total: 0 }
      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      } as Response)

      await sectlNotification.getNotifications({ limit: 10, offset: 0 })

      const calledUrl = vi.mocked(global.fetch).mock.calls[0][0] as string
      expect(calledUrl).toContain(`${SECTL_CONFIG.baseUrl}/api/notifications?`)
      expect(calledUrl).toContain("limit=10")
      expect(calledUrl).toContain("offset=0")
      expect(calledUrl).not.toContain("client_id")
    })
  })

  describe("markNotificationRead", () => {
    it("should call correct API endpoint", async () => {
      const mockResponse = { success: true, notification: { $id: "notif-123", is_read: true } }
      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      } as Response)

      await sectlNotification.markNotificationRead("notif-123")

      expect(global.fetch).toHaveBeenCalledWith(
        `${SECTL_CONFIG.baseUrl}/api/notifications/notif-123/read`,
        expect.objectContaining({
          method: "POST",
        })
      )
    })
  })

  describe("markAllNotificationsRead", () => {
    it("should call correct API endpoint", async () => {
      const mockResponse = { success: true, marked_count: 5 }
      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      } as Response)

      await sectlNotification.markAllNotificationsRead()

      expect(global.fetch).toHaveBeenCalledWith(
        `${SECTL_CONFIG.baseUrl}/api/notifications/read-all`,
        expect.objectContaining({
          method: "POST",
        })
      )
    })
  })

  describe("deleteNotification", () => {
    it("should call correct API endpoint", async () => {
      const mockResponse = { success: true, message: "deleted" }
      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      } as Response)

      await sectlNotification.deleteNotification("notif-123")

      expect(global.fetch).toHaveBeenCalledWith(
        `${SECTL_CONFIG.baseUrl}/api/notifications/notif-123`,
        expect.objectContaining({
          method: "DELETE",
        })
      )
    })
  })

  describe("sendNotification", () => {
    it("should call correct API endpoint", async () => {
      const mockResponse = { success: true, notification_id: "notif-123" }
      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      } as Response)

      await sectlNotification.sendNotification({
        user_id: "user-123",
        title: "Test",
        content: "Test content",
      })

      expect(global.fetch).toHaveBeenCalledWith(
        `${SECTL_CONFIG.baseUrl}/api/notifications/send`,
        expect.objectContaining({
          method: "POST",
        })
      )
    })
  })
})
