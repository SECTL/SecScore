import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { Table, Button, Space, MessagePlugin, Dialog, Form, Input } from 'tdesign-react'
import type { PrimaryTableCol } from 'tdesign-react'

// 创建 XLSX Worker
const createXlsxWorker = () => {
  return new Worker(new URL('../workers/xlsxWorker.ts', import.meta.url), {
    type: 'module'
  })
}

interface student {
  id: number
  name: string
  score: number
}

export const StudentManager: React.FC<{ canEdit: boolean }> = ({ canEdit }) => {
  const [data, setData] = useState<student[]>([])
  const [loading, setLoading] = useState(false)
  const [visible, setVisible] = useState(false)
  const [importVisible, setImportVisible] = useState(false)
  const [xlsxVisible, setXlsxVisible] = useState(false)
  const [xlsxLoading, setXlsxLoading] = useState(false)
  const [xlsxFileName, setXlsxFileName] = useState('')
  const [xlsxAoa, setXlsxAoa] = useState<any[][]>([])
  const [xlsxSelectedCol, setXlsxSelectedCol] = useState<number | null>(null)
  const xlsxInputRef = useRef<HTMLInputElement | null>(null)
  const xlsxWorkerRef = useRef<Worker | null>(null)
  const [form] = Form.useForm()

  // 初始化 Worker
  useEffect(() => {
    xlsxWorkerRef.current = createXlsxWorker()
    return () => {
      xlsxWorkerRef.current?.terminate()
    }
  }, [])

  const emitDataUpdated = (category: 'students' | 'all') => {
    window.dispatchEvent(new CustomEvent('ss:data-updated', { detail: { category } }))
  }

  const fetchStudents = useCallback(async () => {
    if (!(window as any).api) return
    setLoading(true)
    try {
      const res = await (window as any).api.queryStudents({})
      if (res.success && res.data) {
        setData(res.data)
      }
    } catch (e) {
      console.error('Failed to fetch students:', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchStudents()
    const onDataUpdated = (e: any) => {
      const category = e?.detail?.category
      if (category === 'students' || category === 'all') fetchStudents()
    }
    window.addEventListener('ss:data-updated', onDataUpdated as any)
    return () => window.removeEventListener('ss:data-updated', onDataUpdated as any)
  }, [fetchStudents])

  const handleAdd = async () => {
    if (!(window as any).api) return
    if (!canEdit) {
      MessagePlugin.error('当前为只读权限')
      return
    }
    try {
      const validateResult = await form.validate()
      if (validateResult !== true) {
        return
      }

      const values = form.getFieldsValue(true) as { name: string }
      if (!values.name) {
        MessagePlugin.warning('请输入姓名')
        return
      }

      const name = values.name.trim()
      if (data.some((s) => s.name === name)) {
        MessagePlugin.warning('学生姓名已存在')
        return
      }

      const res = await (window as any).api.createStudent({ ...values, name })
      if (res.success) {
        MessagePlugin.success('添加成功')
        setVisible(false)
        form.reset()
        fetchStudents()
        emitDataUpdated('students')
      } else {
        MessagePlugin.error(res.message || '添加失败')
      }
    } catch (err) {
      try {
        const api = (window as any).api
        api?.writeLog?.({
          level: 'error',
          message: 'renderer:validate error',
          meta:
            err instanceof Error ? { message: err.message, stack: err.stack } : { err: String(err) }
        })
      } catch {
        return
      }
    }
  }

  const handleDelete = async (id: number) => {
    if (!(window as any).api) return
    if (!canEdit) {
      MessagePlugin.error('当前为只读权限')
      return
    }
    const res = await (window as any).api.deleteStudent(id)
    if (res.success) {
      MessagePlugin.success('删除成功')
      fetchStudents()
      emitDataUpdated('students')
    } else {
      MessagePlugin.error(res.message || '删除失败')
    }
  }

  const excelColName = (idx: number) => {
    let n = idx + 1
    let s = ''
    while (n > 0) {
      const mod = (n - 1) % 26
      s = String.fromCharCode(65 + mod) + s
      n = Math.floor((n - 1) / 26)
    }
    return s
  }

  const parseXlsxFile = async (file: File) => {
    if (!xlsxWorkerRef.current) {
      MessagePlugin.error('Worker 未初始化')
      return
    }

    setXlsxLoading(true)
    try {
      const buf = await file.arrayBuffer()

      // 使用 Worker 处理文件解析，避免阻塞主线程
      xlsxWorkerRef.current.postMessage({
        type: 'parseXlsx',
        data: { buffer: buf }
      })

      // 监听 Worker 消息
      const handleMessage = (event: MessageEvent) => {
        if (event.data.type === 'success') {
          setXlsxFileName(file.name)
          setXlsxAoa(event.data.data)
          setXlsxSelectedCol(null)
          setXlsxVisible(true)
          setImportVisible(false)
          setXlsxLoading(false)
        } else if (event.data.type === 'error') {
          MessagePlugin.error(event.data.error || '解析 xlsx 失败')
          setXlsxLoading(false)
        }
        xlsxWorkerRef.current?.removeEventListener('message', handleMessage)
      }

      xlsxWorkerRef.current.addEventListener('message', handleMessage)
    } catch (e: any) {
      MessagePlugin.error(e?.message || '解析 xlsx 失败')
      setXlsxLoading(false)
    }
  }

  const xlsxMaxCols = useMemo(() => {
    let max = 0
    for (const row of xlsxAoa) {
      if (Array.isArray(row)) max = Math.max(max, row.length)
    }
    return max
  }, [xlsxAoa])

  const xlsxPreviewRows = useMemo(() => {
    const limit = 50
    const rows = xlsxAoa.slice(0, limit)
    return rows.map((row, idx) => {
      const record: any = { __row: idx + 1 }
      for (let c = 0; c < xlsxMaxCols; c++) {
        record[`c${c}`] = row?.[c] ?? ''
      }
      return record
    })
  }, [xlsxAoa, xlsxMaxCols])

  const xlsxPreviewColumns = useMemo(() => {
    const cols: PrimaryTableCol<any>[] = [
      { colKey: '__row', title: '#', width: 60, align: 'center', fixed: 'left' as any }
    ]
    for (let c = 0; c < xlsxMaxCols; c++) {
      const selected = xlsxSelectedCol === c
      cols.push({
        colKey: `c${c}`,
        title: (
          <span
            style={{
              cursor: 'pointer',
              fontWeight: selected ? 700 : 500,
              color: selected ? 'var(--td-brand-color)' : undefined
            }}
            onClick={() => setXlsxSelectedCol(c)}
          >
            {excelColName(c)}
          </span>
        ),
        minWidth: 120
      })
    }
    return cols
  }, [xlsxMaxCols, xlsxSelectedCol])

  const extractNamesFromAoa = (aoa: any[][], colIdx: number) => {
    const out: string[] = []
    const seen = new Set<string>()
    const banned = new Set(['姓名', 'name', '名字'])
    for (const row of aoa) {
      const raw = row?.[colIdx]
      const name = String(raw ?? '').trim()
      if (!name) continue
      if (banned.has(name.toLowerCase()) || banned.has(name)) continue
      if (seen.has(name)) continue
      seen.add(name)
      out.push(name)
    }
    return out
  }

  const handleConfirmXlsxImport = async () => {
    if (!(window as any).api) return
    if (!canEdit) {
      MessagePlugin.error('当前为只读权限')
      return
    }
    if (xlsxSelectedCol == null) {
      MessagePlugin.warning('请先点击选择“姓名列”')
      return
    }

    const names = extractNamesFromAoa(xlsxAoa, xlsxSelectedCol)
    if (!names.length) {
      MessagePlugin.error('所选列未解析到可导入的姓名')
      return
    }

    setXlsxLoading(true)
    try {
      const res = await (window as any).api.importStudentsFromXlsx({ names })
      if (!res?.success) {
        MessagePlugin.error(res?.message || '导入失败')
        return
      }
      const inserted = Number(res?.data?.inserted ?? 0)
      const skipped = Number(res?.data?.skipped ?? 0)
      MessagePlugin.success(`导入完成：新增 ${inserted}，跳过 ${skipped}`)
      setXlsxVisible(false)
      setXlsxAoa([])
      setXlsxFileName('')
      setXlsxSelectedCol(null)
      fetchStudents()
      emitDataUpdated('students')
    } finally {
      setXlsxLoading(false)
    }
  }

  const columns: PrimaryTableCol<student>[] = [
    { colKey: 'name', title: '姓名', width: 200 },
    {
      colKey: 'score',
      title: '当前积分',
      width: 120,
      align: 'center',
      cell: ({ row }) => (
        <span
          style={{
            fontWeight: 'bold',
            color:
              row.score > 0
                ? 'var(--td-success-color)'
                : row.score < 0
                  ? 'var(--td-error-color)'
                  : 'inherit'
          }}
        >
          {row.score > 0 ? `+${row.score}` : row.score}
        </span>
      )
    },
    {
      colKey: 'operation',
      title: '操作',
      width: 100,
      cell: ({ row }) => (
        <Space>
          <Button
            theme="danger"
            variant="text"
            disabled={!canEdit}
            onClick={() => handleDelete(row.id)}
          >
            删除
          </Button>
        </Space>
      )
    }
  ]

  return (
    <div style={{ padding: '24px' }}>
      <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'space-between' }}>
        <h2 style={{ margin: 0, color: 'var(--ss-text-main)' }}>学生管理</h2>
        <Space>
          <Button variant="outline" disabled={!canEdit} onClick={() => setImportVisible(true)}>
            导入名单
          </Button>
          <Button theme="primary" disabled={!canEdit} onClick={() => setVisible(true)}>
            添加学生
          </Button>
        </Space>
      </div>

      <Table
        data={data}
        columns={columns}
        rowKey="id"
        loading={loading}
        bordered
        hover
        pagination={{ pageSize: 50, total: data.length, defaultCurrent: 1 }}
        scroll={{ type: 'virtual', rowHeight: 48, threshold: 100 }}
        style={{ backgroundColor: 'var(--ss-card-bg)', color: 'var(--ss-text-main)' }}
      />

      {/* 添加学生弹窗 */}
      <Dialog
        header="添加学生"
        visible={visible}
        onConfirm={handleAdd}
        onClose={() => setVisible(false)}
        destroyOnClose
      >
        <Form form={form} labelWidth={80}>
          <Form.FormItem label="姓名" name="name">
            <Input placeholder="请输入学生姓名" />
          </Form.FormItem>
        </Form>
      </Dialog>

      <Dialog
        header="导入名单"
        visible={importVisible}
        onClose={() => setImportVisible(false)}
        footer={false}
        destroyOnClose
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          <Button
            loading={xlsxLoading}
            disabled={!canEdit}
            onClick={() => {
              xlsxInputRef.current?.click()
            }}
          >
            通过 xlsx 导入
          </Button>
          <input
            ref={xlsxInputRef}
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) parseXlsxFile(file)
              if (xlsxInputRef.current) xlsxInputRef.current.value = ''
            }}
          />
        </Space>
      </Dialog>

      <Dialog
        header="xlsx 预览与导入"
        visible={xlsxVisible}
        onClose={() => setXlsxVisible(false)}
        confirmBtn={{ content: '导入', loading: xlsxLoading, disabled: xlsxSelectedCol == null }}
        onConfirm={handleConfirmXlsxImport}
        width="80%"
        destroyOnClose
      >
        <div style={{ marginBottom: '12px', color: 'var(--ss-text-secondary)', fontSize: '12px' }}>
          <div>文件：{xlsxFileName || '-'}</div>
          <div>
            点击表头选择姓名列：{xlsxSelectedCol == null ? '-' : excelColName(xlsxSelectedCol)}
          </div>
          <div>预览前 50 行</div>
        </div>
        <Table
          data={xlsxPreviewRows}
          columns={xlsxPreviewColumns}
          rowKey="__row"
          bordered
          hover
          maxHeight={420}
          style={{ backgroundColor: 'var(--ss-card-bg)', color: 'var(--ss-text-main)' }}
        />
      </Dialog>
    </div>
  )
}
