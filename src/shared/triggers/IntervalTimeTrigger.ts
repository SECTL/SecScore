import type { TriggerLogic } from './types'

export const intervalTimeTrigger: TriggerLogic = {
  eventName: 'interval_time_passed',
  label: '根据间隔时间触发',
  description: '当间隔时间到达时触发自动化',

  validate: (value: string) => {
    const minutes = parseInt(value, 10)
    if (isNaN(minutes) || minutes <= 0) {
      return { valid: false, message: '请输入有效的时间间隔（分钟）' }
    }
    return { valid: true }
  },

  calculateNextTime: (value: string, lastExecuted: Date | undefined, now: Date) => {
    const intervalMinutes = parseInt(value, 10)
    if (isNaN(intervalMinutes) || intervalMinutes <= 0) {
      return { delayMs: 0, nextExecuteTime: now }
    }

    const intervalMs = intervalMinutes * 60 * 1000

    let delayMs = intervalMs
    if (lastExecuted) {
      const timeSinceLastExecution = now.getTime() - lastExecuted.getTime()
      delayMs = intervalMs - (timeSinceLastExecution % intervalMs)
      if (timeSinceLastExecution >= intervalMs) {
        delayMs = 0
      }
    }

    const nextExecuteTime = new Date(now.getTime() + delayMs)
    return { delayMs, nextExecuteTime }
  },

  check: (context, value) => {
    const result = intervalTimeTrigger.calculateNextTime!(
      value,
      context.rule.triggers?.find((t) => t.event === 'interval_time_passed')
        ? context.now
        : undefined,
      context.now
    )
    return {
      shouldExecute: result.delayMs === 0,
      matchedStudents: context.students,
      nextExecuteTime: result.nextExecuteTime,
      delayMs: result.delayMs
    }
  }
}
