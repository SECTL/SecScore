import React from 'react'
import { Input } from 'tdesign-react'
import type { ActionComponentProps } from '../types'

export const eventName = 'add_score'
export const label = '添加分数'
export const description = '为学生添加分数'
export const hasReason = true

const AddScoreAction: React.FC<ActionComponentProps> = ({ value, reason, onChange, onReasonChange }) => {
  return (
    <>
      <Input
        placeholder="请输入分数"
        style={{ width: '150px' }}
        value={value ?? ''}
        onChange={(v: any) => onChange(v ? String(v) : '')}
      />
      <Input
        placeholder="请输入理由"
        style={{ width: '150px' }}
        value={reason ?? ''}
        onChange={(v: any) => onReasonChange?.(v ? String(v) : '')}
      />
    </>
  )
}

export default AddScoreAction
