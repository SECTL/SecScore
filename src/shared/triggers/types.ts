export interface TriggerContext {
  students: any[]
  events: any[]
  rule: {
    id: number
    name: string
    studentNames: string[]
    triggers?: { event: string; value?: string }[]
    actions?: { event: string; value?: string; reason?: string }[]
  }
  now: Date
}

export interface TriggerResult {
  shouldExecute: boolean
  matchedStudents?: any[]
  nextExecuteTime?: Date
  delayMs?: number
}

export interface TriggerLogic {
  eventName: string
  label: string
  description: string
  validate: (value: string) => { valid: boolean; message?: string }
  calculateNextTime?: (
    value: string,
    lastExecuted: Date | undefined,
    now: Date
  ) => { delayMs: number; nextExecuteTime: Date }
  check?: (context: TriggerContext, value: string) => TriggerResult
}
