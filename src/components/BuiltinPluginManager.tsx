import React from "react"
import { Card, List, Button, Tag, Space, Typography, Spin, Empty, message } from "antd"
import {
  ThunderboltOutlined,
  DashboardOutlined,
  HistoryOutlined,
  CloudOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  DownloadOutlined,
  DeleteOutlined,
} from "@ant-design/icons"
import { useBuiltinPlugins } from "../hooks/useBuiltinPlugins"
import { BuiltinPluginMeta } from "../plugins/builtin"

const { Title, Text, Paragraph } = Typography

const categoryIcons: Record<string, React.ReactNode> = {
  automation: <ThunderboltOutlined />,
  visualization: <DashboardOutlined />,
  management: <HistoryOutlined />,
  integration: <CloudOutlined />,
}

const categoryLabels: Record<string, string> = {
  automation: "自动化",
  visualization: "可视化",
  management: "管理",
  integration: "集成",
}

interface BuiltinPluginManagerProps {
  canEdit: boolean
}

export const BuiltinPluginManager: React.FC<BuiltinPluginManagerProps> = ({ canEdit }) => {
  const { plugins, loading, install, uninstall, enable, disable } = useBuiltinPlugins()
  const [messageApi, contextHolder] = message.useMessage()

  const handleInstall = async (pluginId: string) => {
    try {
      await install(pluginId)
      messageApi.success("插件安装成功")
    } catch (error) {
      messageApi.error("插件安装失败")
    }
  }

  const handleUninstall = async (pluginId: string) => {
    try {
      await uninstall(pluginId)
      messageApi.success("插件已卸载")
    } catch (error) {
      messageApi.error("插件卸载失败")
    }
  }

  const handleEnable = async (pluginId: string) => {
    try {
      await enable(pluginId)
      messageApi.success("插件已启用")
    } catch (error) {
      messageApi.error("插件启用失败")
    }
  }

  const handleDisable = async (pluginId: string) => {
    try {
      await disable(pluginId)
      messageApi.success("插件已禁用")
    } catch (error) {
      messageApi.error("插件禁用失败")
    }
  }

  const renderPluginActions = (
    plugin: BuiltinPluginMeta & { installed: boolean; enabled: boolean }
  ) => {
    if (!plugin.installed) {
      return (
        <Button
          type="primary"
          icon={<DownloadOutlined />}
          onClick={() => handleInstall(plugin.id)}
          disabled={!canEdit}
        >
          安装
        </Button>
      )
    }

    return (
      <Space>
        {plugin.enabled ? (
          <Button
            type="default"
            icon={<CloseCircleOutlined />}
            onClick={() => handleDisable(plugin.id)}
            disabled={!canEdit}
          >
            禁用
          </Button>
        ) : (
          <Button
            type="primary"
            icon={<CheckCircleOutlined />}
            onClick={() => handleEnable(plugin.id)}
            disabled={!canEdit}
          >
            启用
          </Button>
        )}
        <Button
          danger
          icon={<DeleteOutlined />}
          onClick={() => handleUninstall(plugin.id)}
          disabled={!canEdit}
        >
          卸载
        </Button>
      </Space>
    )
  }

  return (
    <div style={{ padding: "24px" }}>
      {contextHolder}
      <Title level={4}>内置插件管理</Title>
      <Paragraph type="secondary">
        管理 SecScore 的内置功能插件。安装后可在侧边栏访问对应功能。
      </Paragraph>

      {loading ? (
        <div style={{ textAlign: "center", padding: "40px" }}>
          <Spin size="large" />
        </div>
      ) : plugins.length === 0 ? (
        <Empty description="暂无可用插件" />
      ) : (
        <List
          grid={{ gutter: 16, xs: 1, sm: 1, md: 2, lg: 2, xl: 3, xxl: 3 }}
          dataSource={plugins}
          renderItem={(plugin) => (
            <List.Item>
              <Card
                hoverable
                style={{
                  backgroundColor: "var(--ss-card-bg)",
                  borderColor: plugin.enabled
                    ? "var(--ant-color-primary)"
                    : "var(--ss-border-color)",
                }}
                title={
                  <Space>
                    {categoryIcons[plugin.category]}
                    <span>{plugin.name}</span>
                  </Space>
                }
                extra={
                  <Tag color={plugin.enabled ? "success" : "default"}>
                    {plugin.enabled ? "已启用" : plugin.installed ? "已安装" : "未安装"}
                  </Tag>
                }
              >
                <div style={{ marginBottom: "12px" }}>
                  <Text type="secondary">{plugin.description}</Text>
                </div>
                <Space direction="vertical" size="small" style={{ width: "100%" }}>
                  <div>
                    <Tag>{categoryLabels[plugin.category]}</Tag>
                    {plugin.requiresAdmin && <Tag color="warning">需要管理员权限</Tag>}
                  </div>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <Text type="secondary" style={{ fontSize: "12px" }}>
                      版本 {plugin.version}
                    </Text>
                    {renderPluginActions(plugin)}
                  </div>
                </Space>
              </Card>
            </List.Item>
          )}
        />
      )}
    </div>
  )
}
