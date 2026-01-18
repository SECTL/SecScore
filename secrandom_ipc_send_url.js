#!/usr/bin/env node
/**
 * SecRandom IPC URL 发送脚本 (Node.js 版本)
 *
 * 用途
 * - 向本机正在运行的 SecRandom 实例发送 URL（例如 SecRandom://settings）
 * - 通过“命名 IPC 通道”连接（Windows 命名管道 / Linux socket），无需端口
 *
 * 前提
 * - SecRandom 主程序已启动，并已启动 URL IPC 服务端
 *
 * 基本用法（Windows / Linux 通用）
 * - 发送打开设置页：
 *   node secrandom_ipc_send_url.js "SecRandom://settings"
 * - 发送切换页面：
 *   node secrandom_ipc_send_url.js "SecRandom://main/lottery"
 *
 * 参数说明
 * - url：要发送的 URL（大小写不敏感）
 * --ipc-name：目标通道名，默认 SecRandom.secrandom
 *   - Windows 对应：\\.\pipe\SecRandom.secrandom
 *   - Linux 对应：/tmp/SecRandom.secrandom.sock
 *
 * 返回与退出码
 * - 输出：打印服务端响应 JSON
 * - 退出码：
 *   - 0：success 为 true
 *   - 2：success 为 false（例如命令不支持/被拒绝/服务端返回失败）
 *   - 1：脚本运行异常（例如连接失败、序列化失败等）
 */

const net = require('net')

function parseArgs(argv) {
  const out = { url: '', ipcName: 'SecRandom.secrandom', timeout: 5000 }
  const args = Array.from(argv)
  for (let i = 0; i < args.length; i++) {
    const a = String(args[i] ?? '')
    if (a === '--help' || a === '-h') return { help: true }

    if (a === '--ipc-name') {
      out.ipcName = String(args[i + 1] ?? '').trim() || out.ipcName
      i++
      continue
    }
    if (a.startsWith('--ipc-name=')) {
      out.ipcName = a.slice('--ipc-name='.length).trim() || out.ipcName
      continue
    }

    if (a === '--timeout') {
      const n = Number.parseInt(String(args[i + 1] ?? ''), 10)
      if (Number.isFinite(n) && n > 0) out.timeout = n
      i++
      continue
    }
    if (a.startsWith('--timeout=')) {
      const n = Number.parseInt(a.slice('--timeout='.length), 10)
      if (Number.isFinite(n) && n > 0) out.timeout = n
      continue
    }

    if (!a.startsWith('-') && !out.url) {
      out.url = a
    }
  }
  return out
}

const parsed = parseArgs(process.argv.slice(2))
if (parsed.help || !parsed.url) {
  console.log(
    'Usage: node secrandom_ipc_send_url.js <url> [--ipc-name <name>] [--timeout <ms>]\n' +
      'Example: node secrandom_ipc_send_url.js "SecRandom://settings"'
  )
  process.exit(parsed.help ? 0 : 1)
}

const { url, ipcName, timeout } = parsed

function getIpcAddress(ipcName) {
  if (process.platform === 'win32') {
    return `\\\\.\\pipe\\${ipcName}`
  }
  return `/tmp/${ipcName}.sock`
}

const ipcAddress = getIpcAddress(ipcName)
const message = JSON.stringify({ type: 'url', payload: { url } })

const client = net.createConnection(ipcAddress)

client.setTimeout(parseInt(timeout))

client.on('connect', () => {
  client.write(message + '\n')
})

client.on('data', (data) => {
  try {
    const response = JSON.parse(data.toString())
    console.log(JSON.stringify(response, null, 2))
    process.exit(response.success ? 0 : 2)
  } catch (error) {
    console.error('Failed to parse response:', error)
    process.exit(1)
  }
})

client.on('timeout', () => {
  console.error('Connection timeout')
  client.destroy()
  process.exit(1)
})

client.on('error', (error) => {
  if (error.code === 'ENOENT') {
    console.error(`IPC 通道不存在: ${ipcAddress}. 请确认 SecRandom 已运行且已启动 IPC 服务端。`)
  } else {
    console.error('IPC send failed:', error.message)
  }
  process.exit(1)
})

client.on('close', () => {
  if (process.exitCode === undefined) {
    console.error('Connection closed without response')
    process.exit(1)
  }
})
