/**
 * lite 便携版一键构建脚本：
 * 1. 以 vite --mode lite 产出精简前端；
 * 2. 调 tauri build --no-default-features 编译不带 full 特性的 Rust 后端；
 * 3. 产物为内嵌前端的裸 exe（SecScoreLite.exe），数据存在 exe 旁 data/ 目录。
 */
const { spawn } = require("node:child_process")
const { writeFileSync, unlinkSync, existsSync } = require("node:fs")
const { join } = require("node:path")
const os = require("node:os")

const TARGET = process.env.LITE_TARGET || "x86_64-pc-windows-msvc"

function main() {
  const tempDir = os.tmpdir()
  const tempConfigPath = join(tempDir, `tauri-lite-config-${Date.now()}.json`)

  const overrideConfig = {
    productName: "SecScoreLite",
    mainBinaryName: "SecScoreLite",
    build: {
      beforeBuildCommand: "npm run build:lite",
    },
    bundle: {
      // 便携版只出裸 exe，不打包安装器。
      active: false,
    },
    plugins: {
      // lite 无 OAuth/deep-link，去掉 secscore:// 注册配置。
      deepLink: undefined,
    },
  }

  try {
    writeFileSync(tempConfigPath, JSON.stringify(overrideConfig), "utf-8")

    const tauriBin = join(__dirname, "..", "node_modules", ".bin",
      process.platform === "win32" ? "tauri.cmd" : "tauri")
    const args = [
      "build",
      "--target",
      TARGET,
      "--config",
      tempConfigPath,
      "--",
      "--no-default-features",
    ]

    console.log(`[tauri:build:lite] target=${TARGET}`)
    const child = spawn(tauriBin, args, {
      stdio: "inherit",
      shell: process.platform === "win32",
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
      if (code !== 0) {
        console.error("[tauri:build:lite] 构建失败")
      } else {
        console.log(
          `[tauri:build:lite] 完成。产物: src-tauri/target/${TARGET}/release/SecScoreLite.exe`
        )
      }
      process.exit(code ?? 1)
    })
  } catch (error) {
    if (existsSync(tempConfigPath)) {
      unlinkSync(tempConfigPath)
    }
    console.error("[tauri:build:lite] 启动失败:", error)
    process.exit(1)
  }
}

main()
