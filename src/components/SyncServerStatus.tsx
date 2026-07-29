import React, { useEffect, useState } from "react"
import { Card, Space, Tag, Typography } from "antd"
import {
  CheckCircleOutlined,
  CloudOutlined,
  DisconnectOutlined,
  LoadingOutlined,
  LoginOutlined,
  WarningOutlined,
} from "@ant-design/icons"
import { syncClient, SyncConnectionState, SyncStatus } from "../services/syncClient"

const STATUS_META: Record<
  SyncConnectionState,
  { label: string; color: string; icon: React.ReactNode }
> = {
  disabled: { label: "未启用", color: "default", icon: <CloudOutlined /> },
  unbound: { label: "未绑定云端班级", color: "warning", icon: <CloudOutlined /> },
  connecting: { label: "连接中", color: "processing", icon: <LoadingOutlined spin /> },
  online: { label: "在线", color: "success", icon: <CheckCircleOutlined /> },
  offline: { label: "离线", color: "error", icon: <DisconnectOutlined /> },
  auth_error: { label: "需要登录", color: "warning", icon: <LoginOutlined /> },
  error: { label: "连接异常", color: "error", icon: <WarningOutlined /> },
}

const formatSyncTime = (iso: string | null): string => {
  if (!iso) return "从未同步"
  return new Date(iso).toLocaleString()
}

export const SyncServerStatus: React.FC = () => {
  const [status, setStatus] = useState<SyncStatus>(syncClient.getStatus())

  useEffect(() => syncClient.subscribeStatus(setStatus), [])

  const meta = STATUS_META[status.state]

  return (
    <Card
      title={
        <Space>
          <CloudOutlined />
          <span>新同步状态</span>
        </Space>
      }
      style={{
        backgroundColor: "var(--ss-card-bg)",
        color: "var(--ss-text-main)",
        marginBottom: "16px",
      }}
    >
      <Space direction="vertical" size={8} style={{ width: "100%" }}>
        <Space wrap>
          <Tag color={meta.color} icon={meta.icon}>
            {status.isSyncing ? "同步中" : meta.label}
          </Tag>
          <Tag color={status.authenticated ? "success" : "warning"}>
            {status.authenticated ? "SECTL 账号已登录" : "未登录 SECTL"}
          </Tag>
          {status.enabled && (
            <Tag color={status.realtimeConnected ? "success" : "warning"}>
              {status.realtimeConnected ? "实时推送已连接" : "实时推送未连接"}
            </Tag>
          )}
          <span style={{ color: "var(--ss-text-secondary)", fontSize: "12px" }}>
            {status.browserOnline ? "本机网络在线" : "本机网络离线"}
          </span>
        </Space>

        <Typography.Text type="secondary" style={{ fontSize: "12px" }}>
          服务器：{status.serverUrl}
        </Typography.Text>
        <Typography.Text type="secondary" style={{ fontSize: "12px" }}>
          上次成功同步：{formatSyncTime(status.lastSyncAt)}
        </Typography.Text>
        {status.state === "unbound" && (
          <Typography.Text type="warning" style={{ fontSize: "12px" }}>
            请在“账号和班级”中发布当前本地班级，或加入已有的线上班级。
          </Typography.Text>
        )}
        {status.lastError && (
          <Typography.Text type="danger" style={{ fontSize: "12px" }}>
            {status.lastError}
          </Typography.Text>
        )}
      </Space>
    </Card>
  )
}
