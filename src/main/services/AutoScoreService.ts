import { Service } from '../../shared/kernel'
import { MainContext } from '../context'
import { student } from '../repos/StudentRepository'
import { getTriggerLogic } from '../../shared/triggers'

interface AutoScoreRule {
  id: number
  enabled: boolean
  name: string
  studentNames: string[]
  lastExecuted?: Date
  triggers?: { event: string; value?: string }[]
  actions?: { event: string; value?: string; reason?: string }[]
}

interface AutoScoreRuleFileData {
  id: number
  enabled: boolean
  name: string
  studentNames: string[]
  lastExecuted?: string
  triggers?: { event: string; value?: string }[]
  actions?: { event: string; value?: string; reason?: string }[]
}

interface AutoScoreRulesFile {
  version: number
  rules: AutoScoreRuleFileData[]
  updatedAt?: string
}

declare module '../../shared/kernel' {
  interface Context {
    autoScore: AutoScoreService
  }
}

const RULES_FILE_NAME = 'auto-score-rules.json'

export class AutoScoreService extends Service {
  private rules: AutoScoreRule[] = []
  private timers: Map<number, NodeJS.Timeout> = new Map()
  private initialized = false

  constructor(ctx: MainContext) {
    super(ctx, 'autoScore')
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
  }

  private async loadRulesFromFile(): Promise<void> {
    try {
      const fs = this.mainCtx.fileSystem
      if (!fs) {
        this.logger.warn('FileSystemService not available, falling back to settings')
        await this.loadRulesFromSettings()
        return
      }

      const data = await fs.readJsonFile<AutoScoreRulesFile>(RULES_FILE_NAME, 'automatic')
      if (data && data.rules) {
        this.rules = data.rules.map((rule: any) => {
          const migratedRule = this.migrateRule(rule)
          return {
            ...migratedRule,
            lastExecuted: migratedRule.lastExecuted
              ? new Date(migratedRule.lastExecuted)
              : undefined
          }
        })
        if (
          data.rules.some(
            (rule: any) => rule.intervalMinutes !== undefined || rule.scoreValue !== undefined
          )
        ) {
          await this.saveRulesToFile()
        }
      } else {
        await this.loadRulesFromSettings()
        await this.saveRulesToFile()
      }
    } catch (error) {
      this.logger.warn('Failed to load auto score rules from file, falling back to settings', {
        error
      })
      await this.loadRulesFromSettings()
    }
  }

  private migrateRule(rule: any): AutoScoreRule {
    if (!rule.intervalMinutes && !rule.scoreValue) {
      return rule
    }

    const migratedRule: AutoScoreRule = {
      id: rule.id,
      enabled: rule.enabled,
      name: rule.name,
      studentNames: rule.studentNames || [],
      lastExecuted: rule.lastExecuted,
      triggers: rule.triggers || [],
      actions: rule.actions || []
    }

    if (
      rule.intervalMinutes &&
      !migratedRule.triggers?.find((t) => t.event === 'interval_time_passed')
    ) {
      migratedRule.triggers = migratedRule.triggers || []
      migratedRule.triggers.push({
        event: 'interval_time_passed',
        value: String(rule.intervalMinutes)
      })
    }

    if (
      rule.scoreValue !== undefined &&
      !migratedRule.actions?.find((a) => a.event === 'add_score')
    ) {
      migratedRule.actions = migratedRule.actions || []
      migratedRule.actions.push({
        event: 'add_score',
        value: String(rule.scoreValue),
        reason: rule.reason
      })
    }

    return migratedRule
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
    try {
      const fs = this.mainCtx.fileSystem
      if (!fs) {
        this.logger.warn('FileSystemService not available, falling back to settings')
        await this.saveRulesToSettings()
        return
      }

      const data: AutoScoreRulesFile = {
        version: 1,
        rules: this.rules.map(({ lastExecuted, ...rule }) => ({
          ...rule,
          lastExecuted: lastExecuted?.toISOString()
        })),
        updatedAt: new Date().toISOString()
      }

      const success = await fs.writeJsonFile(RULES_FILE_NAME, data, 'automatic')
      if (!success) {
        this.logger.warn('Failed to save rules to file, falling back to settings')
        await this.saveRulesToSettings()
      }
    } catch (error) {
      this.logger.error('Failed to save auto score rules to file:', { error })
      await this.saveRulesToSettings()
    }
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

    for (const rule of this.rules) {
      if (rule.enabled) {
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
      const logic = getTriggerLogic(trigger.event)
      if (logic?.calculateNextTime) {
        const result = logic.calculateNextTime(trigger.value || '', rule.lastExecuted, now)
        if (delayMs === 0 || result.delayMs < delayMs) {
          delayMs = result.delayMs
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
      const logic = getTriggerLogic(trigger.event)
      if (logic?.calculateNextTime) {
        const result = logic.calculateNextTime(trigger.value || '', rule.lastExecuted, now)
        if (result.delayMs < minDelayMs) {
          minDelayMs = result.delayMs
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

      let studentsToScore: student[] = []
      if (rule.studentNames.length === 0) {
        const allStudents = await studentRepo.findAll()
        studentsToScore = allStudents
      } else {
        const allStudents = await studentRepo.findAll()
        for (const name of rule.studentNames) {
          const student = allStudents.find((s) => s.name === name)
          if (student) {
            studentsToScore.push(student)
          }
        }
      }

      for (const trigger of rule.triggers || []) {
        const logic = getTriggerLogic(trigger.event)
        if (logic?.check) {
          const context = {
            students: studentsToScore,
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
          const result = logic.check(context, trigger.value || '')
          if (result.matchedStudents && result.matchedStudents.length > 0) {
            studentsToScore = result.matchedStudents
          }
        }
      }

      for (const action of rule.actions || []) {
        await this.executeAction(action, studentsToScore, rule.name)
      }

      rule.lastExecuted = new Date()
      await this.saveRulesToFile()

      this.logger.info(
        `Auto score rule executed successfully for ${studentsToScore.length} students`
      )
    } catch (error) {
      this.logger.error(`Failed to execute auto score rule ${rule.name}:`, { error })
    }
  }

  private async executeAction(
    action: { event: string; value?: string; reason?: string },
    students: student[],
    ruleName: string
  ) {
    const eventRepo = this.mainCtx.events

    switch (action.event) {
      case 'add_score': {
        const scoreValue = action.value ? parseInt(action.value, 10) : 0
        const reason = action.reason || `自动化加分 - ${ruleName}`
        for (const student of students) {
          await eventRepo.create({
            student_name: student.name,
            reason_content: reason,
            delta: scoreValue
          })
        }
        break
      }
      case 'add_tag': {
        const tagName = action.value
        if (tagName) {
          const studentRepo = this.mainCtx.students
          for (const student of students) {
            const currentTags = student.tags || []
            if (!currentTags.includes(tagName)) {
              await studentRepo.update(student.id, {
                tags: [...currentTags, tagName]
              })
            }
          }
        }
        break
      }
      case 'send_notification': {
        this.logger.info(`Notification action: ${action.value}`)
        break
      }
      case 'set_student_status': {
        this.logger.info(`Set student status action: ${action.value} (not implemented - student type has no status field)`)
        break
      }
      default:
        this.logger.warn(`Unknown action event: ${action.event}`)
    }
  }

  private stopRules() {
    for (const [timer] of this.timers) {
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
      this.startRuleTimer(rule)
    }

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
