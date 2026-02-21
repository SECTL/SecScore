import React from 'react'
import { Select } from 'tdesign-react'
import type { ActionComponentProps } from '../types'

export const eventName = 'set_student_status'
export const label = '设置学生状态'
export const description = '设置学生的状态'
export const hasReason = false

const statusOptions = [
  { label: '活跃', value: 'active' },
  { label: '不活跃', value: 'inactive' },
  { label: '请假', value: 'leave' }
]

const SetStudentStatusAction: React.FC<ActionComponentProps> = ({ value, onChange }) => {
  return (
    <Select
      placeholder="请选择状态"
      style={{ width: '150px' }}
      value={value ?? ''}
      onChange={(v: any) => onChange(v ? String(v) : '')}
      options={statusOptions}
    />
  )
}

export default SetStudentStatusAction
