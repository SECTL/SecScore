/**
 * SECTL 积分数据同步组件
 * 提供云端数据同步功能
 */

import React, { useState, useEffect } from "react"
import { Card, Button, Space, Alert, Descriptions, message, Modal, Typography, Divider } from "antd"
import {
  CloudSyncOutlined,
  UploadOutlined,
  DownloadOutlined,
  DeleteOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
} from "@ant-design/icons"
import { scoreSyncService } from "../services/scoreSyncService"
import { useSectl } from "../contexts/SectlContext"

const { Title, Text } = Typography

interface SyncPanelProps {
  // 从父组件获取数据的方法
  onGetLocalData?: () => {
    students: any[]
    events: any[]
    settings: { reasons: any[]; tags: any[] }
  }
  // 从云端恢复数据到本地的方法
  onRestoreData?: (data: {
    students: any[]
    events: any[]
    settings: { reasons: any[]; tags: any[] }
  }) => void
}

export const ScoreSyncPanel: React.FC<SyncPanelProps> = ({ onGetLocalData, onRestoreData }) => {
  const { isAuthenticated } = useSectl()
  const [syncing, setSyncing] = useState(false)
  const [restoring, setRestoring] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [loading, setLoading] = useState(false)
  const [metadata, setMetadata] = useState<any>(null)
  const [hasData, setHasData] = useState(false)

  // 检查云端数据状态
  const checkCloudStatus = async () => {
    if (!isAuthenticated) return

    try {
      setLoading(true)
      const [meta, hasCloudData] = await Promise.all([
        scoreSyncService.getSyncMetadata(),
        scoreSyncService.hasCloudData(),
      ])

      setMetadata(meta)
      setHasData(hasCloudData)
    } catch (error: any) {
      console.error("检查云端状态失败:", error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (isAuthenticated) {
      checkCloudStatus()
    }
  }, [isAuthenticated])

  // 上传数据到云端
  const handleSyncToCloud = async () => {
    if (!onGetLocalData) {
      message.error("未配置数据获取方法")
      return
    }

    try {
      setSyncing(true)
      const localData = onGetLocalData()
      await scoreSyncService.fullSync(localData)
      await checkCloudStatus()
      message.success("数据已同步到云端")
    } catch (error: any) {
      message.error(`同步失败：${error.message}`)
    } finally {
      setSyncing(false)
    }
  }

  // 从云端下载数据
  const handleRestoreFromCloud = async () => {
    Modal.confirm({
      title: "确认恢复云端数据",
      icon: <ExclamationCircleOutlined />,
      content: "此操作将用云端数据覆盖本地数据，确定继续吗？",
      okText: "确定",
      cancelText: "取消",
      onOk: async () => {
        if (!onRestoreData) {
          message.error("未配置数据恢复方法")
          return
        }

        try {
          setRestoring(true)
          const cloudData = await scoreSyncService.restoreFromCloud()
          onRestoreData({
            students: cloudData.students as any[],
            events: cloudData.events as any[],
            settings: cloudData.settings,
          })
          message.success("数据已从云端恢复")
        } catch (error: any) {
          message.error(`恢复失败：${error.message}`)
        } finally {
          setRestoring(false)
        }
      },
    })
  }

  // 清除云端数据
  const handleClearCloudData = async () => {
    Modal.confirm({
      title: "确认清除云端数据",
      icon: <ExclamationCircleOutlined />,
      content: "此操作将永久删除云端的所有数据，且不可恢复！确定继续吗？",
      okText: "确定",
      cancelText: "取消",
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          setClearing(true)
          await scoreSyncService.clearCloudData()
          await checkCloudStatus()
          message.success("云端数据已清除")
        } catch (error: any) {
          message.error(`清除失败：${error.message}`)
        } finally {
          setClearing(false)
        }
      },
    })
  }

  if (!isAuthenticated) {
    return (
      <Card>
        <Alert
          message="请先登录 SECTL"
          description="登录后可使用云端数据同步功能"
          type="info"
          showIcon
        />
      </Card>
    )
  }

  return (
    <div>
      <Card
        title={
          <Space>
            <CloudSyncOutlined />
            <span>云端数据同步</span>
          </Space>
        }
      >
        <Space direction="vertical" style={{ width: "100%" }} size="large">
          {/* 云端状态 */}
          <Alert
            message={
              hasData ? (
                <Space>
                  <CheckCircleOutlined style={{ color: "#52c41a" }} />
                  <span>云端有数据</span>
                </Space>
              ) : (
                <Space>
                  <ExclamationCircleOutlined style={{ color: "#faad14" }} />
                  <span>云端暂无数据</span>
                </Space>
              )
            }
            description={
              metadata ? (
                <div>
                  <Text>
                    最后同步时间：{new Date(metadata.lastSyncTime).toLocaleString("zh-CN")}
                  </Text>
                  <br />
                  <Text>数据版本：{metadata.version}</Text>
                </div>
              ) : (
                "暂无同步记录"
              )
            }
            type={hasData ? "success" : "warning"}
            showIcon
          />

          <Divider />

          {/* 同步操作 */}
          <div>
            <Title level={5}>同步操作</Title>
            <Space direction="vertical" style={{ width: "100%" }}>
              <Alert
                message="数据同步说明"
                description={
                  <div>
                    <ul style={{ margin: 0, paddingLeft: 20 }}>
                      <li>上传：将本地积分数据同步到云端</li>
                      <li>下载：从云端恢复数据到本地（会覆盖本地数据）</li>
                      <li>清除：删除云端的所有数据（不可恢复）</li>
                    </ul>
                  </div>
                }
                type="info"
                showIcon
                style={{ marginBottom: 16 }}
              />

              <Space wrap>
                <Button
                  type="primary"
                  icon={<UploadOutlined />}
                  onClick={handleSyncToCloud}
                  loading={syncing}
                  disabled={!onGetLocalData}
                >
                  上传到云端
                </Button>

                <Button
                  icon={<DownloadOutlined />}
                  onClick={handleRestoreFromCloud}
                  loading={restoring}
                  disabled={!hasData || !onRestoreData}
                >
                  从云端恢复
                </Button>

                <Button
                  danger
                  icon={<DeleteOutlined />}
                  onClick={handleClearCloudData}
                  loading={clearing}
                  disabled={!hasData}
                >
                  清除云端数据
                </Button>

                <Button icon={<CloudSyncOutlined />} onClick={checkCloudStatus} loading={loading}>
                  刷新状态
                </Button>
              </Space>
            </Space>
          </div>

          <Divider />

          {/* 同步记录 */}
          <div>
            <Title level={5}>同步信息</Title>
            {metadata ? (
              <Descriptions bordered column={1} size="small">
                <Descriptions.Item label="最后同步时间">
                  {new Date(metadata.lastSyncTime).toLocaleString("zh-CN")}
                </Descriptions.Item>
                <Descriptions.Item label="数据版本">{metadata.version}</Descriptions.Item>
                <Descriptions.Item label="平台">
                  {metadata.platform || "SecScore"}
                </Descriptions.Item>
              </Descriptions>
            ) : (
              <Text type="secondary">暂无同步记录</Text>
            )}
          </div>
        </Space>
      </Card>
    </div>
  )
}
