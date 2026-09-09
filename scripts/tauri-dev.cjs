const net = require("node:net")
const { spawn } = require("node:child_process")
const { writeFileSync, unlinkSync, existsSync, readFileSync } = require("node:fs")
const { join } = require("node:path")
const os = require("node:os")

const START_PORT = Number.parseInt(process.env.TAURI_DEV_PORT_START || "1420", 10)

// Rust 后端不会自动读取 Vite 的 .env，这里把仓库根目录的 .env 显式加载进进程环境，
// 以便 tauri dev 启动的 Rust 进程能读取 SECSCORE_* 等配置。
function loadRootDotEnv() {
  const envPath = join(__dirname, "..", ".env")
  if (!existsSync(envPath)) {
    return
  }

  const content = readFileSync(envPath, "utf8")
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith("#")) {
      continue
    }
    const eqIndex = line.indexOf("=")
    if (eqIndex <= 0) {
      continue
    }
    const key = line.slice(0, eqIndex).trim()
    let value = line.slice(eqIndex + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (key && !Object.prototype.hasOwnProperty.call(process.env, key)) {
      process.env[key] = value
    }
  }
}

loadRootDotEnv()

function canUsePort(port) {
  return new Promise((resolve) => {
    const server = net.createServer()

    server.once("error", () => {
      resolve(false)
    })

    server.once("listening", () => {
      server.close(() => resolve(true))
    })

    server.listen(port, "127.0.0.1")
  })
}

async function findAvailablePort(startPort) {
  let port = startPort
  while (!(await canUsePort(port))) {
    port += 1
  }
  return port
}

async function main() {
  const port = await findAvailablePort(START_PORT)
  const overrideConfig = {
    app: {
      // 临时开发配置也必须保留 Tauri 全局 invoke，否则前端会误判为 LAN 模式，
      // 从而跳过本地同步初始化。
      withGlobalTauri: true,
    },
    build: {
      beforeDevCommand: `pnpm exec vite --host --port ${port}`,
      devUrl: `http://localhost:${port}`,
    },
  }

  console.log(`[tauri:dev] 使用端口 ${port}`)

  const tempDir = os.tmpdir()
  const tempConfigPath = join(tempDir, `tauri-config-${Date.now()}.json`)

  try {
    writeFileSync(tempConfigPath, JSON.stringify(overrideConfig), "utf-8")

    const extraArgs = process.argv.slice(2)
    const cmd = "pnpm"
    const args = ["tauri", "dev", "--config", tempConfigPath, ...extraArgs]

    const child = spawn(cmd, args, {
      stdio: "inherit",
      env: process.env,
      shell: true,
      windowsHide: false,
    })

    child.on("exit", (code, signal) => {
      if (existsSync(tempConfigPath)) {
        unlinkSync(tempConfigPath)
      }
      if (signal) {
        process.kill(process.pid, signal)
        return
      }
      process.exit(code ?? 1)
    })
  } catch (error) {
    if (existsSync(tempConfigPath)) {
      unlinkSync(tempConfigPath)
    }
    throw error
  }
}

main().catch((error) => {
  console.error("[tauri:dev] 启动失败:", error)
  process.exit(1)
})
