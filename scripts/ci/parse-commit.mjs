import fs from 'fs'
import path from 'path'

const cwd = process.cwd()
const pkgPath = path.join(cwd, 'package.json')
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'))
const scripts = pkg?.scripts ?? {}

const rawMessage =
  process.env.RELEASE_MESSAGE ??
  process.env.GITHUB_COMMIT_MESSAGE ??
  process.argv.slice(2).join(' ') ??
  ''
const message = String(rawMessage || '').trim()

// 是否以 release: 开头
const isReleasePrefix = /^release:/i.test(message)

const semverRe = /\bv?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)\b/
const versionMatch = message.match(semverRe)
const version = versionMatch ? versionMatch[1] : ''

const buildToken =
  message.match(/\b(build:(?:win|mac|linux|unpack|all))\b/i)?.[1]?.toLowerCase() ?? ''
let buildScript =
  buildToken === 'build:all'
    ? 'build:all'
    : buildToken && buildToken.startsWith('build:')
      ? buildToken
      : ''

// 如果是 release: 开头且没有显式指定构建脚本，默认为 build:all
if (isReleasePrefix && !buildScript) {
  buildScript = 'build:all'
}

const supportedBuildScripts = new Set(['build:win', 'build:mac', 'build:linux', 'build:unpack'])
const hasBuildScript = buildScript
  ? buildScript === 'build:all'
    ? [...supportedBuildScripts].every((s) => typeof scripts[s] === 'string' && scripts[s])
    : typeof scripts[buildScript] === 'string' && scripts[buildScript]
  : false

const fail = (text) => {
  process.stderr.write(`${text}\n`)
  process.exit(1)
}

const hasAnySignal = Boolean(isReleasePrefix || version || buildScript)
const shouldSkip = !hasAnySignal

if (!shouldSkip) {
  if (!version) {
    fail(
      [
        '未在提交信息中检测到版本号。',
        '示例：release: v1.2.3 build:win 或 release: 1.2.3',
        '支持格式：v1.2.3 或 1.2.3（可带 -beta.1 等后缀）'
      ].join('\n')
    )
  }

  if (!buildScript) {
    fail(
      [
        '未在提交信息中检测到构建命令标记。',
        '示例：release: v1.2.3 build:win',
        '支持：build:win | build:mac | build:linux | build:unpack | build:all'
      ].join('\n')
    )
  }

  if (!hasBuildScript) {
    fail(`构建脚本不存在或为空：${buildScript}`)
  }
}

const runWin = !shouldSkip && (buildScript === 'build:all' || buildScript === 'build:win')
const runMac = !shouldSkip && (buildScript === 'build:all' || buildScript === 'build:mac')
const runLinux = !shouldSkip && (buildScript === 'build:all' || buildScript === 'build:linux')
const runUnpack = !shouldSkip && buildScript === 'build:unpack'

const outputs = {
  version: shouldSkip ? '' : version,
  tag: shouldSkip ? '' : `v${version}`,
  build_script: shouldSkip ? '' : buildScript,
  run_win: String(runWin),
  run_mac: String(runMac),
  run_linux: String(runLinux),
  run_unpack: String(runUnpack)
}

if (process.env.GITHUB_OUTPUT) {
  const lines = Object.entries(outputs).map(([k, v]) => `${k}=${v}`)
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `${lines.join('\n')}\n`)
} else {
  process.stdout.write(`${JSON.stringify(outputs, null, 2)}\n`)
}
