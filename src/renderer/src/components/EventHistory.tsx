import React, { useState, useEffect } from 'react'
import { Table, PrimaryTableCol, Tag } from 'tdesign-react'

interface scoreEvent {
  id: number
  uuid: string
  student_name: string
  reason_content: string
  delta: number
  val_prev: number
  val_curr: number
  event_time: string
}

export const EventHistory: React.FC = () => {
  const [data, setData] = useState<scoreEvent[]>([])
  const [loading, setLoading] = useState(false)

  const fetchEvents = async () => {
    if (!(window as any).api) return
    setLoading(true)
    const res = await (window as any).api.queryEvents({ limit: 100 })
    if (res.success && res.data) {
      setData(res.data)
    }
    setLoading(false)
  }

  useEffect(() => {
    fetchEvents()
  }, [])

  const columns: PrimaryTableCol<scoreEvent>[] = [
    { colKey: 'student_name', title: '学生姓名', width: 120 },
    { colKey: 'reason_content', title: '积分理由', width: 200 },
    {
      colKey: 'delta',
      title: '分值变动',
      width: 100,
      cell: ({ row }) => (
        <Tag theme={row.delta > 0 ? 'success' : 'danger'} variant="light">
          {row.delta > 0 ? `+${row.delta}` : row.delta}
        </Tag>
      )
    },
    { colKey: 'val_prev', title: '原分值', width: 100 },
    { colKey: 'val_curr', title: '新分值', width: 100 },
    {
      colKey: 'event_time',
      title: '发生时间',
      width: 180,
      cell: ({ row }) => new Date(row.event_time).toLocaleString()
    }
  ]

  return (
    <div style={{ padding: '24px' }}>
      <h2 style={{ marginBottom: '16px', color: 'var(--ss-text-main)' }}>积分流水</h2>
      <Table
        data={data}
        columns={columns}
        rowKey="uuid"
        loading={loading}
        bordered
        hover
        pagination={{ pageSize: 50, total: data.length, defaultCurrent: 1 }}
        scroll={{ type: 'virtual', rowHeight: 48, threshold: 100 }}
        style={{ backgroundColor: 'var(--ss-card-bg)', color: 'var(--ss-text-main)' }}
      />
    </div>
  )
}
