import fs from "fs"
import path from "path"

const rawVersion = String(process.argv[2] || "")
  .trim()
  .replace(/^v/i, "")
if (!rawVersion) {
  process.stderr.write("缺少版本号参数，例如：node scripts/ci/apply-version.mjs 1.2.3\n")
  process.exit(1)
}

const semverRe = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+([0-9A-Za-z.-]+))?$/

function toSemver(version) {
  if (semverRe.test(version)) {
    return version
  }

  const parts = version.split(/[._-]/)
  const nums = parts.filter((p) => /^\d+$/.test(p))
  const nonNums = parts.filter((p) => !/^\d+$/.test(p) && p.length > 0)

  let major = "0",
    minor = "0",
    patch = "0"
  let prerelease = ""
  let buildMeta = ""

  if (nums.length >= 3) {
    major = nums[0]
    minor = nums[1]
    patch = nums[2]
    if (nums.length > 3) {
      buildMeta = nums.slice(3).join(".")
    }
  } else if (nums.length === 2) {
    major = nums[0]
    minor = nums[1]
    patch = "0"
  } else if (nums.length === 1) {
    major = nums[0]
    minor = "0"
    patch = "0"
  }

  if (nonNums.length > 0) {
    if (prerelease) {
      prerelease += "." + nonNums.join(".")
    } else {
      prerelease = nonNums.join(".")
    }
  }

  let result = `${major}.${minor}.${patch}`
  if (prerelease) {
    result += `-${prerelease}`
  }
  if (buildMeta) {
    result += `+${buildMeta}`
  }

  return result
}

const version = toSemver(rawVersion)

process.stdout.write(`版本号转换: "${rawVersion}" -> "${version}"\n`)

const pkgPath = path.join(process.cwd(), "package.json")
const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"))
pkg.version = version
fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`, "utf-8")

const tauriConfPath = path.join(process.cwd(), "src-tauri", "tauri.conf.json")
const tauriConf = JSON.parse(fs.readFileSync(tauriConfPath, "utf-8"))
tauriConf.version = version
fs.writeFileSync(tauriConfPath, `${JSON.stringify(tauriConf, null, 2)}\n`, "utf-8")

const cargoPath = path.join(process.cwd(), "src-tauri", "Cargo.toml")
let cargoContent = fs.readFileSync(cargoPath, "utf-8")
cargoContent = cargoContent.replace(/^version = "[^"]+"/m, `version = "${version}"`)
fs.writeFileSync(cargoPath, cargoContent, "utf-8")
