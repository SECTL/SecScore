import { useState } from 'react'
import { InputNumber, Space, Radio, Form } from 'tdesign-react'
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
  const [unit, setUnit] = useState<'minutes' | 'days'>('minutes')

  const handleChange = (v: any) => {
    const numV = typeof v === 'number' ? v : v ? Number(v) : undefined
    if (numV === undefined || numV === null || isNaN(numV)) {
      onChange('')
      return
    }
    const minutes = unit === 'minutes' ? numV : numV * 1440
    onChange(String(Math.round(minutes)))
  }

  const displayValue =
    numValue === undefined || isNaN(numValue)
      ? undefined
      : unit === 'minutes'
      ? numValue
      : Math.max(1, Math.round(numValue / 1440))

  return (
    <Space>
      <Form.FormItem
        name="intervalMinutes"
        rules={[
          { required: true, message: '请输入时间' },
          { min: 1, message: unit === 'minutes' ? '间隔时间至少为1分钟' : '间隔时间至少为1天' }
        ]}
        style={{ marginBottom: 0 }}
      >
        <InputNumber
          placeholder={unit === 'minutes' ? '请输入时间间隔（分钟）' : '请输入时间间隔（天）'}
          style={{ width: '100px' }}
          value={displayValue}
          onChange={handleChange}
          min={1}
          theme="column"
        />
      </Form.FormItem>
      <Form.FormItem
        name="timeUnit"
        initialData="minutes"
        style={{ marginBottom: 0, marginLeft: -12 }}
      >
        <Radio.Group
          variant="default-filled"
          value={unit}
          onChange={(v) => setUnit(String(v) as 'minutes' | 'days')}
        >
          <Radio.Button value="days">天</Radio.Button>
          <Radio.Button value="minutes">分钟</Radio.Button>
        </Radio.Group>
      </Form.FormItem>
    </Space>
  )
}

export default IntervalTimeTrigger
