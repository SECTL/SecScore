import React, { useState, useEffect } from 'react'
import { Dialog, Input, Button, Space, Tag, MessagePlugin } from 'tdesign-react'
import { useTheme } from '../contexts/ThemeContext' // 导入主题上下文

interface Tag {
  id: number
  name: string
}

interface TagEditorDialogProps {
  visible: boolean
  onClose: () => void
  onConfirm: (tagIds: number[]) => void
  initialTagIds?: number[]
  title?: string
}

export const TagEditorDialog: React.FC<TagEditorDialogProps> = ({
  visible,
  onClose,
  onConfirm,
  initialTagIds = [],
  title = '编辑标签'
}) => {
  const [inputValue, setInputValue] = useState('')
  const [allTags, setAllTags] = useState<Tag[]>([])
  const [selectedTagIds, setSelectedTagIds] = useState<Set<number>>(new Set(initialTagIds))
  const { currentTheme } = useTheme() // 获取当前主题

  const themeMode = currentTheme?.mode || 'light' // 默认为 light

  useEffect(() => {
    if (visible) {
      setSelectedTagIds(new Set(initialTagIds))
      setInputValue('')
      fetchAllTags()
    }
  }, [visible, initialTagIds])

  const fetchAllTags = async () => {
    if (!(window as any).api) return
    try {
      const res = await (window as any).api.tagsGetAll()
      if (res.success && res.data) {
        setAllTags(res.data)
      }
    } catch (e) {
      console.error('Failed to fetch tags:', e)
      MessagePlugin.error('获取标签列表失败')
    }
  }

  const handleAddTag = async () => {
    const trimmed = inputValue.trim()
    if (!trimmed) return

    if (trimmed.length > 30) {
      MessagePlugin.error('标签名称不能超过 30 个字符')
      return
    }

    if (allTags.some((t) => t.name === trimmed)) {
      const existingTag = allTags.find((t) => t.name === trimmed)
      if (existingTag) {
        setSelectedTagIds((prev) => new Set([...prev, existingTag.id]))
      }
      setInputValue('')
      return
    }

    try {
      const res = await (window as any).api.tagsCreate(trimmed)
      if (res.success && res.data) {
        setAllTags((prev) => [...prev, res.data])
        setSelectedTagIds((prev) => new Set([...prev, res.data.id]))
        setInputValue('')
      } else {
        MessagePlugin.error(res.message || '添加标签失败')
      }
    } catch (e) {
      console.error('Failed to create tag:', e)
      MessagePlugin.error('添加标签失败')
    }
  }

  const handleToggleTag = (tagId: number) => {
    setSelectedTagIds((prev) => {
      const newSet = new Set(prev)
      if (newSet.has(tagId)) {
        newSet.delete(tagId)
      } else {
        newSet.add(tagId)
      }
      return newSet
    })
  }

  const handleDeleteTag = async (tagId: number) => {
    try {
      const res = await (window as any).api.tagsDelete(tagId)
      if (res.success) {
        setAllTags((prev) => prev.filter((t) => t.id !== tagId))
        setSelectedTagIds((prev) => {
          const newSet = new Set(prev)
          newSet.delete(tagId)
          return newSet
        })
        MessagePlugin.success('标签删除成功')
      } else {
        MessagePlugin.error(res.message || '删除标签失败')
      }
    } catch (e) {
      console.error('Failed to delete tag:', e)
      MessagePlugin.error('删除标签失败')
    }
  }

  /*   const handleKeyDown = (value: string, context: { e: React.KeyboardEvent<HTMLInputElement> }) => {
    if (context.e.key === 'Enter') {
      context.e.preventDefault()
      handleAddTag()
    }
  } */

  const handleConfirm = () => {
    onConfirm(Array.from(selectedTagIds))
    onClose()
  }

  const selectedTags = allTags.filter((t) => selectedTagIds.has(t.id))
  const availableTags = allTags.filter((t) => !selectedTagIds.has(t.id))

  return (
    <Dialog
      header={title}
      visible={visible}
      onClose={onClose}
      onConfirm={handleConfirm}
      confirmBtn={{ content: '保存', theme: 'primary' }}
      cancelBtn={{ content: '取消' }}
      destroyOnClose
      width={500}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {/* 标签输入区 */}
        <div style={{ display: 'flex', gap: '8px' }}>
          <Input
            placeholder="输入标签名称，按 Enter 添加"
            value={inputValue}
            onChange={setInputValue}
            onEnter={handleAddTag}
            /*             maxLength={50} */
            style={{ flex: 1 }}
          />
          <Button theme="primary" onClick={handleAddTag} disabled={!inputValue.trim()}>
            添加
          </Button>
        </div>

        {/* 已选标签区 */}
        <div>
          <div style={{ fontSize: '14px', color: 'var(--ss-text-secondary)', marginBottom: '8px' }}>
            已选标签（点击取消）
          </div>
          <div
            style={{
              minHeight: '50px',
              padding: '12px',
              backgroundColor: 'var(--ss-card-bg)',
              borderRadius: '4px'
            }}
          >
            {selectedTags.length === 0 ? (
              <span style={{ color: 'var(--ss-text-secondary)' }}>未选择标签</span>
            ) : (
              <Space>
                {selectedTags.map((tag) => (
                  <Tag
                    key={tag.id}
                    theme="primary"
                    variant={themeMode === 'dark' ? 'outline' : 'light'} // 根据主题模式动态设置变体
                    closable
                    onClose={() => handleToggleTag(tag.id)}
                    style={{ cursor: 'pointer' }}
                  >
                    {tag.name}
                  </Tag>
                ))}
              </Space>
            )}
          </div>
        </div>

        {/* 可选标签区 */}
        <div>
          <div style={{ fontSize: '14px', color: 'var(--ss-text-secondary)', marginBottom: '8px' }}>
            可选标签（点击选择）
          </div>
          <div
            style={{
              minHeight: '50px',
              padding: '12px',
              backgroundColor: 'var(--ss-card-bg)',
              borderRadius: '4px'
            }}
          >
            {availableTags.length === 0 ? (
              <span style={{ color: 'var(--ss-text-secondary)' }}>无可用标签</span>
            ) : (
              <Space>
                {availableTags.map((tag) => (
                  <Tag
                    key={tag.id}
                    theme="default"
                    variant={themeMode === 'dark' ? 'light' : 'outline'} // 根据主题模式动态设置变体
                    closable
                    onClose={() => handleDeleteTag(tag.id)}
                    style={{ cursor: 'pointer' }}
                    onClick={() => handleToggleTag(tag.id)}
                  >
                    {tag.name}
                  </Tag>
                ))}
              </Space>
            )}
          </div>
        </div>
      </div>
    </Dialog>
  )
}
