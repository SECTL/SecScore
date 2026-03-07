import React, { useState, useEffect, useCallback } from 'react'
import {
  Form,
  Select,
  Radio,
  Input,
  InputNumber,
  Button,
  message,
  Card,
  Table,
  Tag,
  Space,
  Popconfirm
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useTranslation } from 'react-i18next'
import { UndoOutlined } from '@ant-design/icons'
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
  const { t } = useTranslation()
  const [students, setStudents] = useState<student[]>([])
  const [reasons, setReasons] = useState<reason[]>([])
  const [events, setEvents] = useState<scoreEvent[]>([])
  const [loading, setLoading] = useState(false)
  const [submitLoading, setSubmitLoading] = useState(false)
  const [form] = Form.useForm()
  const [messageApi, contextHolder] = message.useMessage()

  const emitDataUpdated = (category: 'events' | 'students' | 'reasons' | 'all') => {
    window.dispatchEvent(new CustomEvent('ss:data-updated', { detail: { category } }))
  }

  const fetchData = useCallback(async () => {
    if (!(window as any).api) return
    setTimeout(async () => {
      setLoading(true)
      try {
        const [stuRes, reaRes, eveRes] = await Promise.all([
          (window as any).api.queryStudents({}),
          (window as any).api.queryReasons(),
          (window as any).api.queryEvents({ limit: 10 })
        ])

        if (stuRes.success) setStudents(stuRes.data)
        if (reaRes.success) setReasons(reaRes.data)
        if (eveRes.success) setEvents(eveRes.data)
      } catch (e) {
        console.error('Failed to fetch data:', e)
      } finally {
        setLoading(false)
      }
    }, 0)
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
      messageApi.error(t('common.readOnly'))
      return
    }
    const values = form.getFieldsValue(true) as any

    const studentNames = Array.isArray(values.student_name)
      ? values.student_name
      : [values.student_name]
    if (!studentNames || studentNames.length === 0 || !values.reason_content) {
      messageApi.warning(t('score.pleaseEnterInfo'))
      return
    }

    const deltaInput = Number(values.delta)
    const hasDeltaInput = Number.isFinite(deltaInput) && deltaInput > 0

    const reasonId = Number(values.reason_id)
    const selectedReason = Number.isFinite(reasonId) ? reasons.find((r) => r.id === reasonId) : null

    if (!hasDeltaInput && !selectedReason) {
      messageApi.warning(t('score.pleaseEnterPoints'))
      return
    }

    setSubmitLoading(true)
    const delta = hasDeltaInput
      ? values.type === 'subtract'
        ? -Math.abs(deltaInput)
        : Math.abs(deltaInput)
      : Number(selectedReason?.delta ?? 0)

    try {
      let successCount = 0
      for (const studentName of studentNames) {
        const res = await (window as any).api.createEvent({
          student_name: studentName,
          reason_content: values.reason_content,
          delta: delta
        })
        if (res.success) {
          successCount++
        }
      }

      if (successCount === studentNames.length) {
        messageApi.success(t('score.batchSuccess', { count: successCount }))
        form.setFieldsValue({
          student_name: [],
          delta: undefined,
          reason_content: '',
          reason_id: undefined,
          type: 'add'
        })
        fetchData()
        emitDataUpdated('events')
      } else {
        messageApi.warning(
          t('score.batchPartial', { success: successCount, total: studentNames.length })
        )
        fetchData()
        emitDataUpdated('events')
      }
    } finally {
      setSubmitLoading(false)
    }
  }

  const handleUndo = async (uuid: string) => {
    if (!(window as any).api) return
    if (!canEdit) {
      messageApi.error(t('common.readOnly'))
      return
    }
    const res = await (window as any).api.deleteEvent(uuid)
    if (res.success) {
      messageApi.success(t('score.undoSuccess'))
      fetchData()
      emitDataUpdated('events')
    } else {
      messageApi.error(res.message || t('score.undoFailed'))
    }
  }

  const columns: ColumnsType<scoreEvent> = [
    { title: t('score.student'), dataIndex: 'student_name', key: 'student_name', width: 100 },
    {
      title: t('score.change'),
      dataIndex: 'delta',
      key: 'delta',
      width: 80,
      render: (delta: number) => (
        <Tag color={delta > 0 ? 'success' : 'error'}>{delta > 0 ? `+${delta}` : delta}</Tag>
      )
    },
    {
      title: t('score.reason'),
      dataIndex: 'reason_content',
      key: 'reason_content',
      ellipsis: true
    },
    {
      title: t('score.time'),
      dataIndex: 'event_time',
      key: 'event_time',
      width: 160,
      render: (time: string) => new Date(time).toLocaleString()
    },
    {
      title: t('common.operation'),
      key: 'operation',
      width: 80,
      render: (_, row) => (
        <Popconfirm title={t('score.undoConfirm')} onConfirm={() => handleUndo(row.uuid)}>
          <Button type="link" danger disabled={!canEdit} icon={<UndoOutlined />}>
            {t('score.undo')}
          </Button>
        </Popconfirm>
      )
    }
  ]

  return (
    <div style={{ padding: '24px' }}>
      {contextHolder}
      <h2 style={{ marginBottom: '24px', color: 'var(--ss-text-main)' }}>{t('score.title')}</h2>

      <Card style={{ marginBottom: '24px', backgroundColor: 'var(--ss-card-bg)' }}>
        <Form form={form} layout="vertical" initialValues={{ type: 'add' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
            <Form.Item label={t('score.student')} name="student_name">
              <Select
                mode="multiple"
                showSearch
                placeholder={t('score.pleaseSelectStudent')}
                filterOption={(input, option) => matchStudentName(getOptionLabel(option), input)}
                options={students.map((s) => ({ label: s.name, value: s.name }))}
              />
            </Form.Item>

            <Form.Item label={t('score.points')}>
              <Space>
                <Form.Item name="type" noStyle>
                  <Radio.Group optionType="button" buttonStyle="solid">
                    <Radio.Button value="add">{t('score.addPoints')}</Radio.Button>
                    <Radio.Button value="subtract">{t('score.deductPoints')}</Radio.Button>
                  </Radio.Group>
                </Form.Item>
                <Form.Item name="delta" noStyle>
                  <InputNumber min={1} placeholder={t('score.points')} style={{ width: '120px' }} />
                </Form.Item>
              </Space>
            </Form.Item>

            <Form.Item label={t('score.quickReason')} name="reason_id">
              <Select
                placeholder={t('score.selectReason')}
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
                options={reasons.map((r) => ({
                  label: `${r.content} (${r.delta > 0 ? `+${r.delta}` : r.delta})`,
                  value: r.id
                }))}
              />
            </Form.Item>

            <Form.Item label={t('score.reasonContent')} name="reason_content">
              <Input placeholder={t('score.reasonPlaceholder')} />
            </Form.Item>
          </div>

          <div style={{ marginTop: '24px', display: 'flex', justifyContent: 'center' }}>
            <Button
              type="primary"
              size="large"
              disabled={!canEdit}
              onClick={handleSubmit}
              loading={submitLoading}
              style={{ width: '200px' }}
            >
              {t('score.submit')}
            </Button>
          </div>
        </Form>
      </Card>

      <Card style={{ backgroundColor: 'var(--ss-card-bg)' }}>
        <div style={{ fontWeight: 600, marginBottom: 16 }}>{t('score.recentRecords')}</div>
        <Table
          dataSource={events}
          columns={columns}
          rowKey="uuid"
          loading={loading}
          size="small"
          pagination={{ pageSize: 5, total: events.length, defaultCurrent: 1 }}
          style={{ color: 'var(--ss-text-main)' }}
        />
      </Card>
    </div>
  )
}
