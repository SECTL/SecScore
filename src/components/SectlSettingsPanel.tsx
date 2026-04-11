/**
 * SECTL 设置面板组件
 */

import React, { useState } from "react"
import { Card, Form, Input, Button, Space, Alert, Tag, Descriptions, message } from "antd"
import {
  SettingOutlined,
  UserOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
} from "@ant-design/icons"
import { useSectl } from "../contexts/SectlContext"
import { SectlLoginButton } from "./SectlLoginButton"
import { ScoreSyncPanel } from "./ScoreSyncPanel"

export const SectlSettingsPanel: React.FC = () => {
  const { isAuthenticated, isLoading, userInfo, platformId, setPlatformId, refreshUserInfo } =
    useSectl()
  const [form] = Form.useForm()
  const [isSaving, setIsSaving] = useState(false)

  // 保存平台 ID 配置
  const handleSaveConfig = async (values: any) => {
    try {
      setIsSaving(true)
      setPlatformId(values.platformId)

      // 保存到本地存储
      localStorage.setItem("sectl_platform_id", values.platformId)

      message.success("配置已保存")
    } catch (error: any) {
      message.error(`保存失败：${error.message}`)
    } finally {
      setIsSaving(false)
    }
  }

  // 加载已保存的配置
  React.useEffect(() => {
    const savedPlatformId = localStorage.getItem("sectl_platform_id")
    if (savedPlatformId) {
      form.setFieldsValue({ platformId: savedPlatformId })
    }
  }, [form])

  return (
    <div>
      {/* 认证状态卡片 */}
      <Card
        title={
          <Space>
            <UserOutlined />
            <span>SECTL 认证状态</span>
          </Space>
        }
        style={{ marginBottom: 24 }}
      >
        <Space direction="vertical" style={{ width: "100%" }} size="large">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <Space>
                <span>当前状态：</span>
                {isLoading ? (
                  <Tag color="processing">加载中...</Tag>
                ) : isAuthenticated ? (
                  <Tag icon={<CheckCircleOutlined />} color="success">
                    已登录
                  </Tag>
                ) : (
                  <Tag icon={<CloseCircleOutlined />} color="default">
                    未登录
                  </Tag>
                )}
              </Space>
            </div>
            <SectlLoginButton onLoginSuccess={refreshUserInfo} onLogoutSuccess={() => {}} />
          </div>

          {isAuthenticated && userInfo && (
            <Descriptions bordered column={2} size="small">
              <Descriptions.Item label="用户 ID">{userInfo.user_id}</Descriptions.Item>
              <Descriptions.Item label="用户名">{userInfo.name}</Descriptions.Item>
              <Descriptions.Item label="邮箱">{userInfo.email}</Descriptions.Item>
              <Descriptions.Item label="权限">{userInfo.permission}</Descriptions.Item>
              <Descriptions.Item label="角色">{userInfo.role}</Descriptions.Item>
              {userInfo.github_username && (
                <Descriptions.Item label="GitHub">{userInfo.github_username}</Descriptions.Item>
              )}
            </Descriptions>
          )}
        </Space>
      </Card>

      {/* 平台配置卡片 */}
      <Card
        title={
          <Space>
            <SettingOutlined />
            <span>平台配置</span>
          </Space>
        }
        style={{ marginBottom: 24 }}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSaveConfig}
          initialValues={{ platformId }}
        >
          <Alert
            message="平台 ID 配置"
            description="请在 SECTL 控制台创建应用后填写平台 ID（Client ID）"
            type="info"
            showIcon
            style={{ marginBottom: 24 }}
          />

          <Form.Item
            label="平台 ID (Client ID)"
            name="platformId"
            rules={[
              { required: true, message: "请输入平台 ID" },
              { pattern: /^pf_[a-zA-Z0-9]+$/, message: "平台 ID 格式不正确" },
            ]}
          >
            <Input placeholder="例如：pf_xxxxxxxxxxxx" />
          </Form.Item>

          <Form.Item>
            <Space>
              <Button
                type="primary"
                htmlType="submit"
                loading={isSaving}
                icon={<SettingOutlined />}
              >
                保存配置
              </Button>
              <Button
                onClick={() => {
                  form.resetFields()
                }}
              >
                重置
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Card>

      {/* 数据同步面板 */}
      <ScoreSyncPanel />
    </div>
  )
}
