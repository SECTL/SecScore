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
  return allTriggerLogics.find((t) => t.eventName === eventName)
}
