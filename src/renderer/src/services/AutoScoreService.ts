import { Service } from '../../../shared/kernel'
import { ClientContext } from '../ClientContext'
import { allTriggers, allActions } from '../components/com.automatically'
import type { TriggerItem, ActionItem } from '../components/com.automatically/types'

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

export { allTriggers, allActions }
export type { TriggerItem, ActionItem }

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

  createTriggerItem(triggerList: TriggerItem[]): TriggerItem {
    const nextId = triggerList.length ? Math.max(...triggerList.map((t) => t.id)) + 1 : 1
    const defaultTrigger = allTriggers.list[0]
    return {
      id: nextId,
      eventName: defaultTrigger.eventName,
      value: ''
    }
  }

  updateTriggerEvent(triggerList: TriggerItem[], id: number, eventName: string): TriggerItem[] {
    return triggerList.map((t) =>
      t.id === id ? { ...t, eventName, value: '' } : t
    )
  }

  updateTriggerValue(triggerList: TriggerItem[], id: number, value: string): TriggerItem[] {
    return triggerList.map((t) => (t.id === id ? { ...t, value } : t))
  }

  deleteTriggerItem(triggerList: TriggerItem[], id: number): TriggerItem[] {
    return triggerList.filter((t) => t.id !== id)
  }

  createActionItem(actionList: ActionItem[]): ActionItem {
    const nextId = actionList.length ? Math.max(...actionList.map((a) => a.id)) + 1 : 1
    const defaultAction = allActions.list[0]
    return {
      id: nextId,
      eventName: defaultAction.eventName,
      value: '',
      reason: ''
    }
  }

  updateActionEvent(actionList: ActionItem[], id: number, eventName: string): ActionItem[] {
    return actionList.map((a) =>
      a.id === id ? { ...a, eventName, value: '' } : a
    )
  }

  updateActionValue(actionList: ActionItem[], id: number, value: string): ActionItem[] {
    return actionList.map((a) => (a.id === id ? { ...a, value } : a))
  }

  updateActionReason(actionList: ActionItem[], id: number, reason: string): ActionItem[] {
    return actionList.map((a) => (a.id === id ? { ...a, reason } : a))
  }

  deleteActionItem(actionList: ActionItem[], id: number): ActionItem[] {
    return actionList.filter((a) => a.id !== id)
  }
}
