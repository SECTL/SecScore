import React, { useEffect } from 'react'
import {
  Drawer,
  Form,
  Input,
  Select,
  ColorPicker,
  Button,
  Space,
  Divider,
  Row,
  Col
} from 'tdesign-react'
import { useThemeEditor } from '../contexts/ThemeEditorContext'
import { useTheme } from '../contexts/ThemeContext'
import { generateColorMap } from '../utils/color'
import { themeConfig } from '../../../preload/types'

const variableGroups = {
  background: {
    title: '背景颜色',
    items: [
      { key: '--ss-bg-color', label: '全局背景' },
      { key: '--ss-card-bg', label: '卡片背景' },
      { key: '--ss-header-bg', label: '顶部栏背景' },
      { key: '--ss-sidebar-bg', label: '侧边栏背景' }
    ]
  },
  text: {
    title: '文字颜色',
    items: [
      { key: '--ss-text-main', label: '主要文字' },
      { key: '--ss-text-secondary', label: '次要文字' },
      { key: '--ss-sidebar-active-text', label: '侧边栏选中文字' }
    ]
  },
  border: {
    title: '边框与分割线',
    items: [{ key: '--ss-border-color', label: '通用边框' }]
  },
  interaction: {
    title: '交互状态',
    items: [
      { key: '--ss-item-hover', label: '列表悬浮' },
      { key: '--ss-sidebar-active-bg', label: '侧边栏选中背景' }
    ]
  }
}

export const ThemeEditor: React.FC = () => {
  const {
    isEditing,
    editingTheme,
    updateEditingTheme,
    updateConfig,
    saveEditingTheme,
    cancelEditing
  } = useThemeEditor()

  const { currentTheme } = useTheme()

  // 实时预览逻辑
  useEffect(() => {
    if (!isEditing || !editingTheme) return

    const applyPreview = (theme: themeConfig) => {
      const { tdesign, custom } = theme.config
      const root = document.documentElement

      // 1. 设置 TDesign 模式
      root.setAttribute('theme-mode', theme.mode)

      // 2. 设置 TDesign 品牌色
      if (tdesign.brandColor) {
        const colorMap = generateColorMap(tdesign.brandColor, theme.mode)
        Object.entries(colorMap).forEach(([key, value]) => {
          root.style.setProperty(key, value)
        })
      }

      // 3. 应用自定义变量
      Object.entries(custom).forEach(([key, value]) => {
        root.style.setProperty(key, value)
      })
    }

    applyPreview(editingTheme)
  }, [editingTheme, isEditing])

  // 关闭时恢复原有主题
  useEffect(() => {
    if (!isEditing && currentTheme) {
      const { tdesign, custom } = currentTheme.config
      const root = document.documentElement

      root.setAttribute('theme-mode', currentTheme.mode)

      if (tdesign.brandColor) {
        const colorMap = generateColorMap(tdesign.brandColor, currentTheme.mode)
        Object.entries(colorMap).forEach(([key, value]) => {
          root.style.setProperty(key, value)
        })
      }

      Object.entries(custom).forEach(([key, value]) => {
        root.style.setProperty(key, value)
      })
    }
  }, [isEditing, currentTheme])

  if (!editingTheme) return null

  return (
    <Drawer
      header="编辑主题"
      visible={isEditing}
      onClose={cancelEditing}
      size="500px"
      footer={
        <Space>
          <Button theme="primary" onClick={saveEditingTheme}>
            保存主题
          </Button>
          <Button theme="default" onClick={cancelEditing}>
            取消
          </Button>
        </Space>
      }
      destroyOnClose
    >
      <Form labelAlign="top">
        <Space direction="vertical" style={{ width: '100%' }} size="large">
          {/* 基本信息 */}
          <div>
            <Divider align="left">基本信息</Divider>
            <Row gutter={[16, 16]}>
              <Col span={12}>
                <Form.FormItem label="主题名称">
                  <Input
                    value={editingTheme.name}
                    onChange={(v) => updateEditingTheme({ name: v })}
                    placeholder="请输入主题名称"
                  />
                </Form.FormItem>
              </Col>
              <Col span={12}>
                <Form.FormItem label="色彩模式">
                  <Select
                    value={editingTheme.mode}
                    onChange={(v) => updateEditingTheme({ mode: v as 'light' | 'dark' })}
                    options={[
                      { label: '浅色 (Light)', value: 'light' },
                      { label: '深色 (Dark)', value: 'dark' }
                    ]}
                  />
                </Form.FormItem>
              </Col>
              <Col span={24}>
                <Form.FormItem label="主题 ID (唯一标识)" help="建议使用英文，如 my-theme">
                  <Input
                    value={editingTheme.id}
                    onChange={(v) => updateEditingTheme({ id: v })}
                    placeholder="请输入主题 ID"
                  />
                </Form.FormItem>
              </Col>
            </Row>
          </div>

          {/* TDesign 品牌色 */}
          <div>
            <Divider align="left">品牌色 (Brand)</Divider>
            <Form.FormItem label="主品牌色" help="将自动生成一系列色阶">
              <ColorPicker
                value={editingTheme.config.tdesign.brandColor}
                onChange={(v) => updateConfig('tdesign', 'brandColor', v)}
                enableAlpha={false}
                format="HEX"
              />
            </Form.FormItem>
          </div>

          {/* 业务自定义变量 */}
          <div>
            <Divider align="left">界面配色 (Custom)</Divider>
            {Object.entries(variableGroups).map(([groupKey, group]) => (
              <div key={groupKey} style={{ marginBottom: 24 }}>
                <div
                  style={{
                    fontSize: '13px',
                    fontWeight: 600,
                    marginBottom: '12px',
                    color: 'var(--td-text-color-primary)'
                  }}
                >
                  {group.title}
                </div>
                <Row gutter={[12, 12]}>
                  {group.items.map((item) => (
                    <Col span={6} key={item.key}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <div
                          style={{
                            fontSize: '12px',
                            color: 'var(--td-text-color-secondary)',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap'
                          }}
                          title={item.label}
                        >
                          {item.label}
                        </div>
                        <ColorPicker
                          value={editingTheme.config.custom[item.key] || '#ffffff'}
                          onChange={(v) => updateConfig('custom', item.key, v)}
                          enableAlpha
                          format="HEX"
                        />
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
