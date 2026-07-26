import { AppstoreOutlined, LoginOutlined, PlusOutlined, SwapOutlined } from "@ant-design/icons"
import { Button, Divider, Input, List, Modal, Space, Tag, message } from "antd"
import { useCallback, useEffect, useMemo, useState } from "react"
import { OAuthLogin } from "./OAuth/OAuthLogin"
import type { WorkspaceState } from "../preload/types"
import { sectlAuth } from "../services/sectlAuth"
import { syncClient } from "../services/syncClient"

interface WorkspaceManagerProps {
  compact?: boolean
}

const maskIdentifier = (value: string | null | undefined): string => {
  if (!value) return "none"
  if (value.length <= 8) return "***"
  return `${value.slice(0, 4)}…${value.slice(-4)}`
}

const workspaceLog = (
  level: "debug" | "info" | "warn" | "error",
  event: string,
  meta: Record<string, unknown> = {}
) => {
  try {
    void (window as any).api?.writeLog?.({
      level,
      message: `[workspace] ${event}`,
      meta: { ...meta, at: new Date().toISOString() },
    })
  } catch {
    // 日志失败不能影响工作空间操作。
  }
}

export function WorkspaceManager({ compact = false }: WorkspaceManagerProps): React.JSX.Element {
  const [state, setState] = useState<WorkspaceState | null>(null)
  const [open, setOpen] = useState(false)
  const [oauthOpen, setOAuthOpen] = useState(false)
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const [newClassName, setNewClassName] = useState("")
  const [joinCode, setJoinCode] = useState("")
  const [messageApi, contextHolder] = message.useMessage()

  const applyState = useCallback((next: WorkspaceState) => {
    setState(next)
    workspaceLog("debug", "state_applied", {
      account_count: next.accounts.length,
      class_count: next.classes.length,
      current_account_id: maskIdentifier(next.current_account_id),
      current_class_id: maskIdentifier(next.current_class_id),
    })
    try {
      localStorage.setItem("ss_current_class_id", next.current_class_id)
      localStorage.setItem("ss_current_account_id", next.current_account_id)
    } catch {
      // 非桌面环境可能没有持久化存储，Tauri 目录库仍是最终状态。
    }
  }, [])

  const load = useCallback(async () => {
    const startedAt = performance.now()
    workspaceLog("info", "state_load_start")
    try {
      const result = await (window as any).api?.workspaceGetState?.()
      if (result?.success && result.data) {
        applyState(result.data)
        workspaceLog("info", "state_load_complete", {
          duration_ms: Math.round(performance.now() - startedAt),
        })
      } else {
        workspaceLog("warn", "state_load_failed", { message: result?.message || "empty_response" })
      }
    } catch (error) {
      workspaceLog("error", "state_load_exception", {
        duration_ms: Math.round(performance.now() - startedAt),
        error: String(error),
      })
    }
  }, [applyState])

  useEffect(() => {
    void load()
    const api = (window as any).api
    if (!api?.onWorkspaceChanged) return
    let disposed = false
    let unlisten: (() => void) | null = null
    Promise.resolve(api.onWorkspaceChanged((next: WorkspaceState) => applyState(next)))
      .then((fn: (() => void) | undefined) => {
        if (disposed) fn?.()
        else unlisten = fn || null
      })
      .catch(() => void 0)
    return () => {
      disposed = true
      unlisten?.()
    }
  }, [applyState, load])

  const currentAccount = useMemo(
    () => state?.accounts.find((item) => item.is_active) || state?.accounts[0],
    [state]
  )
  const currentClass = useMemo(
    () => state?.classes.find((item) => item.is_current) || state?.classes[0],
    [state]
  )

  const run = async (id: string, action: () => Promise<any>) => {
    const startedAt = performance.now()
    workspaceLog("info", "operation_start", {
      operation: id,
      account_id: maskIdentifier(state?.current_account_id),
      class_id: maskIdentifier(state?.current_class_id),
    })
    setLoadingId(id)
    try {
      const result = await action()
      if (!result?.success) {
        workspaceLog("warn", "operation_failed", {
          operation: id,
          duration_ms: Math.round(performance.now() - startedAt),
          message: result?.message || "操作失败",
        })
        messageApi.error(result?.message || "操作失败")
      } else {
        if (result.data) applyState(result.data)
        workspaceLog("info", "operation_complete", {
          operation: id,
          duration_ms: Math.round(performance.now() - startedAt),
        })
      }
    } catch (error: any) {
      workspaceLog("error", "operation_exception", {
        operation: id,
        duration_ms: Math.round(performance.now() - startedAt),
        error: String(error?.message || error),
      })
      messageApi.error(error?.message || "操作失败")
    } finally {
      setLoadingId(null)
    }
  }

  const openClass = (classId: string) =>
    run(`class:${classId}`, () => (window as any).api.workspaceSwitchClass(classId))

  const openAccount = (accountId: string) =>
    run(`account:${accountId}`, async () => {
      persistCurrentToken()
      const result = await (window as any).api.workspaceSwitchAccount(accountId)
      if (result?.success) {
        const target = result.data?.accounts?.find((item: { id: string }) => item.id === accountId)
        if (target?.user_id) restoreStoredToken(target.user_id)
      }
      return result
    })

  const persistCurrentToken = () => {
    const userId = sectlAuth.getUserId()
    const token = sectlAuth.getToken()
    if (!userId || !token) {
      workspaceLog("debug", "account_token_persist_skipped", {
        user_id: maskIdentifier(userId),
        has_token: Boolean(token),
      })
      return
    }
    try {
      localStorage.setItem(`sectl_token:${userId}`, JSON.stringify(token))
      workspaceLog("info", "account_token_persisted", {
        user_id: maskIdentifier(userId),
        token_kind: token.access_token?.split(".").length === 3 ? "jwt_like" : "opaque",
      })
    } catch {
      workspaceLog("warn", "account_token_persist_failed", { user_id: maskIdentifier(userId) })
      // token 持久化失败不阻断当前会话。
    }
  }

  const restoreStoredToken = (userId: string) => {
    try {
      const raw = localStorage.getItem(`sectl_token:${userId}`)
      if (raw) {
        sectlAuth.restoreToken(JSON.parse(raw))
        workspaceLog("info", "account_token_restored", { user_id: maskIdentifier(userId) })
      } else {
        workspaceLog("debug", "account_token_restore_skipped", { user_id: maskIdentifier(userId) })
      }
    } catch {
      workspaceLog("warn", "account_token_restore_failed", { user_id: maskIdentifier(userId) })
      // 该账号没有可恢复的凭据时，保留未登录状态。
    }
  }

  const remoteRequest = async (path: string, init: RequestInit = {}) => {
    const startedAt = performance.now()
    const method = init.method || "GET"
    const token = sectlAuth.getAccessToken()
    if (!token) {
      workspaceLog("warn", "remote_request_skipped_no_token", { method, path })
      throw new Error("请先登录 SECTL 账号")
    }
    const serverUrl = (localStorage.getItem("ss_sync_server_url") || "http://127.0.0.1:8787").replace(/\/$/, "")
    workspaceLog("info", "remote_request_start", { method, path })
    try {
      const response = await fetch(`${serverUrl}${path}`, {
        ...init,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          ...(init.headers || {}),
        },
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) {
        workspaceLog("warn", "remote_request_failed", {
          method,
          path,
          status: response.status,
          duration_ms: Math.round(performance.now() - startedAt),
          message: body.error || body.message || `请求失败 (${response.status})`,
        })
        throw new Error(body.error || body.message || `请求失败 (${response.status})`)
      }
      workspaceLog("info", "remote_request_complete", {
        method,
        path,
        status: response.status,
        duration_ms: Math.round(performance.now() - startedAt),
      })
      return body
    } catch (error) {
      workspaceLog("error", "remote_request_exception", {
        method,
        path,
        duration_ms: Math.round(performance.now() - startedAt),
        error: String(error),
      })
      throw error
    }
  }

  const createClass = () => {
    const name = newClassName.trim()
    if (!name) return
    void run("create", async () => {
      const result = await (window as any).api.workspaceCreateLocalClass(name)
      if (result?.success) setNewClassName("")
      return result
    })
  }

  const handleOAuthSuccess = (userInfo: {
    user_id?: string
    id?: string
    email?: string
    name?: string
  }) => {
    const userId = userInfo.user_id || userInfo.id
    if (!userId) {
      workspaceLog("warn", "oauth_success_missing_user_id")
      messageApi.error("登录结果缺少用户 ID")
      return
    }
    workspaceLog("info", "oauth_login_success", {
      user_id: maskIdentifier(userId),
      has_email: Boolean(userInfo.email),
    })
    persistCurrentToken()
    try {
      const token = sectlAuth.getToken()
      if (token) localStorage.setItem(`sectl_token:${userId}`, JSON.stringify(token))
    } catch {
      // 当前会话仍可继续使用。
    }
    void run("account:add", async () => {
      const result = await (window as any).api.workspaceUpsertSectlAccount(
        userId,
        userInfo.name || userInfo.email || userId,
        userInfo.email || null
      )
      if (!result?.success) return result
      const current = result.data?.classes?.find((item: { is_current?: boolean }) => item.is_current)
      if (current?.kind === "local") {
        const created = await remoteRequest("/v1/classes", {
          method: "POST",
          body: JSON.stringify({ name: current.name }),
        })
        const online = await (window as any).api.workspaceMarkClassOnline(
          current.id,
          created.id,
          created.join_code
        )
        if (online?.success) syncClient.requestSnapshot()
        return online
      }
      return result
    })
  }

  const joinOnlineClass = () => {
    if (joinCode.length !== 6) return
    void run("join", async () => {
      const joined = await remoteRequest("/v1/classes/join", {
        method: "POST",
        body: JSON.stringify({ join_code: joinCode }),
      })
      const result = await (window as any).api.workspaceAddOnlineClass(
        joined.name,
        joined.id,
        joined.join_code
      )
      if (result?.success) {
        setJoinCode("")
        syncClient.requestSnapshot()
      }
      return result
    })
  }

  const publishClass = (item: { id: string; name: string }) => {
    void run(`publish:${item.id}`, async () => {
      const created = await remoteRequest("/v1/classes", {
        method: "POST",
        body: JSON.stringify({ name: item.name }),
      })
      const result = await (window as any).api.workspaceMarkClassOnline(
        item.id,
        created.id,
        created.join_code
      )
      if (result?.success) syncClient.requestSnapshot()
      return result
    })
  }

  const renameClass = (item: { id: string; name: string; remote_id?: string | null }) => {
    const name = window.prompt("请输入新的班级名称", item.name)?.trim()
    if (!name || name === item.name) return
    void run(`rename:${item.id}`, async () => {
      if (item.remote_id) {
        await remoteRequest(`/v1/classes/${item.remote_id}`, {
          method: "PATCH",
          body: JSON.stringify({ name }),
        })
      }
      return (window as any).api.workspaceRenameClass(item.id, name)
    })
  }

  const rotateClassCode = (item: { id: string; remote_id?: string | null }) => {
    if (!item.remote_id) {
      messageApi.info("本地班级发布后才能刷新班级 ID")
      return
    }
    void run(`rotate:${item.id}`, async () => {
      const result = await remoteRequest(`/v1/classes/${item.remote_id}/rotate-code`, { method: "POST" })
      return (window as any).api.workspaceUpdateClassCode(item.id, result.join_code)
    })
  }

  const deleteClass = (item: { id: string; remote_id?: string | null; name: string }) => {
    if (!window.confirm(`确定删除班级“${item.name}”吗？删除后本地缓存将变为只读。`)) return
    void run(`delete:${item.id}`, async () => {
      if (item.remote_id) {
        await remoteRequest(`/v1/classes/${item.remote_id}`, { method: "DELETE" })
      }
      return (window as any).api.workspaceMarkClassDeleted(item.id)
    })
  }

  const leaveClass = (item: { id: string; remote_id?: string | null; name: string }) => {
    if (!window.confirm(`确定退出班级“${item.name}”吗？`)) return
    void run(`leave:${item.id}`, async () => {
      if (item.remote_id) {
        await remoteRequest(`/v1/classes/${item.remote_id}/leave`, { method: "POST" })
      }
      return (window as any).api.workspaceLeaveClass(item.id)
    })
  }

  return (
    <>
      {contextHolder}
      <Button
        size={compact ? "small" : "middle"}
        icon={<AppstoreOutlined />}
        onClick={() => setOpen(true)}
        title="账号和班级"
      >
        {currentClass?.name || "我的班级"} · {currentAccount?.name || "本地账号"}
      </Button>
      <Modal
        title="账号和班级"
        open={open}
        onCancel={() => setOpen(false)}
        footer={null}
        destroyOnHidden
        width={620}
      >
        <Space direction="vertical" size={14} style={{ width: "100%" }}>
          <div>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>账号</div>
            <List
              size="small"
              bordered
              dataSource={state?.accounts || []}
              locale={{ emptyText: "暂无账号" }}
              renderItem={(account) => (
                <List.Item
                  actions={[
                    <Button
                      key="switch"
                      type={account.is_active ? "link" : "default"}
                      size="small"
                      loading={loadingId === `account:${account.id}`}
                      disabled={account.is_active}
                      icon={<SwapOutlined />}
                      onClick={() => openAccount(account.id)}
                    >
                      {account.is_active ? "当前账号" : "切换"}
                    </Button>,
                  ]}
                >
                  <List.Item.Meta
                    title={account.name}
                    description={account.email || (account.kind === "local" ? "离线本地账号" : account.user_id)}
                  />
                </List.Item>
              )}
            />
            <Button
              style={{ marginTop: 8 }}
              icon={<LoginOutlined />}
              onClick={() => setOAuthOpen(true)}
            >
              添加 SECTL 账号
            </Button>
          </div>

          <Divider style={{ margin: 0 }} />

          <div>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>班级</div>
            <List
              size="small"
              bordered
              dataSource={state?.classes || []}
              locale={{ emptyText: "暂无班级" }}
              renderItem={(item) => (
                <List.Item
                  actions={[
                    <Button
                      key="switch"
                      type={item.is_current ? "link" : "default"}
                      size="small"
                      loading={loadingId === `class:${item.id}`}
                      disabled={item.is_current}
                      onClick={() => openClass(item.id)}
                    >
                      {item.is_current ? "当前班级" : "切换"}
                    </Button>,
                    ...(item.kind === "local" && currentAccount?.kind === "sectl"
                      ? [
                          <Button
                            key="publish"
                            type="link"
                            size="small"
                            loading={loadingId === `publish:${item.id}`}
                            onClick={() => publishClass(item)}
                          >
                            发布
                          </Button>,
                        ]
                      : []),
                    <Button
                      key="rename"
                      type="link"
                      size="small"
                      loading={loadingId === `rename:${item.id}`}
                      onClick={() => renameClass(item)}
                    >
                      改名
                    </Button>,
                    ...(item.remote_id
                      ? [
                          <Button
                            key="rotate"
                            type="link"
                            size="small"
                            loading={loadingId === `rotate:${item.id}`}
                            onClick={() => rotateClassCode(item)}
                          >
                            刷新ID
                          </Button>,
                        ]
                      : []),
                    <Button
                      key="delete"
                      type="link"
                      danger
                      size="small"
                      loading={loadingId === `delete:${item.id}`}
                      onClick={() => deleteClass(item)}
                    >
                      删除
                    </Button>,
                    <Button
                      key="leave"
                      type="link"
                      size="small"
                      loading={loadingId === `leave:${item.id}`}
                      onClick={() => leaveClass(item)}
                    >
                      退出
                    </Button>,
                  ]}
                >
                  <List.Item.Meta
                    title={
                      <Space>
                        {item.name}
                        <Tag color={item.kind === "online" ? "blue" : "default"}>
                          {item.kind === "online" ? "在线" : "本地"}
                        </Tag>
                      </Space>
                    }
                    description={item.join_code ? `班级 ID：${item.join_code}` : "尚未发布到云端"}
                  />
                </List.Item>
              )}
            />
            <Space.Compact style={{ width: "100%", marginTop: 8 }}>
              <Input
                placeholder="新建本地班级名称"
                value={newClassName}
                onChange={(event) => setNewClassName(event.target.value)}
                onPressEnter={createClass}
              />
              <Button
                type="primary"
                icon={<PlusOutlined />}
                loading={loadingId === "create"}
                onClick={createClass}
              >
                创建
              </Button>
            </Space.Compact>
            <Space.Compact style={{ width: "100%", marginTop: 8 }}>
              <Input
                placeholder="输入6位班级 ID 加入在线班级"
                maxLength={6}
                value={joinCode}
                onChange={(event) => setJoinCode(event.target.value.toUpperCase().replace(/[^A-Z]/g, ""))}
              />
              <Button disabled={joinCode.length !== 6} loading={loadingId === "join"} onClick={joinOnlineClass}>
                加入
              </Button>
            </Space.Compact>
          </div>
        </Space>
      </Modal>
      <OAuthLogin
        visible={oauthOpen}
        onClose={() => setOAuthOpen(false)}
        onSuccess={handleOAuthSuccess}
      />
    </>
  )
}
