import React, { useState, useEffect } from "react"
import { Table, Tag } from "antd"
import type { ColumnsType } from "antd/es/table"

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

  const columns: ColumnsType<scoreEvent> = [
    { title: "学生姓名", dataIndex: "student_name", key: "student_name", width: 120 },
    { title: "积分理由", dataIndex: "reason_content", key: "reason_content", width: 200 },
    {
      title: "分值变动",
      dataIndex: "delta",
      key: "delta",
      width: 100,
      render: (delta: number) => (
        <Tag color={delta > 0 ? "success" : "error"}>{delta > 0 ? `+${delta}` : delta}</Tag>
      ),
    },
    { title: "原分值", dataIndex: "val_prev", key: "val_prev", width: 100 },
    { title: "新分值", dataIndex: "val_curr", key: "val_curr", width: 100 },
    {
      title: "发生时间",
      dataIndex: "event_time",
      key: "event_time",
      width: 180,
      render: (time: string) => new Date(time).toLocaleString(),
    },
  ]

  return (
    <div style={{ padding: "24px" }}>
      <h2 style={{ marginBottom: "16px", color: "var(--ss-text-main)" }}>积分流水</h2>
      <Table
        dataSource={data}
        columns={columns}
        rowKey="uuid"
        loading={loading}
        bordered
        pagination={{ pageSize: 50, total: data.length, defaultCurrent: 1 }}
        style={{ backgroundColor: "var(--ss-card-bg)", color: "var(--ss-text-main)" }}
      />
    </div>
  )
}
