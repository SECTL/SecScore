import React from 'react'
import { InputNumber, Row, Col } from 'tdesign-react'
import type { TriggerComponentProps } from '../types'

export const eventName = 'random_time'
export const label = '随机时间触发'
export const description = '在指定时间范围内随机触发自动化'
export const triggerLogic = {
  eventName,
  label,
  description,
  validate: (value: string) => {
    const minutes = parseInt(value, 10)
    if (isNaN(minutes) || minutes <= 0) {
      return { valid: false, message: '请输入有效的时间范围（分钟）' }
    }
    return { valid: true }
  }
}

interface RandomTimeConfig {
  minHour: number
  maxHour: number
}

const RandomTimeTrigger: React.FC<TriggerComponentProps> = ({ value, onChange }) => {
  let config: RandomTimeConfig = { minHour: 9, maxHour: 18 }
  try {
    if (value) {
      const parsed = JSON.parse(value)
      config = { ...config, ...parsed }
    }
  } catch {}

  const handleChange = (key: keyof RandomTimeConfig, v: any) => {
    const numV = typeof v === 'number' ? v : (v ? Number(v) : undefined)
    const newConfig = { ...config, [key]: numV ?? (key === 'minHour' ? 0 : 23) }
    onChange(JSON.stringify(newConfig))
  }

  return (
    <Row gutter={8}>
      <Col>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span style={{ fontSize: '12px', color: 'var(--ss-text-secondary)' }}>从</span>
          <InputNumber
            placeholder="最小小时"
            style={{ width: '70px' }}
            value={config.minHour}
            onChange={(v) => handleChange('minHour', v)}
            min={0}
            max={23}
            theme="column"
          />
          <span style={{ fontSize: '12px', color: 'var(--ss-text-secondary)' }}>时</span>
        </div>
      </Col>
      <Col>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span style={{ fontSize: '12px', color: 'var(--ss-text-secondary)' }}>到</span>
          <InputNumber
            placeholder="最大小时"
            style={{ width: '70px' }}
            value={config.maxHour}
            onChange={(v) => handleChange('maxHour', v)}
            min={0}
            max={23}
            theme="column"
          />
          <span style={{ fontSize: '12px', color: 'var(--ss-text-secondary)' }}>时</span>
        </div>
      </Col>
    </Row>
  )
}

export default RandomTimeTrigger
