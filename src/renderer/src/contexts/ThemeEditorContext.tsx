import React, { createContext, useContext, useState, useCallback } from 'react'
import { themeConfig } from '../../../preload/types'
import { useTheme } from './ThemeContext'

interface ThemeEditorContextType {
  isEditing: boolean
  editingTheme: themeConfig | null
  startEditing: (theme?: themeConfig) => void
  updateEditingTheme: (updates: Partial<themeConfig>) => void
  updateConfig: (type: 'tdesign' | 'custom', key: string, value: string) => void
  saveEditingTheme: () => Promise<void>
  cancelEditing: () => void
}

const ThemeEditorContext = createContext<ThemeEditorContextType | undefined>(undefined)

export const ThemeEditorProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { currentTheme } = useTheme()
  const [isEditing, setIsEditing] = useState(false)
  const [editingTheme, setEditingTheme] = useState<themeConfig | null>(null)

  const startEditing = useCallback(
    (theme?: themeConfig) => {
      if (theme) {
        setEditingTheme(JSON.parse(JSON.stringify(theme)))
      } else if (currentTheme) {
        const newTheme: themeConfig = JSON.parse(JSON.stringify(currentTheme))
        newTheme.id = `custom-${Date.now()}`
        newTheme.name = '新自定义主题'
        setEditingTheme(newTheme)
      }
      setIsEditing(true)
    },
    [currentTheme]
  )

  const updateEditingTheme = useCallback((updates: Partial<themeConfig>) => {
    setEditingTheme((prev) => (prev ? { ...prev, ...updates } : null))
  }, [])

  const updateConfig = useCallback((type: 'tdesign' | 'custom', key: string, value: string) => {
    setEditingTheme((prev) => {
      if (!prev) return null
      const next = { ...prev }
      next.config = { ...next.config }
      next.config[type] = { ...next.config[type], [key]: value }
      return next
    })
  }, [])

  const saveEditingTheme = useCallback(async () => {
    if (!editingTheme) return
    const res = await (window as any).api.saveTheme(editingTheme)
    if (res.success) {
      await (window as any).api.setTheme(editingTheme.id)
      setIsEditing(false)
      setEditingTheme(null)
    } else {
      console.error('Failed to save theme:', res.message)
    }
  }, [editingTheme])

  const cancelEditing = useCallback(() => {
    setIsEditing(false)
    setEditingTheme(null)
  }, [])

  return (
    <ThemeEditorContext.Provider
      value={{
        isEditing,
        editingTheme,
        startEditing,
        updateEditingTheme,
        updateConfig,
        saveEditingTheme,
        cancelEditing
      }}
    >
      {children}
    </ThemeEditorContext.Provider>
  )
}

export const useThemeEditor = () => {
  const context = useContext(ThemeEditorContext)
  if (!context) throw new Error('useThemeEditor must be used within ThemeEditorProvider')
  return context
}
