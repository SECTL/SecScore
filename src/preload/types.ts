import { invoke } from "@tauri-apps/api/core"
import { listen, UnlistenFn } from "@tauri-apps/api/event"

export interface themeConfig {
  name: string
  id: string
  mode: "light" | "dark"
  config: {
    tdesign: Record<string, string>
    custom: Record<string, string>
  }
}

export interface settingChange {
  key: string
  value: any
  oldValue: any
}

export interface dataUpdatedEvent {
  category?: "events" | "students" | "reasons" | "all"
  source?: string
}

export interface autoScoreTrigger {
  event: string
  value?: string | null
}

export interface autoScoreAction {
  event: string
  value?: string | null
}

export interface autoScoreRule {
  id: number
  name: string
  enabled: boolean
  studentNames: string[]
  triggers: autoScoreTrigger[]
  actions: autoScoreAction[]
  lastExecuted?: string | null
}

export type settingsKey =
  | "is_wizard_completed"
  | "log_level"
  | "window_zoom"
  | "search_keyboard_layout"
  | "disable_search_keyboard"
  | "themes_custom"
  | "auto_score_enabled"
  | "auto_score_rules"
  | "current_theme_id"
  | "dashboards_config"
  | "pg_connection_string"
  | "pg_connection_status"
  | "mobile_bottom_nav_items"

export interface settingsSpec {
  is_wizard_completed: boolean
  log_level: string
  window_zoom: number
  search_keyboard_layout: "t9" | "qwerty26"
  disable_search_keyboard: boolean
  themes_custom: themeConfig[]
  auto_score_enabled: boolean
  auto_score_rules: autoScoreRule[]
  current_theme_id: string
  dashboards_config: any[]
  pg_connection_string: string
  pg_connection_status: {
    connected: boolean
    type: "sqlite" | "postgresql"
    error?: string
  }
  mobile_bottom_nav_items: string[]
}

const api = {
  // Theme
  getThemes: (): Promise<{ success: boolean; data: themeConfig[] }> => invoke("theme_list"),
  getCurrentTheme: (): Promise<{ success: boolean; data: themeConfig }> => invoke("theme_current"),
  setTheme: (themeId: string): Promise<{ success: boolean }> => invoke("theme_set", { themeId }),
  saveTheme: (theme: themeConfig): Promise<{ success: boolean }> => invoke("theme_save", { theme }),
  deleteTheme: (themeId: string): Promise<{ success: boolean }> =>
    invoke("theme_delete", { themeId }),
  onThemeChanged: (callback: (theme: themeConfig) => void): Promise<UnlistenFn> => {
    return listen<themeConfig | { theme?: themeConfig }>("theme:updated", (event) => {
      const payload = event.payload as themeConfig | { theme?: themeConfig } | undefined
      const theme =
        payload && typeof payload === "object" && "theme" in payload
          ? payload.theme
          : (payload as themeConfig | undefined)
      if (theme) callback(theme)
    })
  },

  // DB - Student
  queryStudents: (params?: any): Promise<{ success: boolean; data: any[] }> =>
    invoke("student_query", { params }),
  createStudent: (data: {
    name: string
    group_name?: string
  }): Promise<{ success: boolean; data?: number; message?: string }> =>
    invoke("student_create", { data }),
  updateStudent: (id: number, data: any): Promise<{ success: boolean }> =>
    invoke("student_update", { id, data }),
  deleteStudent: (id: number): Promise<{ success: boolean }> => invoke("student_delete", { id }),
  importStudentsFromXlsx: (params: {
    names: string[]
  }): Promise<{ success: boolean; data: { inserted: number; skipped: number; total: number } }> =>
    invoke("student_import_from_xlsx", { params }),
  fetchBanYouClassrooms: (params: { cookie: string }): Promise<{
    success: boolean
    data?: {
      classrooms: Array<{
        classId: string
        classNickName: string
        invitationCode?: string | null
        masterName?: string | null
        studentsNum?: number | null
        praiseCount?: number | null
        classAvatarPath?: string | null
        classAvatarDataUrl?: string | null
        isOwn?: boolean | null
      }>
      administrativeGroups: Array<{
        classId: string
        classNickName: string
        invitationCode?: string | null
        masterName?: string | null
        studentsNum?: number | null
        praiseCount?: number | null
        classAvatarPath?: string | null
        classAvatarDataUrl?: string | null
        isOwn?: boolean | null
      }>
    }
    message?: string
  }> => invoke("student_fetch_banyou_classrooms", { params }),
  fetchBanYouClassroomDetail: (params: {
    cookie: string
    classId: string
    teamPlanId?: number
  }): Promise<{
    success: boolean
    data?: {
      medals: Array<{
        key?: string
        uid?: string
        name: string
        type?: number
        medalType?: number
        value?: number
      }>
      students: Array<{
        studentId: string
        studentName: string
        avatar?: string | null
      }>
      teams: Array<{
        teamId: string
        teamName: string
        students: Array<{
          studentId: string
          studentName: string
        }>
      }>
      ungroupedStudents: Array<{
        studentId: string
        studentName: string
      }>
      teamPlanIdUsed?: number
      teamPlans?: Array<{
        teamPlanId: number
        name?: string
      }>
      teamPlanSource?: string
    }
    message?: string
  }> => invoke("student_fetch_banyou_classroom_detail", { params }),

  // DB - Tags
  tagsGetAll: (): Promise<{ success: boolean; data: any[] }> => invoke("tags_get_all"),
  tagsGetByStudent: (studentId: number): Promise<{ success: boolean; data: any[] }> =>
    invoke("tags_get_by_student", { studentId }),
  tagsCreate: (name: string): Promise<{ success: boolean; data: any }> =>
    invoke("tags_create", { name }),
  tagsDelete: (id: number): Promise<{ success: boolean }> => invoke("tags_delete", { id }),
  tagsUpdateStudentTags: (studentId: number, tagIds: number[]): Promise<{ success: boolean }> =>
    invoke("tags_update_student_tags", { studentId, tagIds }),

  // DB - Reason
  queryReasons: (): Promise<{ success: boolean; data: any[] }> => invoke("reason_query"),
  createReason: (data: any): Promise<{ success: boolean; data?: number; message?: string }> =>
    invoke("reason_create", { data }),
  updateReason: (id: number, data: any): Promise<{ success: boolean }> =>
    invoke("reason_update", { id, data }),
  deleteReason: (id: number): Promise<{ success: boolean }> => invoke("reason_delete", { id }),

  // DB - Reward
  rewardSettingQuery: (): Promise<{ success: boolean; data: any[] }> =>
    invoke("reward_setting_query"),
  rewardSettingCreate: (data: {
    name: string
    cost_points: number
  }): Promise<{ success: boolean; data?: number; message?: string }> =>
    invoke("reward_setting_create", { data }),
  rewardSettingUpdate: (id: number, data: any): Promise<{ success: boolean; message?: string }> =>
    invoke("reward_setting_update", { id, data }),
  rewardSettingDelete: (id: number): Promise<{ success: boolean; message?: string }> =>
    invoke("reward_setting_delete", { id }),
  rewardRedeem: (data: {
    student_name: string
    reward_id: number
  }): Promise<{
    success: boolean
    data?: { redemption_id: number; remaining_reward_points: number }
    message?: string
  }> => invoke("reward_redeem", { data }),
  rewardRedemptionQuery: (params?: {
    limit?: number
  }): Promise<{ success: boolean; data: any[] }> => invoke("reward_redemption_query", { params }),

  // DB - Event
  queryEvents: (params?: { limit?: number }): Promise<{ success: boolean; data: any[] }> =>
    invoke("event_query", { params }),
  createEvent: (data: {
    studentName: string
    reasonContent: string
    delta: number
  }): Promise<{ success: boolean; data?: number; message?: string }> =>
    invoke("event_create", { data }),
  deleteEvent: (uuid: string): Promise<{ success: boolean }> => invoke("event_delete", { uuid }),
  queryEventsByStudent: (params: {
    studentName: string
    limit?: number
    startTime?: string
  }): Promise<{ success: boolean; data: any[] }> => invoke("event_query_by_student", { params }),
  queryLeaderboard: (params: {
    range: "today" | "week" | "month"
  }): Promise<{ success: boolean; data: { startTime: string; rows: any[] } }> =>
    invoke("leaderboard_query", { params }),
  boardQuerySql: (params: {
    sql: string
    limit?: number
  }): Promise<{ success: boolean; data: any[]; message?: string }> =>
    invoke("board_query_sql", { params }),
  boardGetConfigs: (): Promise<{ success: boolean; data: any[]; message?: string }> =>
    invoke("board_get_configs"),
  boardSaveConfigs: (configs: any[]): Promise<{ success: boolean; message?: string }> =>
    invoke("board_save_configs", { configs }),

  // Settlement
  querySettlements: (): Promise<{ success: boolean; data: any[] }> => invoke("db_settlement_query"),
  createSettlement: (): Promise<{ success: boolean; data: any }> => invoke("db_settlement_create"),
  querySettlementLeaderboard: (params: {
    settlementId: number
  }): Promise<{ success: boolean; data: any }> => invoke("db_settlement_leaderboard", { params }),

  // Auto Score
  autoScoreGetRules: (): Promise<{
    success: boolean
    data?: autoScoreRule[]
    message?: string
  }> => invoke("auto_score_get_rules"),
  autoScoreAddRule: (rule: {
    name: string
    enabled: boolean
    studentNames: string[]
    triggers: autoScoreTrigger[]
    actions: autoScoreAction[]
  }): Promise<{ success: boolean; data?: number; message?: string }> =>
    invoke("auto_score_add_rule", { rule }),
  autoScoreUpdateRule: (rule: {
    id: number
    name: string
    enabled: boolean
    studentNames: string[]
    triggers: autoScoreTrigger[]
    actions: autoScoreAction[]
  }): Promise<{ success: boolean; data?: boolean; message?: string }> =>
    invoke("auto_score_update_rule", { rule }),
  autoScoreDeleteRule: (ruleId: number): Promise<{ success: boolean; data?: boolean; message?: string }> =>
    invoke("auto_score_delete_rule", { ruleId }),
  autoScoreToggleRule: (params: {
    ruleId: number
    enabled: boolean
  }): Promise<{ success: boolean; data?: boolean; message?: string }> =>
    invoke("auto_score_toggle_rule", { params }),
  autoScoreGetStatus: (): Promise<{
    success: boolean
    data?: {
      enabled: boolean
    }
    message?: string
  }> => invoke("auto_score_get_status"),
  autoScoreSortRules: (ruleIds: number[]): Promise<{ success: boolean; data?: boolean; message?: string }> =>
    invoke("auto_score_sort_rules", { ruleIds }),

  // Settings & Sync
  getAllSettings: (): Promise<{ success: boolean; data: settingsSpec }> =>
    invoke("settings_get_all"),
  getSetting: <K extends settingsKey>(
    key: K
  ): Promise<{ success: boolean; data: settingsSpec[K] }> => invoke("settings_get", { key }),
  setSetting: <K extends settingsKey>(
    key: K,
    value: settingsSpec[K]
  ): Promise<{ success: boolean }> => invoke("settings_set", { key, value }),
  onSettingChanged: (callback: (change: settingChange) => void): Promise<UnlistenFn> => {
    return listen<settingChange>("settings:changed", (event) => {
      callback(event.payload)
    })
  },

  // Auth & Security
  authGetStatus: (): Promise<{
    success: boolean
    data: {
      permission: string
      hasAdminPassword: boolean
      hasPointsPassword: boolean
      hasRecoveryString: boolean
    }
  }> => invoke("auth_get_status"),
  authLogin: (
    password: string
  ): Promise<{ success: boolean; data?: { permission: string }; message?: string }> =>
    invoke("auth_login", { password }),
  authLogout: (): Promise<{ success: boolean; data: { permission: string } }> =>
    invoke("auth_logout"),
  authSetPasswords: (payload: {
    adminPassword?: string | null
    pointsPassword?: string | null
  }): Promise<{ success: boolean; data?: { recoveryString: string }; message?: string }> =>
    invoke("auth_set_passwords", payload),
  authGenerateRecovery: (): Promise<{ success: boolean; data: { recoveryString: string } }> =>
    invoke("auth_generate_recovery"),
  authResetByRecovery: (
    recoveryString: string
  ): Promise<{ success: boolean; data?: { recoveryString: string }; message?: string }> =>
    invoke("auth_reset_by_recovery", { recoveryString }),
  authClearAll: (): Promise<{ success: boolean }> => invoke("auth_clear_all"),

  // Data import/export
  exportDataJson: (): Promise<{ success: boolean; data: string }> => invoke("data_export_json"),
  importDataJson: (jsonText: string): Promise<{ success: boolean }> =>
    invoke("data_import_json", { jsonText }),

  // Window
  windowMinimize: (): Promise<void> => invoke("window_minimize"),
  windowMaximize: (): Promise<boolean> => invoke("window_maximize"),
  windowClose: (): Promise<void> => invoke("window_close"),
  windowIsMaximized: (): Promise<boolean> => invoke("window_is_maximized"),
  startDraggingWindow: (): Promise<void> => invoke("window_start_dragging"),
  toggleDevTools: (): Promise<void> => invoke("toggle_devtools"),
  windowResize: (width: number, height: number): Promise<void> =>
    invoke("window_resize", { width, height }),
  windowSetResizable: (resizable: boolean): Promise<void> =>
    invoke("window_set_resizable", { resizable }),
  onWindowMaximizedChanged: (callback: (maximized: boolean) => void): Promise<UnlistenFn> => {
    return listen<boolean>("window:maximized-changed", (event) => {
      callback(event.payload)
    })
  },
  onNavigate: (callback: (route: string) => void): Promise<UnlistenFn> => {
    return listen<string>("app:navigate", (event) => {
      callback(event.payload)
    })
  },
  onDataUpdated: (callback: (payload: dataUpdatedEvent) => void): Promise<UnlistenFn> => {
    return listen<dataUpdatedEvent>("ss:data-updated", (event) => {
      callback(event.payload || {})
    })
  },

  // Logger
  queryLogs: (
    input?: number | { lines?: number }
  ): Promise<{ success: boolean; data: string[] }> => {
    const lines = typeof input === "number" ? input : input?.lines
    return invoke("log_query", { lines })
  },
  clearLogs: (): Promise<{ success: boolean }> => invoke("log_clear"),
  setLogLevel: (level: string): Promise<{ success: boolean }> => invoke("log_set_level", { level }),
  writeLog: (payload: {
    level: string
    message: string
    meta?: any
  }): Promise<{ success: boolean }> => invoke("log_write", { payload }),

  // Database Connection
  dbTestConnection: (
    connectionString: string
  ): Promise<{ success: boolean; data: { success: boolean; error?: string } }> =>
    invoke("db_test_connection", { connectionString }),
  dbSwitchConnection: (
    connectionString: string
  ): Promise<{ success: boolean; data: { type: "sqlite" | "postgresql" } }> =>
    invoke("db_switch_connection", { connectionString }),
  dbGetStatus: (): Promise<{
    success: boolean
    data: { type: string; connected: boolean; error?: string }
  }> => invoke("db_get_status"),
  dbSync: (): Promise<{ success: boolean; data: { success: boolean; message?: string } }> =>
    invoke("db_sync"),
  dbSyncPreview: (): Promise<{
    success: boolean
    data: {
      can_sync: boolean
      need_sync: boolean
      local_only: number
      remote_only: number
      conflicts: Array<{
        table: string
        key: string
        local_summary: string
        remote_summary: string
      }>
      message?: string
    }
  }> => invoke("db_sync_preview"),
  dbSyncApply: (
    strategy: "keep_local" | "keep_remote"
  ): Promise<{
    success: boolean
    data: { success: boolean; synced_records: number; resolved_conflicts: number; message?: string }
  }> => invoke("db_sync_apply", { strategy }),

  // HTTP Server
  httpServerStart: (config?: {
    port?: number
    host?: string
    corsOrigin?: string
  }): Promise<{ success: boolean; data: { url: string; config: any } }> =>
    invoke("http_server_start", { config }),
  httpServerStop: (): Promise<{ success: boolean }> => invoke("http_server_stop"),
  httpServerStatus: (): Promise<{
    success: boolean
    data: { isRunning: boolean; config?: any; url?: string }
  }> => invoke("http_server_status"),

  // MCP Server
  mcpServerStart: (config?: {
    port?: number
    host?: string
  }): Promise<{
    success: boolean
    data?: { url: string; config: { port: number; host: string } }
  }> => invoke("mcp_server_start", { config }),
  mcpServerStop: (): Promise<{ success: boolean }> => invoke("mcp_server_stop"),
  mcpServerStatus: (): Promise<{
    success: boolean
    data?: {
      is_running: boolean
      config: { port: number; host: string }
      url?: string | null
    }
  }> => invoke("mcp_server_status"),

  // File System
  fsGetConfigStructure: (): Promise<{
    success: boolean
    data: { configRoot: string; automatic: string; script: string }
  }> => invoke("fs_get_config_structure"),
  fsReadJson: (
    relativePath: string,
    folder?: "automatic" | "script"
  ): Promise<{ success: boolean; data: any }> => invoke("fs_read_json", { relativePath, folder }),
  fsWriteJson: (
    relativePath: string,
    data: any,
    folder?: "automatic" | "script"
  ): Promise<{ success: boolean }> => invoke("fs_write_json", { relativePath, data, folder }),
  fsReadText: (
    relativePath: string,
    folder?: "automatic" | "script"
  ): Promise<{ success: boolean; data: string }> =>
    invoke("fs_read_text", { relativePath, folder }),
  fsWriteText: (
    content: string,
    relativePath: string,
    folder?: "automatic" | "script"
  ): Promise<{ success: boolean }> => invoke("fs_write_text", { content, relativePath, folder }),
  fsDeleteFile: (
    relativePath: string,
    folder?: "automatic" | "script"
  ): Promise<{ success: boolean }> => invoke("fs_delete_file", { relativePath, folder }),
  fsListFiles: (folder?: "automatic" | "script"): Promise<{ success: boolean; data: any[] }> =>
    invoke("fs_list_files", { folder }),
  fsFileExists: (
    relativePath: string,
    folder?: "automatic" | "script"
  ): Promise<{ success: boolean; data: boolean }> =>
    invoke("fs_file_exists", { relativePath, folder }),

  // App
  registerUrlProtocol: (): Promise<{
    success: boolean
    data?: { registered: boolean }
    message?: string
  }> => invoke("register_url_protocol"),
  appQuit: (): Promise<void> => invoke("app_quit"),
  appRestart: (): Promise<void> => invoke("app_restart"),

  // Generic invoke wrapper for backward compatibility with callers using `api.invoke`
  invoke: async (channel: string, ..._args: any[]): Promise<any> => {
    switch (channel) {
      default:
        throw new Error(`Unsupported legacy invoke channel: ${channel}`)
    }
  },
}

export default api
export { api }
