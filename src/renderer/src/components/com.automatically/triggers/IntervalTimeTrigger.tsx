import React from 'react'
import { InputNumber } from 'tdesign-react'
import type { TriggerComponentProps } from '../types'

export const eventName = 'interval_time_passed'
export const label = '根据间隔时间触发'
export const description = '当间隔时间到达时触发自动化'
export const triggerLogic = {
  eventName,
  label,
  description,
  validate: (value: string) => {
    const minutes = parseInt(value, 10)
    if (isNaN(minutes) || minutes <= 0) {
      return { valid: false, message: '请输入有效的时间间隔（分钟）' }
    }
    return { valid: true }
  }
}

const IntervalTimeTrigger: React.FC<TriggerComponentProps> = ({ value, onChange }) => {
  const numValue = value ? parseInt(value, 10) : undefined

  const handleChange = (v: any) => {
    const numV = typeof v === 'number' ? v : (v ? Number(v) : undefined)
    onChange(numV !== undefined && numV !== null && !isNaN(numV) ? String(numV) : '')
  }

  return (
    <InputNumber
      placeholder="请输入时间间隔（分钟）"
      style={{ width: '150px' }}
      value={numValue}
      onChange={handleChange}
      min={1}
      theme="column"
    />
  )
}

export default IntervalTimeTrigger
