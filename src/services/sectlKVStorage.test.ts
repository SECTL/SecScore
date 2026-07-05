import { describe, it, expect, vi, beforeEach } from "vitest"
import { sectlKVStorage } from "./sectlKVStorage"
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

describe("sectlKVStorage", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(sectlAuth.getAccessToken).mockReturnValue("test-access-token")
    vi.mocked(sectlAuth.getUserId).mockReturnValue("test-user-id")
  })

  describe("setKV", () => {
    it("should call correct API endpoint for string value", async () => {
      const mockResponse = { success: true }
      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      } as Response)

      await sectlKVStorage.setKV("test-key", "test-value")

      expect(global.fetch).toHaveBeenCalledWith(
        `${SECTL_CONFIG.baseUrl}/api/cloud/kv`,
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining('"key":"test-key"'),
        })
      )
    })

    it("should call correct API endpoint for object value", async () => {
      const mockResponse = { success: true }
      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      } as Response)

      await sectlKVStorage.setKV("test-key", { foo: "bar" })

      expect(global.fetch).toHaveBeenCalledWith(
        `${SECTL_CONFIG.baseUrl}/api/cloud/kv`,
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining('"key":"test-key"'),
        })
      )
    })
  })

  describe("getKV", () => {
    it("should call correct API endpoint", async () => {
      const mockResponse = { value: "test-value" }
      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      } as Response)

      await sectlKVStorage.getKV("test-key")

      expect(global.fetch).toHaveBeenCalledWith(
        `${SECTL_CONFIG.baseUrl}/api/cloud/kv/test-key?client_id=test-platform-id&user_id=test-user-id`,
        expect.any(Object)
      )
    })
  })

  describe("deleteKV", () => {
    it("should call correct API endpoint", async () => {
      const mockResponse = { success: true }
      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      } as Response)

      await sectlKVStorage.deleteKV("test-key")

      expect(global.fetch).toHaveBeenCalledWith(
        `${SECTL_CONFIG.baseUrl}/api/cloud/kv/test-key`,
        expect.objectContaining({
          method: "DELETE",
        })
      )
    })
  })

  describe("updateKVField", () => {
    it("should call correct API endpoint", async () => {
      const mockResponse = { success: true }
      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      } as Response)

      await sectlKVStorage.updateKVField("test-key", "field", "value")

      expect(global.fetch).toHaveBeenCalledWith(
        `${SECTL_CONFIG.baseUrl}/api/cloud/kv/test-key`,
        expect.objectContaining({
          method: "PATCH",
        })
      )
    })
  })
})
