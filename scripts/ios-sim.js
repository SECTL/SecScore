#!/usr/bin/env node

const { execSync, spawn } = require("node:child_process")
const net = require("node:net")
const readline = require("node:readline")

function getAvailableDevices() {
  const raw = execSync("xcrun simctl list devices available -j", {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  })
  const parsed = JSON.parse(raw)
  const devicesByRuntime = parsed.devices || {}
  const all = []

  for (const [runtime, devices] of Object.entries(devicesByRuntime)) {
    for (const device of devices) {
      if (!device.isAvailable) continue
      if (device.name.includes("iPad") || device.name.includes("iPhone")) {
        all.push({
          name: device.name,
          udid: device.udid,
          state: device.state,
          runtime,
        })
      }
    }
  }

  all.sort((a, b) => a.name.localeCompare(b.name) || a.runtime.localeCompare(b.runtime))
  return all
}

function promptChoice(max) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })

  return new Promise((resolve, reject) => {
    rl.question("请输入要使用的机型编号: ", (answer) => {
      rl.close()
      const idx = Number(answer.trim())
      if (!Number.isInteger(idx) || idx < 1 || idx > max) {
        reject(new Error(`无效编号: ${answer}`))
        return
      }
      resolve(idx - 1)
    })
  })
}

function isPortListening(port, host = "127.0.0.1") {
  return new Promise((resolve) => {
    const socket = new net.Socket()
    let settled = false

    const finalize = (result) => {
      if (settled) return
      settled = true
      socket.destroy()
      resolve(result)
    }

    socket.setTimeout(500)
    socket.once("connect", () => finalize(true))
    socket.once("timeout", () => finalize(false))
    socket.once("error", () => finalize(false))
    socket.connect(port, host)
  })
}

async function hasListeningDevServer(port) {
  const checks = await Promise.all([
    isPortListening(port, "127.0.0.1"),
    isPortListening(port, "::1"),
    isPortListening(port, "localhost"),
  ])
  return checks.some(Boolean)
}

async function main() {
  const devices = getAvailableDevices()

  if (devices.length === 0) {
    throw new Error("未找到可用 iOS 模拟器，请先在 Xcode 安装模拟器运行时。")
  }

  console.log("可用 iOS 模拟器:")
  devices.forEach((d, i) => {
    const runtime = d.runtime.replace("com.apple.CoreSimulator.SimRuntime.", "")
    console.log(`${i + 1}. ${d.name} | ${runtime} | ${d.state} | ${d.udid}`)
  })

  const pickedIndex = await promptChoice(devices.length)
  const picked = devices[pickedIndex]
  console.log(`\n已选择: ${picked.name} (${picked.runtime})`)

  const args = ["tauri", "ios", "dev", picked.name]
  const tauriDevPort = Number(process.env.TAURI_DEV_PORT || 1420)
  const hasExistingDevServer = await hasListeningDevServer(tauriDevPort)
  if (hasExistingDevServer) {
    console.log(`检测到 ${tauriDevPort} 端口已有 dev server，复用现有服务并跳过 beforeDevCommand。`)
    args.push(
      "--config",
      JSON.stringify({
        build: {
          beforeDevCommand: `echo using-existing-dev-server-on-${tauriDevPort}`,
        },
      })
    )
  }

  const child = spawn("pnpm", args, {
    stdio: "inherit",
    shell: process.platform === "win32",
  })

  child.on("exit", (code) => {
    process.exit(code ?? 1)
  })
}

main().catch((err) => {
  console.error(`执行失败: ${err.message}`)
  process.exit(1)
})
