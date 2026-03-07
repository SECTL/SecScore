import React, { useEffect, useMemo, useState } from 'react'
import { Button, ColorPicker, Input, Segmented, Space, Typography, message } from 'antd'
import type { Color } from 'antd/es/color-picker'
import { useTranslation } from 'react-i18next'
import { useTheme } from '../contexts/ThemeContext'
import type { themeConfig } from '../../../preload/types'

type props = {
  compact?: boolean
}

const presetPrimaryColors = [
  '#1677FF',
  '#2F54EB',
  '#722ED1',
  '#EB2F96',
  '#F5222D',
  '#FA8C16',
  '#FADB14',
  '#52C41A',
  '#13C2C2'
]

const presetGradients: {
  id: string
  labelKey: string
  light: string
  dark: string
}[] = [
  {
    id: 'blue',
    labelKey: 'blue',
    light: 'linear-gradient(180deg, #f7fbff 0%, #f1f7ff 55%, #f8f9fc 100%)',
    dark: 'linear-gradient(180deg, #0f1220 0%, #101524 55%, #0b0d16 100%)'
  },
  {
    id: 'pink',
    labelKey: 'pink',
    light: 'linear-gradient(180deg, #fff7f1 0%, #fff1f1 55%, #f7f7fb 100%)',
    dark: 'linear-gradient(180deg, #1a0f14 0%, #1d1218 55%, #120c10 100%)'
  },
  {
    id: 'cyan',
    labelKey: 'cyan',
    light: 'linear-gradient(180deg, #f0f9ff 0%, #e0f2fe 55%, #f0f9ff 100%)',
    dark: 'linear-gradient(180deg, #050b10 0%, #06121a 55%, #05070a 100%)'
  },
  {
    id: 'purple',
    labelKey: 'purple',
    light: 'linear-gradient(180deg, #faf5ff 0%, #f3e8ff 55%, #faf5ff 100%)',
    dark: 'linear-gradient(180deg, #0f0a14 0%, #151020 55%, #0d0910 100%)'
  }
]

const deepClone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T

const normalizeHex = (value: string): string | null => {
  const s = String(value || '').trim()
  if (!s) return null
  const m = s.match(/^#?([0-9a-fA-F]{6})$/)
  if (!m) return null
  return `#${m[1].toUpperCase()}`
}

const buildGradient = (a: string, b: string, dir: 'v' | 'h' | 'd'): string => {
  const angle = dir === 'h' ? '90deg' : dir === 'd' ? '135deg' : '180deg'
  return `linear-gradient(${angle}, ${a} 0%, ${b} 100%)`
}

export const ThemeQuickSettings: React.FC<props> = ({ compact }) => {
  const { t } = useTranslation()
  const { currentTheme, setTheme, themes, applyTheme } = useTheme()
  const [messageApi, holder] = message.useMessage()

  const [workingTheme, setWorkingTheme] = useState<themeConfig | null>(null)
  const [saving, setSaving] = useState(false)

  const [primaryInput, setPrimaryInput] = useState('')
  const primaryColor = useMemo(() => {
    const fromTheme = workingTheme?.config?.tdesign?.brandColor
    return normalizeHex(primaryInput) || normalizeHex(fromTheme || '') || '#1677FF'
  }, [primaryInput, workingTheme])

  const [gradientDir, setGradientDir] = useState<'v' | 'h' | 'd'>('v')
  const [g1, setG1] = useState<string>('#f7fbff')
  const [g2, setG2] = useState<string>('#f8f9fc')

  const currentBg = workingTheme?.config?.custom?.['--ss-bg-color'] || ''

  useEffect(() => {
    if (!currentTheme) return
    const base = deepClone(currentTheme)
    const editable =
      base.id === 'custom-default' || base.id.startsWith('custom-')
        ? base
        : { ...base, id: 'custom-default', name: t('theme.myTheme') }
    setWorkingTheme(editable)
    setPrimaryInput(editable.config?.tdesign?.brandColor || '')
  }, [currentTheme])

  // Real-time theme preview
  useEffect(() => {
    if (!workingTheme) return
    applyTheme(workingTheme)
  }, [workingTheme, applyTheme])

  const ensureCustomThemeSelected = async (theme: themeConfig): Promise<boolean> => {
    if (!(window as any).api) return false
    const exists = themes.some((t) => t.id === theme.id)
    if (!exists) {
      const res = await (window as any).api.saveTheme(theme)
      if (!res?.success) return false
    }
    if (currentTheme?.id !== theme.id) {
      await setTheme(theme.id)
    }
    return true
  }

  const saveThemeToDb = async (theme: themeConfig) => {
    if (!(window as any).api) return false
    try {
      const exists = themes.some((t) => t.id === theme.id)
      if (!exists) {
        const res = await (window as any).api.saveTheme(theme)
        if (!res?.success) return false
      }
      if (currentTheme?.id !== theme.id) {
        await setTheme(theme.id)
      }
      const res = await (window as any).api.saveTheme(theme)
      return res?.success
    } catch {
      return false
    }
  }

  const save = async () => {
    if (!(window as any).api) return
    if (!workingTheme) return
    setSaving(true)
    try {
      const ok = await ensureCustomThemeSelected(workingTheme)
      if (!ok) throw new Error('保存失败')
      const res = await (window as any).api.saveTheme(workingTheme)
      if (!res?.success) throw new Error(res?.message || '保存失败')
      messageApi.success(t('theme.saved'))
    } catch (e: any) {
      messageApi.error(e?.message || t('theme.saveFailed'))
    } finally {
      setSaving(false)
    }
  }

  const setPrimary = async (hex: string) => {
    setPrimaryInput(hex)
    setWorkingTheme((prev) => {
      if (!prev) return prev
      const next = deepClone(prev)
      next.config = next.config || ({} as any)
      next.config.tdesign = { ...(next.config.tdesign || {}), brandColor: hex }
      saveThemeToDb(next)
      return next
    })
  }

  const setGradientPreset = async (value: string) => {
    setWorkingTheme((prev) => {
      if (!prev) return prev
      const next = deepClone(prev)
      next.config = next.config || ({} as any)
      next.config.custom = { ...(next.config.custom || {}), '--ss-bg-color': value }
      saveThemeToDb(next)
      return next
    })
  }

  const setGradientFromPickers = async () => {
    const g = buildGradient(g1, g2, gradientDir)
    setWorkingTheme((prev) => {
      if (!prev) return prev
      const next = deepClone(prev)
      next.config = next.config || ({} as any)
      next.config.custom = { ...(next.config.custom || {}), '--ss-bg-color': g }
      saveThemeToDb(next)
      return next
    })
  }

  const setMode = async (mode: 'light' | 'dark') => {
    const targetThemeId = mode === 'light' ? 'light-default' : 'dark-default'
    await setTheme(targetThemeId)
  }

  if (!workingTheme) return null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: compact ? 12 : 16 }}>
      {holder}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography.Text strong>{t('theme.colorAndBackground')}</Typography.Text>
        <Space>
          <Button type="primary" loading={saving} onClick={save}>
            {t('common.save')}
          </Button>
        </Space>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <Typography.Text>{t('theme.mode')}</Typography.Text>
        <Segmented
          value={workingTheme.mode}
          onChange={(v) => setMode(v as any)}
          options={[
            { label: t('settings.lightMode'), value: 'light' },
            { label: t('settings.darkMode'), value: 'dark' }
          ]}
        />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <Typography.Text>{t('settings.primaryColor')}</Typography.Text>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <Input
            value={primaryInput}
            onChange={(e) => setPrimaryInput(e.target.value)}
            onBlur={() => {
              const n = normalizeHex(primaryInput)
              if (n) setPrimary(n)
              else setPrimary(primaryColor)
            }}
            style={{ width: 120 }}
          />
          {presetPrimaryColors.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setPrimary(c)}
              style={{
                width: 18,
                height: 18,
                borderRadius: 999,
                border:
                  c === primaryColor ? '2px solid rgba(0,0,0,0.35)' : '1px solid rgba(0,0,0,0.18)',
                background: c,
                cursor: 'pointer',
                padding: 0
              }}
            />
          ))}
          <ColorPicker
            value={primaryColor}
            onChange={(color: Color) => setPrimary(color.toHexString().toUpperCase())}
          />
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <Typography.Text>{t('settings.backgroundGradient')}</Typography.Text>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
            gap: 10
          }}
        >
          {presetGradients.map((g) => {
            const gradientValue = g[workingTheme.mode]
            const active = currentBg === gradientValue
            return (
              <button
                key={g.id}
                type="button"
                onClick={() => setGradientPreset(gradientValue)}
                style={{
                  borderRadius: 10,
                  border: active
                    ? '2px solid var(--ant-color-primary)'
                    : '1px solid var(--ss-border-color)',
                  padding: 10,
                  background: 'transparent',
                  cursor: 'pointer',
                  textAlign: 'left'
                }}
              >
                <div
                  style={{
                    height: 56,
                    borderRadius: 8,
                    border: '1px solid var(--ss-border-color)',
                    background: gradientValue
                  }}
                />
                <div style={{ marginTop: 8, fontSize: 12, color: 'var(--ss-text-secondary)' }}>
                  {t(`theme.gradientLabels.${g.labelKey}`)}
                </div>
              </button>
            )
          })}
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <Segmented
            value={gradientDir}
            onChange={(v) => setGradientDir(v as any)}
            options={[
              { label: t('theme.gradientDirections.vertical'), value: 'v' },
              { label: t('theme.gradientDirections.horizontal'), value: 'h' },
              { label: t('theme.gradientDirections.diagonal'), value: 'd' }
            ]}
          />
          <Space size="small">
            <ColorPicker value={g1} onChange={(c: Color) => setG1(c.toHexString())} />
            <ColorPicker value={g2} onChange={(c: Color) => setG2(c.toHexString())} />
            <Button onClick={setGradientFromPickers}>{t('theme.generate')}</Button>
          </Space>
          <div
            style={{
              width: 160,
              height: 32,
              borderRadius: 8,
              border: '1px solid var(--ss-border-color)',
              background: buildGradient(g1, g2, gradientDir)
            }}
          />
        </div>
      </div>
    </div>
  )
}
