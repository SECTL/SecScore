import './assets/main.css'
import './i18n'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { ClientContext } from './ClientContext'
import { StudentService } from './services/StudentService'
import { ServiceProvider } from './contexts/ServiceContext'

const ctx = new ClientContext()
new StudentService(ctx)

const safeWriteLog = (payload: {
  level: 'debug' | 'info' | 'warn' | 'error'
  message: string
  meta?: any
}) => {
  try {
    const api = (window as any).api
    if (!api?.writeLog) return
    api.writeLog(payload)
  } catch {
    return
  }
}

const patchConsole = () => {
  const c = window.console as any
  const set = (name: string, fn: (...args: any[]) => void) => {
    try {
      c[name] = fn
    } catch {
      void 0
    }
  }

  set('log', (...args: any[]) =>
    safeWriteLog({ level: 'info', message: String(args[0] ?? ''), meta: args.slice(1) })
  )
  set('info', (...args: any[]) =>
    safeWriteLog({ level: 'info', message: String(args[0] ?? ''), meta: args.slice(1) })
  )
  set('warn', (...args: any[]) =>
    safeWriteLog({ level: 'warn', message: String(args[0] ?? ''), meta: args.slice(1) })
  )
  set('debug', (...args: any[]) =>
    safeWriteLog({ level: 'debug', message: String(args[0] ?? ''), meta: args.slice(1) })
  )
  set('error', (...args: any[]) => {
    const first = args[0]
    if (first instanceof Error) {
      safeWriteLog({
        level: 'error',
        message: first.message,
        meta: { stack: first.stack, args: args.slice(1) }
      })
      return
    }
    safeWriteLog({ level: 'error', message: String(first ?? ''), meta: args.slice(1) })
  })
  set('trace', (...args: any[]) =>
    safeWriteLog({
      level: 'debug',
      message: 'console.trace',
      meta: { args, stack: new Error('console.trace').stack }
    })
  )
  set('table', (...args: any[]) =>
    safeWriteLog({ level: 'info', message: 'console.table', meta: args })
  )
}
patchConsole()

window.addEventListener('error', (e: any) => {
  const error = e?.error
  safeWriteLog({
    level: 'error',
    message: 'renderer:error',
    meta: {
      message: error?.message || e?.message,
      stack: error?.stack,
      filename: e?.filename,
      lineno: e?.lineno,
      colno: e?.colno
    }
  })
})

window.addEventListener('unhandledrejection', (e: any) => {
  const reason = e?.reason
  safeWriteLog({
    level: 'error',
    message: 'renderer:unhandledrejection',
    meta: reason instanceof Error ? { message: reason.message, stack: reason.stack } : { reason }
  })
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ServiceProvider value={ctx}>
      <App />
    </ServiceProvider>
  </StrictMode>
)
