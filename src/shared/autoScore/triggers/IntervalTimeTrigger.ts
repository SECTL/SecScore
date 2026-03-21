import type { AutoScoreContext } from "../AutoScoreRuleEngine"

export interface IntervalTimeTriggerConfig {
  intervalMinutes: number
}

export function createIntervalTimeTrigger() {
  return {
    id: "interval_time_passed",
    label: "间隔时间",
    description: "每隔指定时间自动触发",

    validate: (value: string): { valid: boolean; message?: string } => {
      const minutes = parseInt(value, 10)
      if (isNaN(minutes) || minutes <= 0) {
        return { valid: false, message: "请输入有效的分钟数" }
      }
      return { valid: true }
    },

    calculateNextTime: (
      value: string,
      lastExecuted: Date | undefined,
      now: Date
    ): { delayMs: number; nextExecuteTime: Date } => {
      const minutes = parseInt(value, 10)
      const intervalMs = minutes * 60 * 1000

      let nextExecuteTime: Date
      if (lastExecuted) {
        nextExecuteTime = new Date(lastExecuted.getTime() + intervalMs)
      } else {
        nextExecuteTime = new Date(now.getTime() + intervalMs)
      }

      const delayMs = nextExecuteTime.getTime() - now.getTime()
      return { delayMs, nextExecuteTime }
    },

    check: (
      context: AutoScoreContext,
      value: string
    ): {
      shouldExecute: boolean
      matchedStudents?: Array<{ id: number; name: string; tags: string[] }>
      nextExecuteTime?: Date
      delayMs?: number
    } => {
      const minutes = parseInt(value, 10)
      if (isNaN(minutes) || minutes <= 0) {
        return { shouldExecute: false }
      }

      const intervalMs = minutes * 60 * 1000
      const now = context.now

      const matchedStudents = context.students.filter((student) => {
        if (!student.lastScoreTime) {
          return true
        }

        const timeSinceLastScore = now.getTime() - student.lastScoreTime.getTime()
        return timeSinceLastScore >= intervalMs
      })

      return {
        shouldExecute: matchedStudents.length > 0,
        matchedStudents,
      }
    },

    toRuleCondition: (value: string): any => {
      const minutes = parseInt(value, 10)
      const intervalMs = minutes * 60 * 1000

      return {
        all: [
          {
            fact: "student",
            path: ".lastScoreTime",
            operator: "lessThan",
            value: new Date(Date.now() - intervalMs).toISOString(),
          },
        ],
      }
    },
  }
}
