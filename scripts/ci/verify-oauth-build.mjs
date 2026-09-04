import { readdir, readFile, stat } from "node:fs/promises"
import path from "node:path"

const mode = process.argv[2] || "pre"
const productionEnv = await readFile(path.resolve(".env.production"), "utf8").catch(() => "")
const committedPlatformId = productionEnv
  .split(/\r?\n/)
  .find((line) => line.startsWith("VITE_OAUTH_PLATFORM_ID="))
  ?.slice("VITE_OAUTH_PLATFORM_ID=".length)
  .trim()
const platformId = String(process.env.VITE_OAUTH_PLATFORM_ID || committedPlatformId || "").trim()

if (!platformId) {
  console.error("OAuth public client ID: missing")
  process.exit(1)
}

if (mode === "pre") {
  console.log("OAuth public client ID: configured")
  process.exit(0)
}

if (mode !== "post") {
  console.error("Usage: node scripts/ci/verify-oauth-build.mjs pre|post")
  process.exit(1)
}

const distDir = path.resolve("dist")
const files = []

async function collectFiles(directory) {
  for (const entry of await readdir(directory)) {
    const filePath = path.join(directory, entry)
    const fileStat = await stat(filePath)
    if (fileStat.isDirectory()) await collectFiles(filePath)
    else files.push(filePath)
  }
}

await collectFiles(distDir)

let hasPlatformId = false
let hasSecretMarker = false
let hasUnresolvedPlatformMarker = false
for (const file of files) {
  const content = await readFile(file)
  const text = content.toString("utf8")
  hasPlatformId ||= text.includes(platformId)
  hasSecretMarker ||= text.includes("VITE_OAUTH_PLATFORM_SECRET")
  hasUnresolvedPlatformMarker ||= text.includes("VITE_OAUTH_PLATFORM_ID")
}

if (!hasPlatformId || hasSecretMarker || hasUnresolvedPlatformMarker) {
  console.error("OAuth bundle verification: failed")
  process.exit(1)
}

console.log("OAuth bundle verification: passed")
