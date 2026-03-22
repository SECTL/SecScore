export type disposer = () => void

export type eventListener = (...args: any[]) => void

export class EventEmitter {
  protected _events: Record<string | symbol, eventListener[]> = {}

  on(event: string | symbol, listener: eventListener): this {
    if (!this._events[event]) {
      this._events[event] = []
    }
    this._events[event].push(listener)
    return this
  }

  off(event: string | symbol, listener: eventListener): this {
    if (!this._events[event]) return this
    this._events[event] = this._events[event].filter((l) => l !== listener)
    return this
  }

  once(event: string | symbol, listener: eventListener): this {
    const onceListener: eventListener = (...args) => {
      this.off(event, onceListener)
      listener(...args)
    }
    return this.on(event, onceListener)
  }

  emit(event: string | symbol, ...args: any[]): boolean {
    if (!this._events[event]) return false
    const listeners = [...this._events[event]]
    listeners.forEach((listener) => listener(...args))
    return true
  }

  removeAllListeners(event?: string | symbol): this {
    if (event) {
      delete this._events[event]
    } else {
      this._events = {}
    }
    return this
  }
}

export class Context extends EventEmitter {
  private _disposables: disposer[] = []

  constructor() {
    super()
  }

  effect(callback: disposer): disposer {
    this._disposables.push(callback)
    return () => {
      const index = this._disposables.indexOf(callback)
      if (index >= 0) {
        this._disposables.splice(index, 1)
        callback()
      }
    }
  }

  on(event: string | symbol, listener: eventListener): this {
    super.on(event, listener)
    this.effect(() => {
      super.off(event, listener)
    })
    return this
  }

  once(event: string | symbol, listener: eventListener): this {
    const onceListener: eventListener = (...args) => {
      this.off(event, onceListener)
      listener(...args)
    }
    super.on(event, onceListener)
    this.effect(() => {
      super.off(event, onceListener)
    })
    return this
  }

  dispose() {
    this.emit("dispose")
    while (this._disposables.length) {
      const dispose = this._disposables.pop()
      try {
        if (dispose) dispose()
      } catch (e) {
        ;(this as any).logger?.error?.("Error during disposal", {
          meta: e instanceof Error ? { message: e.message, stack: e.stack } : { e },
        })
      }
    }
    this.removeAllListeners()
  }

  extend(): Context {
    const child = new Context()
    const disposeChild = this.effect(() => child.dispose())
    child.on("dispose", disposeChild)

    Object.setPrototypeOf(child, this)

    return child
  }
}

export abstract class Service {
  constructor(
    protected ctx: Context,
    name: string
  ) {
    if ((ctx as any)[name]) {
      ;(ctx as any).logger?.warn?.("Service already exists on context. Overwriting.", { name })
    }
    ;(ctx as any)[name] = this

    ctx.effect(() => {
      if ((ctx as any)[name] === this) {
        delete (ctx as any)[name]
      }
    })
  }
}
