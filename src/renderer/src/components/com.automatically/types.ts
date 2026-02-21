import React from 'react'

export interface TriggerComponentProps {
  value: string
  onChange: (value: string) => void
}

export interface ActionComponentProps {
  value: string
  reason: string
  onChange: (value: string) => void
  onReasonChange: (reason: string) => void
}

export interface TriggerLogic {
  eventName: string
  label: string
  description: string
  validate: (value: string) => { valid: boolean; message?: string }
  calculateNextTime?: (value: string, lastExecuted: Date | undefined, now: Date) => { delayMs: number; nextExecuteTime: Date }
  check?: (context: any, value: string) => { shouldExecute: boolean; message?: string }
}

export interface TriggerDefinition {
  eventName: string
  label: string
  description: string
  component: React.FC<TriggerComponentProps>
  triggerLogic?: TriggerLogic
}

export interface ActionDefinition {
  eventName: string
  label: string
  description: string
  component: React.FC<ActionComponentProps>
  hasReason?: boolean
}

export interface TriggerItem {
  id: number
  eventName: string
  value: string
}

export interface ActionItem {
  id: number
  eventName: string
  value: string
  reason: string
}
