import fs from 'fs'
import path from 'path'

const version = String(process.argv[2] || '').trim().replace(/^v/i, '')
if (!version) {
  process.stderr.write('缺少版本号参数，例如：node scripts/ci/apply-version.mjs 1.2.3\n')
  process.exit(1)
}

const semverRe = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/
if (!semverRe.test(version)) {
  process.stderr.write(`非法版本号：${version}\n`)
  process.exit(1)
}

const pkgPath = path.join(process.cwd(), 'package.json')
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'))
pkg.version = version
fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`, 'utf-8')

