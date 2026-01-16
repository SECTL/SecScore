import React, { useEffect, useState, useCallback } from 'react'
import { Table, Button, Space, MessagePlugin, Dialog, Form, Input } from 'tdesign-react'
import type { PrimaryTableCol } from 'tdesign-react'

interface Student {
  id: number
  name: string
  score: number
}

export const StudentManager: React.FC<{ canEdit: boolean }> = ({ canEdit }) => {
  const [data, setData] = useState<Student[]>([])
  const [loading, setLoading] = useState(false)
  const [visible, setVisible] = useState(false)
  const [form] = Form.useForm()

  const emitDataUpdated = (category: 'students' | 'all') => {
    window.dispatchEvent(new CustomEvent('ss:data-updated', { detail: { category } }))
  }

  const fetchStudents = useCallback(async () => {
    if (!(window as any).api) return
    setLoading(true)
    const res = await (window as any).api.queryStudents({})
    if (res.success && res.data) {
      setData(res.data)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchStudents()
    const onDataUpdated = (e: any) => {
      const category = e?.detail?.category
      if (category === 'students' || category === 'all') fetchStudents()
    }
    window.addEventListener('ss:data-updated', onDataUpdated as any)
    return () => window.removeEventListener('ss:data-updated', onDataUpdated as any)
  }, [fetchStudents])

  const handleAdd = async () => {
    if (!(window as any).api) return
    if (!canEdit) {
      MessagePlugin.error('当前为只读权限')
      return
    }
    try {
      const validateResult = await form.validate()
      if (validateResult !== true) {
        return
      }

      const values = form.getFieldsValue(true) as { name: string }
      if (!values.name) {
        MessagePlugin.warning('请输入姓名')
        return
      }

      const name = values.name.trim()
      if (data.some((s) => s.name === name)) {
        MessagePlugin.warning('学生姓名已存在')
        return
      }

      const res = await (window as any).api.createStudent({ ...values, name })
      if (res.success) {
        MessagePlugin.success('添加成功')
        setVisible(false)
        form.reset()
        fetchStudents()
        emitDataUpdated('students')
      } else {
        MessagePlugin.error(res.message || '添加失败')
      }
    } catch (err) {
      console.error('Validate error', err)
    }
  }

  const handleDelete = async (id: number) => {
    if (!(window as any).api) return
    if (!canEdit) {
      MessagePlugin.error('当前为只读权限')
      return
    }
    const res = await (window as any).api.deleteStudent(id)
    if (res.success) {
      MessagePlugin.success('删除成功')
      fetchStudents()
      emitDataUpdated('students')
    } else {
      MessagePlugin.error(res.message || '删除失败')
    }
  }

  const columns: PrimaryTableCol<Student>[] = [
    { colKey: 'name', title: '姓名', width: 200 },
    {
      colKey: 'score',
      title: '当前积分',
      width: 120,
      align: 'center',
      cell: ({ row }) => (
        <span
          style={{
            fontWeight: 'bold',
            color:
              row.score > 0
                ? 'var(--td-success-color)'
                : row.score < 0
                  ? 'var(--td-error-color)'
                  : 'inherit'
          }}
        >
          {row.score > 0 ? `+${row.score}` : row.score}
        </span>
      )
    },
    {
      colKey: 'operation',
      title: '操作',
      width: 100,
      cell: ({ row }) => (
        <Space>
          <Button
            theme="danger"
            variant="text"
            disabled={!canEdit}
            onClick={() => handleDelete(row.id)}
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
        <h2 style={{ margin: 0, color: 'var(--ss-text-main)' }}>学生管理</h2>
        <Button theme="primary" disabled={!canEdit} onClick={() => setVisible(true)}>
          添加学生
        </Button>
      </div>

      <Table
        data={data}
        columns={columns}
        rowKey="id"
        loading={loading}
        bordered
        hover
        style={{ backgroundColor: 'var(--ss-card-bg)', color: 'var(--ss-text-main)' }}
      />

      {/* 添加学生弹窗 */}
      <Dialog
        header="添加学生"
        visible={visible}
        onConfirm={handleAdd}
        onClose={() => setVisible(false)}
        destroyOnClose
      >
        <Form form={form} labelWidth={80}>
          <Form.FormItem label="姓名" name="name">
            <Input placeholder="请输入学生姓名" />
          </Form.FormItem>
        </Form>
      </Dialog>
    </div>
  )
}
