import './triggers'
import './actions'

export { triggerRegistry, actionRegistry, allTriggers, allActions } from './registry'
export type { 
  TriggerComponentProps, 
  ActionComponentProps, 
  TriggerDefinition, 
  ActionDefinition,
  TriggerItem,
  ActionItem 
} from './types'
export { default as TriggerItemComponent } from './TriggerItem'
export { default as ActionItemComponent } from './ActionItem'

export { IntervalTimeTrigger, StudentTagTrigger, RandomTimeTrigger } from './triggers'
export { AddScoreAction, AddTagAction, SendNotificationAction, SetStudentStatusAction } from './actions'
