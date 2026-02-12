import React, { useState, useEffect } from 'react'
import { AddIcon, Delete1Icon, MoveIcon } from 'tdesign-icons-react'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { prism } from 'react-syntax-highlighter/dist/esm/styles/prism'
import {
  Card,
  Form,
  Input,
  InputNumber,
  Button,
  MessagePlugin,
  Table,
  PrimaryTableCol,
  Tag,
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
  intervalMinutes: number
  studentNames: string[]
  scoreValue: number
  reason: string
  lastExecuted?: string
}

interface AutoScoreRuleFormValues {
  name: string
  intervalMinutes: number
  studentNames: string
  scoreValue: number
  reason: string
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
      // 权限检查：确保当前为 admin
      try {
        const authRes = await (window as any).api.authGetStatus()
        if (!authRes || !authRes.success || authRes.data?.permission !== 'admin') {
          MessagePlugin.error('需要管理员权限以查看自动加分自动化，请先登录管理员账号')
          setLoading(false)
          return
        }
      } catch (e) {
        // 如果权限检查失败，继续让后端返回更明确的错误
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

    const values = form.getFieldsValue(true) as unknown as AutoScoreRuleFormValues & {
      timeUnit: string
    }

    if (!values.name || values.intervalMinutes == null || values.scoreValue == null) {
      MessagePlugin.warning('请填写完整信息')
      return
    }

    // 根据单位转换间隔时间
    const intervalMinutes =
      values.timeUnit === 'days' ? values.intervalMinutes * 1440 : values.intervalMinutes

    // 确保 studentNames 是数组类型
    const studentNames = Array.isArray(values.studentNames) ? values.studentNames : []

    const ruleData = {
      enabled: true,
      name: values.name,
      intervalMinutes,
      studentNames,
      scoreValue: values.scoreValue,
      reason: values.reason || `自动化加分 - ${values.name}`
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
          intervalMinutes: undefined,
          studentNames: '',
          scoreValue: undefined,
          reason: '',
          timeUnit: 'minutes'
        })
        setEditingRuleId(null)
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
      intervalMinutes: rule.intervalMinutes,
      studentNames: rule.studentNames.join(', '),
      scoreValue: rule.scoreValue,
      reason: rule.reason
    })
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
      intervalMinutes: undefined,
      studentNames: '',
      scoreValue: undefined,
      reason: ''
    })
    setEditingRuleId(null)
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
      colKey: 'intervalMinutes',
      title: '间隔',
      width: 100,
      cell: ({ row }) => {
        const isDays = row.intervalMinutes >= 1440
        const value = isDays ? row.intervalMinutes / 1440 : row.intervalMinutes
        const unit = isDays ? '天' : '分钟'
        return `${value} ${unit}`
      }
    },
    {
      colKey: 'scoreValue',
      title: '分值',
      width: 80,
      cell: ({ row }) => (
        <Tag theme={row.scoreValue > 0 ? 'success' : 'danger'} variant="light">
          {row.scoreValue > 0 ? `+${row.scoreValue}` : row.scoreValue}
        </Tag>
      )
    },
    {
      colKey: 'studentNames',
      title: '适用学生',
      width: 130,
      cell: ({ row }) => {
        if (row.studentNames.length === 0) {
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
    { colKey: 'reason', title: '理由', width: 130, ellipsis: true },
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

  // 定义触发规则选项
  const triggerOptions = [
    { label: '学生注册', value: 'student_registered' },
    { label: '学生登录', value: 'student_logged_in' },
    { label: '完成作业', value: 'homework_completed' },
    { label: '考试通过', value: 'exam_passed' },
    { label: '参与活动', value: 'event_participated' },
    { label: '签到', value: 'check_in' },
    { label: '其他自定义事件', value: 'custom_event' }
  ]

  const initialTriggers = [
    {
      id: 1,
      triggerEvent: triggerOptions[1],
      description: '当学生登录时触发自动化',
      haveValue: true,
      value: 1
    },
    {
      id: 2,
      triggerEvent: triggerOptions[2],
      description: '当学生完成作业时触发自动化',
      haveValue: true,
      value: '12'
    },
    {
      id: 3,
      triggerEvent: triggerOptions[3],
      description: '当学生考试通过时触发自动化',
      haveValue: false,
      value: null
    }
  ]

  const [triggerList, setTriggerList] = useState(initialTriggers)

  const handleTriggerChange = (id: number, value: string) => {
    setTriggerList((prev) =>
      prev.map((t) =>
        t.id === id
          ? { ...t, triggerEvent: triggerOptions.find((o) => o.value === value) || t.triggerEvent }
          : t
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
    setTriggerList((prev) => [
      ...prev,
      { id: nextId, triggerEvent: triggerOptions[0], description: '', haveValue: false, value: '' }
    ])
  }

  const triggerItems = triggerList
    .filter((t) => t.description !== null)
    .map((triggerTest) => (
      <div key={triggerTest.id} style={{ display: 'flex', gap: 5 }}>
        <Button
          theme="default"
          variant="text"
          icon={<Delete1Icon strokeWidth={2.4} />}
          onClick={() => handleDeleteTrigger(triggerTest.id)}
        />
        <Select
          value={triggerTest.triggerEvent.value}
          style={{ width: '200px' }}
          options={triggerOptions}
          placeholder="请选择触发规则"
          onChange={(value) => handleTriggerChange(triggerTest.id, value as string)}
        />
        {triggerTest.haveValue === true ? (
          <Input
            placeholder="请输入Value"
            style={{ width: '150px' }}
            value={String(triggerTest.value)}
            onChange={(v) =>
              handleValueChange(triggerTest.id, String((v as any).target?.value ?? v))
            }
          />
        ) : null}
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

            <Form.FormItem>
              <Space>
                <Form.FormItem
                  label="间隔时间"
                  name="intervalMinutes"
                  rules={[
                    { required: true, message: '请输入间隔时间' },
                    { min: 1, message: '间隔时间至少为1分钟' }
                  ]}
                  style={{ marginBottom: 0 }}
                >
                  <InputNumber min={1} placeholder="例如：1（每隔1分钟/天执行一次）" />
                </Form.FormItem>
                <Form.FormItem name="timeUnit" initialData="minutes" style={{ marginBottom: 0 }}>
                  <Radio.Group variant="default-filled">
                    <Radio.Button value="days">天</Radio.Button>
                    <Radio.Button value="minutes">分钟</Radio.Button>
                  </Radio.Group>
                </Form.FormItem>
              </Space>
            </Form.FormItem>

            <Form.FormItem
              label="加分值"
              name="scoreValue"
              rules={[{ required: true, message: '请输入加分值' }]}
            >
              <InputNumber placeholder="例如：1（每次加1分）" />
            </Form.FormItem>

            <Form.FormItem label="适用学生" name="studentNames">
              <Select
                filterable
                multiple
                placeholder="请选择或搜索学生（留空表示所有学生）"
                options={students.map((student) => ({ label: student.name, value: student.name }))}
              />
            </Form.FormItem>

            <Form.FormItem label="加分理由" name="reason">
              <Input placeholder="例如：每日签到奖励" />
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
        title="当以下事件触发时"
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
            添加触发器
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
