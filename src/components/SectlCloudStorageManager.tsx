/**
 * SECTL 云存储管理组件
 */

import React, { useState, useEffect } from "react"
import {
  Card,
  Table,
  Button,
  Upload,
  Space,
  Progress,
  Modal,
  Input,
  message,
  Popconfirm,
  Typography,
} from "antd"
import {
  CloudOutlined,
  UploadOutlined,
  DownloadOutlined,
  DeleteOutlined,
  ShareAltOutlined,
  ReloadOutlined,
  FileOutlined,
} from "@ant-design/icons"
import type { UploadFile } from "antd"
import { sectlCloudStorage, CloudFile, StorageUsage } from "../services/sectlCloudStorage"
import { useSectl } from "../contexts/SectlContext"

const { Title } = Typography

export const SectlCloudStorageManager: React.FC = () => {
  const { isAuthenticated } = useSectl()
  const [files, setFiles] = useState<CloudFile[]>([])
  const [loading, setLoading] = useState(false)
  const [storageUsage, setStorageUsage] = useState<StorageUsage | null>(null)
  const [uploading, setUploading] = useState(false)
  const [renameModal, setRenameModal] = useState<{
    visible: boolean
    fileId?: string
    filename?: string
  }>({ visible: false })
  const [newFilename, setNewFilename] = useState("")

  // 加载文件列表
  const loadFiles = async () => {
    if (!isAuthenticated) return

    try {
      setLoading(true)
      const result = await sectlCloudStorage.listFiles({ limit: 100 })
      setFiles(result.files)
    } catch (error: any) {
      message.error(`加载文件列表失败：${error.message}`)
    } finally {
      setLoading(false)
    }
  }

  // 加载存储使用情况
  const loadStorageUsage = async () => {
    if (!isAuthenticated) return

    try {
      const usage = await sectlCloudStorage.getStorageUsage()
      setStorageUsage(usage)
    } catch (error: any) {
      console.error("加载存储使用情况失败:", error)
    }
  }

  useEffect(() => {
    if (isAuthenticated) {
      loadFiles()
      loadStorageUsage()
    }
  }, [isAuthenticated])

  // 处理文件上传
  const handleUpload = async (file: UploadFile): Promise<void> => {
    if (!file.originFileObj) return

    try {
      setUploading(true)
      await sectlCloudStorage.uploadFile(file.originFileObj)
      message.success(`文件 ${file.name} 上传成功`)
      loadFiles()
      loadStorageUsage()
    } catch (error: any) {
      message.error(`上传失败：${error.message}`)
    } finally {
      setUploading(false)
    }
  }

  // 处理文件下载
  const handleDownload = async (file: CloudFile) => {
    try {
      const { download_url } = await sectlCloudStorage.downloadFile(file.file_id)
      window.open(download_url, "_blank")
      message.success("开始下载")
    } catch (error: any) {
      message.error(`下载失败：${error.message}`)
    }
  }

  // 处理文件删除
  const handleDelete = async (file: CloudFile) => {
    try {
      await sectlCloudStorage.deleteFile(file.file_id)
      message.success("文件已删除")
      loadFiles()
      loadStorageUsage()
    } catch (error: any) {
      message.error(`删除失败：${error.message}`)
    }
  }

  // 处理文件重命名
  const handleRename = async () => {
    if (!renameModal.fileId || !newFilename) return

    try {
      await sectlCloudStorage.renameFile(renameModal.fileId, newFilename)
      message.success("重命名成功")
      setRenameModal({ visible: false })
      setNewFilename("")
      loadFiles()
    } catch (error: any) {
      message.error(`重命名失败：${error.message}`)
    }
  }

  // 创建分享链接
  const handleCreateShare = async (file: CloudFile) => {
    try {
      const share = await sectlCloudStorage.createShare(file.file_id, {
        expires_in: 86400, // 1 天
      })

      // 复制到剪贴板
      await navigator.clipboard.writeText(share.share_url)
      message.success("分享链接已创建并复制到剪贴板")
    } catch (error: any) {
      message.error(`创建分享失败：${error.message}`)
    }
  }

  // 表格列定义
  const columns = [
    {
      title: "文件名",
      dataIndex: "filename",
      key: "filename",
      render: (text: string, record: CloudFile) => (
        <Space>
          <FileOutlined />
          <span>{text}</span>
          <Typography.Text type="secondary" style={{ fontSize: "12px" }}>
            .{record.extension}
          </Typography.Text>
        </Space>
      ),
    },
    {
      title: "大小",
      dataIndex: "size_formatted",
      key: "size_formatted",
      width: 100,
    },
    {
      title: "上传时间",
      dataIndex: "created_at",
      key: "created_at",
      width: 180,
      render: (text: string) => new Date(text).toLocaleString("zh-CN"),
    },
    {
      title: "操作",
      key: "action",
      width: 250,
      render: (_: any, record: CloudFile) => (
        <Space>
          <Button type="link" icon={<DownloadOutlined />} onClick={() => handleDownload(record)}>
            下载
          </Button>
          <Button type="link" icon={<ShareAltOutlined />} onClick={() => handleCreateShare(record)}>
            分享
          </Button>
          <Button
            type="link"
            onClick={() =>
              setRenameModal({
                visible: true,
                fileId: record.file_id,
                filename: record.filename,
              })
            }
          >
            重命名
          </Button>
          <Popconfirm
            title="确定要删除这个文件吗？"
            onConfirm={() => handleDelete(record)}
            okText="确定"
            cancelText="取消"
          >
            <Button type="link" danger icon={<DeleteOutlined />}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  if (!isAuthenticated) {
    return (
      <Card>
        <div style={{ textAlign: "center", padding: "40px" }}>
          <CloudOutlined style={{ fontSize: 48, color: "#999" }} />
          <Title level={4} style={{ marginTop: 16 }}>
            请先登录 SECTL 以使用云存储服务
          </Title>
        </div>
      </Card>
    )
  }

  return (
    <div>
      <Card
        title={
          <Space>
            <CloudOutlined />
            <span>云存储管理</span>
          </Space>
        }
        extra={
          <Space>
            <Button icon={<ReloadOutlined />} onClick={loadFiles} loading={loading}>
              刷新
            </Button>
            <Upload
              accept="*/*"
              showUploadList={false}
              beforeUpload={handleUpload}
              disabled={uploading}
            >
              <Button type="primary" icon={<UploadOutlined />} loading={uploading}>
                上传文件
              </Button>
            </Upload>
          </Space>
        }
      >
        {/* 存储使用情况 */}
        {storageUsage && (
          <div style={{ marginBottom: 24 }}>
            <Space direction="vertical" style={{ width: "100%" }} size="small">
              <div>
                已用：{storageUsage.used_storage_formatted} / {storageUsage.total_storage_formatted}
              </div>
              <Progress
                percent={storageUsage.percentage}
                status={storageUsage.percentage > 90 ? "exception" : "active"}
              />
              <div style={{ fontSize: "12px", color: "#999" }}>
                文件数量：{storageUsage.file_count}
              </div>
            </Space>
          </div>
        )}

        {/* 文件列表 */}
        <Table
          columns={columns}
          dataSource={files}
          rowKey="file_id"
          loading={loading}
          pagination={{
            pageSize: 20,
            showSizeChanger: true,
            showTotal: (total) => `共 ${total} 个文件`,
          }}
        />
      </Card>

      {/* 重命名对话框 */}
      <Modal
        title="重命名文件"
        open={renameModal.visible}
        onOk={handleRename}
        onCancel={() => {
          setRenameModal({ visible: false })
          setNewFilename("")
        }}
        okText="确定"
        cancelText="取消"
      >
        <Input
          placeholder="请输入新文件名"
          value={newFilename}
          onChange={(e) => setNewFilename(e.target.value)}
          onPressEnter={handleRename}
          defaultValue={renameModal.filename}
        />
      </Modal>
    </div>
  )
}
