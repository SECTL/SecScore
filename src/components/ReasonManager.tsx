import React, { useState, useEffect, useCallback } from "react"
import { Table, Button, Modal, Form, Input, InputNumber, message, Tag, Popconfirm, Space } from "antd"
import type { ColumnsType } from "antd/es/table"
import { useTranslation } from "react-i18next"

interface reason {
  id: number
  content: string
  category: string
  delta: number
  is_system: number
}

export const ReasonManager: React.FC<{ canEdit: boolean }> = ({ canEdit }) => {
  const { t } = useTranslation()
  const [data, setData] = useState<reason[]>([])
  const [loading, setLoading] = useState(false)
  const [visible, setVisible] = useState(false)
  const [editing, setEditing] = useState<reason | null>(null)
  const [form] = Form.useForm()
  const [messageApi, contextHolder] = message.useMessage()

  const emitDataUpdated = (category: "reasons" | "all") => {
    window.dispatchEvent(new CustomEvent("ss:data-updated", { detail: { category } }))
  }

  const fetchReasons = useCallback(async () => {
    if (!(window as any).api) return
    setLoading(true)
    try {
      const res = await (window as any).api.queryReasons()
      if (res.success && res.data) {
        setData(res.data)
      }
    } catch (e) {
      console.error("Failed to fetch reasons:", e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchReasons()
    const onDataUpdated = (e: any) => {
      const category = e?.detail?.category
      if (category === "reasons" || category === "all") fetchReasons()
    }
    window.addEventListener("ss:data-updated", onDataUpdated as any)
    return () => window.removeEventListener("ss:data-updated", onDataUpdated as any)
  }, [fetchReasons])

  const openAdd = () => {
    setEditing(null)
    form.setFieldsValue({
      category: t("reasons.others"),
      content: "",
      delta: null,
    })
    setVisible(true)
  }

  const openEdit = (row: reason) => {
    setEditing(row)
    form.setFieldsValue({
      category: row.category,
      content: row.content,
      delta: row.delta,
    })
    setVisible(true)
  }

  const handleSubmit = async () => {
    if (!(window as any).api) return
    if (!canEdit) {
      messageApi.error(t("common.readOnly"))
      return
    }
    const values = await form.validateFields()
    const content = values.content?.trim()
    const category = values.category?.trim() || t("reasons.others")
    const delta = Number(values.delta)

    if (data.some((r) => r.content === content && r.category === category && r.id !== editing?.id)) {
      messageApi.warning(t("reasons.reasonExists"))
      return
    }

    if (editing) {
      const res = await (window as any).api.updateReason(editing.id, { content, category, delta })
      if (res.success) {
        messageApi.success(t("reasons.updateSuccess"))
        setVisible(false)
        form.resetFields()
        fetchReasons()
        emitDataUpdated("reasons")
      } else {
        messageApi.error(res.message || t("reasons.updateFailed"))
      }
      return
    }

    const res = await (window as any).api.createReason({ content, category, delta })
    if (res.success) {
      messageApi.success(t("reasons.addSuccess"))
      setVisible(false)
      form.resetFields()
      fetchReasons()
      emitDataUpdated("reasons")
    } else {
      messageApi.error(res.message || t("reasons.addFailed"))
    }
  }

  const handleDelete = async (id: number) => {
    if (!(window as any).api) return
    if (!canEdit) {
      messageApi.error(t("common.readOnly"))
      return
    }
    const res = await (window as any).api.deleteReason(id)
    if (res.success) {
      messageApi.success(t("reasons.deleteSuccess"))
      fetchReasons()
      emitDataUpdated("reasons")
    } else {
      messageApi.error(res.message || t("reasons.deleteFailed"))
    }
  }

  const columns: ColumnsType<reason> = [
    {
      title: t("reasons.category"),
      dataIndex: "category",
      key: "category",
      width: 120,
      render: (category: string) => <Tag>{category}</Tag>,
    },
    { title: t("reasons.content"), dataIndex: "content", key: "content" },
    {
      title: t("reasons.presetPoints"),
      dataIndex: "delta",
      key: "delta",
      width: 90,
      align: "center",
      render: (delta: number) => (
        <span
          style={{
            color:
              delta > 0 ? "var(--ant-color-success, #52c41a)" : "var(--ant-color-error, #ff4d4f)",
          }}
        >
          {delta > 0 ? `+${delta}` : delta}
        </span>
      ),
    },
    {
      title: t("common.operation"),
      key: "operation",
      width: 120,
      render: (_, row) => (
        <Space size={0}>
          <Button type="link" size="small" disabled={!canEdit} onClick={() => openEdit(row)}>
            {t("common.edit")}
          </Button>
          <Popconfirm
            title={t("reasons.deleteConfirm")}
            onConfirm={() => handleDelete(row.id)}
            disabled={!canEdit}
          >
            <Button type="link" size="small" danger disabled={!canEdit}>
              {t("common.delete")}
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <div style={{ padding: "24px" }}>
      {contextHolder}
      <div style={{ marginBottom: "16px", display: "flex", justifyContent: "space-between" }}>
        <h2 style={{ margin: 0, color: "var(--ss-text-main)" }}>{t("reasons.title")}</h2>
        <Button type="primary" disabled={!canEdit} onClick={openAdd}>
          {t("reasons.addReason")}
        </Button>
      </div>

      <Table
        dataSource={data}
        columns={columns}
        rowKey="id"
        loading={loading}
        size="small"
        bordered
        className="ss-compact-table"
        pagination={{ pageSize: 50, total: data.length, defaultCurrent: 1 }}
        style={{ backgroundColor: "var(--ss-card-bg)", color: "var(--ss-text-main)" }}
      />

      <Modal
        title={editing ? t("reasons.editTitle") : t("reasons.addTitle")}
        open={visible}
        onOk={handleSubmit}
        onCancel={() => setVisible(false)}
        okText={editing ? t("common.save") : t("reasons.addConfirm")}
        cancelText={t("common.cancel")}
        destroyOnHidden
      >
        <Form form={form} layout="horizontal" labelCol={{ span: 6 }} wrapperCol={{ span: 18 }}>
          <Form.Item
            label={t("reasons.category")}
            name="category"
            initialValue={t("reasons.others")}
          >
            <Input placeholder={t("reasons.categoryPlaceholder")} />
          </Form.Item>
          <Form.Item
            label={t("reasons.content")}
            name="content"
            rules={[{ required: true, message: t("reasons.contentRequired") }]}
          >
            <Input placeholder={t("reasons.contentPlaceholder")} />
          </Form.Item>
          <Form.Item
            label={t("reasons.presetPoints")}
            name="delta"
            rules={[{ required: true, message: t("reasons.pointsRequired") }]}
          >
            <InputNumber placeholder={t("reasons.pointsPlaceholder")} style={{ width: "100%" }} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
