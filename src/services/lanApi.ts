const buildLanApiBase = () => {
  const { protocol, hostname } = window.location
  const apiProtocol = protocol === "https:" ? "https:" : "http:"
  return `${apiProtocol}//${hostname}:45740`
}

const request = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const res = await fetch(`${buildLanApiBase()}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  })
  if (!res.ok) {
    return {
      success: false,
      message:
        res.status === 401 ? "局域网访问链接已失效，请重新扫码或复制最新链接" : res.statusText,
    } as T
  }
  return (await res.json()) as T
}

const defaultTheme = {
  id: "light-default",
  name: "Default",
  mode: "light" as const,
  config: {
    tdesign: {
      brandColor: "#1677ff",
      warningColor: "#faad14",
      errorColor: "#ff4d4f",
      successColor: "#52c41a",
    },
    custom: {
      "--ss-bg-color": "#f5f7fb",
      "--ss-header-bg": "#ffffff",
      "--ss-card-bg": "#ffffff",
      "--ss-border-color": "#e7e7e7",
      "--ss-text-main": "#1f2329",
      "--ss-text-secondary": "#6b7280",
    },
  },
}

const noopUnlisten = async () => () => void 0

const lanApiBase = {
  getThemes: async () => ({ success: true, data: [defaultTheme] }),
  getCurrentTheme: async () => ({ success: true, data: defaultTheme }),
  setTheme: async () => ({ success: true }),
  saveTheme: async () => ({ success: false, message: "LAN 模式不支持主题管理" }),
  deleteTheme: async () => ({ success: false, message: "LAN 模式不支持主题管理" }),
  onThemeChanged: noopUnlisten,

  queryStudents: async () =>
    request<{ success: boolean; data: any[]; message?: string }>("/api/students"),
  queryReasons: async () =>
    request<{ success: boolean; data: any[]; message?: string }>("/api/reasons"),
  updateStudent: async () => ({ success: false, message: "LAN 模式不支持修改学生信息" }),
  rewardSettingQuery: async () =>
    request<{ success: boolean; data: any[]; message?: string }>("/api/rewards"),
  queryEvents: async (params?: { limit?: number }) => {
    const limit = Number(params?.limit || 100)
    return request<{ success: boolean; data: any[]; message?: string }>(
      `/api/events?limit=${limit}`
    )
  },
  createEvent: async (data: any) =>
    request<{ success: boolean; data?: number; message?: string }>("/api/events", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  deleteEvent: async (uuid: string) =>
    request<{ success: boolean; message?: string }>(`/api/events/${encodeURIComponent(uuid)}`, {
      method: "DELETE",
    }),
  rewardRedeem: async () => ({ success: false, message: "LAN 模式仅支持加分和扣分" }),

  getAllSettings: async () => ({
    success: true,
    data: {
      is_wizard_completed: true,
      log_level: "info",
      window_zoom: 1,
      search_keyboard_layout: "qwerty26",
      disable_search_keyboard: false,
      font_family: "system",
      mobile_bottom_nav_items: ["home"],
      lan_access_enabled: true,
    },
  }),
  getSetting: async () => ({ success: false, message: "LAN 模式不支持设置" }),
  setSetting: async () => ({ success: false, message: "LAN 模式不支持设置" }),
  getSystemFonts: async () => ({ success: true, data: [] }),

  dbGetStatus: async () => ({
    success: true,
    data: {
      connected: true,
      type: "sqlite",
    },
  }),
  dbSync: async () => ({ success: true }),
  dbSyncPreview: async () => ({
    success: true,
    data: {
      can_sync: false,
      need_sync: false,
      local_only: 0,
      remote_only: 0,
      conflicts: [],
      message: "LAN 模式不支持数据库同步",
    },
  }),
  dbSyncApply: async () => ({
    success: true,
    data: {
      success: false,
      synced_records: 0,
      resolved_conflicts: 0,
      message: "LAN 模式不支持数据库同步",
    },
  }),

  authGetStatus: async () => ({
    success: true,
    data: {
      permission: "points",
      hasAdminPassword: false,
      hasPointsPassword: false,
      hasRecoveryString: false,
    },
  }),
  authLogin: async () => ({ success: true, data: { permission: "points" } }),
  authLogout: async () => ({ success: true, data: { permission: "points" } }),
  authSetPasswords: async () => ({ success: false, message: "LAN 模式不支持权限设置" }),
  authGenerateRecovery: async () => ({ success: false, message: "LAN 模式不支持权限设置" }),
  authResetByRecovery: async () => ({ success: false, message: "LAN 模式不支持权限设置" }),
  authClearAll: async () => ({ success: false, message: "LAN 模式不支持权限设置" }),

  oauthLoadLoginState: async () => ({ success: true, data: null }),
  oauthClearLoginState: async () => ({ success: true }),
  oauthGetStorageUsage: async () => ({ success: false, message: "LAN 模式不支持云空间查询" }),
  onDeepLink: noopUnlisten,
  onNavigate: noopUnlisten,
  onSettingChanged: noopUnlisten,
  onDataUpdated: noopUnlisten,
  writeLog: async () => ({ success: true }),

  openManagementWindow: async () => void 0,
  windowMinimize: async () => void 0,
  windowMaximize: async () => false,
  windowClose: async () => void 0,
  windowIsMaximized: async () => false,
  onWindowMaximizedChanged: noopUnlisten,
  windowResize: async () => void 0,
  windowSetResizable: async () => void 0,
}

export const lanApi = new Proxy(lanApiBase, {
  get(target, prop, receiver) {
    if (prop in target) return Reflect.get(target, prop, receiver)
    if (typeof prop !== "string") return undefined
    if (prop.startsWith("on")) return noopUnlisten
    return async () => ({ success: false, message: `LAN 模式不支持 ${prop}` })
  },
})
