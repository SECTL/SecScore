/**
 * SECTL KV 存储管理组件
 * 基于 SECTL-One-Stop SDK 规范实现
 */

import React, { useState, useEffect } from "react"
import {
  Card,
  Table,
  Button,
  Space,
  Modal,
  Input,
  message,
  Popconfirm,
  Typography,
  Tag,
  Form,
  Switch,
  InputNumber,
  Tooltip,
} from "antd"
import {
  DatabaseOutlined,
  PlusOutlined,
  DeleteOutlined,
  EditOutlined,
  ReloadOutlined,
  CodeOutlined,
  FieldStringOutlined,
} from "@ant-design/icons"
import { sectlKVStorage, KVItem, ListKVOptions } from "../services/sectlKVStorage"
import { useSectl } from "../contexts/SectlContext"

const { Title, Text } = Typography
const { TextArea } = Input

export const SectlKVStorageManager: React.FC = () => {
  const { isAuthenticated } = useSectl()
  const [kvList, setKvList] = useState<KVItem[]>([])
  const [loading, setLoading] = useState(false)
  const [total, setTotal] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [offset, setOffset] = useState(0)
  const [prefix, setPrefix] = useState("")

  // 编辑/创建对话框状态
  const [editModal, setEditModal] = useState<{
    visible: boolean
    isEdit: boolean
    key?: string
  }>({ visible: false, isEdit: false })

  // 查看详情对话框状态
  const [detailModal, setDetailModal] = useState<{
    visible: boolean
    item?: KVItem
  }>({ visible: false })

  // 表单
  const [form] = Form.useForm()

  // 加载 KV 列表
  const loadKVList = async (resetOffset = false) => {
    if (!isAuthenticated) return

    try {
      setLoading(true)
      const currentOffset = resetOffset ? 0 : offset
      const options: ListKVOptions = {
        limit: 20,
        offset: currentOffset,
      }
      if (prefix) {
        options.prefix = prefix
      }

      const result = await sectlKVStorage.listKV(options)
      setKvList(resetOffset ? result.kv_list : [...kvList, ...result.kv_list])
      setTotal(result.total)
      setHasMore(result.has_more)
      if (resetOffset) {
        setOffset(20)
      } else {
        setOffset(currentOffset + 20)
      }
    } catch (error: any) {
      message.error(`加载键值对列表失败：${error.message}`)
    } finally {
      setLoading(false)
    }
  }

  // 初始加载
  useEffect(() => {
    if (isAuthenticated) {
      loadKVList(true)
    }
  }, [isAuthenticated, prefix])

  // 处理创建/更新
  const handleSave = async (values: {
    key: string
    value: string
    isJson: boolean
    ttl?: number
  }) => {
    try {
      let parsedValue: unknown

      if (values.isJson) {
        try {
          parsedValue = JSON.parse(values.value)
        } catch {
          message.error("JSON 格式无效")
          return
        }
      } else {
        parsedValue = values.value
      }

      await sectlKVStorage.setKV(values.key, parsedValue, values.ttl)
      message.success(editModal.isEdit ? "键值对已更新" : "键值对已创建")
      setEditModal({ visible: false, isEdit: false })
      form.resetFields()
      loadKVList(true)
    } catch (error: any) {
      message.error(`保存失败：${error.message}`)
    }
  }

  // 处理删除
  const handleDelete = async (key: string) => {
    try {
      await sectlKVStorage.deleteKV(key)
      message.success("键值对已删除")
      loadKVList(true)
    } catch (error: any) {
      message.error(`删除失败：${error.message}`)
    }
  }

  // 打开编辑对话框
  const openEditModal = (item: KVItem) => {
    form.setFieldsValue({
      key: item.key,
      value: item.is_json ? JSON.stringify(item.value, null, 2) : String(item.value),
      isJson: item.is_json,
    })
    setEditModal({ visible: true, isEdit: true, key: item.key })
  }

  // 打开创建对话框
  const openCreateModal = () => {
    form.resetFields()
    form.setFieldsValue({ isJson: true })
    setEditModal({ visible: true, isEdit: false })
  }

  // 打开详情对话框
  const openDetailModal = (item: KVItem) => {
    setDetailModal({ visible: true, item })
  }

  // 格式化值显示
  const formatValue = (value: unknown, isJson: boolean): string => {
    if (isJson) {
      return JSON.stringify(value).slice(0, 100) + (JSON.stringify(value).length > 100 ? "..." : "")
    }
    return String(value).slice(0, 100) + (String(value).length > 100 ? "..." : "")
  }

  // 表格列定义
  const columns = [
    {
      title: "键名",
      dataIndex: "key",
      key: "key",
      render: (text: string, record: KVItem) => (
        <Space>
          <DatabaseOutlined />
          <a onClick={() => openDetailModal(record)}>{text}</a>
        </Space>
      ),
    },
    {
      title: "类型",
      dataIndex: "is_json",
      key: "is_json",
      width: 100,
      render: (isJson: boolean) =>
        isJson ? (
          <Tag color="blue" icon={<CodeOutlined />}>
            JSON
          </Tag>
        ) : (
          <Tag icon={<FieldStringOutlined />}>文本</Tag>
        ),
    },
    {
      title: "大小",
      dataIndex: "size",
      key: "size",
      width: 100,
      render: (size: number) => {
        if (size < 1024) return `${size} B`
        if (size < 1024 * 1024) return `${(size / 1024).toFixed(2)} KB`
        return `${(size / (1024 * 1024)).toFixed(2)} MB`
      },
    },
    {
      title: "值预览",
      dataIndex: "value",
      key: "value",
      ellipsis: true,
      render: (_: unknown, record: KVItem) => (
        <Text type="secondary" style={{ fontSize: "12px" }}>
          {formatValue(record.value, record.is_json)}
        </Text>
      ),
    },
    {
      title: "更新时间",
      dataIndex: "updated_at",
      key: "updated_at",
      width: 180,
      render: (text: string) => new Date(text).toLocaleString("zh-CN"),
    },
    {
      title: "操作",
      key: "action",
      width: 150,
      render: (_: unknown, record: KVItem) => (
        <Space>
          <Tooltip title="编辑">
            <Button type="link" icon={<EditOutlined />} onClick={() => openEditModal(record)} />
          </Tooltip>
          <Popconfirm
            title="确定要删除这个键值对吗？"
            onConfirm={() => handleDelete(record.key)}
            okText="确定"
            cancelText="取消"
          >
            <Button type="link" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ]

  if (!isAuthenticated) {
    return (
      <Card>
        <div style={{ textAlign: "center", padding: "40px" }}>
          <DatabaseOutlined style={{ fontSize: 48, color: "#999" }} />
          <Title level={4} style={{ marginTop: 16 }}>
            请先登录 SECTL 以使用 KV 存储服务
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
            <DatabaseOutlined />
            <span>KV 存储管理</span>
          </Space>
        }
        extra={
          <Space>
            <Input
              placeholder="键名前缀过滤"
              value={prefix}
              onChange={(e) => setPrefix(e.target.value)}
              style={{ width: 200 }}
              allowClear
            />
            <Button icon={<ReloadOutlined />} onClick={() => loadKVList(true)} loading={loading}>
              刷新
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreateModal}>
              新建键值对
            </Button>
          </Space>
        }
      >
        {/* 统计信息 */}
        <div style={{ marginBottom: 16 }}>
          <Text type="secondary">
            共 {total} 个键值对
            {hasMore && `（已加载 ${kvList.length} 个）`}
          </Text>
        </div>

        {/* KV 列表 */}
        <Table
          columns={columns}
          dataSource={kvList}
          rowKey="key"
          loading={loading}
          pagination={false}
        />

        {/* 加载更多 */}
        {hasMore && (
          <div style={{ textAlign: "center", marginTop: 16 }}>
            <Button onClick={() => loadKVList(false)} loading={loading}>
              加载更多
            </Button>
          </div>
        )}
      </Card>

      {/* 创建/编辑对话框 */}
      <Modal
        title={editModal.isEdit ? "编辑键值对" : "新建键值对"}
        open={editModal.visible}
        onOk={() => form.submit()}
        onCancel={() => {
          setEditModal({ visible: false, isEdit: false })
          form.resetFields()
        }}
        okText="保存"
        cancelText="取消"
        width={600}
      >
        <Form form={form} layout="vertical" onFinish={handleSave}>
          <Form.Item
            name="key"
            label="键名"
            rules={[
              { required: true, message: "请输入键名" },
              { max: 255, message: "键名最大 255 字符" },
            ]}
          >
            <Input placeholder="请输入键名" disabled={editModal.isEdit} />
          </Form.Item>

          <Form.Item name="isJson" label="数据类型" valuePropName="checked">
            <Switch checkedChildren="JSON" unCheckedChildren="文本" />
          </Form.Item>

          <Form.Item name="value" label="值" rules={[{ required: true, message: "请输入值" }]}>
            <TextArea
              rows={8}
              placeholder={
                form.getFieldValue("isJson")
                  ? '请输入 JSON 格式数据，例如：\n{\n  "theme": "dark",\n  "language": "zh-CN"\n}'
                  : "请输入文本值"
              }
            />
          </Form.Item>

          <Form.Item name="ttl" label="过期时间（秒）">
            <InputNumber style={{ width: "100%" }} placeholder="留空表示永不过期" min={1} />
          </Form.Item>
        </Form>
      </Modal>

      {/* 详情对话框 */}
      <Modal
        title="键值对详情"
        open={detailModal.visible}
        onCancel={() => setDetailModal({ visible: false })}
        footer={[
          <Button key="close" onClick={() => setDetailModal({ visible: false })}>
            关闭
          </Button>,
        ]}
        width={700}
      >
        {detailModal.item && (
          <Space direction="vertical" style={{ width: "100%" }} size="large">
            <div>
              <Text strong>键名：</Text>
              <Text copyable>{detailModal.item.key}</Text>
            </div>

            <div>
              <Text strong>类型：</Text>
              {detailModal.item.is_json ? (
                <Tag color="blue" icon={<CodeOutlined />}>
                  JSON
                </Tag>
              ) : (
                <Tag icon={<FieldStringOutlined />}>文本</Tag>
              )}
            </div>

            <div>
              <Text strong>大小：</Text>
              <Text>
                {detailModal.item.size < 1024
                  ? `${detailModal.item.size} B`
                  : detailModal.item.size < 1024 * 1024
                    ? `${(detailModal.item.size / 1024).toFixed(2)} KB`
                    : `${(detailModal.item.size / (1024 * 1024)).toFixed(2)} MB`}
              </Text>
            </div>

            <div>
              <Text strong>创建时间：</Text>
              <Text>{new Date(detailModal.item.created_at).toLocaleString("zh-CN")}</Text>
            </div>

            <div>
              <Text strong>更新时间：</Text>
              <Text>{new Date(detailModal.item.updated_at).toLocaleString("zh-CN")}</Text>
            </div>

            <div>
              <Text strong>值：</Text>
              <pre
                style={{
                  background: "#f5f5f5",
                  padding: 16,
                  borderRadius: 8,
                  overflow: "auto",
                  maxHeight: 400,
                }}
              >
                {detailModal.item.is_json
                  ? JSON.stringify(detailModal.item.value, null, 2)
                  : String(detailModal.item.value)}
              </pre>
            </div>
          </Space>
        )}
      </Modal>
    </div>
  )
}
