import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { Table, Button, Space, message, Modal, Form, Input, Tag, Pagination } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useTranslation } from 'react-i18next'
import { TagEditorDialog } from './TagEditorDialog'

const createXlsxWorker = () => {
  return new Worker(new URL('../workers/xlsxWorker.ts', import.meta.url), {
    type: 'module'
  })
}

interface student {
  id: number
  name: string
  score: number
  tags?: string[]
  tagIds?: number[]
}

export const StudentManager: React.FC<{ canEdit: boolean }> = ({ canEdit }) => {
  const { t } = useTranslation()
  const [data, setData] = useState<student[]>([])
  const [loading, setLoading] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState<number>(50)
  const [visible, setVisible] = useState(false)
  const [importVisible, setImportVisible] = useState(false)
  const [xlsxVisible, setXlsxVisible] = useState(false)
  const [tagEditVisible, setTagEditVisible] = useState(false)
  const [editingStudent, setEditingStudent] = useState<student | null>(null)
  const [xlsxLoading, setXlsxLoading] = useState(false)
  const [xlsxFileName, setXlsxFileName] = useState('')
  const [xlsxAoa, setXlsxAoa] = useState<any[][]>([])
  const [xlsxSelectedCol, setXlsxSelectedCol] = useState<number | null>(null)
  const xlsxInputRef = useRef<HTMLInputElement | null>(null)
  const xlsxWorkerRef = useRef<Worker | null>(null)
  const [form] = Form.useForm()
  const [messageApi, contextHolder] = message.useMessage()

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
        try {
          const students = await Promise.all(
            (res.data as any[]).map(async (s) => {
              let tagIds: number[] = []
              let tags: string[] = []

              try {
                const tagsRes = await (window as any).api.tagsGetByStudent(s.id)
                if (tagsRes.success && tagsRes.data) {
                  tagIds = tagsRes.data.map((t: any) => t.id)
                  tags = tagsRes.data.map((t: any) => t.name)
                }
              } catch (e) {
                console.warn('Failed to fetch tags for student:', s.id, e)
              }

              return {
                id: s.id,
                name: s.name,
                score: s.score,
                tags,
                tagIds
              }
            })
          )
          console.debug('Fetched students:', students)
          setData(students)
        } catch (e) {
          console.warn('Failed to parse students response, falling back:', e)
          setData(res.data)
        }
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
      messageApi.error(t('common.readOnly'))
      return
    }
    try {
      const values = await form.validateFields()
      if (!values.name) {
        messageApi.warning(t('students.nameRequired'))
        return
      }

      const name = values.name.trim()
      if (data.some((s) => s.name === name)) {
        messageApi.warning(t('students.nameExists'))
        return
      }

      const res = await (window as any).api.createStudent({ ...values, name })
      if (res.success) {
        messageApi.success(t('students.addSuccess'))
        setVisible(false)
        form.resetFields()
        fetchStudents()
        emitDataUpdated('students')
      } else {
        messageApi.error(res.message || t('students.addFailed'))
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
      messageApi.error(t('common.readOnly'))
      return
    }
    const res = await (window as any).api.deleteStudent(id)
    if (res.success) {
      messageApi.success(t('students.deleteSuccess'))
      fetchStudents()
      emitDataUpdated('students')
    } else {
      messageApi.error(res.message || t('students.deleteFailed'))
    }
  }

  const handleOpenTagEditor = (student: student) => {
    if (!canEdit) {
      messageApi.error(t('common.readOnly'))
      return
    }
    setEditingStudent(student)
    setTagEditVisible(true)
  }

  const handleSaveTags = async (tagIds: number[]) => {
    if (!editingStudent || !(window as any).api) return

    try {
      const res = await (window as any).api.tagsUpdateStudentTags(editingStudent.id, tagIds)
      if (res && res.success) {
        messageApi.success('标签保存成功')
        setTagEditVisible(false)
        setEditingStudent(null)
        fetchStudents()
        emitDataUpdated('students')
      } else {
        const errorMsg = res?.message || t('students.tagSaveFailed')
        messageApi.error(errorMsg)
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      messageApi.error(`${t('students.tagSaveFailed')}: ${errorMsg}`)
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
      messageApi.error(t('students.workerNotReady'))
      return
    }

    setXlsxLoading(true)
    try {
      const buf = await file.arrayBuffer()

      xlsxWorkerRef.current.postMessage({
        type: 'parseXlsx',
        data: { buffer: buf }
      })

      const handleMessage = (event: MessageEvent) => {
        if (event.data.type === 'success') {
          setXlsxFileName(file.name)
          setXlsxAoa(event.data.data)
          setXlsxSelectedCol(null)
          setXlsxVisible(true)
          setImportVisible(false)
          setXlsxLoading(false)
        } else if (event.data.type === 'error') {
          messageApi.error(event.data.error || t('students.parseXlsxFailed'))
          setXlsxLoading(false)
        }
        xlsxWorkerRef.current?.removeEventListener('message', handleMessage)
      }

      xlsxWorkerRef.current.addEventListener('message', handleMessage)
    } catch (e: any) {
      messageApi.error(e?.message || t('students.parseXlsxFailed'))
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
    const cols: any[] = [
      {
        title: '#',
        dataIndex: '__row',
        key: '__row',
        width: 60,
        align: 'center' as const,
        fixed: 'left' as const
      }
    ]
    for (let c = 0; c < xlsxMaxCols; c++) {
      const selected = xlsxSelectedCol === c
      cols.push({
        title: (
          <span
            style={{
              cursor: 'pointer',
              fontWeight: selected ? 700 : 500,
              color: selected ? 'var(--ant-color-primary, #1890ff)' : undefined
            }}
            onClick={() => setXlsxSelectedCol(c)}
          >
            {excelColName(c)}
          </span>
        ),
        dataIndex: `c${c}`,
        key: `c${c}`,
        width: 120
      })
    }
    return cols
  }, [xlsxMaxCols, xlsxSelectedCol])

  const extractNamesFromAoa = (aoa: any[][], colIdx: number) => {
    const out: string[] = []
    const seen = new Set<string>()
    const banned = new Set([t('students.name').toLowerCase(), 'name', t('students.name')])
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
      messageApi.error(t('common.readOnly'))
      return
    }
    if (xlsxSelectedCol == null) {
      messageApi.warning(t('students.selectNameColFirst'))
      return
    }

    const names = extractNamesFromAoa(xlsxAoa, xlsxSelectedCol)
    if (!names.length) {
      messageApi.error(t('students.noNamesFound'))
      return
    }

    setXlsxLoading(true)
    try {
      const res = await (window as any).api.importStudentsFromXlsx({ names })
      if (!res?.success) {
        messageApi.error(res?.message || t('students.importFailed'))
        return
      }
      const inserted = Number(res?.data?.inserted ?? 0)
      const skipped = Number(res?.data?.skipped ?? 0)
      messageApi.success(t('students.importComplete', { inserted, skipped }))
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

  const columns: ColumnsType<student> = [
    { title: t('students.name'), dataIndex: 'name', key: 'name', width: 100 },
    {
      title: t('students.currentScore'),
      dataIndex: 'score',
      key: 'score',
      width: 160,
      align: 'center',
      render: (score: number) => (
        <span
          style={{
            fontWeight: 'bold',
            color:
              score > 0
                ? 'var(--ant-color-success, #52c41a)'
                : score < 0
                  ? 'var(--ant-color-error, #ff4d4f)'
                  : 'inherit'
          }}
        >
          {score > 0 ? `+${score}` : score}
        </span>
      )
    },
    {
      title: t('students.tags'),
      dataIndex: 'tags',
      key: 'tags',
      width: 200,
      render: (tags: string[] = []) => (
        <Space>
          {tags.length === 0 ? (
            <span style={{ color: 'var(--ss-text-secondary)' }}>{t('students.noTags')}</span>
          ) : (
            tags.slice(0, 3).map((tag) => (
              <Tag key={tag} color="blue">
                {tag}
              </Tag>
            ))
          )}
          {tags.length > 3 && <Tag>+{tags.length - 3}</Tag>}
        </Space>
      )
    },
    {
      title: t('common.operation'),
      key: 'operation',
      width: 150,
      render: (_, row) => (
        <Space>
          <Button type="link" disabled={!canEdit} onClick={() => handleOpenTagEditor(row)}>
            {t('students.editTags')}
          </Button>
          <Button type="link" danger disabled={!canEdit} onClick={() => handleDelete(row.id)}>
            {t('common.delete')}
          </Button>
        </Space>
      )
    }
  ]

  const paginatedData = data.slice((currentPage - 1) * pageSize, currentPage * pageSize)

  return (
    <div style={{ padding: '24px' }}>
      {contextHolder}
      <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'space-between' }}>
        <h2 style={{ margin: 0, color: 'var(--ss-text-main)' }}>{t('students.title')}</h2>
        <Space>
          <Button disabled={!canEdit} onClick={() => setImportVisible(true)}>
            {t('students.importList')}
          </Button>
          <Button type="primary" disabled={!canEdit} onClick={() => setVisible(true)}>
            {t('students.addStudent')}
          </Button>
        </Space>
      </div>

      <Table
        dataSource={paginatedData}
        columns={columns}
        rowKey="id"
        loading={loading}
        pagination={false}
        style={{ backgroundColor: 'var(--ss-card-bg)', color: 'var(--ss-text-main)' }}
      />
      <div style={{ marginTop: 16, textAlign: 'right' }}>
        <Pagination
          current={currentPage}
          pageSize={pageSize}
          total={data.length}
          onChange={(page, size) => {
            setCurrentPage(page)
            setPageSize(size)
          }}
          showSizeChanger
          showTotal={(total) => t('common.total', { count: total })}
        />
      </div>

      <Modal
        title={t('students.addTitle')}
        open={visible}
        onOk={handleAdd}
        onCancel={() => setVisible(false)}
        okText={t('students.addConfirm')}
        cancelText={t('common.cancel')}
        destroyOnHidden
      >
        <Form form={form} layout="vertical">
          <Form.Item
            label={t('students.name')}
            name="name"
            rules={[{ required: true, message: t('students.nameRequired') }]}
          >
            <Input placeholder={t('students.namePlaceholder')} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={t('students.importTitle')}
        open={importVisible}
        onCancel={() => setImportVisible(false)}
        footer={null}
        destroyOnHidden
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          <Button
            loading={xlsxLoading}
            disabled={!canEdit}
            onClick={() => {
              xlsxInputRef.current?.click()
            }}
          >
            {t('students.importByXlsx')}
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
      </Modal>

      <Modal
        title={t('students.xlsxPreview')}
        open={xlsxVisible}
        onCancel={() => setXlsxVisible(false)}
        onOk={handleConfirmXlsxImport}
        okText={t('students.importConfirm')}
        okButtonProps={{ loading: xlsxLoading, disabled: xlsxSelectedCol == null }}
        width="80%"
        destroyOnHidden
      >
        <div style={{ marginBottom: '12px', color: 'var(--ss-text-secondary)', fontSize: '12px' }}>
          <div>
            {t('students.file')}
            {xlsxFileName || '-'}
          </div>
          <div>
            {t('students.selectNameCol')}
            {xlsxSelectedCol == null ? '-' : excelColName(xlsxSelectedCol)}
          </div>
          <div>{t('students.previewRows')}</div>
        </div>
        <Table
          dataSource={xlsxPreviewRows}
          columns={xlsxPreviewColumns}
          rowKey="__row"
          bordered
          scroll={{ y: 420 }}
          style={{ backgroundColor: 'var(--ss-card-bg)', color: 'var(--ss-text-main)' }}
          pagination={false}
        />
      </Modal>

      <TagEditorDialog
        visible={tagEditVisible}
        onClose={() => {
          setTagEditVisible(false)
          setEditingStudent(null)
        }}
        onConfirm={handleSaveTags}
        initialTagIds={editingStudent?.tagIds || []}
        title={t('students.editTagTitle', { name: editingStudent?.name || '' })}
      />
    </div>
  )
}
