import { Button, Card, Input, List, Modal, Space, Tag, message } from "antd"
import { PlusOutlined } from "@ant-design/icons"
import { useCallback, useEffect, useState } from "react"
import type { WorkspaceState } from "../preload/types"

/**
 * lite 版班级管理卡片：本地班级的新建/切换/改名/删除。
 * 复用后端 workspace 本地班级机制（每班一个 SQLite 文件），
 * 与 full 版 WorkspaceManager 共享同一套命令与 workspace:changed 事件。
 */
export function ClassManagerCard({ onClassSwitched }: { onClassSwitched?: () => void }): React.JSX.Element {
  const [state, setState] = useState<WorkspaceState | null>(null)
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const [newClassName, setNewClassName] = useState("")
  const [renameTarget, setRenameTarget] = useState<{ id: string; name: string } | null>(null)
  const [renameName, setRenameName] = useState("")
  const [messageApi, contextHolder] = message.useMessage()

  const applyState = useCallback(
    (next: WorkspaceState) => {
      const previousClassId = state?.current_class_id
      setState(next)
      try {
        localStorage.setItem("ss_current_class_id", next.current_class_id)
      } catch {
        // 非 Tauri 环境忽略。
      }
      if (previousClassId && previousClassId !== next.current_class_id) {
        window.dispatchEvent(
          new CustomEvent("ss:data-updated", {
            detail: { category: "all", source: "workspace" },
          })
        )
        onClassSwitched?.()
      }
    },
    [state?.current_class_id, onClassSwitched]
  )

  const load = useCallback(async () => {
    try {
      const result = await (window as any).api?.workspaceGetState?.()
      if (result?.success && result.data) {
        setState(result.data)
      }
    } catch {
      // 后端尚未就绪时静默，稍后事件会再次触发刷新。
    }
  }, [])

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

  const run = async (id: string, action: () => Promise<any>) => {
    setLoadingId(id)
    try {
      const result = await action()
      if (!result?.success) {
        messageApi.error(result?.message || "操作失败")
      } else if (result.data) {
        applyState(result.data)
      }
    } catch (error: any) {
      messageApi.error(error?.message || "操作失败")
    } finally {
      setLoadingId(null)
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

  const switchClass = (classId: string) =>
    run(`switch:${classId}`, () => (window as any).api.workspaceSwitchClass(classId))

  const confirmRename = () => {
    if (!renameTarget) return
    const name = renameName.trim()
    if (!name) return
    void run(`rename:${renameTarget.id}`, () =>
      (window as any).api.workspaceRenameClass(renameTarget.id, name)
    ).then(() => setRenameTarget(null))
  }

  const deleteClass = (item: { id: string; name: string }) => {
    Modal.confirm({
      title: "删除班级",
      content: `确定删除「${item.name}」吗？班级数据将保留在磁盘上（标记为已删除），但不会再出现在列表中。`,
      okText: "删除",
      okButtonProps: { danger: true },
      cancelText: "取消",
      onOk: () =>
        run(`delete:${item.id}`, () =>
          (window as any).api.workspaceMarkClassDeleted(item.id)
        ),
    })
  }

  const classes = state?.classes || []

  return (
    <Card style={{ backgroundColor: "var(--ss-card-bg)", color: "var(--ss-text-main)" }}>
      {contextHolder}
      <div style={{ fontWeight: 600, marginBottom: "12px" }}>班级</div>
      <List
        size="small"
        bordered
        dataSource={classes}
        locale={{ emptyText: "暂无班级" }}
        renderItem={(item) => (
          <List.Item
            actions={[
              <Button
                key="switch"
                type={item.is_current ? "link" : "default"}
                size="small"
                loading={loadingId === `switch:${item.id}`}
                disabled={item.is_current}
                onClick={() => switchClass(item.id)}
              >
                {item.is_current ? "当前班级" : "切换"}
              </Button>,
              <Button
                key="rename"
                type="link"
                size="small"
                onClick={() => {
                  setRenameTarget({ id: item.id, name: item.name })
                  setRenameName(item.name)
                }}
              >
                改名
              </Button>,
              <Button
                key="delete"
                type="link"
                danger
                size="small"
                loading={loadingId === `delete:${item.id}`}
                disabled={item.is_current && classes.length === 1}
                onClick={() => deleteClass(item)}
              >
                删除
              </Button>,
            ]}
          >
            <List.Item.Meta
              title={
                <Space>
                  {item.name}
                  {item.is_current && <Tag color="success">当前</Tag>}
                </Space>
              }
            />
          </List.Item>
        )}
      />
      <Space.Compact style={{ width: "100%", marginTop: 12 }}>
        <Input
          placeholder="新建班级名称"
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

      <Modal
        title="班级改名"
        open={Boolean(renameTarget)}
        onOk={confirmRename}
        onCancel={() => setRenameTarget(null)}
        okText="保存"
        cancelText="取消"
        destroyOnHidden
      >
        <Input
          value={renameName}
          onChange={(event) => setRenameName(event.target.value)}
          onPressEnter={confirmRename}
        />
      </Modal>
    </Card>
  )
}
