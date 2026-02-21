import { useState, useEffect } from 'react'
import { Select } from 'tdesign-react'
import type { TriggerComponentProps } from '../types'
export const eventName = 'student_tag_matched'
export const label = '当学生匹配标签时触发'
export const description = '当学生匹配特定标签时触发自动化'
export const triggerLogic = {
  eventName,
  label,
  description,
  validate: (value: string) => {
    if (!value || value.trim() === '') {
      return { valid: false, message: '请输入标签名称' }
    }
    return { valid: true }
  }
}

const StudentTagTrigger: React.FC<TriggerComponentProps> = ({ value, onChange }) => {
  const [tags, setTags] = useState<{ label: string; value: string }[]>([])

  useEffect(() => {
    const fetchTags = async () => {
      try {
        const res = await (window as any).api.tagsGetAll()
        if (res.success && res.data) {
          setTags(res.data.map((tag: any) => ({ label: tag.name, value: tag.name })))
        }
      } catch (e) {
        console.error('Failed to fetch tags', e)
      }
    }
    fetchTags()
  }, [])

  return (
    <Select
      placeholder="请选择标签"
      style={{ width: '150px' }}
      value={value ?? ''}
      onChange={(v: any) => onChange(v ? String(v) : '')}
      options={tags}
      filterable
      clearable
    />
  )
}

export default StudentTagTrigger
