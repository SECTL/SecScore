import { useCallback } from "react"
import { logger, LogLevel } from "../services/LoggerService"

/**
 * React Hook: 使用日志服务
 */
export function useLogger(source?: string) {
  const log = useCallback(
    (_level: LogLevel, message: string, meta?: any) => {
      if (source) {
        const childLogger = logger.createChild(source)
        childLogger.debug(message, meta)
      } else {
        logger.debug(message, meta)
      }
    },
    [source]
  )

  const debug = useCallback(
    (message: string, meta?: any) => {
      log("debug", message, meta)
    },
    [log]
  )

  const info = useCallback(
    (message: string, meta?: any) => {
      log("info", message, meta)
    },
    [log]
  )

  const warn = useCallback(
    (message: string, meta?: any) => {
      log("warn", message, meta)
    },
    [log]
  )

  const error = useCallback(
    (message: string, meta?: any) => {
      log("error", message, meta)
    },
    [log]
  )

  return {
    debug,
    info,
    warn,
    error,
    log,
  }
}
