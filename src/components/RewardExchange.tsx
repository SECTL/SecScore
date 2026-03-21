import React, { useCallback, useEffect, useMemo, useState } from "react"
import { Button, Card, Modal, Table, Tag, message } from "antd"
import type { ColumnsType } from "antd/es/table"
import { useTranslation } from "react-i18next"

interface StudentItem {
  id: number
  name: string
  score: number
  reward_points: number
}

interface RewardItem {
  id: number
  name: string
  cost_points: number
}

interface RedemptionItem {
  id: number
  uuid: string
  student_name: string
  reward_id: number
  reward_name: string
  cost_points: number
  redeemed_at: string
}

export const RewardExchange: React.FC<{ canEdit: boolean }> = ({ canEdit }) => {
  const { t } = useTranslation()
  const [students, setStudents] = useState<StudentItem[]>([])
  const [rewards, setRewards] = useState<RewardItem[]>([])
  const [records, setRecords] = useState<RedemptionItem[]>([])
  const [loading, setLoading] = useState(false)
  const [exchangeMode, setExchangeMode] = useState(false)
  const [selectedStudent, setSelectedStudent] = useState<StudentItem | null>(null)
  const [chooseRewardVisible, setChooseRewardVisible] = useState(false)
  const [messageApi, contextHolder] = message.useMessage()

  const emitDataUpdated = () => {
    window.dispatchEvent(new CustomEvent("ss:data-updated", { detail: { category: "all" } }))
  }

  const fetchData = useCallback(async () => {
    if (!(window as any).api) return
    setLoading(true)
    try {
      const [stuRes, rewardRes, recordRes] = await Promise.all([
        (window as any).api.queryStudents({}),
        (window as any).api.rewardSettingQuery(),
        (window as any).api.rewardRedemptionQuery({ limit: 100 }),
      ])

      if (stuRes.success && Array.isArray(stuRes.data)) {
        setStudents(stuRes.data)
      }
      if (rewardRes.success && Array.isArray(rewardRes.data)) {
        setRewards(rewardRes.data)
      }
      if (recordRes.success && Array.isArray(recordRes.data)) {
        setRecords(recordRes.data)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
    const onDataUpdated = (e: any) => {
      const category = e?.detail?.category
      if (category === "all" || category === "students" || category === "events") {
        fetchData()
      }
    }
    window.addEventListener("ss:data-updated", onDataUpdated as any)
    return () => window.removeEventListener("ss:data-updated", onDataUpdated as any)
  }, [fetchData])

  const sortedStudents = useMemo(
    () =>
      [...students].sort(
        (a, b) => b.reward_points - a.reward_points || a.name.localeCompare(b.name, "zh-CN")
      ),
    [students]
  )

  const affordableRewards = useMemo(() => {
    if (!selectedStudent) return []
    return rewards.filter((r) => r.cost_points <= selectedStudent.reward_points)
  }, [rewards, selectedStudent])

  const handleStudentClick = (student: StudentItem) => {
    if (!exchangeMode) return
    if (!canEdit) {
      messageApi.error(t("common.readOnly"))
      return
    }
    setSelectedStudent(student)
    setChooseRewardVisible(true)
  }

  const handleRedeem = async (reward: RewardItem) => {
    if (!(window as any).api || !selectedStudent) return
    if (!canEdit) {
      messageApi.error(t("common.readOnly"))
      return
    }

    const res = await (window as any).api.rewardRedeem({
      student_name: selectedStudent.name,
      reward_id: reward.id,
    })

    if (res.success) {
      messageApi.success(
        t("rewardExchange.redeemSuccess", {
          student: selectedStudent.name,
          reward: reward.name,
          points: reward.cost_points,
        })
      )
      setChooseRewardVisible(false)
      setSelectedStudent(null)
      setExchangeMode(false)
      fetchData()
      emitDataUpdated()
    } else {
      messageApi.error(res.message || t("rewardExchange.redeemFailed"))
    }
  }

  const columns: ColumnsType<RedemptionItem> = [
    {
      title: t("rewardExchange.recordStudent"),
      dataIndex: "student_name",
      key: "student_name",
      width: 120,
    },
    { title: t("rewardExchange.recordReward"), dataIndex: "reward_name", key: "reward_name" },
    {
      title: t("rewardExchange.recordCost"),
      dataIndex: "cost_points",
      key: "cost_points",
      width: 120,
      render: (v: number) => <Tag color="gold">-{v}</Tag>,
    },
    {
      title: t("rewardExchange.recordTime"),
      dataIndex: "redeemed_at",
      key: "redeemed_at",
      width: 180,
      render: (time: string) => new Date(time).toLocaleString(),
    },
  ]

  return (
    <div style={{ padding: "24px" }}>
      {contextHolder}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "16px",
        }}
      >
        <h2 style={{ margin: 0, color: "var(--ss-text-main)" }}>{t("rewardExchange.title")}</h2>
        <Button
          type={exchangeMode ? "default" : "primary"}
          disabled={!canEdit}
          onClick={() => {
            if (!canEdit) {
              messageApi.error(t("common.readOnly"))
              return
            }
            setExchangeMode((prev) => !prev)
          }}
        >
          {exchangeMode ? t("rewardExchange.exitMode") : t("rewardExchange.enterMode")}
        </Button>
      </div>

      <div style={{ marginBottom: "12px", color: "var(--ss-text-secondary)", fontSize: 13 }}>
        {exchangeMode ? t("rewardExchange.modeHint") : t("rewardExchange.normalHint")}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
          gap: "12px",
          marginBottom: "24px",
        }}
      >
        {sortedStudents.map((student) => {
          const points = exchangeMode ? student.reward_points : student.score
          return (
            <Card
              key={student.id}
              hoverable={exchangeMode}
              onClick={() => handleStudentClick(student)}
              style={{
                cursor: exchangeMode ? "pointer" : "default",
                border: exchangeMode
                  ? "1px solid var(--ant-color-primary, #1677ff)"
                  : "1px solid var(--ss-border-color)",
              }}
              bodyStyle={{ padding: "12px" }}
            >
              <div style={{ fontWeight: 600, marginBottom: 8 }}>{student.name}</div>
              <Tag color={points > 0 ? "success" : points < 0 ? "error" : "default"}>
                {points > 0 ? `+${points}` : points}
              </Tag>
              <div style={{ marginTop: 8, fontSize: 12, color: "var(--ss-text-secondary)" }}>
                {exchangeMode
                  ? t("rewardExchange.remainingRewardPoints")
                  : t("rewardExchange.currentScore")}
              </div>
            </Card>
          )
        })}
      </div>

      <Card title={t("rewardExchange.recordsTitle")} loading={loading}>
        <Table
          rowKey="uuid"
          dataSource={records}
          columns={columns}
          pagination={{ pageSize: 10, total: records.length, defaultCurrent: 1 }}
        />
      </Card>

      <Modal
        title={t("rewardExchange.chooseRewardTitle", { name: selectedStudent?.name || "" })}
        open={chooseRewardVisible}
        onCancel={() => {
          setChooseRewardVisible(false)
          setSelectedStudent(null)
        }}
        footer={null}
        destroyOnHidden
      >
        {!selectedStudent ? null : (
          <>
            <div style={{ marginBottom: "12px", color: "var(--ss-text-secondary)", fontSize: 13 }}>
              {t("rewardExchange.currentRewardPoints", { points: selectedStudent.reward_points })}
            </div>
            {affordableRewards.length === 0 ? (
              <div style={{ color: "var(--ss-text-secondary)" }}>
                {t("rewardExchange.noAffordableRewards")}
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {affordableRewards
                  .sort(
                    (a, b) => a.cost_points - b.cost_points || a.name.localeCompare(b.name, "zh-CN")
                  )
                  .map((reward) => (
                    <div
                      key={reward.id}
                      style={{
                        border: "1px solid var(--ss-border-color)",
                        borderRadius: 8,
                        padding: "10px 12px",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 600 }}>{reward.name}</div>
                        <div style={{ fontSize: 12, color: "var(--ss-text-secondary)" }}>
                          {t("rewardExchange.costLabel", { points: reward.cost_points })}
                        </div>
                      </div>
                      <Button type="primary" onClick={() => handleRedeem(reward)}>
                        {t("rewardExchange.redeemNow")}
                      </Button>
                    </div>
                  ))}
              </div>
            )}
          </>
        )}
      </Modal>
    </div>
  )
}
