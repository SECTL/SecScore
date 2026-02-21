import type { TriggerLogic } from './types'

export const randomTimeTrigger: TriggerLogic = {
  eventName: 'random_time_reached',
  label: '随机时间触发',
  description: '当随机时间到达时触发自动化',

  validate: (value: string) => {
    if (!value) {
      return { valid: true }
    }
    try {
      const config = JSON.parse(value)
      if (config.minHour !== undefined || config.maxHour !== undefined) {
        const minHour = config.minHour ?? 0
        const maxHour = config.maxHour ?? 23
        if (minHour < 0 || minHour > 23 || maxHour < 0 || maxHour > 23) {
          return { valid: false, message: '小时范围必须在0-23之间' }
        }
        if (minHour > maxHour) {
          return { valid: false, message: '最小小时不能大于最大小时' }
        }
      }
      return { valid: true }
    } catch {
      return { valid: false, message: '配置格式错误' }
    }
  },

  calculateNextTime: (value: string, _lastExecuted: Date | undefined, now: Date) => {
    let config = { minHour: 9, maxHour: 18 }
    try {
      if (value) {
        const parsed = JSON.parse(value)
        config = { ...config, ...parsed }
      }
    } catch {}

    const minHour = config.minHour ?? 0
    const maxHour = config.maxHour ?? 23

    const randomHour = Math.floor(Math.random() * (maxHour - minHour + 1)) + minHour
    const randomMinute = Math.floor(Math.random() * 60)

    let targetDate = new Date(now)
    targetDate.setHours(randomHour, randomMinute, 0, 0)

    if (targetDate.getTime() <= now.getTime()) {
      targetDate.setDate(targetDate.getDate() + 1)
    }

    const delayMs = targetDate.getTime() - now.getTime()
    return { delayMs, nextExecuteTime: targetDate }
  },

  check: (context, value) => {
    const result = randomTimeTrigger.calculateNextTime!(value, undefined, context.now)
    return {
      shouldExecute: result.delayMs === 0,
      matchedStudents: context.students,
      nextExecuteTime: result.nextExecuteTime,
      delayMs: result.delayMs
    }
  }
}
