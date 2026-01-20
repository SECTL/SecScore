import React, { useState, useEffect, useCallback } from 'react'
import {
  Table,
  PrimaryTableCol,
  Tag,
  Button,
  Select,
  Space,
  Card,
  MessagePlugin,
  Dialog
} from 'tdesign-react'
import { ViewListIcon, DownloadIcon } from 'tdesign-icons-react'
import * as XLSX from 'xlsx'

interface studentRank {
  id: number
  name: string
  score: number
  range_change: number
}

export const Leaderboard: React.FC = () => {
  const [data, setData] = useState<studentRank[]>([])
  const [loading, setLoading] = useState(false)
  const [timeRange, setTimeRange] = useState('today')
  const [startTime, setStartTime] = useState<string | null>(null)
  const [historyVisible, setHistoryVisible] = useState(false)
  const [historyHeader, setHistoryHeader] = useState('')
  const [historyText, setHistoryText] = useState('')

  const fetchRankings = useCallback(async () => {
    if (!(window as any).api) return
    setLoading(true)
    try {
      const res = await (window as any).api.queryLeaderboard({ range: timeRange })
      if (res.success && res.data) {
        setStartTime(res.data.startTime)
        setData(res.data.rows)
      }
    } catch (e) {
      console.error('Failed to fetch rankings:', e)
    } finally {
      setLoading(false)
    }
  }, [timeRange])

  useEffect(() => {
    fetchRankings()
  }, [fetchRankings])

  useEffect(() => {
    const onDataUpdated = (e: any) => {
      const category = e?.detail?.category
      if (category === 'events' || category === 'students' || category === 'all') fetchRankings()
    }
    window.addEventListener('ss:data-updated', onDataUpdated as any)
    return () => window.removeEventListener('ss:data-updated', onDataUpdated as any)
  }, [fetchRankings])

  const handleViewHistory = async (studentName: string) => {
    if (!(window as any).api) return
    const res = await (window as any).api.queryEventsByStudent({
      student_name: studentName,
      limit: 200,
      startTime
    })
    if (!res.success) {
      MessagePlugin.error(res.message || '查询失败')
      return
    }

    const lines = (res.data || []).map((e: any) => {
      const time = new Date(e.event_time).toLocaleString()
      const delta = e.delta > 0 ? `+${e.delta}` : String(e.delta)
      return `${time}  ${delta}  ${e.reason_content}`
    })

    setHistoryHeader(`${studentName} - 操作记录`)
    setHistoryText(lines.join('\n') || '暂无记录')
    setHistoryVisible(true)
  }

  const handleExport = () => {
    // 使用 requestIdleCallback 或 setTimeout 避免阻塞 UI
    setTimeout(() => {
      const title = timeRange === 'today' ? '今天' : timeRange === 'week' ? '本周' : '本月'

      const sanitizeCell = (v: unknown) => {
        if (typeof v !== 'string') return v
        if (/^[=+\-@]/.test(v)) return `'${v}`
        return v
      }

      const sheetData = [
        ['排名', '姓名', '总积分', `${title}变化`],
        ...data.map((item, index) => [
          index + 1,
          sanitizeCell(item.name),
          item.score,
          item.range_change
        ])
      ]

      const ws = XLSX.utils.aoa_to_sheet(sheetData)
      ws['!cols'] = [{ wch: 6 }, { wch: 14 }, { wch: 10 }, { wch: 10 }]

      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, '排行榜')

      const xlsxBytes = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
      const blob = new Blob([xlsxBytes], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      })

      const link = document.createElement('a')
      const url = URL.createObjectURL(blob)
      link.setAttribute('href', url)
      link.setAttribute(
        'download',
        `排行榜_${timeRange}_${new Date().toISOString().slice(0, 10)}.xlsx`
      )
      link.style.visibility = 'hidden'
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
      MessagePlugin.success('导出成功')
    }, 0)
  }

  const columns: PrimaryTableCol<studentRank>[] = [
    {
      colKey: 'rank',
      title: '排名',
      width: 70,
      align: 'center',
      cell: ({ rowIndex }) => {
        const rank = rowIndex + 1
        let color = 'inherit'
        if (rank === 1) color = '#FFD700'
        if (rank === 2) color = '#C0C0C0'
        if (rank === 3) color = '#CD7F32'
        return (
          <span style={{ fontWeight: 'bold', color, fontSize: rank <= 3 ? '18px' : '14px' }}>
            {rank}
          </span>
        )
      }
    },
    { colKey: 'name', title: '姓名', width: 120, align: 'center' },
    {
      colKey: 'score',
      title: '总积分',
      width: 100,
      align: 'center',
      cell: ({ row }) => <span style={{ fontWeight: 'bold' }}>{row.score}</span>
    },
    {
      colKey: 'range_change',
      title: timeRange === 'today' ? '今日变化' : timeRange === 'week' ? '本周变化' : '本月变化',
      width: 100,
      align: 'center',
      cell: ({ row }) => (
        <Tag
          theme={row.range_change > 0 ? 'success' : row.range_change < 0 ? 'danger' : 'default'}
          variant="light"
        >
          {row.range_change > 0 ? `+${row.range_change}` : row.range_change}
        </Tag>
      )
    },
    {
      colKey: 'operation',
      title: '操作记录',
      width: 100,
      align: 'center',
      cell: ({ row }) => (
        <Button
          variant="text"
          theme="primary"
          icon={<ViewListIcon />}
          onClick={() => handleViewHistory(row.name)}
        >
          查看
        </Button>
      )
    }
  ]

  return (
    <div style={{ padding: '24px' }}>
      <div
        style={{
          marginBottom: '24px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}
      >
        <h2 style={{ margin: 0, color: 'var(--ss-text-main)' }}>积分排行榜</h2>
        <Space>
          <Select
            value={timeRange}
            onChange={(v) => setTimeRange(v as string)}
            style={{ width: '120px' }}
          >
            <Select.Option value="today" label="今天" />
            <Select.Option value="week" label="本周" />
            <Select.Option value="month" label="本月" />
          </Select>
          <Button variant="outline" icon={<DownloadIcon />} onClick={handleExport}>
            导出 XLSX
          </Button>
        </Space>
      </div>

      <Card style={{ backgroundColor: 'var(--ss-card-bg)' }}>
        <Table
          data={data}
          columns={columns}
          rowKey="id"
          loading={loading}
          bordered
          hover
          pagination={{ pageSize: 30, total: data.length, defaultCurrent: 1 }}
          scroll={{ type: 'virtual', rowHeight: 48, threshold: 100 }}
          className="ss-table-center"
          style={{ color: 'var(--ss-text-main)' }}
        />
      </Card>

      <Dialog
        header={historyHeader}
        visible={historyVisible}
        width="80%"
        cancelBtn={null}
        confirmBtn="关闭"
        onClose={() => setHistoryVisible(false)}
        onConfirm={() => setHistoryVisible(false)}
      >
        <div
          style={{
            maxHeight: '420px',
            overflowY: 'auto',
            fontSize: '12px',
            fontFamily:
              'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", "Microsoft YaHei UI", "Microsoft YaHei", "PingFang SC", monospace',
            whiteSpace: 'pre-wrap',
            backgroundColor: '#1e1e1e',
            color: '#d4d4d4',
            padding: '10px'
          }}
        >
          {historyText}
        </div>
      </Dialog>
    </div>
  )
}
