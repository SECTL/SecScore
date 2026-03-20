const net = require("node:net")
const { spawn } = require("node:child_process")
const { writeFileSync, unlinkSync, existsSync } = require("node:fs")
const { join } = require("node:path")
const os = require("node:os")

const START_PORT = Number.parseInt(process.env.TAURI_DEV_PORT_START || "1420", 10)

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
    build: {
      beforeDevCommand: `npm run dev -- --host --port ${port} --strictPort`,
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
