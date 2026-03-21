import { Service } from "../shared/kernel"
import { ClientContext } from "../ClientContext"

export interface AutoScoreRule {
  id: number
  enabled: boolean
  name: string
  studentNames: string[]
  lastExecuted?: string
  triggers?: { event: string; value?: string; relation?: "AND" | "OR" }[]
  actions?: { event: string; value?: string; reason?: string }[]
}

export interface AutoScoreRuleInput {
  enabled: boolean
  name: string
  studentNames: string[]
  triggers?: { event: string; value?: string; relation?: "AND" | "OR" }[]
  actions?: { event: string; value?: string; reason?: string }[]
}

declare module "../shared/kernel" {
  interface Context {
    autoScore: AutoScoreService
  }
}

export class AutoScoreService extends Service {
  constructor(ctx: ClientContext) {
    super(ctx, "autoScore")
  }

  async getRules(): Promise<{ success: boolean; data?: AutoScoreRule[]; message?: string }> {
    return await (window as any).api.invoke("auto-score:getRules", {})
  }

  async addRule(
    rule: AutoScoreRuleInput
  ): Promise<{ success: boolean; data?: number; message?: string }> {
    return await (window as any).api.invoke("auto-score:addRule", rule)
  }

  async updateRule(
    rule: Partial<AutoScoreRule> & { id: number }
  ): Promise<{ success: boolean; data?: boolean; message?: string }> {
    return await (window as any).api.invoke("auto-score:updateRule", rule)
  }

  async deleteRule(
    ruleId: number
  ): Promise<{ success: boolean; data?: boolean; message?: string }> {
    return await (window as any).api.invoke("auto-score:deleteRule", ruleId)
  }

  async toggleRule(
    ruleId: number,
    enabled: boolean
  ): Promise<{ success: boolean; data?: boolean; message?: string }> {
    return await (window as any).api.invoke("auto-score:toggleRule", { ruleId, enabled })
  }

  async sortRules(
    ruleIds: number[]
  ): Promise<{ success: boolean; data?: boolean; message?: string }> {
    return await (window as any).api.invoke("auto-score:sortRules", ruleIds)
  }

  async getStatus(): Promise<{ success: boolean; data?: { enabled: boolean }; message?: string }> {
    return await (window as any).api.invoke("auto-score:getStatus", {})
  }
}
