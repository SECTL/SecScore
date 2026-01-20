import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Button, Card, MessagePlugin, Space, Table } from 'tdesign-react'
import type { PrimaryTableCol } from 'tdesign-react'

interface settlementSummary {
  id: number
  start_time: string
  end_time: string
  event_count: number
}

interface settlementLeaderboardRow {
  name: string
  score: number
}

export const SettlementHistory: React.FC = () => {
  const [settlements, setSettlements] = useState<settlementSummary[]>([])
  const [loading, setLoading] = useState(false)

  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [selectedSettlement, setSelectedSettlement] = useState<{
    id: number
    start_time: string
    end_time: string
  } | null>(null)
  const [rows, setRows] = useState<settlementLeaderboardRow[]>([])
  const [detailLoading, setDetailLoading] = useState(false)

  const formatRange = (s: { start_time: string; end_time: string }) => {
    const start = new Date(s.start_time).toLocaleString()
    const end = new Date(s.end_time).toLocaleString()
    return `${start} - ${end}`
  }

  const fetchSettlements = useCallback(async () => {
    if (!(window as any).api) return
    setLoading(true)
    try {
      const res = await (window as any).api.querySettlements()
      if (!res.success) {
        MessagePlugin.error(res.message || '查询失败')
        return
      }
      setSettlements(res.data || [])
    } catch (e) {
      console.error('Failed to fetch settlements:', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchSettlements()
  }, [fetchSettlements])

  useEffect(() => {
    const onDataUpdated = (e: any) => {
      const category = e?.detail?.category
      if (category === 'events' || category === 'all') fetchSettlements()
    }
    window.addEventListener('ss:data-updated', onDataUpdated as any)
    return () => window.removeEventListener('ss:data-updated', onDataUpdated as any)
  }, [fetchSettlements])

  const openSettlement = async (id: number) => {
    if (!(window as any).api) return
    setSelectedId(id)
    setDetailLoading(true)
    try {
      const res = await (window as any).api.querySettlementLeaderboard({ settlement_id: id })
      if (!res.success || !res.data) {
        MessagePlugin.error(res.message || '查询失败')
        return
      }
      setSelectedSettlement(res.data.settlement)
      setRows(res.data.rows || [])
    } catch (e) {
      console.error('Failed to fetch settlement leaderboard:', e)
    } finally {
      setDetailLoading(false)
    }
  }

  const columns: PrimaryTableCol<settlementLeaderboardRow>[] = useMemo(
    () => [
      {
        colKey: 'rank',
        title: '排名',
        width: 70,
        align: 'center',
        cell: ({ rowIndex }) => <span style={{ fontWeight: 'bold' }}>{rowIndex + 1}</span>
      },
      { colKey: 'name', title: '姓名', width: 160 },
      {
        colKey: 'score',
        title: '阶段积分',
        width: 120,
        cell: ({ row }) => <span style={{ fontWeight: 'bold' }}>{row.score}</span>
      }
    ],
    []
  )

  if (selectedId !== null && selectedSettlement) {
    return (
      <div style={{ padding: '24px' }}>
        <Space style={{ marginBottom: '16px' }}>
          <Button
            variant="outline"
            onClick={() => {
              setSelectedId(null)
              setSelectedSettlement(null)
              setRows([])
            }}
          >
            返回
          </Button>
          <div style={{ color: 'var(--ss-text-main)', fontWeight: 700 }}>结算排行榜</div>
          <div style={{ color: 'var(--ss-text-secondary)', fontSize: '12px' }}>
            {formatRange(selectedSettlement)}
          </div>
        </Space>

        <Card style={{ backgroundColor: 'var(--ss-card-bg)' }}>
          <Table
            data={rows}
            columns={columns}
            rowKey="name"
            loading={detailLoading}
            bordered
            hover
            pagination={{ pageSize: 50, total: rows.length, defaultCurrent: 1 }}
            scroll={{ type: 'virtual', rowHeight: 48, threshold: 100 }}
            style={{ color: 'var(--ss-text-main)' }}
          />
        </Card>
      </div>
    )
  }

  return (
    <div style={{ padding: '24px' }}>
      <h2 style={{ marginBottom: '16px', color: 'var(--ss-text-main)' }}>结算历史</h2>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
          gap: '16px'
        }}
      >
        {settlements.map((s) => (
          <Card
            key={s.id}
            style={{ backgroundColor: 'var(--ss-card-bg)', color: 'var(--ss-text-main)' }}
          >
            <div style={{ fontWeight: 700, marginBottom: '8px' }}>阶段 #{s.id}</div>
            <div
              style={{ fontSize: '12px', color: 'var(--ss-text-secondary)', marginBottom: '12px' }}
            >
              {formatRange(s)}
            </div>
            <Space>
              <Button theme="primary" onClick={() => openSettlement(s.id)}>
                查看排行榜
              </Button>
              <div style={{ fontSize: '12px', color: 'var(--ss-text-secondary)' }}>
                记录数: {s.event_count}
              </div>
            </Space>
          </Card>
        ))}
      </div>
      {!loading && settlements.length === 0 && (
        <div style={{ marginTop: '16px', color: 'var(--ss-text-secondary)' }}>暂无结算记录</div>
      )}
    </div>
  )
}
