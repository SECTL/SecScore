import React from 'react'
import { Input } from 'tdesign-react'
import type { ActionComponentProps } from '../types'

export const eventName = 'send_notification'
export const label = '发送通知'
export const description = '向学生发送通知'
export const hasReason = false

const SendNotificationAction: React.FC<ActionComponentProps> = ({ value, onChange }) => {
  return (
    <Input
      placeholder="请输入通知内容"
      style={{ width: '150px' }}
      value={value ?? ''}
      onChange={(v: any) => onChange(v ? String(v) : '')}
    />
  )
}

export default SendNotificationAction
