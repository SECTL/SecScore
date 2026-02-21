import React from 'react'
import { Button, Select } from 'tdesign-react'
import { Delete1Icon } from 'tdesign-icons-react'
import { triggerRegistry, allTriggers } from './registry'
import type { TriggerItem as TriggerItemType } from './types'

interface TriggerItemProps {
  item: TriggerItemType
  onDelete: (id: number) => void
  onChange: (id: number, eventName: string) => void
  onValueChange: (id: number, value: string) => void
}

const TriggerItem: React.FC<TriggerItemProps> = ({ item, onDelete, onChange, onValueChange }) => {
  const definition = triggerRegistry.get(item.eventName)
  const Component = definition?.component

  return (
    <div style={{ display: 'flex', gap: 5 }}>
      <Button
        theme="default"
        variant="text"
        icon={<Delete1Icon strokeWidth={2.4} />}
        onClick={() => onDelete(item.id)}
      />
      <Select
        value={item.eventName}
        style={{ width: '200px' }}
        options={allTriggers.options}
        placeholder="请选择触发规则"
        onChange={(value) => onChange(item.id, value as string)}
      />
      {Component && (
        <Component
          value={item.value}
          onChange={(value) => onValueChange(item.id, value)}
        />
      )}
    </div>
  )
}

export default TriggerItem
