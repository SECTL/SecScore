import React, { useState, useEffect } from 'react'
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
  Popconfirm
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
  const [loading, setLoading] = useState(false)
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
          MessagePlugin.error('需要管理员权限以查看自动加分规则，请先登录管理员账号')
          setLoading(false)
          return
        }
      } catch (e) {
        // 如果权限检查失败，继续让后端返回更明确的错误
        console.warn('Auth check failed', e)
      }

      const res = await (window as any).api.invoke('auto-score:getRules', {})
      if (res.success) {
        setRules(res.data)
      } else {
        MessagePlugin.error(res.message || '获取规则失败')
      }
    } catch (error) {
      console.error('Failed to fetch auto score rules:', error)
      MessagePlugin.error('获取规则失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchRules()
  }, [])

  const handleSubmit = async () => {
    if (!(window as any).api) return
    
    // 修复类型转换错误，使用更安全的方式获取表单值
    const values = form.getFieldsValue(true) as unknown as AutoScoreRuleFormValues
    
    if (!values.name || values.intervalMinutes == null || values.scoreValue == null) {
      MessagePlugin.warning('请填写完整信息')
      return
    }

    // 解析学生姓名列表（以逗号分隔）
    const studentNames = values.studentNames
      ? values.studentNames.split(',').map(name => name.trim()).filter(name => name)
      : []

    const ruleData = {
      enabled: true, // 默认启用新规则
      name: values.name,
      intervalMinutes: values.intervalMinutes,
      studentNames,
      scoreValue: values.scoreValue,
      reason: values.reason || `自动化加分 - ${values.name}`
    }

    // 权限检查：仅管理员可创建/更新规则
    try {
      const authRes = await (window as any).api.authGetStatus()
      if (!authRes || !authRes.success || authRes.data?.permission !== 'admin') {
        MessagePlugin.error('需要管理员权限以创建或更新自动加分规则')
        return
      }
    } catch (e) {
      console.warn('Auth check failed', e)
    }

    try {
      let res
      if (editingRuleId !== null) {
        // 更新现有规则
        res = await (window as any).api.invoke('auto-score:updateRule', {
          id: editingRuleId,
          ...ruleData
        })
      } else {
        // 创建新规则
        res = await (window as any).api.invoke('auto-score:addRule', ruleData)
      }

      if (res.success) {
        MessagePlugin.success(editingRuleId !== null ? '规则更新成功' : '规则创建成功')
        form.reset()
        setEditingRuleId(null)
        fetchRules() // 刷新规则列表
      } else {
        MessagePlugin.error(res.message || (editingRuleId !== null ? '更新规则失败' : '创建规则失败'))
      }
    } catch (error) {
      console.error('Failed to submit auto score rule:', error)
      MessagePlugin.error(editingRuleId !== null ? '更新规则失败' : '创建规则失败')
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
        MessagePlugin.error('需要管理员权限以删除自动加分规则')
        return
      }
    } catch (e) {
      console.warn('Auth check failed', e)
    }

    try {
      const res = await (window as any).api.invoke('auto-score:deleteRule', ruleId)
      if (res.success) {
        MessagePlugin.success('规则删除成功')
        fetchRules() // 刷新规则列表
      } else {
        MessagePlugin.error(res.message || '删除规则失败')
      }
    } catch (error) {
      console.error('Failed to delete auto score rule:', error)
      MessagePlugin.error('删除规则失败')
    }
  }

  const handleToggle = async (ruleId: number, enabled: boolean) => {
    if (!(window as any).api) return
    // 权限检查
    try {
      const authRes = await (window as any).api.authGetStatus()
      if (!authRes || !authRes.success || authRes.data?.permission !== 'admin') {
        MessagePlugin.error('需要管理员权限以启用/禁用自动加分规则')
        return
      }
    } catch (e) {
      console.warn('Auth check failed', e)
    }

    try {
      const res = await (window as any).api.invoke('auto-score:toggleRule', { ruleId, enabled })
      if (res.success) {
        MessagePlugin.success(enabled ? '规则已启用' : '规则已禁用')
        fetchRules() // 刷新规则列表
      } else {
        MessagePlugin.error(res.message || (enabled ? '启用规则失败' : '禁用规则失败'))
      }
    } catch (error) {
      console.error('Failed to toggle auto score rule:', error)
      MessagePlugin.error(enabled ? '启用规则失败' : '禁用规则失败')
    }
  }

  const handleResetForm = () => {
    form.reset()
    setEditingRuleId(null)
  }

  const columns: PrimaryTableCol<AutoScoreRule>[] = [
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
    { colKey: 'name', title: '规则名称', width: 150 },
    {
      colKey: 'intervalMinutes',
      title: '间隔',
      width: 100,
      cell: ({ row }) => `${row.intervalMinutes} 分钟`
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
      width: 150,
      cell: ({ row }) => {
        if (row.studentNames.length === 0) {
          return <span>所有学生</span>
        }
        return <span title={row.studentNames.join(', ')}>{row.studentNames.length} 名学生</span>
      }
    },
    { colKey: 'reason', title: '理由', ellipsis: true },
    {
      colKey: 'lastExecuted',
      title: '最后执行',
      width: 150,
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
          <Button
            size="small"
            variant="outline"
            onClick={() => handleEdit(row)}
          >
            编辑
          </Button>
          <Popconfirm
            content="确定要删除这条规则吗？"
            onConfirm={() => handleDelete(row.id)}
          >
            <Button size="small" variant="outline" theme="danger">
              删除
            </Button>
          </Popconfirm>
        </Space>
      )
    }
  ]

  return (
    <div style={{ padding: '24px' }}>
      <h2 style={{ marginBottom: '24px', color: 'var(--ss-text-main)' }}>自动化加分管理</h2>

      <Card style={{ marginBottom: '24px', backgroundColor: 'var(--ss-card-bg)' }}>
        <Form
          form={form}
          labelWidth={100}
          onReset={handleResetForm}
        >
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
            <Form.FormItem
              label="规则名称"
              name="name"
              rules={[{ required: true, message: '请输入规则名称' }]}
            >
              <Input placeholder="例如：每日签到加分" />
            </Form.FormItem>

            <Form.FormItem
              label="间隔时间(分钟)"
              name="intervalMinutes"
              rules={[
                { required: true, message: '请输入间隔时间' },
                { min: 1, message: '间隔时间至少为1分钟' }
              ]}
            >
              <InputNumber min={1} placeholder="例如：1440（每天）" />
            </Form.FormItem>

            <Form.FormItem
              label="加分值"
              name="scoreValue"
              rules={[{ required: true, message: '请输入加分值' }]}
            >
              <InputNumber placeholder="例如：1（每次加1分）" />
            </Form.FormItem>

            <Form.FormItem
              label="适用学生"
              name="studentNames"
            >
              <Input placeholder="留空表示所有学生，多个学生用逗号分隔" />
            </Form.FormItem>

            <Form.FormItem
              label="加分理由"
              name="reason"
            >
              <Input placeholder="例如：每日签到奖励" />
            </Form.FormItem>
          </div>

          <div style={{ marginTop: '24px', display: 'flex', gap: '12px' }}>
            <Button
              theme="primary"
              onClick={handleSubmit}
            >
              {editingRuleId !== null ? '更新规则' : '添加规则'}
            </Button>
            <Button
              type="reset"
              variant="outline"
            >
              {editingRuleId !== null ? '取消编辑' : '重置表单'}
            </Button>
          </div>
        </Form>
      </Card>

      <Card style={{ backgroundColor: 'var(--ss-card-bg)' }}>
        <Table
          data={rules}
          columns={columns}
          rowKey="id"
          loading={loading}
          pagination={{ defaultPageSize: 10 }}
          style={{ color: 'var(--ss-text-main)' }}
        />
      </Card>

      <div style={{ marginTop: '24px', padding: '16px', backgroundColor: 'var(--ss-card-bg)', borderRadius: '8px' }}>
        <h3 style={{ marginBottom: '12px', color: 'var(--ss-text-main)' }}>使用说明</h3>
        <ul style={{ color: 'var(--ss-text-secondary)', lineHeight: '1.6' }}>
          <li>自动化加分功能会按照设定的时间间隔自动为学生加分</li>
          <li>间隔时间以分钟为单位，例如1440表示每24小时（一天）执行一次</li>
          <li>如果"适用学生"字段为空，则规则适用于所有学生</li>
          <li>可以随时启用/禁用规则，不会影响已保存的规则配置</li>
        </ul>
      </div>
    </div>
  )
}