import React, { useState, useEffect, useCallback } from "react"
import {
  Card,
  Button,
  Space,
  Tag,
  Table,
  Progress,
  message,
  Spin,
  Tooltip,
  Modal,
  Radio,
  Divider,
  Alert,
} from "antd"
import {
  CloudSyncOutlined,
  CloudUploadOutlined,
  CloudDownloadOutlined,
  ReloadOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  InfoCircleOutlined,
} from "@ant-design/icons"
import { useTranslation } from "react-i18next"
import { useSectl } from "../contexts/SectlContext"
import { sectlCloudSync, CloudSyncResult, CloudSyncStatus } from "../services/sectlCloudSync"
import { sectlAuth } from "../services/sectlAuth"

const TABLE_LABELS: Record<string, string> = {
  students: "学生",
  reasons: "理由",
  score_events: "积分事件",
  tags: "标签",
  student_tags: "学生标签",
  reward_settings: "奖励设置",
  reward_redemptions: "奖励兑换",
}

interface StorageStats {
  used: number
  total: number
  percentage: number
  table_stats: Array<{ table: string; count: number; size: number }>
}

export const SectlCloudSyncPanel: React.FC = () => {
  const { t } = useTranslation()
  const { isAuthenticated, isLoading: authLoading } = useSectl()
  const [syncStatus, setSyncStatus] = useState<CloudSyncStatus>(sectlCloudSync.getStatus())
  const [storageStats, setStorageStats] = useState<StorageStats | null>(null)
  const [syncDirection, setSyncDirection] = useState<"push" | "pull" | "bidirectional">(
    "bidirectional"
  )
  const [lastResult, setLastResult] = useState<CloudSyncResult | null>(null)
  const [loadingStats, setLoadingStats] = useState(false)
  const [messageApi, contextHolder] = message.useMessage()

  const refreshStatus = useCallback(() => {
    setSyncStatus(sectlCloudSync.getStatus())
  }, [])

  useEffect(() => {
    refreshStatus()
    const interval = setInterval(refreshStatus, 10_000)
    return () => clearInterval(interval)
  }, [refreshStatus])

  const loadStorageStats = useCallback(async () => {
    if (!isAuthenticated) return
    setLoadingStats(true)
    try {
      const stats = await sectlCloudSync.getCloudStorageUsage()
      setStorageStats(stats)
    } catch {
      // ignore
    } finally {
      setLoadingStats(false)
    }
  }, [isAuthenticated])

  useEffect(() => {
    if (isAuthenticated) loadStorageStats()
  }, [isAuthenticated, loadStorageStats])

  const handleSync = async (direction: "push" | "pull" | "bidirectional") => {
    if (!sectlAuth.isAuthenticated()) {
      messageApi.warning(t("settings.cloudSync.loginRequired"))
      return
    }

    refreshStatus()
    if (syncStatus.is_syncing) {
      messageApi.warning(t("settings.cloudSync.syncInProgress"))
      return
    }

    const directionLabel =
      direction === "push"
        ? t("settings.cloudSync.uploadToCloud")
        : direction === "pull"
          ? t("settings.cloudSync.downloadFromCloud")
          : t("settings.cloudSync.fullSync")

    Modal.confirm({
      title: directionLabel,
      content: t("settings.cloudSync.syncConfirm", { direction: directionLabel }),
      okText: t("common.confirm"),
      cancelText: t("common.cancel"),
      onOk: async () => {
        try {
          let result: CloudSyncResult
          if (direction === "push") {
            result = await sectlCloudSync.syncToCloud()
          } else if (direction === "pull") {
            result = await sectlCloudSync.syncFromCloud()
          } else {
            result = await sectlCloudSync.fullSync("bidirectional")
          }

          setLastResult(result)
          refreshStatus()
          await loadStorageStats()

          if (result.success) {
            messageApi.success(result.message)
            window.dispatchEvent(
              new CustomEvent("ss:data-updated", { detail: { category: "all" } })
            )
          } else {
            messageApi.error(result.message)
          }
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err)
          messageApi.error(`同步失败：${msg}`)
        }
      },
    })
  }

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return "0 B"
    const k = 1024
    const sizes = ["B", "KB", "MB"]
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
  }

  const formatTime = (iso: string | null): string => {
    if (!iso) return t("settings.cloudSync.never")
    try {
      return new Date(iso).toLocaleString()
    } catch {
      return iso
    }
  }

  if (authLoading) {
    return (
      <Card>
        <div style={{ textAlign: "center", padding: "40px 0" }}>
          <Spin />
        </div>
      </Card>
    )
  }

  if (!isAuthenticated) {
    return (
      <Card>
        <Alert
          type="warning"
          showIcon
          icon={<InfoCircleOutlined />}
          message={t("settings.cloudSync.loginRequired")}
          description={t("settings.cloudSync.loginHint")}
        />
      </Card>
    )
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {contextHolder}

      <Card
        title={
          <Space>
            <CloudSyncOutlined />
            <span>{t("settings.cloudSync.statusTitle")}</span>
          </Space>
        }
        style={{ backgroundColor: "var(--ss-card-bg)", color: "var(--ss-text-main)" }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 16,
          }}
        >
          <Space>
            <Tag color={syncStatus.is_configured ? "success" : "default"}>
              {syncStatus.is_configured
                ? t("settings.cloudSync.configured")
                : t("settings.cloudSync.notConfigured")}
            </Tag>
            {syncStatus.is_syncing && (
              <Tag color="processing">
                <Spin size="small" /> {t("settings.cloudSync.syncing")}
              </Tag>
            )}
          </Space>
          <span style={{ fontSize: "12px", color: "var(--ss-text-secondary)" }}>
            {t("settings.cloudSync.lastSync")}: {formatTime(syncStatus.last_sync_at)}
          </span>
        </div>

        {lastResult && (
          <Alert
            type={lastResult.success ? "success" : "error"}
            showIcon
            icon={lastResult.success ? <CheckCircleOutlined /> : <ExclamationCircleOutlined />}
            message={lastResult.message}
            description={
              lastResult.tables.length > 0 && (
                <div style={{ marginTop: 8 }}>
                  {lastResult.tables
                    .filter((tr) => tr.uploaded > 0 || tr.downloaded > 0 || tr.errors.length > 0)
                    .map((tr) => (
                      <Tag
                        key={tr.table}
                        color={tr.errors.length > 0 ? "error" : "success"}
                        style={{ marginBottom: 4 }}
                      >
                        {TABLE_LABELS[tr.table] || tr.table}
                        {tr.uploaded > 0 && ` ↑${tr.uploaded}`}
                        {tr.downloaded > 0 && ` ↓${tr.downloaded}`}
                        {tr.errors.length > 0 && ` ⚠${tr.errors.length}`}
                      </Tag>
                    ))}
                </div>
              )
            }
            style={{ marginBottom: 16 }}
            closable
            onClose={() => setLastResult(null)}
          />
        )}
      </Card>

      <Card
        title={t("settings.cloudSync.syncActions")}
        style={{ backgroundColor: "var(--ss-card-bg)", color: "var(--ss-text-main)" }}
      >
        <div style={{ marginBottom: 16 }}>
          <div style={{ marginBottom: 8, fontWeight: 500 }}>
            {t("settings.cloudSync.syncDirection")}
          </div>
          <Radio.Group
            value={syncDirection}
            onChange={(e) => setSyncDirection(e.target.value)}
            style={{ width: "100%" }}
          >
            <Space direction="vertical" style={{ width: "100%" }}>
              <Radio value="bidirectional">{t("settings.cloudSync.bidirectional")}</Radio>
              <Radio value="push">{t("settings.cloudSync.pushOnly")}</Radio>
              <Radio value="pull">{t("settings.cloudSync.pullOnly")}</Radio>
            </Space>
          </Radio.Group>
        </div>

        <Divider style={{ margin: "12px 0" }} />

        <Space direction="vertical" style={{ width: "100%" }} size="middle">
          <Button
            type="primary"
            icon={<CloudSyncOutlined />}
            onClick={() => handleSync(syncDirection)}
            loading={syncStatus.is_syncing}
            block
            size="large"
          >
            {t("settings.cloudSync.startSync")}
          </Button>

          <Space style={{ width: "100%" }}>
            <Button
              icon={<CloudUploadOutlined />}
              onClick={() => handleSync("push")}
              loading={syncStatus.is_syncing}
              style={{ flex: 1 }}
            >
              {t("settings.cloudSync.uploadToCloud")}
            </Button>
            <Button
              icon={<CloudDownloadOutlined />}
              onClick={() => handleSync("pull")}
              loading={syncStatus.is_syncing}
              style={{ flex: 1 }}
            >
              {t("settings.cloudSync.downloadFromCloud")}
            </Button>
          </Space>
        </Space>
      </Card>

      <Card
        title={
          <Space>
            <span>{t("settings.cloudSync.storageUsage")}</span>
            <Tooltip title={t("common.refresh")}>
              <Button
                type="text"
                size="small"
                icon={<ReloadOutlined />}
                onClick={loadStorageStats}
                loading={loadingStats}
              />
            </Tooltip>
          </Space>
        }
        style={{ backgroundColor: "var(--ss-card-bg)", color: "var(--ss-text-main)" }}
      >
        {storageStats ? (
          <>
            <div style={{ marginBottom: 16 }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  marginBottom: 8,
                  fontSize: "13px",
                }}
              >
                <span>{t("settings.cloudSync.usedStorage")}</span>
                <span>
                  {formatBytes(storageStats.used)} / {formatBytes(storageStats.total)}
                </span>
              </div>
              <Progress
                percent={storageStats.percentage}
                status={storageStats.percentage > 90 ? "exception" : "active"}
                size="small"
              />
            </div>

            <Table
              dataSource={storageStats.table_stats}
              rowKey="table"
              size="small"
              pagination={false}
              columns={[
                {
                  title: t("settings.cloudSync.table"),
                  dataIndex: "table",
                  key: "table",
                  render: (val: string) => TABLE_LABELS[val] || val,
                },
                {
                  title: t("settings.cloudSync.records"),
                  dataIndex: "count",
                  key: "count",
                  width: 80,
                  align: "center",
                },
                {
                  title: t("settings.cloudSync.size"),
                  dataIndex: "size",
                  key: "size",
                  width: 100,
                  align: "right",
                  render: (val: number) => formatBytes(val),
                },
              ]}
            />
          </>
        ) : (
          <div
            style={{ textAlign: "center", padding: "20px 0", color: "var(--ss-text-secondary)" }}
          >
            {loadingStats ? <Spin /> : t("settings.cloudSync.clickToLoadStats")}
          </div>
        )}
      </Card>

      <Card style={{ backgroundColor: "var(--ss-card-bg)", color: "var(--ss-text-main)" }}>
        <div style={{ fontWeight: 600, marginBottom: 12 }}>
          {t("settings.cloudSync.description")}
        </div>
        <div style={{ fontSize: "13px", color: "var(--ss-text-secondary)", lineHeight: 1.8 }}>
          <p>{t("settings.cloudSync.descriptionPoint1")}</p>
          <p>{t("settings.cloudSync.descriptionPoint2")}</p>
          <p>{t("settings.cloudSync.descriptionPoint3")}</p>
          <p>{t("settings.cloudSync.descriptionPoint4")}</p>
        </div>
      </Card>
    </div>
  )
}
