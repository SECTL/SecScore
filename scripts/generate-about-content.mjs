import fs from "fs"
import path from "path"

const cwd = process.cwd()
const readmePath = path.join(cwd, "README.md")
const outputPath = path.join(cwd, "public", "about-content.json")
const pkgPath = path.join(cwd, "package.json")

if (!fs.existsSync(readmePath)) {
  console.error("README.md not found")
  process.exit(1)
}

const readmeContent = fs.readFileSync(readmePath, "utf-8")

// 提取 README 的主要内容（跳过徽章部分）
const lines = readmeContent.split("\n")
let startIndex = 0

// 找到第一个非空行且不是徽章的行
for (let i = 0; i < lines.length; i++) {
  const line = lines[i].trim()
  // 跳过徽章行、空行、标题行
  if (line && !line.startsWith("<") && !line.startsWith("[") && !line.startsWith("!")) {
    startIndex = i
    break
  }
}

// 提取主要内容
const mainContent = lines.slice(startIndex).join("\n")

// 简单的 markdown 转 HTML（保留基本格式）
function markdownToHtml(md) {
  return md
    .replace(/^### (.*$)/gim, "<h3>$1</h3>")
    .replace(/^## (.*$)/gim, "<h2>$1</h2>")
    .replace(/^# (.*$)/gim, "<h1>$1</h1>")
    .replace(/\*\*(.*)\*\*/gim, "<strong>$1</strong>")
    .replace(/\*(.*)\*/gim, "<em>$1</em>")
    .replace(/`([^`]+)`/gim, "<code>$1</code>")
    .replace(/^- (.*$)/gim, "<li>$1</li>")
    .replace(/(<li>.*<\/li>\n?)+/gim, "<ul>$&</ul>")
    .replace(/\n/gim, "<br>")
}

// 读取 package.json 获取版本号
let version = "1.0.0"
if (fs.existsSync(pkgPath)) {
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"))
  version = pkg.version || version
}

const aboutData = {
  title: "SecScore",
  description: "教育积分管理软件",
  version: `v${version}`,
  content: markdownToHtml(mainContent),
  rawMarkdown: mainContent,
}

// 确保 public 目录存在
const publicDir = path.join(cwd, "public")
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true })
}

fs.writeFileSync(outputPath, JSON.stringify(aboutData, null, 2), "utf-8")
console.log(`About content generated: ${outputPath}`)
