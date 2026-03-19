const net = require('node:net')
const { spawn } = require('node:child_process')

const START_PORT = Number.parseInt(process.env.TAURI_DEV_PORT_START || '1420', 10)

function canUsePort(port) {
  return new Promise((resolve) => {
    const server = net.createServer()

    server.once('error', () => {
      resolve(false)
    })

    server.once('listening', () => {
      server.close(() => resolve(true))
    })

    server.listen(port, '127.0.0.1')
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

  const extraArgs = process.argv.slice(2)
  const pnpmCmd = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
  const child = spawn(
    pnpmCmd,
    ['tauri', 'dev', '-c', JSON.stringify(overrideConfig), ...extraArgs],
    {
      stdio: 'inherit',
      env: process.env,
    }
  )

  child.on('exit', (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal)
      return
    }
    process.exit(code ?? 1)
  })
}

main().catch((error) => {
  console.error('[tauri:dev] 启动失败:', error)
  process.exit(1)
})
