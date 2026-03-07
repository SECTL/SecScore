import { useState, useEffect } from 'react'
import { PlusOutlined, HolderOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { allTriggers, allActions, triggerRegistry, actionRegistry } from './com.automatically'
import type { TriggerItem, ActionItem } from './com.automatically/types'
import TriggerItemComponent from './com.automatically/TriggerItem'
import ActionItemComponent from './com.automatically/ActionItem'
import {
  Card,
  Form,
  Input,
  Button,
  message,
  Table,
  Space,
  Switch,
  Popconfirm,
  Select,
  Tooltip,
  Pagination
} from 'antd'
import type { ColumnsType } from 'antd/es/table'

import { RuleComponent } from './autoScore/ruleComponent'
import type { AutoScoreRuleData } from './autoScore/ruleBuilderUtils'

interface AutoScoreRule {
  id: number
  enabled: boolean
  name: string
  studentNames: string[]
  lastExecuted?: string
  triggers?: { event: string; value?: string; relation?: 'AND' | 'OR' }[]
  actions?: { event: string; value?: string; reason?: string }[]
}

interface AutoScoreRuleFormValues {
  name: string
  studentNames: string
}

export const AutoScoreManager: React.FC = () => {
  const { t } = useTranslation()
  const [rules, setRules] = useState<AutoScoreRule[]>([])
  const [students, setStudents] = useState<{ id: number; name: string }[]>([])
  const [loading, setLoading] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState<number>(50)
  const [form] = Form.useForm()
  const [editingRuleId, setEditingRuleId] = useState<number | null>(null)
  const [ruleData, setRuleData] = useState<AutoScoreRuleData>({
    triggers: [],
    actions: []
  })
  const [messageApi, contextHolder] = message.useMessage()

  const fetchRules = async () => {
    if (!(window as any).api) return

    setLoading(true)
    try {
      try {
        const authRes = await (window as any).api.authGetStatus()
        if (!authRes || !authRes.success || authRes.data?.permission !== 'admin') {
          messageApi.error(t('autoScore.adminRequired'))
          setLoading(false)
          return
        }
      } catch (e) {
        console.warn('Auth check failed', e)
      }

      const [rulesRes, studentsRes] = await Promise.all([
        (window as any).api.invoke('auto-score:getRules', {}),
        (window as any).api.queryStudents({})
      ])
      if (rulesRes.success) {
        setRules(rulesRes.data)
      } else {
        messageApi.error(rulesRes.message || t('autoScore.fetchFailed'))
      }
      if (studentsRes.success) {
        setStudents(studentsRes.data)
      }
    } catch (error) {
      console.error('Failed to fetch auto score rules:', error)
      messageApi.error(t('autoScore.fetchFailed'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchRules()
  }, [])

  const handleSubmit = async () => {
    if (!(window as any).api) return

    const values = form.getFieldsValue(true) as unknown as AutoScoreRuleFormValues

    if (!values.name) {
      messageApi.warning(t('autoScore.nameRequired'))
      return
    }

    if (triggerList.length === 0) {
      messageApi.warning(t('autoScore.triggerRequired'))
      return
    }

    if (actionList.length === 0) {
      messageApi.warning(t('autoScore.actionRequired'))
      return
    }

    const studentNames = Array.isArray(values.studentNames) ? values.studentNames : []

    const ruleDataToSubmit = {
      enabled: true,
      name: values.name,
      studentNames,
      triggers: ruleData.triggers,
      actions: ruleData.actions
    }

    try {
      const authRes = await (window as any).api.authGetStatus()
      if (!authRes || !authRes.success || authRes.data?.permission !== 'admin') {
        messageApi.error(t('autoScore.adminCreateRequired'))
        return
      }
    } catch (e) {
      console.warn('Auth check failed', e)
    }

    try {
      let res: { success: boolean; message?: string; data?: any }
      if (editingRuleId !== null) {
        res = await (window as any).api.invoke('auto-score:updateRule', {
          id: editingRuleId,
          ...ruleDataToSubmit
        })
      } else {
        res = await (window as any).api.invoke('auto-score:addRule', ruleDataToSubmit)
      }

      if (res.success) {
        messageApi.success(
          editingRuleId !== null ? t('autoScore.updateSuccess') : t('autoScore.createSuccess')
        )
        form.setFieldsValue({
          name: '',
          studentNames: ''
        })
        setEditingRuleId(null)
        setRuleData({ triggers: [], actions: [] })
        fetchRules()
      } else {
        messageApi.error(
          res.message ||
            (editingRuleId !== null ? t('autoScore.updateFailed') : t('autoScore.createFailed'))
        )
      }
    } catch (error) {
      console.error('Failed to submit auto score rule:', error)
      messageApi.error(
        editingRuleId !== null ? t('autoScore.updateFailed') : t('autoScore.createFailed')
      )
    }
  }

  const handleEdit = (rule: AutoScoreRule) => {
    setEditingRuleId(rule.id)
    form.setFieldsValue({
      name: rule.name,
      studentNames: rule.studentNames
    })
    setRuleData({
      triggers: rule.triggers || [],
      actions: rule.actions || []
    })
  }

  const handleDelete = async (ruleId: number) => {
    if (!(window as any).api) return
    try {
      const authRes = await (window as any).api.authGetStatus()
      if (!authRes || !authRes.success || authRes.data?.permission !== 'admin') {
        messageApi.error(t('autoScore.adminDeleteRequired'))
        return
      }
    } catch (e) {
      console.warn('Auth check failed', e)
    }

    try {
      const res = await (window as any).api.invoke('auto-score:deleteRule', ruleId)
      if (res.success) {
        messageApi.success(t('autoScore.deleteSuccess'))
        fetchRules()
      } else {
        messageApi.error(res.message || t('autoScore.deleteFailed'))
      }
    } catch (error) {
      console.error('Failed to delete auto score rule:', error)
      messageApi.error(t('autoScore.deleteFailed'))
    }
  }

  const handleToggle = async (ruleId: number, enabled: boolean) => {
    if (!(window as any).api) return
    try {
      const authRes = await (window as any).api.authGetStatus()
      if (!authRes || !authRes.success || authRes.data?.permission !== 'admin') {
        messageApi.error(t('autoScore.adminToggleRequired'))
        return
      }
    } catch (e) {
      console.warn('Auth check failed', e)
    }

    try {
      const res = await (window as any).api.invoke('auto-score:toggleRule', { ruleId, enabled })
      if (res.success) {
        messageApi.success(enabled ? t('autoScore.enabled') : t('autoScore.disabled'))
        fetchRules()
      } else {
        messageApi.error(
          res.message || (enabled ? t('autoScore.enableFailed') : t('autoScore.disableFailed'))
        )
      }
    } catch (error) {
      console.error('Failed to toggle auto score rule:', error)
      messageApi.error(enabled ? t('autoScore.enableFailed') : t('autoScore.disableFailed'))
    }
  }

  const handleResetForm = () => {
    form.setFieldsValue({
      name: '',
      studentNames: ''
    })
    setEditingRuleId(null)
    setTriggerList([])
    setActionList([])
  }

  const handleAddTrigger = () => {
    const nextId = triggerList.length ? Math.max(...triggerList.map((t) => t.id)) + 1 : 1
    const defaultTrigger = allTriggers.list[0]
    if (!defaultTrigger) {
      messageApi.error(t('autoScore.noTriggerAvailable'))
      return
    }
    setTriggerList((prev) => [
      ...prev,
      {
        id: nextId,
        eventName: defaultTrigger.eventName,
        value: '',
        relation: 'AND'
      }
    ])
  }

  const handleDeleteTrigger = (id: number) => {
    setTriggerList((prev) => prev.filter((t) => t.id !== id))
  }

  const handleTriggerChange = (id: number, eventName: string) => {
    setTriggerList((prev) => prev.map((t) => (t.id === id ? { ...t, eventName, value: '' } : t)))
  }

  const handleTriggerValueChange = (id: number, value: string) => {
    setTriggerList((prev) => prev.map((t) => (t.id === id ? { ...t, value } : t)))
  }

  const handleTriggerRelationChange = (id: number, relation: 'AND' | 'OR') => {
    setTriggerList((prev) => prev.map((t) => (t.id === id ? { ...t, relation } : t)))
  }

  const handleAddAction = () => {
    const nextId = actionList.length ? Math.max(...actionList.map((a) => a.id)) + 1 : 1
    const defaultAction = allActions.list[0]
    if (!defaultAction) {
      messageApi.error(t('autoScore.noActionAvailable'))
      return
    }
    setActionList((prev) => [
      ...prev,
      {
        id: nextId,
        eventName: defaultAction.eventName,
        value: '',
        reason: ''
      }
    ])
  }

  const handleDeleteAction = (id: number) => {
    setActionList((prev) => prev.filter((a) => a.id !== id))
  }

  const handleActionChange = (id: number, eventName: string) => {
    setActionList((prev) => prev.map((a) => (a.id === id ? { ...a, eventName, value: '' } : a)))
  }

  const handleActionValueChange = (id: number, value: string) => {
    setActionList((prev) => prev.map((a) => (a.id === id ? { ...a, value } : a)))
  }

  const handleActionReasonChange = (id: number, reason: string) => {
    setActionList((prev) => prev.map((a) => (a.id === id ? { ...a, reason } : a)))
  }

  const columns: ColumnsType<AutoScoreRule> = [
    {
      key: 'drag',
      title: t('autoScore.sort'),
      width: 60,
      render: () => <HolderOutlined style={{ cursor: 'move' }} />
    },
    {
      title: t('autoScore.status'),
      dataIndex: 'enabled',
      key: 'enabled',
      width: 80,
      render: (enabled: boolean, row) => (
        <Switch checked={enabled} onChange={(value) => handleToggle(row.id, value)} size="small" />
      )
    },
    { title: t('autoScore.name'), dataIndex: 'name', key: 'name', width: 150 },
    {
      title: t('autoScore.triggers'),
      dataIndex: 'triggers',
      key: 'triggers',
      width: 150,
      render: (triggers: AutoScoreRule['triggers']) => {
        if (!triggers || triggers.length === 0) {
          return <span>{t('common.none')}</span>
        }
        const triggerLabels = triggers.map((t) => {
          const def = triggerRegistry.get(t.event)
          return def?.label || t.event
        })
        return (
          <Tooltip title={triggerLabels.join(', ')}>
            <span>{t('autoScore.triggerCount', { count: triggers.length })}</span>
          </Tooltip>
        )
      }
    },
    {
      title: t('autoScore.actions'),
      dataIndex: 'actions',
      key: 'actions',
      width: 150,
      render: (actions: AutoScoreRule['actions']) => {
        if (!actions || actions.length === 0) {
          return <span>{t('common.none')}</span>
        }
        const actionLabels = actions.map((a) => {
          const def = actionRegistry.get(a.event)
          return def?.label || a.event
        })
        return (
          <Tooltip title={actionLabels.join(', ')}>
            <span>{t('autoScore.actionCount', { count: actions.length })}</span>
          </Tooltip>
        )
      }
    },
    {
      title: t('autoScore.applicableStudents'),
      dataIndex: 'studentNames',
      key: 'studentNames',
      width: 130,
      render: (studentNames: string[]) => {
        if (!studentNames || studentNames.length === 0) {
          return <span>{t('autoScore.allStudents')}</span>
        }
        const studentList = studentNames.join(',\n')
        return (
          <Tooltip title={studentList}>
            <span>{t('autoScore.studentCount', { count: studentNames.length })}</span>
          </Tooltip>
        )
      }
    },
    {
      title: t('autoScore.lastExecuted'),
      dataIndex: 'lastExecuted',
      key: 'lastExecuted',
      width: 180,
      render: (lastExecuted: string) => {
        if (!lastExecuted) return <span>{t('autoScore.notExecuted')}</span>
        try {
          const date = new Date(lastExecuted)
          return date.toLocaleString()
        } catch {
          return <span>{t('autoScore.invalidTime')}</span>
        }
      }
    },
    {
      title: t('common.operation'),
      key: 'operation',
      width: 150,
      render: (_, row) => (
        <Space>
          <Button size="small" onClick={() => handleEdit(row)}>
            {t('common.edit')}
          </Button>
          <Popconfirm title={t('autoScore.deleteConfirm')} onConfirm={() => handleDelete(row.id)}>
            <Button size="small" danger>
              {t('common.delete')}
            </Button>
          </Popconfirm>
        </Space>
      )
    }
  ]

  return (
    <div style={{ padding: '24px' }}>
      {contextHolder}
      <h2 style={{ marginBottom: '24px', color: 'var(--ss-text-main)' }}>{t('autoScore.title')}</h2>

      <Card style={{ marginBottom: '24px', backgroundColor: 'var(--ss-card-bg)' }}>
        <Form form={form} layout="vertical">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
            <Form.Item
              label={t('autoScore.name')}
              name="name"
              rules={[{ required: true, message: t('autoScore.nameRequired') }]}
            >
              <Input placeholder={t('autoScore.namePlaceholder')} />
            </Form.Item>

            <Form.Item label={t('autoScore.applicableStudents')} name="studentNames">
              <Select
                mode="multiple"
                showSearch
                placeholder={t('autoScore.studentPlaceholder')}
                options={students.map((student) => ({ label: student.name, value: student.name }))}
              />
            </Form.Item>
          </div>

          <div style={{ marginTop: '16px' }}>
            <RuleComponent initialData={ruleData} onChange={(data) => setRuleData(data)} />
          </div>

          <div style={{ marginTop: '24px', display: 'flex', gap: '12px' }}>
            <Button type="primary" onClick={handleSubmit}>
              {editingRuleId !== null
                ? t('autoScore.updateAutomation')
                : t('autoScore.addAutomation')}
            </Button>
            <Button onClick={handleResetForm}>
              {editingRuleId !== null ? t('autoScore.cancelEdit') : t('autoScore.resetForm')}
            </Button>
          </div>
        </Form>
      </Card>

      <Card
        style={{ marginBottom: '24px', backgroundColor: 'var(--ss-card-bg)' }}
        title={t('autoScore.whenTriggered')}
      >
        <Space orientation="vertical" style={{ width: '100%' }}>
          {triggerItems}
          <Button
            type="dashed"
            icon={<PlusOutlined />}
            onClick={handleAddTrigger}
            style={{ fontWeight: 'bolder', fontSize: 15 }}
          >
            {t('autoScore.addTrigger')}
          </Button>
        </Space>
      </Card>

      <Card
        style={{ marginBottom: '24px', backgroundColor: 'var(--ss-card-bg)' }}
        title={t('autoScore.triggeredActions')}
      >
        <Space orientation="vertical" style={{ width: '100%' }}>
          {actionItems}
          <Button
            type="dashed"
            icon={<PlusOutlined />}
            onClick={handleAddAction}
            style={{ fontWeight: 'bolder', fontSize: 15 }}
          >
            {t('autoScore.addAction')}
          </Button>
        </Space>
      </Card>

      <Card style={{ marginBottom: '24px', backgroundColor: 'var(--ss-card-bg)' }}>
        <Table
          dataSource={rules.slice((currentPage - 1) * pageSize, currentPage * pageSize)}
          columns={columns}
          rowKey="id"
          loading={loading}
          pagination={false}
          style={{ color: 'var(--ss-text-main)' }}
        />
        <div style={{ marginTop: 16, textAlign: 'right' }}>
          <Pagination
            current={currentPage}
            pageSize={pageSize}
            total={rules.length}
            onChange={(page, size) => {
              setCurrentPage(page)
              setPageSize(size)
            }}
            showSizeChanger
            showTotal={(total) => t('common.total', { count: total })}
          />
        </div>
      </Card>
    </div>
  )
}
