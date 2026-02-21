import { actionRegistry } from '../registry'
import type { ActionDefinition } from '../types'

import AddScoreAction, {
  eventName as addScoreEventName,
  label as addScoreLabel,
  description as addScoreDescription,
  hasReason as addScoreHasReason
} from './AddScoreAction'

import AddTagAction, {
  eventName as addTagEventName,
  label as addTagLabel,
  description as addTagDescription,
  hasReason as addTagHasReason
} from './AddTagAction'

import SendNotificationAction, {
  eventName as sendNotificationEventName,
  label as sendNotificationLabel,
  description as sendNotificationDescription,
  hasReason as sendNotificationHasReason
} from './SendNotificationAction'

const actionDefinitions: ActionDefinition[] = [
  {
    eventName: addScoreEventName,
    label: addScoreLabel,
    description: addScoreDescription,
    component: AddScoreAction,
    hasReason: addScoreHasReason
  },
  {
    eventName: addTagEventName,
    label: addTagLabel,
    description: addTagDescription,
    component: AddTagAction,
    hasReason: addTagHasReason
  },
  {
    eventName: sendNotificationEventName,
    label: sendNotificationLabel,
    description: sendNotificationDescription,
    component: SendNotificationAction,
    hasReason: sendNotificationHasReason
  },
]

actionDefinitions.forEach((def) => actionRegistry.register(def))

export { AddScoreAction, AddTagAction, SendNotificationAction }
