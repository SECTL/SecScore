import type { TriggerLogic } from './types'
import { intervalTimeTrigger } from './IntervalTimeTrigger'
import { studentTagTrigger } from './StudentTagTrigger'
import { randomTimeTrigger } from './RandomTimeTrigger'

export * from './types'
export { intervalTimeTrigger, studentTagTrigger, randomTimeTrigger }

export const allTriggerLogics: TriggerLogic[] = [
  intervalTimeTrigger,
  studentTagTrigger,
  randomTimeTrigger
]

export function getTriggerLogic(eventName: string): TriggerLogic | undefined {
  const direct = allTriggerLogics.find((t) => t.eventName === eventName)
  if (direct) return direct
  const aliasMap: Record<string, string> = {
    random_time: 'random_time_reached',
    student_tag_added: 'student_tag_matched'
  }
  const mapped = aliasMap[eventName]
  if (mapped) {
    return allTriggerLogics.find((t) => t.eventName === mapped)
  }
  return undefined
}
