export interface AutoScoreContext {
  students: Array<{
    id: number
    name: string
    tags: string[]
    lastScoreTime: Date
  }>
  events: Array<{
    id: number
    student_name: string
    delta: number
    reason_content: string
    created_at: Date
  }>
  rule: {
    id: number
    name: string
    studentNames: string[]
    triggers?: Array<{ event: string; value?: string; relation?: "AND" | "OR" }>
    actions?: Array<{ event: string; value?: string; reason?: string }>
  }
  now: Date
}

export interface AutoScoreActionContext {
  students: Array<{
    id: number
    name: string
    tags: string[]
  }>
  params: Record<string, any>
}

export interface RuleConfig {
  id: number
  name: string
  enabled: boolean
  studentNames: string[]
  triggers: Array<{
    event: string
    value?: string
    relation?: "AND" | "OR"
  }>
  actions: Array<{
    event: string
    value?: string
    reason?: string
  }>
  lastExecuted?: Date
}

export interface TriggerCheckResult {
  matchedStudents: Array<{ id: number; name: string; tags?: string[]; lastScoreTime?: Date }>
}

export class AutoScoreRuleEngine {
  private rules: Map<number, RuleConfig> = new Map()

  async addRule(rule: RuleConfig): Promise<void> {
    this.rules.set(rule.id, rule)
  }

  private checkIntervalTimeTrigger(
    students: AutoScoreContext["students"],
    value: string | undefined,
    now: Date
  ): Set<number> {
    const minutes = parseInt(value || "30", 10)
    if (isNaN(minutes) || minutes <= 0) return new Set()

    const intervalMs = minutes * 60 * 1000

    const matchedIds = new Set<number>()
    for (const student of students) {
      if (!student.lastScoreTime) {
        matchedIds.add(student.id)
        continue
      }

      const timeSinceLastScore = now.getTime() - new Date(student.lastScoreTime).getTime()
      if (timeSinceLastScore >= intervalMs) {
        matchedIds.add(student.id)
      }
    }

    return matchedIds
  }

  private checkStudentTagTrigger(
    students: AutoScoreContext["students"],
    value: string | undefined
  ): Set<number> {
    const requiredTags =
      value
        ?.split(",")
        .map((t) => t.trim())
        .filter(Boolean) || []

    if (requiredTags.length === 0) return new Set()

    const matchedIds = new Set<number>()
    for (const student of students) {
      const studentTags = student.tags || []
      if (requiredTags.some((tag) => studentTags.includes(tag))) {
        matchedIds.add(student.id)
      }
    }

    return matchedIds
  }

  async run(context: AutoScoreContext): Promise<
    {
      ruleId: number
      matchedStudents: Array<{ id: number; name: string; tags?: string[] }>
      actions: Array<{ event: string; value?: string; reason?: string }>
    }[]
  > {
    const results: {
      ruleId: number
      matchedStudents: Array<{ id: number; name: string; tags?: string[] }>
      actions: Array<{ event: string; value?: string; reason?: string }>
    }[] = []

    for (const [, rule] of this.rules) {
      if (!rule.enabled) continue

      const triggers = rule.triggers || []
      if (triggers.length === 0) continue

      const triggerResults: Set<number>[] = []
      const relations: ("AND" | "OR")[] = []

      for (let i = 0; i < triggers.length; i++) {
        const trigger = triggers[i]
        let matchedIds: Set<number>

        switch (trigger.event) {
          case "interval_time_passed":
            matchedIds = this.checkIntervalTimeTrigger(context.students, trigger.value, context.now)
            break
          case "student_has_tag":
            matchedIds = this.checkStudentTagTrigger(context.students, trigger.value)
            break
          default:
            continue
        }

        triggerResults.push(matchedIds)
        relations.push(trigger.relation || (i === 0 ? "AND" : "AND"))
      }

      if (triggerResults.length === 0) continue

      let finalMatchedIds: Set<number>
      const firstRelation = triggers[0]?.relation || "AND"

      if (firstRelation === "OR") {
        finalMatchedIds = new Set<number>()
        for (const ids of triggerResults) {
          for (const id of ids) {
            finalMatchedIds.add(id)
          }
        }
      } else {
        finalMatchedIds = new Set(triggerResults[0])
        for (let i = 1; i < triggerResults.length; i++) {
          const relation = triggers[i]?.relation || "AND"
          if (relation === "OR") {
            for (const id of triggerResults[i]) {
              finalMatchedIds.add(id)
            }
          } else {
            const nextSet = new Set<number>()
            for (const id of finalMatchedIds) {
              if (triggerResults[i].has(id)) {
                nextSet.add(id)
              }
            }
            finalMatchedIds = nextSet
          }
        }
      }

      if (finalMatchedIds.size > 0) {
        const matchedStudents = context.students.filter((s) => finalMatchedIds.has(s.id))

        results.push({
          ruleId: rule.id,
          matchedStudents: matchedStudents.map((s) => ({
            id: s.id,
            name: s.name,
            tags: s.tags,
          })),
          actions: rule.actions || [],
        })
      }
    }

    return results
  }

  async executeAction(
    actionType: string,
    students: Array<{ id: number; name: string; tags?: string[] }>,
    params: any,
    eventRepo: any
  ): Promise<void> {
    switch (actionType) {
      case "add_score": {
        const scoreValue = params.value ? parseInt(params.value, 10) : 0
        const reason = params.reason || `自动化加分 - ${params.ruleName}`
        for (const student of students) {
          await eventRepo.create({
            student_name: student.name,
            reason_content: reason,
            delta: scoreValue,
          })
        }
        break
      }
      case "add_tag": {
        const tagName = params.value
        if (tagName) {
          const studentRepo: any = params.studentRepo
          for (const student of students) {
            const currentTags = student.tags || []
            if (!currentTags.includes(tagName)) {
              await studentRepo.update(student.id, {
                tags: [...currentTags, tagName],
              })
            }
          }
        }
        break
      }
      default:
        console.warn(`Unknown action event: ${actionType}`)
    }
  }
}
