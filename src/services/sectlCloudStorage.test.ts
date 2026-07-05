import { describe, it, expect, vi, beforeEach } from "vitest"
import { sectlCloudStorage } from "./sectlCloudStorage"
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

describe("sectlCloudStorage", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(sectlAuth.getAccessToken).mockReturnValue("test-access-token")
    vi.mocked(sectlAuth.getUserId).mockReturnValue("test-user-id")
  })

  describe("uploadFile", () => {
    it("should call correct API endpoint", async () => {
      const mockResponse = { success: true, file_id: "file-123" }
      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      } as Response)

      const file = new File(["test"], "test.txt", { type: "text/plain" })
      await sectlCloudStorage.uploadFile(file, { filename: "test.txt" })

      expect(global.fetch).toHaveBeenCalledWith(
        `${SECTL_CONFIG.baseUrl}/api/cloud/upload`,
        expect.objectContaining({
          method: "POST",
        })
      )
    })
  })

  describe("listFiles", () => {
    it("should call correct API endpoint", async () => {
      const mockResponse = { files: [], total: 0 }
      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      } as Response)

      await sectlCloudStorage.listFiles({ limit: 10, offset: 0 })

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining(`${SECTL_CONFIG.baseUrl}/api/cloud/files`),
        expect.any(Object)
      )
    })
  })

  describe("getFileInfo", () => {
    it("should call correct API endpoint", async () => {
      const mockResponse = { file_id: "file-123", name: "test.txt" }
      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      } as Response)

      await sectlCloudStorage.getFileInfo("file-123")

      expect(global.fetch).toHaveBeenCalledWith(
        `${SECTL_CONFIG.baseUrl}/api/cloud/files/file-123`,
        expect.any(Object)
      )
    })
  })

  describe("downloadFile", () => {
    it("should call correct API endpoint", async () => {
      const mockBlob = new Blob(["test"])
      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        blob: async () => mockBlob,
      } as Response)

      await sectlCloudStorage.downloadFile("file-123")

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining(`${SECTL_CONFIG.baseUrl}/api/cloud/files/file-123/download`),
        expect.any(Object)
      )
    })
  })

  describe("renameFile", () => {
    it("should call correct API endpoint with PUT method", async () => {
      const mockResponse = { file_id: "file-123", filename: "new.txt" }
      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      } as Response)

      await sectlCloudStorage.renameFile("file-123", "new.txt")

      expect(global.fetch).toHaveBeenCalledWith(
        `${SECTL_CONFIG.baseUrl}/api/cloud/files/file-123`,
        expect.objectContaining({
          method: "PUT",
        })
      )
    })
  })

  describe("createShare", () => {
    it("should call correct API endpoint", async () => {
      const mockResponse = { share_id: "share-123", share_url: "https://example.com" }
      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      } as Response)

      await sectlCloudStorage.createShare("file-123")

      expect(global.fetch).toHaveBeenCalledWith(
        `${SECTL_CONFIG.baseUrl}/api/cloud/share`,
        expect.objectContaining({
          method: "POST",
        })
      )
    })
  })

  describe("disableShare", () => {
    it("should call correct API endpoint", async () => {
      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
      } as Response)

      await sectlCloudStorage.disableShare("share-123")

      expect(global.fetch).toHaveBeenCalledWith(
        `${SECTL_CONFIG.baseUrl}/api/cloud/shares/share-123/disable`,
        expect.objectContaining({
          method: "POST",
        })
      )
    })
  })

  describe("enableShare", () => {
    it("should call correct API endpoint", async () => {
      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
      } as Response)

      await sectlCloudStorage.enableShare("share-123")

      expect(global.fetch).toHaveBeenCalledWith(
        `${SECTL_CONFIG.baseUrl}/api/cloud/shares/share-123/enable`,
        expect.objectContaining({
          method: "POST",
        })
      )
    })
  })
})
