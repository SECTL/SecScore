/**
 * Clean script - Similar to `flutter clean`
 * Cleans all build artifacts and caches for the Tauri project
 */

const fs = require("fs")
const path = require("path")

// ANSI color codes for console output
const colors = {
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  reset: "\x1b[0m",
}

/**
 * Delete a directory recursively
 * @param {string} dirPath - Path to directory to delete
 */
function deleteDirectory(dirPath) {
  const fullPath = path.resolve(dirPath)

  if (!fs.existsSync(fullPath)) {
    console.log(`${colors.yellow}⊘${colors.reset} Not found: ${dirPath}`)
    return false
  }

  try {
    fs.rmSync(fullPath, { recursive: true, force: true })
    console.log(`${colors.green}✓${colors.reset} Deleted: ${dirPath}`)
    return true
  } catch (error) {
    console.error(`${colors.red}✗${colors.reset} Failed to delete ${dirPath}: ${error.message}`)
    return false
  }
}

/**
 * Delete a file
 * @param {string} filePath - Path to file to delete
 */
function deleteFile(filePath) {
  const fullPath = path.resolve(filePath)

  if (!fs.existsSync(fullPath)) {
    console.log(`${colors.yellow}⊘${colors.reset} Not found: ${filePath}`)
    return false
  }

  try {
    fs.unlinkSync(fullPath)
    console.log(`${colors.green}✓${colors.reset} Deleted: ${filePath}`)
    return true
  } catch (error) {
    console.error(`${colors.red}✗${colors.reset} Failed to delete ${filePath}: ${error.message}`)
    return false
  }
}

/**
 * Main clean function
 */
function clean() {
  console.log(`\n${colors.blue}════════════════════════════════════════${colors.reset}`)
  console.log(`${colors.blue}  SecScore Clean - Removing build artifacts${colors.reset}`)
  console.log(`${colors.blue}════════════════════════════════════════${colors.reset}\n`)

  // Get project root directory
  const rootDir = path.resolve(__dirname, "..")

  // Directories to clean
  const dirsToClean = [
    // Node.js / Frontend
    "node_modules",
    "dist",
    ".vite",

    // Rust / Tauri
    "src-tauri/target",

    // Test coverage
    "coverage",

    // Cache directories
    ".eslintcache",
    "node_modules/.cache",
  ]

  // Files to clean
  const filesToClean = [
    // Lock files
    "pnpm-lock.yaml",
  ]

  let deletedCount = 0
  let failedCount = 0

  // Clean directories
  console.log(`${colors.blue}Cleaning directories:${colors.reset}`)
  for (const dir of dirsToClean) {
    const dirPath = path.join(rootDir, dir)
    if (deleteDirectory(dirPath)) {
      deletedCount++
    } else if (fs.existsSync(dirPath)) {
      failedCount++
    }
  }

  // Clean files
  if (filesToClean.length > 0) {
    console.log(`\n${colors.blue}Cleaning files:${colors.reset}`)
    for (const file of filesToClean) {
      const filePath = path.join(rootDir, file)
      if (deleteFile(filePath)) {
        deletedCount++
      } else if (fs.existsSync(filePath)) {
        failedCount++
      }
    }
  }

  // Summary
  console.log(`\n${colors.blue}════════════════════════════════════════${colors.reset}`)
  console.log(`${colors.green}✓ Deleted: ${deletedCount}${colors.reset}`)
  if (failedCount > 0) {
    console.log(`${colors.red}✗ Failed: ${failedCount}${colors.reset}`)
  }
  console.log(`${colors.blue}════════════════════════════════════════${colors.reset}`)

  if (failedCount > 0) {
    console.log(
      `\n${colors.yellow}⚠ Some items could not be deleted. Try closing any running processes and try again.${colors.reset}\n`
    )
    process.exit(1)
  }

  console.log(`\n${colors.green}✓ Clean completed successfully!${colors.reset}`)
  console.log(`${colors.yellow}ℹ Run 'pnpm install' to reinstall dependencies.${colors.reset}\n`)
}

// Run clean
clean()
