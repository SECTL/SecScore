#!/usr/bin/env node

import { execFileSync, spawn } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import process from "node:process"
import { fileURLToPath } from "node:url"

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const envFile = resolve(rootDir, process.env.SYNC_SERVER_ENV_FILE || ".env.sync-server.development.local")
const port = Number(process.env.SYNC_SERVER_PORT || "8787")

const parseEnvFile = (filePath) => {
  if (!existsSync(filePath)) return {}

  const values = {}
  for (const rawLine of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith("#")) continue

    const separator = line.indexOf("=")
    if (separator < 1) continue

    const key = line.slice(0, separator).trim()
    let value = line.slice(separator + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    values[key] = value
  }
  return values
}

const findUnixPids = () => {
  try {
    return execFileSync("lsof", ["-tiTCP:" + port, "-sTCP:LISTEN"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    })
      .split(/\s+/)
      .filter(Boolean)
      .map(Number)
      .filter((pid) => Number.isInteger(pid) && pid > 0)
  } catch {
    return []
  }
}

const findWindowsPids = () => {
  try {
    const output = execFileSync("netstat", ["-ano", "-p", "tcp"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    })
    const pids = []
    for (const line of output.split(/\r?\n/)) {
      const columns = line.trim().split(/\s+/)
      if (
        columns.length >= 5 &&
        columns[0].toUpperCase() === "TCP" &&
        columns[1].endsWith(`:${port}`) &&
        columns[3].toUpperCase() === "LISTENING"
      ) {
        const pid = Number(columns[4])
        if (Number.isInteger(pid) && pid > 0) pids.push(pid)
      }
    }
    return [...new Set(pids)]
  } catch {
    return []
  }
}

const killPort = () => {
  const pids = process.platform === "win32" ? findWindowsPids() : findUnixPids()
  if (pids.length === 0) {
    console.log(`[sync-server] port ${port} is free`)
    return
  }

  console.log(`[sync-server] stopping process(es) on port ${port}: ${pids.join(", ")}`)
  for (const pid of pids) {
    try {
      if (process.platform === "win32") {
        execFileSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "inherit" })
      } else {
        process.kill(pid, "SIGTERM")
        try {
          process.kill(pid, 0)
          process.kill(pid, "SIGKILL")
        } catch {
          // 进程已经退出。
        }
      }
    } catch (error) {
      console.warn(`[sync-server] failed to stop pid ${pid}: ${String(error)}`)
    }
  }
}

killPort()

const fileEnv = parseEnvFile(envFile)
const childEnv = {
  ...fileEnv,
  ...process.env,
  BIND_ADDR: process.env.BIND_ADDR || fileEnv.BIND_ADDR || `0.0.0.0:${port}`,
}

if (!childEnv.DATABASE_URL) {
  console.error(`[sync-server] DATABASE_URL is missing; create ${envFile}`)
  process.exit(1)
}

console.log(`[sync-server] using ${envFile}`)
const child = spawn(
  "cargo",
  ["run", "--manifest-path", resolve(rootDir, "sync-server/Cargo.toml")],
  { cwd: rootDir, env: childEnv, stdio: "inherit" }
)

const forwardSignal = (signal) => {
  if (!child.killed) child.kill(signal)
}
process.on("SIGINT", () => forwardSignal("SIGINT"))
process.on("SIGTERM", () => forwardSignal("SIGTERM"))
child.on("exit", (code, signal) => {
  process.exit(code ?? (signal ? 1 : 0))
})
