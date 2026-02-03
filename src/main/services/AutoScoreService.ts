import { Service } from '../../shared/kernel'
import { MainContext } from '../context'
import { student } from '../repos/StudentRepository'

interface AutoScoreRule {
  id: number
  enabled: boolean
  name: string
  intervalMinutes: number // 间隔分钟数
  studentNames: string[] // 学生姓名列表，空数组代表所有学生
  scoreValue: number // 每次加分值
  reason: string // 加分理由
  lastExecuted?: Date // 最后执行时间
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

  constructor(ctx: MainContext) {
    super(ctx, 'autoScore')
    this.registerIpc()
    this.loadRulesFromSettings()
    this.startRules()
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

  private async loadRulesFromSettings() {
    try {
      // 从设置中加载自动化规则
      const settings = await this.mainCtx.settings.getAllRaw()
      const autoScoreRulesStr = settings['auto_score_rules'] || '[]'
      const rulesFromSettings = JSON.parse(autoScoreRulesStr)
      
      this.rules = rulesFromSettings.map((rule: any) => ({
        ...rule,
        lastExecuted: rule.lastExecuted ? new Date(rule.lastExecuted) : undefined
      }))
    } catch (error) {
      console.error('Failed to load auto score rules from settings:', error)
      this.rules = []
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
      console.error('Failed to save auto score rules to settings:', error)
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
    // 清除现有的定时器
    if (this.timers.has(rule.id)) {
      clearTimeout(this.timers.get(rule.id)!)
      this.timers.delete(rule.id)
    }

    // 计算下次执行时间
    const now = new Date()
    const intervalMs = rule.intervalMinutes * 60 * 1000
    
    // 如果规则之前执行过，计算从上次执行到现在需要等待的时间
    let delayMs = intervalMs
    if (rule.lastExecuted) {
      const timeSinceLastExecution = now.getTime() - rule.lastExecuted.getTime()
      delayMs = intervalMs - (timeSinceLastExecution % intervalMs)
      // 如果已经超过了间隔时间，立即执行
      if (timeSinceLastExecution >= intervalMs) {
        delayMs = 0
      }
    }

    const timer = setTimeout(() => {
      this.executeRule(rule)
      // 设置重复执行
      this.setRuleInterval(rule)
    }, delayMs)

    this.timers.set(rule.id, timer)
  }

  private setRuleInterval(rule: AutoScoreRule) {
    const intervalMs = rule.intervalMinutes * 60 * 1000
    const timer = setInterval(() => {
      this.executeRule(rule)
    }, intervalMs)

    this.timers.set(rule.id, timer)
  }

  private async executeRule(rule: AutoScoreRule) {
    try {
      console.log(`Executing auto score rule: ${rule.name}`)
      
      const studentRepo = this.mainCtx.students
      const eventRepo = this.mainCtx.events

      let studentsToScore: student[] = []
      if (rule.studentNames.length === 0) {
        // 如果没有指定学生，对所有学生加分
        const allStudents = await studentRepo.findAll()
        studentsToScore = allStudents
      } else {
        // 否则只对指定的学生加分
        const allStudents = await studentRepo.findAll()
        for (const name of rule.studentNames) {
          const student = allStudents.find(s => s.name === name)
          if (student) {
            studentsToScore.push(student)
          }
        }
      }

      // 为每个学生添加积分事件
      for (const student of studentsToScore) {
        await eventRepo.create({
          student_name: student.name,
          reason_content: rule.reason || `自动化加分 - ${rule.name}`,
          delta: rule.scoreValue
        })
      }

      // 更新规则的最后执行时间
      rule.lastExecuted = new Date()
      await this.saveRulesToSettings()
      
      console.log(`Auto score rule executed successfully for ${studentsToScore.length} students`)
    } catch (error) {
      console.error(`Failed to execute auto score rule ${rule.name}:`, error)
    }
  }

  private stopRules() {
    for (const [_, timer] of this.timers) {
      clearTimeout(timer)
      clearInterval(timer)
    }
    this.timers.clear()
  }

  async addRule(rule: Omit<AutoScoreRule, 'id' | 'lastExecuted'>): Promise<number> {
    const newId = this.rules.length > 0 ? Math.max(...this.rules.map(r => r.id)) + 1 : 1
    const newRule: AutoScoreRule = {
      ...rule,
      id: newId,
      lastExecuted: undefined
    }
    
    this.rules.push(newRule)
    await this.saveRulesToSettings()
    
    if (rule.enabled) {
      this.startRuleTimer(newRule)
    }
    
    return newId
  }

  async updateRule(rule: Partial<AutoScoreRule> & { id: number }): Promise<boolean> {
    const index = this.rules.findIndex(r => r.id === rule.id)
    if (index === -1) return false

    // 停止旧的定时器
    if (this.timers.has(rule.id)) {
      clearTimeout(this.timers.get(rule.id)!)
      clearInterval(this.timers.get(rule.id)!)
      this.timers.delete(rule.id)
    }

    // 更新规则
    const updatedRule = { ...this.rules[index], ...rule }
    this.rules[index] = updatedRule

    // 保存到设置
    await this.saveRulesToSettings()

    // 如果规则已启用，启动新的定时器
    if (updatedRule.enabled) {
      this.startRuleTimer(updatedRule)
    }

    return true
  }

  async deleteRule(ruleId: number): Promise<boolean> {
    const index = this.rules.findIndex(r => r.id === ruleId)
    if (index === -1) return false

    // 停止定时器
    if (this.timers.has(ruleId)) {
      clearTimeout(this.timers.get(ruleId)!)
      clearInterval(this.timers.get(ruleId)!)
      this.timers.delete(ruleId)
    }

    // 从数组中移除规则
    this.rules.splice(index, 1)
    await this.saveRulesToSettings()

    return true
  }

  async toggleRule(ruleId: number, enabled: boolean): Promise<boolean> {
    const rule = this.rules.find(r => r.id === ruleId)
    if (!rule) return false

    rule.enabled = enabled

    // 停止现有定时器
    if (this.timers.has(ruleId)) {
      clearTimeout(this.timers.get(ruleId)!)
      clearInterval(this.timers.get(ruleId)!)
      this.timers.delete(ruleId)
    }

    // 如果规则现在是启用的，启动定时器
    if (enabled) {
      this.startRuleTimer(rule)
    }

    await this.saveRulesToSettings()
    return true
  }

  getRules(): AutoScoreRule[] {
    return [...this.rules]
  }

  isEnabled(): boolean {
    return this.rules.some(rule => rule.enabled)
  }

  async restart() {
    this.stopRules()
    await this.loadRulesFromSettings()
    this.startRules()
  }

  async initialize(): Promise<void> {
    // 确保服务正确初始化
    await this.loadRulesFromSettings()
    this.startRules()
  }

  async dispose(): Promise<void> {
    this.stopRules()
  }
}