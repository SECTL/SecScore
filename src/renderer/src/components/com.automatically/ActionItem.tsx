import React from 'react'
import { Button, Select } from 'tdesign-react'
import { Delete1Icon } from 'tdesign-icons-react'
import { actionRegistry, allActions } from './registry'
import type { ActionItem as ActionItemType } from './types'

interface ActionItemProps {
  item: ActionItemType
  onDelete: (id: number) => void
  onChange: (id: number, eventName: string) => void
  onValueChange: (id: number, value: string) => void
  onReasonChange: (id: number, reason: string) => void
}

const ActionItem: React.FC<ActionItemProps> = ({ 
  item, 
  onDelete, 
  onChange, 
  onValueChange, 
  onReasonChange 
}) => {
  const definition = actionRegistry.get(item.eventName)
  const Component = definition?.component

  return (
    <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
      <Button
        theme="default"
        variant="text"
        icon={<Delete1Icon strokeWidth={2.4} />}
        onClick={() => onDelete(item.id)}
      />
      <Select
        value={item.eventName}
        style={{ width: '200px' }}
        options={allActions.options}
        placeholder="请选择触发行动"
        onChange={(value) => onChange(item.id, value as string)}
      />
      {Component && (
        <Component
          value={item.value}
          reason={item.reason}
          onChange={(value) => onValueChange(item.id, value)}
          onReasonChange={(reason) => onReasonChange(item.id, reason)}
        />
      )}
    </div>
  )
}

export default ActionItem
