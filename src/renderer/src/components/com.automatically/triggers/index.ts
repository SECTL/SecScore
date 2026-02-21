import { triggerRegistry } from '../registry'
import type { TriggerDefinition } from '../types'

import IntervalTimeTrigger, { 
  eventName as intervalEventName, 
  label as intervalLabel, 
  description as intervalDescription,
  triggerLogic as intervalTriggerLogic
} from './IntervalTimeTrigger'

import StudentTagTrigger, { 
  eventName as studentTagEventName, 
  label as studentTagLabel, 
  description as studentTagDescription,
  triggerLogic as studentTagTriggerLogic
} from './StudentTagTrigger'

import RandomTimeTrigger, { 
  eventName as randomTimeEventName, 
  label as randomTimeLabel, 
  description as randomTimeDescription,
  triggerLogic as randomTimeTriggerLogic
} from './RandomTimeTrigger'

const triggerDefinitions: TriggerDefinition[] = [
  {
    eventName: intervalEventName,
    label: intervalLabel,
    description: intervalDescription,
    component: IntervalTimeTrigger,
    triggerLogic: intervalTriggerLogic
  },
  {
    eventName: studentTagEventName,
    label: studentTagLabel,
    description: studentTagDescription,
    component: StudentTagTrigger,
    triggerLogic: studentTagTriggerLogic
  },
  {
    eventName: randomTimeEventName,
    label: randomTimeLabel,
    description: randomTimeDescription,
    component: RandomTimeTrigger,
    triggerLogic: randomTimeTriggerLogic
  }
]

triggerDefinitions.forEach((def) => triggerRegistry.register(def))

export { 
  IntervalTimeTrigger, 
  StudentTagTrigger, 
  RandomTimeTrigger 
}
