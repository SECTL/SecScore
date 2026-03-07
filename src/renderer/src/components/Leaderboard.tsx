import React, { useState, useEffect, useCallback } from 'react'
import { Table, Tag, Button, Select, Space, Card, message, Modal } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useTranslation } from 'react-i18next'
import { EyeOutlined, DownloadOutlined } from '@ant-design/icons'
import * as XLSX from 'xlsx'

interface studentRank {
  id: number
  name: string
  score: number
  range_change: number
}

export const Leaderboard: React.FC = () => {
  const { t } = useTranslation()
  const [data, setData] = useState<studentRank[]>([])
  const [loading, setLoading] = useState(false)
  const [timeRange, setTimeRange] = useState('today')
  const [startTime, setStartTime] = useState<string | null>(null)
  const [historyVisible, setHistoryVisible] = useState(false)
  const [historyHeader, setHistoryHeader] = useState('')
  const [historyText, setHistoryText] = useState('')
  const [messageApi, contextHolder] = message.useMessage()

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
      messageApi.error(res.message || t('leaderboard.queryFailed'))
      return
    }

    const lines = (res.data || []).map((e: any) => {
      const time = new Date(e.event_time).toLocaleString()
      const delta = e.delta > 0 ? `+${e.delta}` : String(e.delta)
      return `${time}  ${delta}  ${e.reason_content}`
    })

    setHistoryHeader(t('leaderboard.historyTitle', { name: studentName }))
    setHistoryText(lines.join('\n') || t('common.noData'))
    setHistoryVisible(true)
  }

  const handleExport = () => {
    setTimeout(() => {
      const title =
        timeRange === 'today'
          ? t('leaderboard.today')
          : timeRange === 'week'
            ? t('leaderboard.week')
            : t('leaderboard.month')

      const sanitizeCell = (v: unknown) => {
        if (typeof v !== 'string') return v
        if (/^[=+\-@]/.test(v)) return `'${v}`
        return v
      }

      const sheetData = [
        [
          t('leaderboard.rank'),
          t('leaderboard.name'),
          t('leaderboard.totalScore'),
          `${title}${t('leaderboard.change')}`
        ],
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
      XLSX.utils.book_append_sheet(wb, ws, t('leaderboard.title'))

      const xlsxBytes = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
      const blob = new Blob([xlsxBytes], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      })

      const link = document.createElement('a')
      const url = URL.createObjectURL(blob)
      link.setAttribute('href', url)
      link.setAttribute(
        'download',
        `${t('leaderboard.title')}_${timeRange}_${new Date().toISOString().slice(0, 10)}.xlsx`
      )
      link.style.visibility = 'hidden'
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
      messageApi.success(t('leaderboard.exportSuccess'))
    }, 0)
  }

  const columns: ColumnsType<studentRank> = [
    {
      title: t('leaderboard.rank'),
      key: 'rank',
      width: 70,
      align: 'center',
      render: (_, __, index) => {
        const rank = index + 1
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
    { title: t('leaderboard.name'), dataIndex: 'name', key: 'name', width: 120, align: 'center' },
    {
      title: t('leaderboard.totalScore'),
      dataIndex: 'score',
      key: 'score',
      width: 100,
      align: 'center',
      render: (score: number) => <span style={{ fontWeight: 'bold' }}>{score}</span>
    },
    {
      title:
        timeRange === 'today'
          ? t('leaderboard.todayChange')
          : timeRange === 'week'
            ? t('leaderboard.weekChange')
            : t('leaderboard.monthChange'),
      dataIndex: 'range_change',
      key: 'range_change',
      width: 100,
      align: 'center',
      render: (change: number) => (
        <Tag color={change > 0 ? 'success' : change < 0 ? 'error' : 'default'}>
          {change > 0 ? `+${change}` : change}
        </Tag>
      )
    },
    {
      title: t('leaderboard.operationRecord'),
      key: 'operation',
      width: 100,
      align: 'center',
      render: (_, row) => (
        <Button type="link" icon={<EyeOutlined />} onClick={() => handleViewHistory(row.name)}>
          {t('leaderboard.viewHistory')}
        </Button>
      )
    }
  ]

  return (
    <div style={{ padding: '24px' }}>
      {contextHolder}
      <div
        style={{
          marginBottom: '24px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}
      >
        <h2 style={{ margin: 0, color: 'var(--ss-text-main)' }}>{t('leaderboard.title')}</h2>
        <Space>
          <Select
            value={timeRange}
            onChange={(v) => setTimeRange(v)}
            style={{ width: '120px' }}
            options={[
              { value: 'today', label: t('leaderboard.today') },
              { value: 'week', label: t('leaderboard.week') },
              { value: 'month', label: t('leaderboard.month') }
            ]}
          />
          <Button icon={<DownloadOutlined />} onClick={handleExport}>
            {t('leaderboard.exportXlsx')}
          </Button>
        </Space>
      </div>

      <Card style={{ backgroundColor: 'var(--ss-card-bg)' }}>
        <Table
          dataSource={data}
          columns={columns}
          rowKey="id"
          loading={loading}
          bordered
          pagination={{ pageSize: 30, total: data.length, defaultCurrent: 1 }}
          style={{ color: 'var(--ss-text-main)' }}
        />
      </Card>

      <Modal
        title={historyHeader}
        open={historyVisible}
        onCancel={() => setHistoryVisible(false)}
        footer={<Button onClick={() => setHistoryVisible(false)}>{t('common.close')}</Button>}
        width="80%"
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
      </Modal>
    </div>
  )
}
