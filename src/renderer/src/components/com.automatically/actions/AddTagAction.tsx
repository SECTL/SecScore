import React from 'react'
import { Input } from 'tdesign-react'
import type { ActionComponentProps } from '../types'

export const eventName = 'add_tag'
export const label = '添加标签'
export const description = '为学生添加标签'
export const hasReason = false

const AddTagAction: React.FC<ActionComponentProps> = ({ value, onChange }) => {
  return (
    <Input
      placeholder="请输入标签"
      style={{ width: '150px' }}
      value={value ?? ''}
      onChange={(v: any) => onChange(v ? String(v) : '')}
    />
  )
}

export default AddTagAction
