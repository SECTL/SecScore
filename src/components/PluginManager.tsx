import React, { useState, useEffect, useCallback } from "react"
import {
  Table,
  Button,
  Modal,
  Form,
  Input,
  Switch,
  message,
  Tag,
  Popconfirm,
  Card,
  Space,
  Descriptions,
  Upload,
  Tooltip,
} from "antd"
import type { ColumnsType } from "antd/es/table"
import { useTranslation } from "react-i18next"
import { UploadOutlined, DeleteOutlined, FolderOpenOutlined } from "@ant-design/icons"

interface Plugin {
  id: string
  name: string
  version: string
  description?: string
  author?: string
  enabled: boolean
  installed_at?: string
  manifest_path?: string
}

interface PluginStats {
  total_plugins: number
  enabled_plugins: number
  disabled_plugins: number
}

export const PluginManager: React.FC<{ canEdit: boolean }> = ({ canEdit }) => {
  const { t } = useTranslation()
  const [data, setData] = useState<Plugin[]>([])
  const [stats, setStats] = useState<PluginStats>({
    total_plugins: 0,
    enabled_plugins: 0,
    disabled_plugins: 0,
  })
  const [loading, setLoading] = useState(false)
  const [installModalVisible, setInstallModalVisible] = useState(false)
  const [installLoading, setInstallLoading] = useState(false)
  const [selectedPath, setSelectedPath] = useState<string>("")
  const [messageApi, contextHolder] = message.useMessage()
  const emitPluginsUpdated = (action: "install" | "uninstall" | "toggle", pluginId?: string) => {
    window.dispatchEvent(
      new CustomEvent("ss:plugins-updated", {
        detail: {
          source: "plugin-manager",
          action,
          pluginId,
        },
      })
    )
  }

  const fetchPlugins = useCallback(async () => {
    if (!(window as any).api) return
    setLoading(true)
    try {
      const res = await (window as any).api.pluginGetList()
      if (res.success && res.data) {
        setData(res.data)
      }
      const statsRes = await (window as any).api.pluginGetStats()
      if (statsRes.success && statsRes.data) {
        setStats(statsRes.data)
      }
    } catch (e) {
      console.error("Failed to fetch plugins:", e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchPlugins()
  }, [fetchPlugins])

  const handleToggle = async (plugin: Plugin, enabled: boolean) => {
    if (!(window as any).api) return
    if (!canEdit) {
      messageApi.error(t("common.readOnly"))
      return
    }
    try {
      const res = await (window as any).api.pluginToggle(plugin.id, enabled)
      if (res.success) {
        messageApi.success(enabled ? t("plugin.enabled") : t("plugin.disabled"))
        fetchPlugins()
        emitPluginsUpdated("toggle", plugin.id)
      } else {
        messageApi.error(res.message || t("plugin.toggleFailed"))
      }
    } catch (e) {
      console.error("Failed to toggle plugin:", e)
      messageApi.error(t("plugin.toggleFailed"))
    }
  }

  const handleUninstall = async (pluginId: string) => {
    if (!(window as any).api) return
    if (!canEdit) {
      messageApi.error(t("common.readOnly"))
      return
    }
    try {
      const res = await (window as any).api.pluginUninstall(pluginId)
      if (res.success) {
        messageApi.success(t("plugin.uninstallSuccess"))
        fetchPlugins()
        emitPluginsUpdated("uninstall", pluginId)
      } else {
        messageApi.error(res.message || t("plugin.uninstallFailed"))
      }
    } catch (e) {
      console.error("Failed to uninstall plugin:", e)
      messageApi.error(t("plugin.uninstallFailed"))
    }
  }

  const handleInstall = async () => {
    if (!selectedPath) {
      messageApi.warning(t("plugin.selectFolder"))
      return
    }
    setInstallLoading(true)
    try {
      const manifestRes = await (window as any).api.pluginLoadManifest(selectedPath)
      if (!manifestRes.success) {
        messageApi.error(manifestRes.message || t("plugin.invalidManifest"))
        setInstallLoading(false)
        return
      }

      const installRes = await (window as any).api.pluginInstall(manifestRes.data, selectedPath)
      if (installRes.success) {
        messageApi.success(t("plugin.installSuccess"))
        setInstallModalVisible(false)
        setSelectedPath("")
        fetchPlugins()
        emitPluginsUpdated("install", installRes.data?.id)
      } else {
        messageApi.error(installRes.message || t("plugin.installFailed"))
      }
    } catch (e) {
      console.error("Failed to install plugin:", e)
      messageApi.error(t("plugin.installFailed"))
    } finally {
      setInstallLoading(false)
    }
  }

  const columns: ColumnsType<Plugin> = [
    {
      title: t("plugin.name"),
      dataIndex: "name",
      key: "name",
      width: 150,
      render: (name: string, record: Plugin) => (
        <Space direction="vertical" size={0}>
          <span style={{ fontWeight: 500 }}>{name}</span>
          <span style={{ fontSize: 12, color: "var(--ss-text-secondary)" }}>v{record.version}</span>
        </Space>
      ),
    },
    {
      title: t("plugin.author"),
      dataIndex: "author",
      key: "author",
      width: 120,
      render: (author?: string) => author || "-",
    },
    {
      title: t("plugin.description"),
      dataIndex: "description",
      key: "description",
      render: (desc?: string) => (
        <Tooltip title={desc}>
          <span
            style={{
              maxWidth: 200,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              display: "block",
            }}
          >
            {desc || "-"}
          </span>
        </Tooltip>
      ),
    },
    {
      title: t("plugin.status"),
      dataIndex: "enabled",
      key: "enabled",
      width: 100,
      render: (enabled: boolean, record: Plugin) => (
        <Switch
          checked={enabled}
          onChange={(checked) => handleToggle(record, checked)}
          disabled={!canEdit}
        />
      ),
    },
    {
      title: t("common.operation"),
      key: "operation",
      width: 100,
      render: (_, record: Plugin) => (
        <Popconfirm
          title={t("plugin.uninstallConfirm")}
          description={t("plugin.uninstallDescription")}
          onConfirm={() => handleUninstall(record.id)}
          disabled={!canEdit}
          okText={t("common.yes")}
          cancelText={t("common.no")}
        >
          <Button type="link" danger icon={<DeleteOutlined />} disabled={!canEdit}>
            {t("common.delete")}
          </Button>
        </Popconfirm>
      ),
    },
  ]

  return (
    <div style={{ padding: "24px" }}>
      {contextHolder}

      <Card size="small" style={{ marginBottom: 16 }}>
        <Descriptions size="small" column={3}>
          <Descriptions.Item label={t("plugin.totalPlugins")}>
            <Tag color="blue">{stats.total_plugins}</Tag>
          </Descriptions.Item>
          <Descriptions.Item label={t("plugin.enabledPlugins")}>
            <Tag color="success">{stats.enabled_plugins}</Tag>
          </Descriptions.Item>
          <Descriptions.Item label={t("plugin.disabledPlugins")}>
            <Tag color="default">{stats.disabled_plugins}</Tag>
          </Descriptions.Item>
        </Descriptions>
      </Card>

      <div style={{ marginBottom: 16, display: "flex", justifyContent: "space-between" }}>
        <h2 style={{ margin: 0, color: "var(--ss-text-main)" }}>{t("plugin.title")}</h2>
        <Button
          type="primary"
          icon={<FolderOpenOutlined />}
          disabled={!canEdit}
          onClick={() => setInstallModalVisible(true)}
        >
          {t("plugin.install")}
        </Button>
      </div>

      <Table
        columns={columns}
        dataSource={data}
        rowKey="id"
        loading={loading}
        locale={{ emptyText: t("plugin.noPlugins") }}
        pagination={{ pageSize: 10, showSizeChanger: false }}
      />

      <Modal
        title={t("plugin.install")}
        open={installModalVisible}
        onCancel={() => {
          setInstallModalVisible(false)
          setSelectedPath("")
        }}
        onOk={handleInstall}
        okText={t("common.confirm")}
        cancelText={t("common.cancel")}
        confirmLoading={installLoading}
      >
        <Form layout="vertical">
          <Form.Item label={t("plugin.pluginFolder")}>
            <Input
              placeholder={t("plugin.folderPlaceholder")}
              value={selectedPath}
              onChange={(e) => setSelectedPath(e.target.value)}
              addonAfter={
                <Upload
                  showUploadList={false}
                  directory
                  beforeUpload={(file) => {
                    const path = (file as any).path || file.name
                    setSelectedPath(path)
                    return false
                  }}
                >
                  <Button type="text" size="small" icon={<UploadOutlined />} />
                </Upload>
              }
            />
          </Form.Item>
          <div style={{ color: "var(--ss-text-secondary)", fontSize: 12 }}>
            {t("plugin.installHint")}
          </div>
        </Form>
      </Modal>
    </div>
  )
}
