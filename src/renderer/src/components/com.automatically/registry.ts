import type { TriggerDefinition, ActionDefinition, TriggerLogic } from './types'

class TriggerRegistry {
  private triggers: Map<string, TriggerDefinition> = new Map()

  register(definition: TriggerDefinition) {
    this.triggers.set(definition.eventName, definition)
  }

  get(eventName: string): TriggerDefinition | undefined {
    return this.triggers.get(eventName)
  }

  getAll(): TriggerDefinition[] {
    return Array.from(this.triggers.values())
  }

  getOptions() {
    return this.getAll().map((t) => ({ label: t.label, value: t.eventName }))
  }

  getLogic(eventName: string): TriggerLogic | undefined {
    return this.triggers.get(eventName)?.triggerLogic
  }
}

class ActionRegistry {
  private actions: Map<string, ActionDefinition> = new Map()

  register(definition: ActionDefinition) {
    this.actions.set(definition.eventName, definition)
  }

  get(eventName: string): ActionDefinition | undefined {
    return this.actions.get(eventName)
  }

  getAll(): ActionDefinition[] {
    return Array.from(this.actions.values())
  }

  getOptions() {
    return this.getAll().map((a) => ({ label: a.label, value: a.eventName }))
  }
}

export const triggerRegistry = new TriggerRegistry()
export const actionRegistry = new ActionRegistry()

export const allTriggers = {
  get list() {
    return triggerRegistry.getAll()
  },
  get options() {
    return triggerRegistry.getOptions()
  }
}

export const allActions = {
  get list() {
    return actionRegistry.getAll()
  },
  get options() {
    return actionRegistry.getOptions()
  }
}
