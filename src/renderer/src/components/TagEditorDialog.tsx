import React, { useState, useEffect } from 'react'
import { Modal, Input, Button, Space, Tag, message } from 'antd'
import { useTranslation } from 'react-i18next'

interface TagItem {
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
  title
}) => {
  const { t } = useTranslation()
  const [inputValue, setInputValue] = useState('')
  const [allTags, setAllTags] = useState<TagItem[]>([])
  const [selectedTagIds, setSelectedTagIds] = useState<Set<number>>(new Set(initialTagIds))
  const [messageApi, contextHolder] = message.useMessage()

  async function fetchAllTags() {
    if (!(window as any).api) return
    try {
      const res = await (window as any).api.tagsGetAll()
      if (res.success && res.data) {
        setAllTags(res.data)
      }
    } catch (e) {
      console.error('Failed to fetch tags:', e)
      messageApi.error(t('tags.fetchFailed'))
    }
  }

  useEffect(() => {
    if (visible) {
      setSelectedTagIds(new Set(initialTagIds))
      setInputValue('')
      fetchAllTags()
    }
  }, [visible, initialTagIds])

  const handleAddTag = async () => {
    const trimmed = inputValue.trim()
    if (!trimmed) return

    if (trimmed.length > 30) {
      messageApi.error(t('tags.nameTooLong'))
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
        messageApi.error(res.message || t('tags.addFailed'))
      }
    } catch (e) {
      console.error('Failed to create tag:', e)
      messageApi.error(t('tags.addFailed'))
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
        messageApi.success(t('tags.deleteSuccess'))
      } else {
        messageApi.error(res.message || t('tags.deleteFailed'))
      }
    } catch (e) {
      console.error('Failed to delete tag:', e)
      messageApi.error(t('tags.deleteFailed'))
    }
  }

  const handleConfirm = () => {
    onConfirm(Array.from(selectedTagIds))
    onClose()
  }

  const selectedTags = allTags.filter((t) => selectedTagIds.has(t.id))
  const availableTags = allTags.filter((t) => !selectedTagIds.has(t.id))

  return (
    <Modal
      title={title || t('tags.editTitle')}
      open={visible}
      onCancel={onClose}
      onOk={handleConfirm}
      okText={t('common.save')}
      cancelText={t('common.cancel')}
      destroyOnHidden
      width={500}
    >
      {contextHolder}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={{ display: 'flex', gap: '8px' }}>
          <Input
            placeholder={t('tags.inputPlaceholder')}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onPressEnter={handleAddTag}
            style={{ flex: 1 }}
          />
          <Button type="primary" onClick={handleAddTag} disabled={!inputValue.trim()}>
            {t('common.add')}
          </Button>
        </div>

        <div>
          <div style={{ fontSize: '14px', color: 'var(--ss-text-secondary)', marginBottom: '8px' }}>
            {t('tags.selectedTags')}
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
              <span style={{ color: 'var(--ss-text-secondary)' }}>{t('tags.noTagsSelected')}</span>
            ) : (
              <Space wrap>
                {selectedTags.map((tag) => (
                  <Tag
                    key={tag.id}
                    color="blue"
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

        <div>
          <div style={{ fontSize: '14px', color: 'var(--ss-text-secondary)', marginBottom: '8px' }}>
            {t('tags.availableTags')}
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
              <span style={{ color: 'var(--ss-text-secondary)' }}>{t('tags.noAvailableTags')}</span>
            ) : (
              <Space wrap>
                {availableTags.map((tag) => (
                  <Tag
                    key={tag.id}
                    closable
                    onClose={(e) => {
                      e.preventDefault()
                      handleDeleteTag(tag.id)
                    }}
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
    </Modal>
  )
}
