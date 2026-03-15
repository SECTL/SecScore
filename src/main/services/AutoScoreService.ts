import { Service } from '../../shared/kernel'
import { MainContext } from '../context'
import {
  AutoScoreRuleEngine,
  type RuleConfig,
  type AutoScoreContext
} from '../../shared/autoScore/AutoScoreRuleEngine'

interface AutoScoreRule extends RuleConfig {
  id: number
  lastExecuted?: Date
}

declare module '../../shared/kernel' {
  interface Context {
    autoScore: AutoScoreService
  }
}

export class AutoScoreService extends Service {
  private rules: AutoScoreRule[] = []
  private timers: Map<number, NodeJS.Timeout> = new Map()
  private initialized = false
  private ruleEngine: AutoScoreRuleEngine

  constructor(ctx: MainContext) {
    super(ctx, 'autoScore')
    this.ruleEngine = new AutoScoreRuleEngine()
    this.registerIpc()
  }

  private get mainCtx() {
    return this.ctx as MainContext
  }

  private registerIpc() {
    this.mainCtx.handle('auto-score:getRules', async (event) => {
      try {
        if (!this.mainCtx.permissions.requirePermission(event, 'admin'))
          return { success: false, message: 'Permission denied' }
        return { success: true, data: this.getRules() }
      } catch (err: any) {
        return { success: false, message: err.message }
      }
    })

    this.mainCtx.handle('auto-score:addRule', async (event, rule) => {
      try {
        if (!this.mainCtx.permissions.requirePermission(event, 'admin'))
          return { success: false, message: 'Permission denied' }
        const id = await this.addRule(rule)
        return { success: true, data: id }
      } catch (err: any) {
        return { success: false, message: err.message }
      }
    })

    this.mainCtx.handle('auto-score:updateRule', async (event, rule) => {
      try {
        if (!this.mainCtx.permissions.requirePermission(event, 'admin'))
          return { success: false, message: 'Permission denied' }
        const success = await this.updateRule(rule)
        return { success, data: success }
      } catch (err: any) {
        return { success: false, message: err.message }
      }
    })

    this.mainCtx.handle('auto-score:deleteRule', async (event, ruleId) => {
      try {
        if (!this.mainCtx.permissions.requirePermission(event, 'admin'))
          return { success: false, message: 'Permission denied' }
        const success = await this.deleteRule(ruleId)
        return { success, data: success }
      } catch (err: any) {
        return { success: false, message: err.message }
      }
    })

    this.mainCtx.handle('auto-score:toggleRule', async (event, params) => {
      try {
        if (!this.mainCtx.permissions.requirePermission(event, 'admin'))
          return { success: false, message: 'Permission denied' }
        const { ruleId, enabled } = params
        const success = await this.toggleRule(ruleId, enabled)
        return { success, data: success }
      } catch (err: any) {
        return { success: false, message: err.message }
      }
    })

    this.mainCtx.handle('auto-score:getStatus', async (event) => {
      try {
        if (!this.mainCtx.permissions.requirePermission(event, 'admin'))
          return { success: false, message: 'Permission denied' }
        return { success: true, data: { enabled: this.isEnabled() } }
      } catch (err: any) {
        return { success: false, message: err.message }
      }
    })

    this.mainCtx.handle('auto-score:sortRules', async (event, ruleIds) => {
      try {
        if (!this.mainCtx.permissions.requirePermission(event, 'admin'))
          return { success: false, message: 'Permission denied' }
        const success = await this.sortRules(ruleIds)
        return { success, data: success }
      } catch (err: any) {
        return { success: false, message: err.message }
      }
    })
  }

  private async loadRulesFromFile(): Promise<void> {
    await this.loadRulesFromSettings()
  }

  private async loadRulesFromSettings() {
    try {
      const settings = await this.mainCtx.settings.getAllRaw()
      const autoScoreRulesStr = settings['auto_score_rules'] || '[]'
      const rulesFromSettings = JSON.parse(autoScoreRulesStr)

      this.rules = rulesFromSettings.map((rule: any) => ({
        ...rule,
        lastExecuted: rule.lastExecuted ? new Date(rule.lastExecuted) : undefined
      }))
    } catch (error) {
      this.logger.error('Failed to load auto score rules from settings:', { error })
      this.rules = []
    }
  }

  private async saveRulesToFile(): Promise<void> {
    await this.saveRulesToSettings()
  }

  private async saveRulesToSettings() {
    try {
      const rulesToSave = this.rules.map(({ lastExecuted, ...rule }) => ({
        ...rule,
        lastExecuted: lastExecuted?.toISOString()
      }))
      await this.mainCtx.settings.setRaw('auto_score_rules', JSON.stringify(rulesToSave))
    } catch (error) {
      this.logger.error('Failed to save auto score rules to settings:', { error })
    }
  }

  private async startRules() {
    if (this.initialized) {
      this.stopRules()
    }

    this.ruleEngine = new AutoScoreRuleEngine()

    for (const rule of this.rules) {
      if (rule.enabled) {
        await this.ruleEngine.addRule(rule)
        this.startRuleTimer(rule)
      }
    }

    this.initialized = true
  }

  private startRuleTimer(rule: AutoScoreRule) {
    if (this.timers.has(rule.id)) {
      clearTimeout(this.timers.get(rule.id)!)
      this.timers.delete(rule.id)
    }

    const now = new Date()
    let delayMs = 0
    let primaryTrigger: { event: string; value?: string } | undefined

    for (const trigger of rule.triggers || []) {
      if (trigger.event === 'interval_time_passed') {
        const minutes = parseInt(trigger.value || '30', 10)
        const intervalMs = minutes * 60 * 1000

        let nextExecuteTime: Date
        if (rule.lastExecuted) {
          nextExecuteTime = new Date(rule.lastExecuted.getTime() + intervalMs)
        } else {
          nextExecuteTime = new Date(now.getTime() + intervalMs)
        }

        const triggerDelayMs = nextExecuteTime.getTime() - now.getTime()
        if (delayMs === 0 || triggerDelayMs < delayMs) {
          delayMs = triggerDelayMs
          primaryTrigger = trigger
        }
      }
    }

    if (!primaryTrigger) {
      this.logger.warn(`Rule ${rule.name} has no valid triggers with timing logic, skipping`)
      return
    }

    if (delayMs < 0) {
      delayMs = 0
    }

    const timer = setTimeout(() => {
      this.executeRule(rule)
      this.setRuleInterval(rule)
    }, delayMs)

    this.timers.set(rule.id, timer)
    this.logger.info(`Rule ${rule.name} scheduled to execute in ${delayMs}ms`)
  }

  private setRuleInterval(rule: AutoScoreRule) {
    const now = new Date()
    let minDelayMs = Infinity
    let primaryTrigger: { event: string; value?: string } | undefined

    for (const trigger of rule.triggers || []) {
      if (trigger.event === 'interval_time_passed') {
        const minutes = parseInt(trigger.value || '30', 10)
        const intervalMs = minutes * 60 * 1000

        let nextExecuteTime: Date
        if (rule.lastExecuted) {
          nextExecuteTime = new Date(rule.lastExecuted.getTime() + intervalMs)
        } else {
          nextExecuteTime = new Date(now.getTime() + intervalMs)
        }

        const triggerDelayMs = nextExecuteTime.getTime() - now.getTime()
        if (triggerDelayMs < minDelayMs) {
          minDelayMs = triggerDelayMs
          primaryTrigger = trigger
        }
      }
    }

    if (!primaryTrigger || minDelayMs === Infinity) {
      return
    }

    const timer = setInterval(() => {
      this.executeRule(rule)
    }, minDelayMs)

    this.timers.set(rule.id, timer)
  }

  private async executeRule(rule: AutoScoreRule) {
    try {
      this.logger.info(`Executing auto score rule: ${rule.name}`)

      const studentRepo = this.mainCtx.students
      const eventRepo = this.mainCtx.events

      const allStudents = await studentRepo.findAll()

      let studentsToScore = allStudents
      if (rule.studentNames.length > 0) {
        studentsToScore = allStudents.filter((s) => rule.studentNames.includes(s.name))
      }

      const studentNames = studentsToScore.map((s) => s.name)
      const lastScoreTimeMap = await eventRepo.getLastScoreTimeByStudents(studentNames)

      const context: AutoScoreContext = {
        students: studentsToScore.map((s) => ({
          id: s.id,
          name: s.name,
          tags: s.tags || [],
          lastScoreTime: lastScoreTimeMap.get(s.name) || new Date(0)
        })),
        events: [],
        rule: {
          id: rule.id,
          name: rule.name,
          studentNames: rule.studentNames,
          triggers: rule.triggers,
          actions: rule.actions
        },
        now: new Date()
      }

      const results = await this.ruleEngine.run(context)

      for (const result of results) {
        if (result.matchedStudents.length > 0) {
          for (const action of result.actions) {
            await this.ruleEngine.executeAction(
              action.event,
              result.matchedStudents,
              {
                ...action,
                ruleId: rule.id,
                ruleName: rule.name,
                studentRepo
              },
              eventRepo
            )
          }
        }
      }

      rule.lastExecuted = new Date()
      await this.saveRulesToFile()

      this.logger.info(
        `Auto score rule executed successfully for ${results.reduce((sum, r) => sum + r.matchedStudents.length, 0)} students`
      )
    } catch (error) {
      this.logger.error(`Failed to execute auto score rule ${rule.name}:`, { error })
    }
  }

  private stopRules() {
    for (const timer of this.timers.values()) {
      clearTimeout(timer)
      clearInterval(timer)
    }
    this.timers.clear()
  }

  async addRule(rule: Omit<AutoScoreRule, 'id' | 'lastExecuted'>): Promise<number> {
    const newId = this.rules.length > 0 ? Math.max(...this.rules.map((r) => r.id)) + 1 : 1
    const newRule: AutoScoreRule = {
      ...rule,
      id: newId,
      lastExecuted: undefined
    }

    this.rules.push(newRule)
    await this.saveRulesToFile()

    if (rule.enabled) {
      await this.ruleEngine.addRule(newRule)
      this.startRuleTimer(newRule)
    }

    return newId
  }

  async updateRule(rule: Partial<AutoScoreRule> & { id: number }): Promise<boolean> {
    const index = this.rules.findIndex((r) => r.id === rule.id)
    if (index === -1) return false

    if (this.timers.has(rule.id)) {
      clearTimeout(this.timers.get(rule.id)!)
      clearInterval(this.timers.get(rule.id)!)
      this.timers.delete(rule.id)
    }

    const updatedRule = { ...this.rules[index], ...rule }
    this.rules[index] = updatedRule

    await this.saveRulesToFile()

    if (updatedRule.enabled) {
      await this.ruleEngine.addRule(updatedRule)
      this.startRuleTimer(updatedRule)
    }

    return true
  }

  async deleteRule(ruleId: number): Promise<boolean> {
    const index = this.rules.findIndex((r) => r.id === ruleId)
    if (index === -1) return false

    if (this.timers.has(ruleId)) {
      clearTimeout(this.timers.get(ruleId)!)
      clearInterval(this.timers.get(ruleId)!)
      this.timers.delete(ruleId)
    }

    this.rules.splice(index, 1)
    await this.saveRulesToFile()

    return true
  }

  async toggleRule(ruleId: number, enabled: boolean): Promise<boolean> {
    const rule = this.rules.find((r) => r.id === ruleId)
    if (!rule) return false

    rule.enabled = enabled

    if (this.timers.has(ruleId)) {
      clearTimeout(this.timers.get(ruleId)!)
      clearInterval(this.timers.get(ruleId)!)
      this.timers.delete(ruleId)
    }

    if (enabled) {
      await this.ruleEngine.addRule(rule)
      this.startRuleTimer(rule)
    }

    await this.saveRulesToFile()
    return true
  }

  async sortRules(ruleIds: number[]): Promise<boolean> {
    const ruleMap = new Map(this.rules.map((r) => [r.id, r]))
    const sortedRules: AutoScoreRule[] = []
    for (const id of ruleIds) {
      const rule = ruleMap.get(id)
      if (rule) {
        sortedRules.push(rule)
      }
    }
    for (const rule of this.rules) {
      if (!ruleIds.includes(rule.id)) {
        sortedRules.push(rule)
      }
    }
    this.rules = sortedRules
    await this.saveRulesToFile()
    return true
  }

  getRules(): AutoScoreRule[] {
    return [...this.rules]
  }

  isEnabled(): boolean {
    return this.rules.some((rule) => rule.enabled)
  }

  async restart() {
    this.stopRules()
    await this.loadRulesFromFile()
    this.startRules()
  }

  async initialize(): Promise<void> {
    await this.loadRulesFromFile()
    this.startRules()
  }

  async dispose(): Promise<void> {
    this.stopRules()
  }
}
