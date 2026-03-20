import React, { useCallback, useEffect, useState } from "react"
import { Button, Form, Input, InputNumber, Modal, Popconfirm, Table, message } from "antd"
import type { ColumnsType } from "antd/es/table"
import { useTranslation } from "react-i18next"

interface RewardItem {
  id: number
  name: string
  cost_points: number
  created_at: string
  updated_at: string
}

export const RewardSettings: React.FC<{ canEdit: boolean }> = ({ canEdit }) => {
  const { t } = useTranslation()
  const [data, setData] = useState<RewardItem[]>([])
  const [loading, setLoading] = useState(false)
  const [visible, setVisible] = useState(false)
  const [editing, setEditing] = useState<RewardItem | null>(null)
  const [form] = Form.useForm()
  const [messageApi, contextHolder] = message.useMessage()

  const emitDataUpdated = () => {
    window.dispatchEvent(new CustomEvent("ss:data-updated", { detail: { category: "all" } }))
  }

  const fetchRewards = useCallback(async () => {
    if (!(window as any).api) return
    setLoading(true)
    try {
      const res = await (window as any).api.rewardSettingQuery()
      if (res.success && Array.isArray(res.data)) {
        setData(res.data)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchRewards()
  }, [fetchRewards])

  const openCreate = () => {
    if (!canEdit) {
      messageApi.error(t("common.readOnly"))
      return
    }
    setEditing(null)
    form.setFieldsValue({ name: "", cost_points: 1 })
    setVisible(true)
  }

  const openEdit = (item: RewardItem) => {
    if (!canEdit) {
      messageApi.error(t("common.readOnly"))
      return
    }
    setEditing(item)
    form.setFieldsValue({ name: item.name, cost_points: item.cost_points })
    setVisible(true)
  }

  const handleDelete = async (item: RewardItem) => {
    if (!(window as any).api) return
    if (!canEdit) {
      messageApi.error(t("common.readOnly"))
      return
    }

    const res = await (window as any).api.rewardSettingDelete(item.id)
    if (res.success) {
      messageApi.success(t("rewardSettings.deleteSuccess"))
      fetchRewards()
      emitDataUpdated()
    } else {
      messageApi.error(res.message || t("rewardSettings.deleteFailed"))
    }
  }

  const handleSave = async () => {
    if (!(window as any).api) return
    if (!canEdit) {
      messageApi.error(t("common.readOnly"))
      return
    }

    const values = await form.validateFields()
    const payload = {
      name: String(values.name || "").trim(),
      cost_points: Number(values.cost_points),
    }

    if (!payload.name) {
      messageApi.warning(t("rewardSettings.nameRequired"))
      return
    }
    if (!Number.isFinite(payload.cost_points) || payload.cost_points <= 0) {
      messageApi.warning(t("rewardSettings.costRequired"))
      return
    }

    const res = editing
      ? await (window as any).api.rewardSettingUpdate(editing.id, payload)
      : await (window as any).api.rewardSettingCreate(payload)

    if (res.success) {
      messageApi.success(
        editing ? t("rewardSettings.updateSuccess") : t("rewardSettings.createSuccess")
      )
      setVisible(false)
      form.resetFields()
      setEditing(null)
      fetchRewards()
      emitDataUpdated()
    } else {
      messageApi.error(
        res.message ||
          (editing ? t("rewardSettings.updateFailed") : t("rewardSettings.createFailed"))
      )
    }
  }

  const columns: ColumnsType<RewardItem> = [
    {
      title: t("rewardSettings.rewardName"),
      dataIndex: "name",
      key: "name",
    },
    {
      title: t("rewardSettings.costPoints"),
      dataIndex: "cost_points",
      key: "cost_points",
      width: 140,
      render: (v: number) => <b>{v}</b>,
    },
    {
      title: t("common.operation"),
      key: "operation",
      width: 180,
      render: (_, row) => (
        <>
          <Button type="link" disabled={!canEdit} onClick={() => openEdit(row)}>
            {t("common.edit")}
          </Button>
          <Popconfirm
            title={t("rewardSettings.deleteConfirm", { name: row.name })}
            onConfirm={() => handleDelete(row)}
            disabled={!canEdit}
          >
            <Button type="link" danger disabled={!canEdit}>
              {t("common.delete")}
            </Button>
          </Popconfirm>
        </>
      ),
    },
  ]

  return (
    <div style={{ padding: "24px" }}>
      {contextHolder}
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "16px" }}>
        <h2 style={{ margin: 0, color: "var(--ss-text-main)" }}>{t("rewardSettings.title")}</h2>
        <Button type="primary" disabled={!canEdit} onClick={openCreate}>
          {t("rewardSettings.addReward")}
        </Button>
      </div>

      <Table
        dataSource={data}
        columns={columns}
        rowKey="id"
        loading={loading}
        bordered
        pagination={{ pageSize: 50, total: data.length, defaultCurrent: 1 }}
      />

      <Modal
        title={editing ? t("rewardSettings.editTitle") : t("rewardSettings.addTitle")}
        open={visible}
        onOk={handleSave}
        onCancel={() => {
          setVisible(false)
          setEditing(null)
        }}
        okText={t("common.save")}
        cancelText={t("common.cancel")}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" initialValues={{ cost_points: 1 }}>
          <Form.Item
            label={t("rewardSettings.rewardName")}
            name="name"
            rules={[{ required: true, message: t("rewardSettings.nameRequired") }]}
          >
            <Input placeholder={t("rewardSettings.namePlaceholder")} maxLength={64} />
          </Form.Item>
          <Form.Item
            label={t("rewardSettings.costPoints")}
            name="cost_points"
            rules={[{ required: true, message: t("rewardSettings.costRequired") }]}
          >
            <InputNumber
              min={1}
              style={{ width: "100%" }}
              placeholder={t("rewardSettings.costPlaceholder")}
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
