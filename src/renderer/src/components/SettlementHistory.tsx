import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Button, Card, message, Space, Table } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useTranslation } from 'react-i18next'

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
  const { t } = useTranslation()
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
  const [messageApi, contextHolder] = message.useMessage()

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
        messageApi.error(res.message || t('settlements.queryFailed'))
        return
      }
      setSettlements(res.data || [])
    } catch (e) {
      console.error('Failed to fetch settlements:', e)
    } finally {
      setLoading(false)
    }
  }, [messageApi])

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
        messageApi.error(res.message || t('settlements.queryFailed'))
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

  const columns: ColumnsType<settlementLeaderboardRow> = useMemo(
    () => [
      {
        title: t('settlements.rank'),
        key: 'rank',
        width: 70,
        align: 'center',
        render: (_, __, index) => <span style={{ fontWeight: 'bold' }}>{index + 1}</span>
      },
      { title: t('settlements.name'), dataIndex: 'name', key: 'name', width: 160 },
      {
        title: t('settlements.phaseScore'),
        dataIndex: 'score',
        key: 'score',
        width: 120,
        render: (score: number) => <span style={{ fontWeight: 'bold' }}>{score}</span>
      }
    ],
    []
  )

  if (selectedId !== null && selectedSettlement) {
    return (
      <div style={{ padding: '24px' }}>
        {contextHolder}
        <Space style={{ marginBottom: '16px' }}>
          <Button
            onClick={() => {
              setSelectedId(null)
              setSelectedSettlement(null)
              setRows([])
            }}
          >
            {t('settlements.back')}
          </Button>
          <div style={{ color: 'var(--ss-text-main)', fontWeight: 700 }}>
            {t('settlements.leaderboardTitle')}
          </div>
          <div style={{ color: 'var(--ss-text-secondary)', fontSize: '12px' }}>
            {formatRange(selectedSettlement)}
          </div>
        </Space>

        <Card style={{ backgroundColor: 'var(--ss-card-bg)' }}>
          <Table
            dataSource={rows}
            columns={columns}
            rowKey="name"
            loading={detailLoading}
            bordered
            pagination={{ pageSize: 50, total: rows.length, defaultCurrent: 1 }}
            style={{ color: 'var(--ss-text-main)' }}
          />
        </Card>
      </div>
    )
  }

  return (
    <div style={{ padding: '24px' }}>
      {contextHolder}
      <h2 style={{ marginBottom: '16px', color: 'var(--ss-text-main)' }}>
        {t('settlements.title')}
      </h2>
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
            <div style={{ fontWeight: 700, marginBottom: '8px' }}>
              {t('settlements.phase', { id: s.id })}
            </div>
            <div
              style={{ fontSize: '12px', color: 'var(--ss-text-secondary)', marginBottom: '12px' }}
            >
              {formatRange(s)}
            </div>
            <Space>
              <Button type="primary" onClick={() => openSettlement(s.id)}>
                {t('settlements.viewLeaderboard')}
              </Button>
              <div style={{ fontSize: '12px', color: 'var(--ss-text-secondary)' }}>
                {t('settlements.recordCount', { count: s.event_count })}
              </div>
            </Space>
          </Card>
        ))}
      </div>
      {!loading && settlements.length === 0 && (
        <div style={{ marginTop: '16px', color: 'var(--ss-text-secondary)' }}>
          {t('settlements.noSettlements')}
        </div>
      )}
    </div>
  )
}
