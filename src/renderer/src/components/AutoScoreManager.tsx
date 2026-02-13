import React, { useState, useEffect } from 'react'
import { AddIcon, Delete1Icon, MoveIcon } from 'tdesign-icons-react'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { prism } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { allTriggers, allActions, TriggerItem, ActionItem } from '../services/AutoScoreService'
import {
  Card,
  Form,
  Input,
  Button,
  MessagePlugin,
  Table,
  PrimaryTableCol,
  Space,
  Switch,
  Popconfirm,
  Radio,
  Select,
  TooltipLite
} from 'tdesign-react'

interface AutoScoreRule {
  id: number
  enabled: boolean
  name: string
  studentNames: string[]
  lastExecuted?: string
  triggers?: { event: string; value?: string }[]
  actions?: { event: string; value?: string; reason?: string }[]
}

interface AutoScoreRuleFormValues {
  name: string
  studentNames: string
}

export const AutoScoreManager: React.FC = () => {
  const [rules, setRules] = useState<AutoScoreRule[]>([])
  const [students, setStudents] = useState<{ id: number; name: string }[]>([])
  const [loading, setLoading] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState<number>(50)
  const [form] = Form.useForm()
  const [editingRuleId, setEditingRuleId] = useState<number | null>(null)

  const fetchRules = async () => {
    if (!(window as any).api) return

    setLoading(true)
    try {
      try {
        const authRes = await (window as any).api.authGetStatus()
        if (!authRes || !authRes.success || authRes.data?.permission !== 'admin') {
          MessagePlugin.error('需要管理员权限以查看自动加分自动化，请先登录管理员账号')
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
        MessagePlugin.error(rulesRes.message || '获取自动化失败')
      }
      if (studentsRes.success) {
        setStudents(studentsRes.data)
      }
    } catch (error) {
      console.error('Failed to fetch auto score rules:', error)
      MessagePlugin.error('获取自动化失败')
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
      MessagePlugin.warning('请填写自动化名称')
      return
    }

    // 验证触发器必填项
    if (triggerList.length === 0) {
      MessagePlugin.warning('请至少添加一个触发器')
      return
    }

    for (const t of triggerList) {
      const def = allTriggers.find((a) => a.eventName === t.eventName)
      if (def?.valueType && (!t.value || String(t.value).trim() === '')) {
        MessagePlugin.warning(`触发器 ${def.label} 需要填写 value`)
        return
      }
    }

    // 验证行动必填项
    if (actionList.length === 0) {
      MessagePlugin.warning('请至少添加一个行动')
      return
    }

    for (const a of actionList) {
      const def = allActions.find((action) => action.eventName === a.eventName)
      if (def?.valueType && (!a.value || String(a.value).trim() === '')) {
        MessagePlugin.warning(`行动 ${def.label} 需要填写 value`)
        return
      }
    }

    // 确保 studentNames 是数组类型
    const studentNames = Array.isArray(values.studentNames) ? values.studentNames : []

    const triggersPayload = triggerList.map((t) => ({ event: t.eventName, value: t.value }))
    const actionsPayload = actionList.map((a) => ({
      event: a.eventName,
      value: a.value,
      reason: a.reason
    }))

    const ruleData = {
      enabled: true,
      name: values.name,
      studentNames,
      triggers: triggersPayload,
      actions: actionsPayload
    }

    // 权限检查：仅管理员可创建/更新自动化
    try {
      const authRes = await (window as any).api.authGetStatus()
      if (!authRes || !authRes.success || authRes.data?.permission !== 'admin') {
        MessagePlugin.error('需要管理员权限以创建或更新自动加分自动化')
        return
      }
    } catch (e) {
      console.warn('Auth check failed', e)
    }

    try {
      let res
      if (editingRuleId !== null) {
        // 更新现有自动化
        res = await (window as any).api.invoke('auto-score:updateRule', {
          id: editingRuleId,
          ...ruleData
        })
      } else {
        // 创建新自动化
        res = await (window as any).api.invoke('auto-score:addRule', ruleData)
      }

      if (res.success) {
        MessagePlugin.success(editingRuleId !== null ? '自动化更新成功' : '自动化创建成功')
        // 手动清空表单字段，避免 form.reset() 导致的栈溢出
        form.setFieldsValue({
          name: '',
          studentNames: ''
        })
        setEditingRuleId(null)
        setTriggerList([])
        setActionList([])
        fetchRules() // 刷新自动化列表
      } else {
        MessagePlugin.error(
          res.message || (editingRuleId !== null ? '更新自动化失败' : '创建自动化失败')
        )
      }
    } catch (error) {
      console.error('Failed to submit auto score rule:', error)
      MessagePlugin.error(editingRuleId !== null ? '更新自动化失败' : '创建自动化失败')
    }
  }
  const handleEdit = (rule: AutoScoreRule) => {
    setEditingRuleId(rule.id)
    form.setFieldsValue({
      name: rule.name,
      studentNames: rule.studentNames.join(', ')
    })
    // 如果后端返回了 triggers 字段，把它加载到 triggerList
    if (rule.triggers && Array.isArray(rule.triggers)) {
      const mapped = rule.triggers.map((t, idx) => {
        const found = allTriggers.find((a) => a.eventName === t.event)
        return {
          id: idx + 1,
          eventName: t.event,
          haveValue: !!found?.valueType,
          value: t.value ?? ''
        }
      })
      setTriggerList(mapped)
    } else {
      setTriggerList([])
    }
    // 如果后端返回了 actions 字段，把它加载到 actionList
    if (rule.actions && Array.isArray(rule.actions)) {
      const mapped = rule.actions.map((a, idx) => {
        const found = allActions.find((action) => action.eventName === a.event)
        return {
          id: idx + 1,
          eventName: a.event,
          valueType: found?.valueType,
          value: a.value ?? '',
          reason: a.reason
        }
      })
      setActionList(mapped)
    } else {
      setActionList([])
    }
  }

  const handleDelete = async (ruleId: number) => {
    if (!(window as any).api) return
    // 权限检查
    try {
      const authRes = await (window as any).api.authGetStatus()
      if (!authRes || !authRes.success || authRes.data?.permission !== 'admin') {
        MessagePlugin.error('需要管理员权限以删除自动加分自动化')
        return
      }
    } catch (e) {
      console.warn('Auth check failed', e)
    }

    try {
      const res = await (window as any).api.invoke('auto-score:deleteRule', ruleId)
      if (res.success) {
        MessagePlugin.success('自动化删除成功')
        fetchRules() // 刷新自动化列表
      } else {
        MessagePlugin.error(res.message || '删除自动化失败')
      }
    } catch (error) {
      console.error('Failed to delete auto score rule:', error)
      MessagePlugin.error('删除自动化失败')
    }
  }

  const handleToggle = async (ruleId: number, enabled: boolean) => {
    if (!(window as any).api) return
    // 权限检查
    try {
      const authRes = await (window as any).api.authGetStatus()
      if (!authRes || !authRes.success || authRes.data?.permission !== 'admin') {
        MessagePlugin.error('需要管理员权限以启用/禁用自动加分自动化')
        return
      }
    } catch (e) {
      console.warn('Auth check failed', e)
    }

    try {
      const res = await (window as any).api.invoke('auto-score:toggleRule', { ruleId, enabled })
      if (res.success) {
        MessagePlugin.success(enabled ? '自动化已启用' : '自动化已禁用')
        fetchRules() // 刷新自动化列表
      } else {
        MessagePlugin.error(res.message || (enabled ? '启用自动化失败' : '禁用自动化失败'))
      }
    } catch (error) {
      console.error('Failed to toggle auto score rule:', error)
      MessagePlugin.error(enabled ? '启用自动化失败' : '禁用自动化失败')
    }
  }

  const handleResetForm = () => {
    // 手动清空表单字段，避免 form.reset() 导致的栈溢出
    form.setFieldsValue({
      name: '',
      studentNames: ''
    })
    setEditingRuleId(null)
    setTriggerList([])
    setActionList([])
  }

  const columns: PrimaryTableCol<AutoScoreRule>[] = [
    {
      colKey: 'drag',
      title: '排序',
      cell: () => <MoveIcon />,
      width: 60
    },
    {
      colKey: 'enabled',
      title: '状态',
      width: 80,
      cell: ({ row }) => (
        <Switch
          value={row.enabled}
          onChange={(value) => handleToggle(row.id, value)}
          size="small"
        />
      )
    },
    { colKey: 'name', title: '自动化名称', width: 150 },
    {
      colKey: 'triggers',
      title: '触发器',
      width: 150,
      cell: ({ row }) => {
        if (!row.triggers || row.triggers.length === 0) {
          return <span>无</span>
        }
        const triggerLabels = row.triggers.map((t) => {
          const def = allTriggers.find((tr) => tr.eventName === t.event)
          return def?.label || t.event
        })
        return (
          <TooltipLite
            content={triggerLabels.join(', ')}
            showArrow
            placement="mouse"
            theme="default"
          >
            {row.triggers.length} 个触发器
          </TooltipLite>
        )
      }
    },
    {
      colKey: 'actions',
      title: '行动',
      width: 150,
      cell: ({ row }) => {
        if (!row.actions || row.actions.length === 0) {
          return <span>无</span>
        }
        const actionLabels = row.actions.map((a) => {
          const def = allActions.find((ac) => ac.eventName === a.event)
          return def?.label || a.event
        })
        return (
          <TooltipLite
            content={actionLabels.join(', ')}
            showArrow
            placement="mouse"
            theme="default"
          >
            {row.actions.length} 个行动
          </TooltipLite>
        )
      }
    },
    {
      colKey: 'studentNames',
      title: '适用学生',
      width: 130,
      cell: ({ row }) => {
        if (!row.studentNames || row.studentNames.length === 0) {
          return <span>所有学生</span>
        }
        const studentList = row.studentNames.join(',\n')
        return (
          <TooltipLite content={studentList} showArrow placement="mouse" theme="default">
            {row.studentNames.length} 名学生
          </TooltipLite>
        )
      }
    },
    {
      colKey: 'lastExecuted',
      title: '最后执行',
      width: 180,
      cell: ({ row }) => {
        if (!row.lastExecuted) return <span>未执行</span>
        try {
          const date = new Date(row.lastExecuted)
          return date.toLocaleString()
        } catch {
          return <span>无效时间</span>
        }
      }
    },
    {
      colKey: 'operation',
      title: '操作',
      width: 150,
      cell: ({ row }) => (
        <Space>
          <Button size="small" variant="outline" onClick={() => handleEdit(row)}>
            编辑
          </Button>
          <Popconfirm content="确定要删除这条自动化吗？" onConfirm={() => handleDelete(row.id)}>
            <Button size="small" variant="outline" theme="danger">
              删除
            </Button>
          </Popconfirm>
        </Space>
      )
    }
  ]
  const onDragSort = (params: any) => setRules(params.newData)

  const triggerOptions = allTriggers.map((t) => ({ label: t.label, value: t.eventName }))

  const [triggerList, setTriggerList] = useState<TriggerItem[]>([])
  const [actionList, setActionList] = useState<ActionItem[]>([])

  const handleTriggerChange = (id: number, value: string) => {
    const found = allTriggers.find((a) => a.eventName === value)
    setTriggerList((prev) =>
      prev.map((t) =>
        t.id === id ? { ...t, eventName: value, valueType: found?.valueType, value: '' } : t
      )
    )
  }

  const handleValueChange = (id: number, val: string) => {
    setTriggerList((prev) => prev.map((t) => (t.id === id ? { ...t, value: val } : t)))
  }

  const handleDeleteTrigger = (id: number) => {
    setTriggerList((prev) => prev.filter((t) => t.id !== id))
  }

  const handleAddTrigger = () => {
    const nextId = triggerList.length ? Math.max(...triggerList.map((t) => t.id)) + 1 : 1
    const defaultTrigger = allTriggers[0]
    setTriggerList((prev) => [
      ...prev,
      {
        id: nextId,
        eventName: defaultTrigger.eventName,
        valueType: defaultTrigger.valueType,
        value: ''
      }
    ])
  }

  // 行动管理相关函数
  const handleActionChange = (id: number, value: string) => {
    const found = allActions.find((a) => a.eventName === value)
    setActionList((prev) =>
      prev.map((t) =>
        t.id === id ? { ...t, eventName: value, valueType: found?.valueType, value: '' } : t
      )
    )
  }

  const handleActionValueChange = (id: number, val: string) => {
    setActionList((prev) => prev.map((t) => (t.id === id ? { ...t, value: val } : t)))
  }

  const handleDeleteAction = (id: number) => {
    setActionList((prev) => prev.filter((t) => t.id !== id))
  }

  const handleAddAction = () => {
    const nextId = actionList.length ? Math.max(...actionList.map((t) => t.id)) + 1 : 1
    const defaultAction = allActions[0]
    setActionList((prev) => [
      ...prev,
      {
        id: nextId,
        eventName: defaultAction.eventName,
        valueType: defaultAction.valueType,
        value: ''
      }
    ])
  }

  const triggerItems = triggerList
    .filter((t) => t.eventName !== null)
    .map((triggerTest) => (
      <div key={triggerTest.id} style={{ display: 'flex', gap: 5 }}>
        <Button
          theme="default"
          variant="text"
          icon={<Delete1Icon strokeWidth={2.4} />}
          onClick={() => handleDeleteTrigger(triggerTest.id)}
        />
        <Select
          value={triggerTest.eventName}
          style={{ width: '200px' }}
          options={triggerOptions}
          placeholder="请选择触发规则"
          onChange={(value) => handleTriggerChange(triggerTest.id, value as string)}
        />
        {triggerTest.valueType
          ? React.createElement(triggerTest.valueType, {
              placeholder:
                triggerTest.eventName === 'interval_time_passed'
                  ? '请选择日期'
                  : '请输入时间间隔（天）',
              style: { width: '150px' },
              value:
                triggerTest.eventName === 'interval_time_passed'
                  ? triggerTest.value
                    ? new Date(triggerTest.value)
                    : undefined
                  : String(triggerTest.value ?? ''),
              onChange: (v: any) => handleValueChange(triggerTest.id, v ? String(v) : '')
            })
          : null}
      </div>
    ))

  const actionOptions = allActions.map((a) => ({ label: a.label, value: a.eventName }))

  const actionItems = actionList
    .filter((a) => a.eventName !== null)
    .map((action) => (
      <div key={action.id} style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
        <Button
          theme="default"
          variant="text"
          icon={<Delete1Icon strokeWidth={2.4} />}
          onClick={() => handleDeleteAction(action.id)}
        />
        <Select
          value={action.eventName}
          style={{ width: '200px' }}
          options={actionOptions}
          placeholder="请选择触发行动"
          onChange={(value) => handleActionChange(action.id, value as string)}
        />
        {(() => {
          const actionDef = allActions.find((a) => a.eventName === action.eventName)
          const renderConfig = actionDef?.renderConfig

          // 特殊处理Radio组件
          if (action.valueType === Radio || renderConfig?.component === Radio) {
            return (
              <Radio.Group
                value={action.value || 'email'}
                onChange={(v: any) => handleActionValueChange(action.id, v ? String(v) : '')}
                {...renderConfig?.props}
              >
                {renderConfig?.props?.options?.map((option: any) => (
                  <Radio.Button key={option.value} value={option.value}>
                    {option.label}
                  </Radio.Button>
                ))}
              </Radio.Group>
            )
          } else if (renderConfig?.component) {
            return React.createElement(renderConfig.component, {
              value: String(action.value ?? ''),
              onChange: (v: any) => handleActionValueChange(action.id, v ? String(v) : ''),
              ...renderConfig.props
            })
          } else if (action.valueType) {
            return React.createElement(action.valueType, {
              placeholder: '请输入Value',
              style: { width: '150px' },
              value: String(action.value ?? ''),
              onChange: (v: any) => handleActionValueChange(action.id, v ? String(v) : '')
            })
          }
          return null
        })()}
        {action.eventName === 'add_score' && (
          <Input
            placeholder="请输入理由"
            style={{ width: '150px' }}
            value={action.reason || ''}
            onChange={(v: any) => {
              setActionList((prev) =>
                prev.map((a) => (a.id === action.id ? { ...a, reason: v } : a))
              )
            }}
          />
        )}
      </div>
    ))

  return (
    <div style={{ padding: '24px' }}>
      <h2 style={{ marginBottom: '24px', color: 'var(--ss-text-main)' }}>自动化加分管理</h2>

      <Card style={{ marginBottom: '24px', backgroundColor: 'var(--ss-card-bg)' }}>
        <Form form={form} labelWidth={100} onReset={handleResetForm}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
            <Form.FormItem
              label="自动化名称"
              name="name"
              rules={[{ required: true, message: '请输入自动化名称' }]}
            >
              <Input placeholder="例如：每日签到加分" />
            </Form.FormItem>

            <Form.FormItem label="适用学生" name="studentNames">
              <Select
                filterable
                multiple
                placeholder="请选择或搜索学生（留空表示所有学生）"
                options={students.map((student) => ({ label: student.name, value: student.name }))}
              />
            </Form.FormItem>
          </div>

          <div style={{ marginTop: '24px', display: 'flex', gap: '12px' }}>
            <Button theme="primary" onClick={handleSubmit}>
              {editingRuleId !== null ? '更新自动化' : '添加自动化'}
            </Button>
            <Button type="reset" variant="outline">
              {editingRuleId !== null ? '取消编辑' : '重置表单'}
            </Button>
          </div>
        </Form>
      </Card>
      <Card style={{ marginBottom: '24px', backgroundColor: 'var(--ss-card-bg)' }}>
        <Table
          data={rules.slice((currentPage - 1) * pageSize, currentPage * pageSize)}
          columns={columns}
          rowKey="id"
          resizable
          loading={loading}
          dragSort="row-handler"
          onDragSort={onDragSort}
          pagination={{
            current: currentPage,
            pageSize,
            total: rules.length,
            onChange: (pageInfo) => setCurrentPage(pageInfo.current),
            onPageSizeChange: (size) => setPageSize(size)
          }}
          style={{ color: 'var(--ss-text-main)' }}
        />
      </Card>

      <Card
        style={{ marginBottom: '24px', backgroundColor: 'var(--ss-card-bg)' }}
        title="当以下规则触发时"
        headerBordered
      >
        <Space style={{ display: 'grid' }}>
          {triggerItems}
          <Button
            theme="default"
            variant="text"
            style={{ fontWeight: 'bolder', fontSize: 15 }}
            icon={<AddIcon strokeWidth={3} />}
            onClick={handleAddTrigger}
          >
            添加规则
          </Button>
        </Space>
      </Card>

      <Card
        style={{ marginBottom: '24px', backgroundColor: 'var(--ss-card-bg)' }}
        title="满足规则时触发的行动"
        headerBordered
      >
        <Space style={{ display: 'grid' }}>
          {actionItems}
          <Button
            theme="default"
            variant="text"
            style={{ fontWeight: 'bolder', fontSize: 15 }}
            icon={<AddIcon strokeWidth={3} />}
            onClick={handleAddAction}
          >
            添加行动
          </Button>
        </Space>
      </Card>

      <Card style={{ marginBottom: '24px', backgroundColor: 'var(--ss-card-bg)' }}>
        <SyntaxHighlighter language="javascript" style={prism} showLineNumbers>
          println("这是一个示例代码块，展示如何使用自动化加分功能的API接口")
        </SyntaxHighlighter>
      </Card>
      {/*       <div style={{ marginTop: '24px', padding: '16px', backgroundColor: 'var(--ss-card-bg)', borderRadius: '8px' }}>
        <h3 style={{ marginBottom: '12px', color: 'var(--ss-text-main)' }}>使用说明</h3>
        <ul style={{ color: 'var(--ss-text-secondary)', lineHeight: '1.6' }}>
          <li>自动化加分功能会按照设定的时间间隔自动为学生加分</li>
          <li>间隔时间以分钟为单位，例如1440表示每24小时（一天）执行一次</li>
          <li>如果"适用学生"字段为空，则自动化适用于所有学生</li>
          <li>可以随时启用/禁用自动化，不会影响已保存的自动化配置</li>
        </ul>
      </div> */}
    </div>
  )
}
