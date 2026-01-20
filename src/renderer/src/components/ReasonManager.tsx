import React, { useState, useEffect, useCallback } from 'react'
import {
  Table,
  PrimaryTableCol,
  Button,
  Space,
  Dialog,
  Form,
  Input,
  MessagePlugin,
  Tag
} from 'tdesign-react'

interface reason {
  id: number
  content: string
  category: string
  delta: number
  is_system: number
}

export const ReasonManager: React.FC<{ canEdit: boolean }> = ({ canEdit }) => {
  const [data, setData] = useState<reason[]>([])
  const [loading, setLoading] = useState(false)
  const [visible, setVisible] = useState(false)
  const [deleteDialogVisible, setDeleteDialogVisible] = useState(false)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<reason | null>(null)
  const [form] = Form.useForm()

  const emitDataUpdated = (category: 'reasons' | 'all') => {
    window.dispatchEvent(new CustomEvent('ss:data-updated', { detail: { category } }))
  }

  const fetchReasons = useCallback(async () => {
    if (!(window as any).api) return
    setLoading(true)
    try {
      const res = await (window as any).api.queryReasons()
      if (res.success && res.data) {
        setData(res.data)
      }
    } catch (e) {
      console.error('Failed to fetch reasons:', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchReasons()
    const onDataUpdated = (e: any) => {
      const category = e?.detail?.category
      if (category === 'reasons' || category === 'all') fetchReasons()
    }
    window.addEventListener('ss:data-updated', onDataUpdated as any)
    return () => window.removeEventListener('ss:data-updated', onDataUpdated as any)
  }, [fetchReasons])

  const handleAdd = async () => {
    if (!(window as any).api) return
    if (!canEdit) {
      MessagePlugin.error('当前为只读权限')
      return
    }
    const values = form.getFieldsValue?.(true) as any
    const content = values.content?.trim()
    const category = values.category?.trim() || '其他'

    if (data.some((r) => r.content === content && r.category === category)) {
      MessagePlugin.warning('该分类下已存在相同理由')
      return
    }

    const res = await (window as any).api.createReason({
      ...values,
      content,
      category,
      delta: Number(values.delta)
    })
    if (res.success) {
      MessagePlugin.success('添加成功')
      setVisible(false)
      form.reset()
      fetchReasons()
      emitDataUpdated('reasons')
    } else {
      MessagePlugin.error(res.message || '添加失败')
    }
  }

  const handleDelete = async (row: reason) => {
    if (!(window as any).api) return
    if (!canEdit) {
      MessagePlugin.error('当前为只读权限')
      return
    }
    setDeleteTarget(row)
    setDeleteDialogVisible(true)
  }

  const columns: PrimaryTableCol<reason>[] = [
    {
      colKey: 'category',
      title: '分类',
      width: 120,
      cell: ({ row }) => <Tag variant="outline">{row.category}</Tag>
    },
    { colKey: 'content', title: '理由内容', width: 250 },
    {
      colKey: 'delta',
      title: '预设分值',
      width: 100,
      cell: ({ row }) => (
        <span
          style={{ color: row.delta > 0 ? 'var(--td-success-color)' : 'var(--td-error-color)' }}
        >
          {row.delta > 0 ? `+${row.delta}` : row.delta}
        </span>
      )
    },
    {
      colKey: 'operation',
      title: '操作',
      width: 150,
      cell: ({ row }) => (
        <Space>
          <Button
            theme="danger"
            variant="text"
            disabled={!canEdit}
            onClick={() => handleDelete(row)}
          >
            删除
          </Button>
        </Space>
      )
    }
  ]

  return (
    <div style={{ padding: '24px' }}>
      <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'space-between' }}>
        <h2 style={{ margin: 0, color: 'var(--ss-text-main)' }}>理由管理</h2>
        <Button theme="primary" disabled={!canEdit} onClick={() => setVisible(true)}>
          添加预设理由
        </Button>
      </div>

      <Table
        data={data}
        columns={columns}
        rowKey="id"
        loading={loading}
        bordered
        hover
        pagination={{ pageSize: 50, total: data.length, defaultCurrent: 1 }}
        scroll={{ type: 'virtual', rowHeight: 48, threshold: 100 }}
        style={{ backgroundColor: 'var(--ss-card-bg)', color: 'var(--ss-text-main)' }}
      />

      <Dialog
        header="添加理由"
        visible={visible}
        onConfirm={handleAdd}
        onClose={() => setVisible(false)}
        destroyOnClose
      >
        <Form form={form} labelWidth={80}>
          <Form.FormItem label="分类" name="category" initialData="其他">
            <Input placeholder="例如: 学习, 纪律" />
          </Form.FormItem>
          <Form.FormItem label="理由内容" name="content">
            <Input placeholder="请输入理由" />
          </Form.FormItem>
          <Form.FormItem label="预设分值" name="delta">
            <Input type="number" placeholder="例如: 2 或 -2" />
          </Form.FormItem>
        </Form>
      </Dialog>

      <Dialog
        header="确认删除该理由？"
        visible={deleteDialogVisible}
        confirmBtn="删除"
        confirmLoading={deleteLoading}
        onClose={() => {
          if (!deleteLoading) {
            setDeleteDialogVisible(false)
            setDeleteTarget(null)
          }
        }}
        onCancel={() => {
          if (!deleteLoading) {
            setDeleteDialogVisible(false)
            setDeleteTarget(null)
          }
        }}
        onConfirm={async () => {
          if (!(window as any).api) return
          if (!deleteTarget) return
          setDeleteLoading(true)
          const res = await (window as any).api.deleteReason(deleteTarget.id)
          setDeleteLoading(false)
          if (res.success) {
            MessagePlugin.success('删除成功')
            setDeleteDialogVisible(false)
            setDeleteTarget(null)
            fetchReasons()
            emitDataUpdated('reasons')
          } else {
            MessagePlugin.error(res.message || '删除失败')
          }
        }}
      >
        <div style={{ wordBreak: 'break-all' }}>
          {deleteTarget
            ? `${deleteTarget.category} / ${deleteTarget.content} (${
                deleteTarget.delta > 0 ? `+${deleteTarget.delta}` : deleteTarget.delta
              })`
            : ''}
        </div>
      </Dialog>
    </div>
  )
}
