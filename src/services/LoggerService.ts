/**
 * SecScore 日志服务
 * 支持分级日志、多色打印、文件存储
 */

export type LogLevel = "debug" | "info" | "warn" | "error"

export interface LogEntry {
  level: LogLevel
  message: string
  timestamp: number
  meta?: any
  source?: string
}

export interface LogWriter {
  write(entry: LogEntry): void
}

/**
 * 控制台日志写入器
 * 支持多色打印
 */
class ConsoleLogWriter implements LogWriter {
  private colors: Record<LogLevel, string> = {
    debug: "\x1b[36m", // Cyan
    info: "\x1b[32m", // Green
    warn: "\x1b[33m", // Yellow
    error: "\x1b[31m", // Red
  }

  private reset = "\x1b[0m"

  write(entry: LogEntry): void {
    const { level, message, timestamp, meta, source } = entry
    const color = this.colors[level]
    const time = new Date(timestamp).toISOString()
    const prefix = source ? `[${source}]` : "[SecScore]"

    const logMessage = `${color}${time} ${prefix} [${level.toUpperCase()}]${this.reset} ${message}`

    switch (level) {
      case "debug":
        console.debug(logMessage, meta || "")
        break
      case "info":
        console.info(logMessage, meta || "")
        break
      case "warn":
        console.warn(logMessage, meta || "")
        break
      case "error":
        console.error(logMessage, meta || "")
        break
    }
  }
}

/**
 * 远程日志写入器
 * 将日志发送到 Rust 后端
 */
class RemoteLogWriter implements LogWriter {
  write(entry: LogEntry): void {
    const api = (window as any).api
    if (!api?.writeLog) return

    const payload = {
      level: entry.level,
      message: entry.message,
      meta: entry.meta,
    }

    Promise.resolve(api.writeLog(payload)).catch(() => void 0)
  }
}

/**
 * 日志服务类
 */
class LoggerServiceClass {
  private writers: LogWriter[] = []
  private minLevel: LogLevel = "info"
  private levelPriority: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
  }
  private source: string = "App"
  private buffer: LogEntry[] = []
  private bufferSize = 1000

  constructor() {
    // 默认添加控制台和远程写入器
    this.addWriter(new ConsoleLogWriter())
    this.addWriter(new RemoteLogWriter())
  }

  /**
   * 设置日志源
   */
  setSource(source: string): void {
    this.source = source
  }

  /**
   * 添加日志写入器
   */
  addWriter(writer: LogWriter): void {
    this.writers.push(writer)
  }

  /**
   * 设置最低日志级别
   */
  setLevel(level: LogLevel): void {
    this.minLevel = level
  }

  /**
   * 获取当前日志级别
   */
  getLevel(): LogLevel {
    return this.minLevel
  }

  /**
   * 写入日志
   */
  private log(level: LogLevel, message: string, meta?: any): void {
    if (this.levelPriority[level] < this.levelPriority[this.minLevel]) {
      return
    }

    const entry: LogEntry = {
      level,
      message,
      timestamp: Date.now(),
      meta,
      source: this.source,
    }

    // 添加到缓冲区
    this.buffer.push(entry)
    if (this.buffer.length > this.bufferSize) {
      this.buffer.shift()
    }

    // 写入所有写入器
    this.writers.forEach((writer) => {
      try {
        writer.write(entry)
      } catch (error) {
        console.error("Log writer error:", error)
      }
    })
  }

  /**
   * Debug 日志
   */
  debug(message: string, meta?: any): void {
    this.log("debug", message, meta)
  }

  /**
   * Info 日志
   */
  info(message: string, meta?: any): void {
    this.log("info", message, meta)
  }

  /**
   * Warning 日志
   */
  warn(message: string, meta?: any): void {
    this.log("warn", message, meta)
  }

  /**
   * Error 日志
   */
  error(message: string, meta?: any): void {
    this.log("error", message, meta)
  }

  /**
   * 创建带指定源的日志记录器
   */
  createChild(source: string): LoggerServiceClass {
    const child = new LoggerServiceClass()
    child.writers = [...this.writers]
    child.minLevel = this.minLevel
    child.source = source
    return child
  }

  /**
   * 获取最近的日志
   */
  getRecentLogs(count: number = 100): LogEntry[] {
    return this.buffer.slice(-count)
  }

  /**
   * 清空日志缓冲
   */
  clear(): void {
    this.buffer = []
  }
}

// 导出全局日志服务实例
export const LoggerService = new LoggerServiceClass()

/**
 * 便捷日志函数
 */
export const logger = {
  debug: (message: string, meta?: any) => LoggerService.debug(message, meta),
  info: (message: string, meta?: any) => LoggerService.info(message, meta),
  warn: (message: string, meta?: any) => LoggerService.warn(message, meta),
  error: (message: string, meta?: any) => LoggerService.error(message, meta),
  createChild: (source: string) => LoggerService.createChild(source),
  setLevel: (level: LogLevel) => LoggerService.setLevel(level),
  getLevel: () => LoggerService.getLevel(),
  getRecentLogs: (count?: number) => LoggerService.getRecentLogs(count),
  clear: () => LoggerService.clear(),
}
