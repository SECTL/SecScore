const fs = require('fs')
const path = require('path')

const afterPack = async (context) => {
  const appOutDir = context.appOutDir
  fs.mkdirSync(path.join(appOutDir, 'data'), { recursive: true })
}

module.exports = afterPack
module.exports.default = afterPack
