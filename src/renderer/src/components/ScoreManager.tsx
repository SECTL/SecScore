import React, { useState, useEffect, useCallback } from 'react'
import {
  Form,
  Select,
  Radio,
  Input,
  InputNumber,
  Button,
  MessagePlugin,
  Card,
  Collapse,
  Table,
  PrimaryTableCol,
  Tag,
  Space,
  Popconfirm
} from 'tdesign-react'
import { RollbackIcon } from 'tdesign-icons-react'
import { match } from 'pinyin-pro'

const normalizeSearch = (input: unknown) =>
  String(input ?? '')
    .trim()
    .toLowerCase()

const getOptionLabel = (option: unknown) => {
  if (option && typeof option === 'object') {
    const anyOption = option as any
    return String(anyOption.label ?? anyOption.text ?? anyOption.value ?? '')
  }
  return String(option ?? '')
}

const matchStudentName = (name: string, keyword: string) => {
  const q0 = normalizeSearch(keyword)
  if (!q0) return true

  const nameLower = String(name).toLowerCase()
  if (nameLower.includes(q0)) return true

  const q1 = q0.replace(/\s+/g, '')
  if (q1 && nameLower.replace(/\s+/g, '').includes(q1)) return true

  try {
    const m0 = match(name, q0)
    if (Array.isArray(m0)) return true
    if (q1 && q1 !== q0) {
      const m1 = match(name, q1)
      if (Array.isArray(m1)) return true
    }
  } catch {
    return false
  }

  return false
}

interface student {
  id: number
  name: string
  score: number
}

interface reason {
  id: number
  content: string
  delta: number
  category: string
}

interface scoreEvent {
  id: number
  uuid: string
  student_name: string
  reason_content: string
  delta: number
  val_prev: number
  val_curr: number
  event_time: string
}

export const ScoreManager: React.FC<{ canEdit: boolean }> = ({ canEdit }) => {
  const [students, setStudents] = useState<student[]>([])
  const [reasons, setReasons] = useState<reason[]>([])
  const [events, setEvents] = useState<scoreEvent[]>([])
  const [loading, setLoading] = useState(false)
  const [submitLoading, setSubmitLoading] = useState(false)
  const [form] = Form.useForm()

  const emitDataUpdated = (category: 'events' | 'students' | 'reasons' | 'all') => {
    window.dispatchEvent(new CustomEvent('ss:data-updated', { detail: { category } }))
  }

  const fetchData = useCallback(async () => {
    if (!(window as any).api) return
    setLoading(true)
    const [stuRes, reaRes, eveRes] = await Promise.all([
      (window as any).api.queryStudents({}),
      (window as any).api.queryReasons(),
      (window as any).api.queryEvents({ limit: 10 })
    ])

    if (stuRes.success) setStudents(stuRes.data)
    if (reaRes.success) setReasons(reaRes.data)
    if (eveRes.success) setEvents(eveRes.data)
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchData()
    const onDataUpdated = (e: any) => {
      const category = e?.detail?.category
      if (
        category === 'events' ||
        category === 'students' ||
        category === 'reasons' ||
        category === 'all'
      ) {
        fetchData()
      }
    }
    window.addEventListener('ss:data-updated', onDataUpdated as any)
    return () => window.removeEventListener('ss:data-updated', onDataUpdated as any)
  }, [fetchData])

  const handleSubmit = async () => {
    if (!(window as any).api) return
    if (!canEdit) {
      MessagePlugin.error('当前为只读权限')
      return
    }
    const values = form.getFieldsValue(true) as any
    if (!values.student_name || !values.reason_content) {
      MessagePlugin.warning('请填写完整信息')
      return
    }

    const deltaInput = Number(values.delta)
    const hasDeltaInput = Number.isFinite(deltaInput) && deltaInput > 0

    const reasonId = Number(values.reason_id)
    const selectedReason = Number.isFinite(reasonId) ? reasons.find((r) => r.id === reasonId) : null

    if (!hasDeltaInput && !selectedReason) {
      MessagePlugin.warning('请填写分值或选择预设理由')
      return
    }

    setSubmitLoading(true)
    const delta = hasDeltaInput
      ? values.type === 'subtract'
        ? -Math.abs(deltaInput)
        : Math.abs(deltaInput)
      : Number(selectedReason?.delta ?? 0)

    const res = await (window as any).api.createEvent({
      student_name: values.student_name,
      reason_content: values.reason_content,
      delta: delta
    })

    if (res.success) {
      MessagePlugin.success('积分提交成功')
      form.setFieldsValue({
        delta: undefined,
        reason_content: '',
        reason_id: undefined,
        type: 'add'
      })
      fetchData()
      emitDataUpdated('events')
    } else {
      MessagePlugin.error(res.message || '提交失败')
    }
    setSubmitLoading(false)
  }

  const handleUndo = async (uuid: string) => {
    if (!(window as any).api) return
    if (!canEdit) {
      MessagePlugin.error('当前为只读权限')
      return
    }
    const res = await (window as any).api.deleteEvent(uuid)
    if (res.success) {
      MessagePlugin.success('已撤销操作')
      fetchData()
      emitDataUpdated('events')
    } else {
      MessagePlugin.error(res.message || '撤销失败')
    }
  }

  const columns: PrimaryTableCol<scoreEvent>[] = [
    { colKey: 'student_name', title: '学生', width: 100 },
    {
      colKey: 'delta',
      title: '变动',
      width: 80,
      cell: ({ row }) => (
        <Tag theme={row.delta > 0 ? 'success' : 'danger'} variant="light">
          {row.delta > 0 ? `+${row.delta}` : row.delta}
        </Tag>
      )
    },
    { colKey: 'reason_content', title: '理由', ellipsis: true },
    {
      colKey: 'event_time',
      title: '时间',
      width: 160,
      cell: ({ row }) => new Date(row.event_time).toLocaleString()
    },
    {
      colKey: 'operation',
      title: '操作',
      width: 80,
      cell: ({ row }) => (
        <Popconfirm
          content="确定要撤销这条记录吗？学生积分将回滚。"
          onConfirm={() => handleUndo(row.uuid)}
        >
          <Button variant="text" theme="warning" disabled={!canEdit} icon={<RollbackIcon />}>
            撤销
          </Button>
        </Popconfirm>
      )
    }
  ]

  return (
    <div style={{ padding: '24px' }}>
      <h2 style={{ marginBottom: '24px', color: 'var(--ss-text-main)' }}>积分管理</h2>

      <Card style={{ marginBottom: '24px', backgroundColor: 'var(--ss-card-bg)' }}>
        <Form
          form={form}
          labelWidth={80}
          initialData={{ type: 'add' }}
          onReset={() => form.setFieldsValue({ type: 'add' })}
        >
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
            <Form.FormItem label="姓名" name="student_name">
              <Select
                filterable
                placeholder="请选择或搜索学生"
                filter={(filterWords, option) =>
                  matchStudentName(getOptionLabel(option), filterWords)
                }
                options={students.map((s) => ({ label: s.name, value: s.name }))}
              />
            </Form.FormItem>

            <Form.FormItem label="分数">
              <Space>
                <Form.FormItem name="type" style={{ marginBottom: 0 }}>
                  <Radio.Group variant="default-filled">
                    <Radio.Button value="add">加分</Radio.Button>
                    <Radio.Button value="subtract">扣分</Radio.Button>
                  </Radio.Group>
                </Form.FormItem>
                <Form.FormItem name="delta" style={{ marginBottom: 0 }}>
                  <InputNumber min={1} placeholder="分值" style={{ width: '120px' }} />
                </Form.FormItem>
              </Space>
            </Form.FormItem>

            <Form.FormItem label="快捷理由" name="reason_id">
              <Select
                placeholder="选择预设理由"
                onChange={(v) => {
                  const id = Number(v)
                  if (!Number.isFinite(id)) return
                  const reason = reasons.find((r) => r.id === id)
                  if (!reason) return

                  const currentDelta = Number(form.getFieldValue('delta'))
                  const hasCurrentDelta = Number.isFinite(currentDelta) && currentDelta > 0

                  if (hasCurrentDelta) {
                    form.setFieldsValue({
                      reason_content: reason.content,
                      type: reason.delta > 0 ? 'add' : 'subtract'
                    })
                    return
                  }

                  form.setFieldsValue({
                    reason_content: reason.content,
                    delta: Math.abs(reason.delta),
                    type: reason.delta > 0 ? 'add' : 'subtract'
                  })
                }}
              >
                {reasons.map((r) => (
                  <Select.Option key={r.id} value={r.id} label={r.content}>
                    {r.content} ({r.delta > 0 ? `+${r.delta}` : r.delta})
                  </Select.Option>
                ))}
              </Select>
            </Form.FormItem>

            <Form.FormItem label="理由内容" name="reason_content">
              <Input placeholder="手动输入或选择快捷理由" />
            </Form.FormItem>
          </div>

          <div style={{ marginTop: '24px', display: 'flex', justifyContent: 'center' }}>
            <Button
              theme="primary"
              size="large"
              disabled={!canEdit}
              onClick={handleSubmit}
              loading={submitLoading}
              style={{ width: '200px' }}
            >
              确认提交
            </Button>
          </div>
        </Form>
      </Card>

      <Card style={{ backgroundColor: 'var(--ss-card-bg)' }}>
        <Collapse defaultValue={[]} expandMutex>
          <Collapse.Panel header="最近记录" value="recent">
            <Table
              data={events}
              columns={columns}
              rowKey="uuid"
              loading={loading}
              size="small"
              pagination={{ pageSize: 5, total: events.length }}
              style={{ color: 'var(--ss-text-main)' }}
            />
          </Collapse.Panel>
        </Collapse>
      </Card>
    </div>
  )
}
