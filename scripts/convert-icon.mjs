import { readFileSync, writeFileSync } from "fs"
import { join, dirname } from "path"
import { fileURLToPath } from "url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const rootDir = join(__dirname, "..")

// 读取 SVG 文件
const svgPath = join(rootDir, "resources", "SecScore.svg")
const svgContent = readFileSync(svgPath, "utf-8")

// 创建不同尺寸的 PNG（使用 base64 编码的透明像素作为占位符，实际使用时需要真实转换）
// 这里我们直接复制现有的 icon.png 如果存在的话
import { existsSync, copyFileSync } from "fs"

const resourcesIcon = join(rootDir, "resources", "SecScore_logo.ico")
const targetIcon = join(rootDir, "src-tauri", "icons", "icon.ico")

if (existsSync(resourcesIcon)) {
  copyFileSync(resourcesIcon, targetIcon)
  console.log("✓ 已复制图标到 src-tauri/icons/icon.ico")
} else {
  console.error("✗ 未找到资源图标")
  process.exit(1)
}

// 对于 PNG，我们需要创建一个简单的转换
// 由于没有 ImageMagick 或其他工具，我们创建一个简单的 SVG 到 PNG 的 base64 转换
const sizes = [32, 128, 256, 512]

// 创建一个简单的 1x1 透明 PNG (base64)
const transparentPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64"
)

// 注意：这里只是占位符，实际项目中应该使用真实的图标转换工具
// 如 ImageMagick: convert -background none -resize 512x512 SecScore.svg icon.png
// 或使用 sharp 库

console.log("\n注意：请使用以下命令手动转换 SVG 到 PNG:")
console.log("  ImageMagick: convert -background none -resize 512x512 resources/SecScore.svg src-tauri/icons/icon.png")
console.log("  或在线工具将 SVG 转换为 512x512 PNG")
console.log("\n已更新图标配置，请确保 src-tauri/icons/ 目录包含:")
console.log("  - icon.ico (Windows 图标)")
console.log("  - icon.png (512x512 PNG 图标)")
