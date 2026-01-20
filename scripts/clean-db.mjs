import fs from 'fs'
import path from 'path'

const root = process.cwd()
const targets = ['db.sqlite']

for (const name of targets) {
  const filePath = path.join(root, name)
  try {
    if (fs.existsSync(filePath)) {
      fs.rmSync(filePath, { force: true })
      console.log(`[clean-db] removed ${filePath}`)
    }
  } catch (e) {
    if (e.code === 'EPERM' || e.code === 'EACCES') {
      console.warn(`[clean-db] skipped ${filePath}: file in use or permission denied`)
    } else {
      console.error(`[clean-db] failed to remove ${filePath}:`, e?.message || e)
    }
  }
}
