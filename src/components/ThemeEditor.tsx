import React, { useEffect } from "react"
import { Drawer, Form, Input, Select, Button, Space, Divider, Row, Col, ColorPicker } from "antd"
import type { Color } from "antd/es/color-picker"
import { useThemeEditor } from "../contexts/ThemeEditorContext"
import { useTheme } from "../contexts/ThemeContext"
import { generateColorMap } from "../utils/color"
import { themeConfig } from "../preload/types"

const variableGroups = {
  background: {
    title: "背景颜色",
    items: [
      { key: "--ss-bg-color", label: "全局背景" },
      { key: "--ss-card-bg", label: "卡片背景" },
      { key: "--ss-header-bg", label: "顶部栏背景" },
      { key: "--ss-sidebar-bg", label: "侧边栏背景" },
    ],
  },
  text: {
    title: "文字颜色",
    items: [
      { key: "--ss-text-main", label: "主要文字" },
      { key: "--ss-text-secondary", label: "次要文字" },
      { key: "--ss-sidebar-active-text", label: "侧边栏选中文字" },
    ],
  },
  border: {
    title: "边框与分割线",
    items: [{ key: "--ss-border-color", label: "通用边框" }],
  },
  interaction: {
    title: "交互状态",
    items: [
      { key: "--ss-item-hover", label: "列表悬浮" },
      { key: "--ss-sidebar-active-bg", label: "侧边栏选中背景" },
    ],
  },
}

export const ThemeEditor: React.FC = () => {
  const {
    isEditing,
    editingTheme,
    updateEditingTheme,
    updateConfig,
    saveEditingTheme,
    cancelEditing,
  } = useThemeEditor()

  const { currentTheme } = useTheme()

  useEffect(() => {
    if (!isEditing || !editingTheme) return

    const applyPreview = (theme: themeConfig) => {
      const { tdesign, custom } = theme.config
      const root = document.documentElement

      root.setAttribute("theme-mode", theme.mode)

      if (tdesign.brandColor) {
        const colorMap = generateColorMap(tdesign.brandColor, theme.mode)
        Object.entries(colorMap).forEach(([key, value]) => {
          root.style.setProperty(key, value)
        })
      }

      Object.entries(custom).forEach(([key, value]) => {
        root.style.setProperty(key, String(value))
      })
    }

    applyPreview(editingTheme)
  }, [editingTheme, isEditing])

  useEffect(() => {
    if (!isEditing && currentTheme) {
      const { tdesign, custom } = currentTheme.config
      const root = document.documentElement

      root.setAttribute("theme-mode", currentTheme.mode)

      if (tdesign.brandColor) {
        const colorMap = generateColorMap(tdesign.brandColor, currentTheme.mode)
        Object.entries(colorMap).forEach(([key, value]) => {
          root.style.setProperty(key, value)
        })
      }

      Object.entries(custom).forEach(([key, value]) => {
        root.style.setProperty(key, String(value))
      })
    }
  }, [isEditing, currentTheme])

  if (!editingTheme) return null

  return (
    <Drawer
      title="编辑主题"
      open={isEditing}
      onClose={cancelEditing}
      width={500}
      footer={
        <Space>
          <Button type="primary" onClick={saveEditingTheme}>
            保存主题
          </Button>
          <Button onClick={cancelEditing}>取消</Button>
        </Space>
      }
      destroyOnHidden
    >
      <Form layout="vertical">
        <Space orientation="vertical" style={{ width: "100%" }} size="large">
          <div>
            <Divider>基本信息</Divider>
            <Row gutter={[16, 16]}>
              <Col span={12}>
                <Form.Item label="主题名称">
                  <Input
                    value={editingTheme.name}
                    onChange={(e) => updateEditingTheme({ name: e.target.value })}
                    placeholder="请输入主题名称"
                  />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item label="色彩模式">
                  <Select
                    value={editingTheme.mode}
                    onChange={(v) => updateEditingTheme({ mode: v as "light" | "dark" })}
                    options={[
                      { label: "浅色 (Light)", value: "light" },
                      { label: "深色 (Dark)", value: "dark" },
                    ]}
                  />
                </Form.Item>
              </Col>
              <Col span={24}>
                <Form.Item label="主题 ID (唯一标识)" help="建议使用英文，如 my-theme">
                  <Input
                    value={editingTheme.id}
                    onChange={(e) => updateEditingTheme({ id: e.target.value })}
                    placeholder="请输入主题 ID"
                  />
                </Form.Item>
              </Col>
            </Row>
          </div>

          <div>
            <Divider>品牌色 (Brand)</Divider>
            <Form.Item label="主品牌色" help="将自动生成一系列色阶">
              <ColorPicker
                value={editingTheme.config.tdesign.brandColor}
                onChange={(color: Color) =>
                  updateConfig("tdesign", "brandColor", color.toHexString())
                }
                showText
              />
            </Form.Item>
          </div>

          <div>
            <Divider>界面配色 (Custom)</Divider>
            {Object.entries(variableGroups).map(([groupKey, group]) => (
              <div key={groupKey} style={{ marginBottom: 24 }}>
                <div
                  style={{
                    fontSize: "13px",
                    fontWeight: 600,
                    marginBottom: "12px",
                    color: "var(--ss-text-main)",
                  }}
                >
                  {group.title}
                </div>
                <Row gutter={[12, 12]}>
                  {group.items.map((item) => (
                    <Col span={groupKey === "background" ? 12 : 6} key={item.key}>
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        <div
                          style={{
                            fontSize: "12px",
                            color: "var(--ss-text-secondary)",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                          title={item.label}
                        >
                          {item.label}
                        </div>
                        {groupKey === "background" ? (
                          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                            <div
                              style={{
                                width: 32,
                                height: 32,
                                borderRadius: 6,
                                border: "1px solid var(--ss-border-color)",
                                background: editingTheme.config.custom[item.key] || "#ffffff",
                                flexShrink: 0,
                              }}
                            />
                            <Input
                              value={editingTheme.config.custom[item.key] || ""}
                              onChange={(e) => updateConfig("custom", item.key, e.target.value)}
                              placeholder="例如 #ffffff 或 linear-gradient(...)"
                            />
                          </div>
                        ) : (
                          <ColorPicker
                            value={editingTheme.config.custom[item.key] || "#ffffff"}
                            onChange={(color: Color) =>
                              updateConfig("custom", item.key, color.toHexString())
                            }
                            showText
                          />
                        )}
                      </div>
                    </Col>
                  ))}
                </Row>
              </div>
            ))}
          </div>
        </Space>
      </Form>
    </Drawer>
  )
}
