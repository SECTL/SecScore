import React from 'react'
import { Service } from '../../../shared/kernel'
import { ClientContext } from '../ClientContext'
import { Input, Select } from 'tdesign-react'

export interface AutoScoreRule {
  id: number
  enabled: boolean
  name: string
  studentNames: string[]
  lastExecuted?: string
  triggers?: { event: string; value?: string }[]
  actions?: { event: string; value?: string; reason?: string }[]
}

export interface AutoScoreRuleInput {
  enabled: boolean
  name: string
  studentNames: string[]
  triggers?: { event: string; value?: string }[]
  actions?: { event: string; value?: string; reason?: string }[]
}

declare module '../../../shared/kernel' {
  interface Context {
    autoScore: AutoScoreService
  }
}

type RenderConfig = {
  component?: React.ElementType
  props?: Record<string, any>
  render?: (props: any) => React.ReactNode
}

type TriggerDef = {
  id: number
  label: string
  description: string
  eventName: string
  valueType?: React.ElementType
  renderConfig?: RenderConfig
}

export const allTriggers: TriggerDef[] = [
  {
    id: 1,
    label: '根据间隔时间触发',
    description: '当学生注册时触发自动化',
    eventName: 'interval_time_passed',
    valueType: Input
  },
  {
    id: 2,
    label: '按照学生标签触发',
    description: '当学生完成作业时触发自动化',
    eventName: 'student_tag_matched',
    valueType: Input
  },
  {
    id: 3,
    label: '随机时间触发',
    description: '当随机时间到达时触发自动化',
    eventName: 'random_time_reached'
  }
]

// 触发器和行动项类型定义
export type TriggerItem = {
  id: number
  eventName: string
  value?: string
  valueType?: React.ElementType
}

export type ActionItem = {
  id: number
  eventName: string
  value?: string
  reason?: string
  valueType?: React.ElementType
}

export const allActions: TriggerDef[] = [
  {
    id: 1,
    label: '添加分数',
    description: '为学生添加分数',
    eventName: 'add_score',
    valueType: Input,
    renderConfig: {
      component: Input,
      props: {
        placeholder: '请输入分数',
        style: { width: '150px' }
      }
    }
  },
  {
    id: 2,
    label: '添加标签',
    description: '为学生添加标签',
    eventName: 'add_tag',
    valueType: Input,
    renderConfig: {
      component: Input,
      props: {
        placeholder: '请输入标签',
        style: { width: '150px' }
      }
    }
  },
  {
    id: 3,
    label: '发送通知',
    description: '向学生发送通知',
    eventName: 'send_notification',
    valueType: Input,
    renderConfig: {
      component: Input,
      props: {
        placeholder: '请输入通知内容',
        style: { width: '150px' }
      }
    }
  },
  {
    id: 4,
    label: '设置学生状态',
    description: '设置学生的状态',
    eventName: 'set_student_status',
    valueType: Select,
    renderConfig: {
      component: Select,
      props: {
        placeholder: '请选择状态',
        style: { width: '150px' },
        options: [
          { label: '活跃', value: 'active' },
          { label: '不活跃', value: 'inactive' },
          { label: '请假', value: 'leave' }
        ]
      }
    }
  }
]

export class AutoScoreService extends Service {
  constructor(ctx: ClientContext) {
    super(ctx, 'autoScore')
  }

  async getRules(): Promise<{ success: boolean; data?: AutoScoreRule[]; message?: string }> {
    return await (window as any).api.invoke('auto-score:getRules', {})
  }

  async addRule(
    rule: AutoScoreRuleInput
  ): Promise<{ success: boolean; data?: number; message?: string }> {
    return await (window as any).api.invoke('auto-score:addRule', rule)
  }

  async updateRule(
    rule: Partial<AutoScoreRule> & { id: number }
  ): Promise<{ success: boolean; data?: boolean; message?: string }> {
    return await (window as any).api.invoke('auto-score:updateRule', rule)
  }

  async deleteRule(
    ruleId: number
  ): Promise<{ success: boolean; data?: boolean; message?: string }> {
    return await (window as any).api.invoke('auto-score:deleteRule', ruleId)
  }

  async toggleRule(
    ruleId: number,
    enabled: boolean
  ): Promise<{ success: boolean; data?: boolean; message?: string }> {
    return await (window as any).api.invoke('auto-score:toggleRule', { ruleId, enabled })
  }

  async getStatus(): Promise<{ success: boolean; data?: { enabled: boolean }; message?: string }> {
    return await (window as any).api.invoke('auto-score:getStatus', {})
  }

  // 触发器管理相关函数
  createTriggerItem(triggerList: TriggerItem[]): TriggerItem {
    const nextId = triggerList.length ? Math.max(...triggerList.map((t) => t.id)) + 1 : 1
    const defaultTrigger = allTriggers[0]
    return {
      id: nextId,
      eventName: defaultTrigger.eventName,
      valueType: defaultTrigger.valueType,
      value: ''
    }
  }

  updateTriggerEvent(triggerList: TriggerItem[], id: number, eventName: string): TriggerItem[] {
    const found = allTriggers.find((a) => a.eventName === eventName)
    return triggerList.map((t) =>
      t.id === id ? { ...t, eventName, valueType: found?.valueType, value: '' } : t
    )
  }

  updateTriggerValue(triggerList: TriggerItem[], id: number, value: string): TriggerItem[] {
    return triggerList.map((t) => (t.id === id ? { ...t, value } : t))
  }

  deleteTriggerItem(triggerList: TriggerItem[], id: number): TriggerItem[] {
    return triggerList.filter((t) => t.id !== id)
  }

  // 行动管理相关函数
  createActionItem(actionList: ActionItem[]): ActionItem {
    const nextId = actionList.length ? Math.max(...actionList.map((a) => a.id)) + 1 : 1
    const defaultAction = allActions[0]
    return {
      id: nextId,
      eventName: defaultAction.eventName,
      valueType: defaultAction.valueType,
      value: ''
    }
  }

  updateActionEvent(actionList: ActionItem[], id: number, eventName: string): ActionItem[] {
    const found = allActions.find((a) => a.eventName === eventName)
    return actionList.map((a) =>
      a.id === id ? { ...a, eventName, valueType: found?.valueType, value: '' } : a
    )
  }

  updateActionValue(actionList: ActionItem[], id: number, value: string): ActionItem[] {
    return actionList.map((a) => (a.id === id ? { ...a, value } : a))
  }

  deleteActionItem(actionList: ActionItem[], id: number): ActionItem[] {
    return actionList.filter((a) => a.id !== id)
  }
}
