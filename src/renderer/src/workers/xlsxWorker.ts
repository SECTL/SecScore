import * as XLSX from 'xlsx'

// 监听主线程消息
self.addEventListener('message', async (event: MessageEvent) => {
  const { type, data } = event.data

  if (type === 'parseXlsx') {
    try {
      const { buffer } = data
      const wb = XLSX.read(buffer, { type: 'array' })
      const firstSheetName = wb.SheetNames?.[0]
      if (!firstSheetName) {
        self.postMessage({ type: 'error', error: 'xlsx 中未找到工作表' })
        return
      }
      const ws = wb.Sheets[firstSheetName]
      const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' }) as any[][]
      if (!Array.isArray(aoa) || aoa.length === 0) {
        self.postMessage({ type: 'error', error: 'xlsx 内容为空' })
        return
      }

      self.postMessage({ type: 'success', data: aoa })
    } catch (error: any) {
      self.postMessage({ type: 'error', error: error?.message || '解析 xlsx 失败' })
    }
  }
})

export {}
