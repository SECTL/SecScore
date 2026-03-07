import React, { useState, useRef, useCallback, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Segmented, Input, Tag, message, Typography, InputNumber } from 'antd'
import { PlusOutlined, UploadOutlined, FileExcelOutlined } from '@ant-design/icons'
import { OOBEBackground } from './OOBEBackground'
import { useTheme } from '../contexts/ThemeContext'
import { changeLanguage, AppLanguage, languageOptions } from '../i18n'
import type { themeConfig } from '../../../preload/types'
import logoSvg from '../assets/logoHD.svg'

interface oobeProps {
  visible: boolean
  onComplete: () => void
}

type oobeStep = 'language' | 'theme' | 'students' | 'reasons' | 'start'

interface studentItem {
  name: string
}

interface reasonItem {
  content: string
  delta: number
}

const deepClone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T

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

export const OOBE: React.FC<oobeProps> = ({ visible, onComplete }) => {
  const { t } = useTranslation()
  const { currentTheme, setTheme, themes, applyTheme } = useTheme()
  const [messageApi, contextHolder] = message.useMessage()

  const [currentStep, setCurrentStep] = useState<oobeStep>('language')
  const [loading, setLoading] = useState(false)

  const [selectedLanguage, setSelectedLanguage] = useState<AppLanguage>('zh-CN')
  const [workingTheme, setWorkingTheme] = useState<themeConfig | null>(null)
  const [primaryInput, setPrimaryInput] = useState('')
  const [students, setStudents] = useState<studentItem[]>([])
  const [newStudentName, setNewStudentName] = useState('')
  const [reasons, setReasons] = useState<reasonItem[]>([])
  const [newReasonContent, setNewReasonContent] = useState('')
  const [newReasonDelta, setNewReasonDelta] = useState(1)

  const fileInputRef = useRef<HTMLInputElement>(null)

  const steps: oobeStep[] = ['language', 'theme', 'students', 'reasons', 'start']
  const stepIndex = steps.indexOf(currentStep) + 1
  const totalSteps = steps.length

  const primaryColor = workingTheme?.config?.tdesign?.brandColor || '#1677FF'
  const isDark = workingTheme?.mode === 'dark'

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

  useEffect(() => {
    if (!workingTheme) return
    applyTheme(workingTheme)
  }, [workingTheme, applyTheme])

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

  const setMode = async (mode: 'light' | 'dark') => {
    const targetThemeId = mode === 'light' ? 'light-default' : 'dark-default'
    await setTheme(targetThemeId)
  }

  const handleLanguageChange = async (lang: AppLanguage) => {
    setSelectedLanguage(lang)
    await changeLanguage(lang)
  }

  const addStudent = () => {
    const name = newStudentName.trim()
    if (!name) return
    if (students.some((s) => s.name === name)) {
      messageApi.warning(t('oobe.steps.students.studentExists'))
      return
    }
    setStudents([...students, { name }])
    setNewStudentName('')
  }

  const removeStudent = (name: string) => {
    setStudents(students.filter((s) => s.name !== name))
  }

  const addReason = () => {
    const content = newReasonContent.trim()
    if (!content) return
    if (reasons.some((r) => r.content === content)) {
      messageApi.warning(t('oobe.steps.reasons.reasonExists'))
      return
    }
    setReasons([...reasons, { content, delta: newReasonDelta }])
    setNewReasonContent('')
    setNewReasonDelta(1)
  }

  const removeReason = (content: string) => {
    setReasons(reasons.filter((r) => r.content !== content))
  }

  const handleFileImport = useCallback(
    async (file: File) => {
      const ext = file.name.split('.').pop()?.toLowerCase()
      if (ext === 'json') {
        try {
          const text = await file.text()
          const data = JSON.parse(text)
          let studentList: string[] = []
          if (Array.isArray(data)) {
            studentList = data.map((item: any) =>
              typeof item === 'string' ? item : item.name || item.student_name
            )
          } else if (data.students && Array.isArray(data.students)) {
            studentList = data.students.map((item: any) =>
              typeof item === 'string' ? item : item.name || item.student_name
            )
          }
          const newStudents = studentList
            .filter((name) => name && typeof name === 'string')
            .filter((name) => !students.some((s) => s.name === name))
            .map((name) => ({ name: name.trim() }))
          if (newStudents.length > 0) {
            setStudents([...students, ...newStudents])
            messageApi.success(
              t('oobe.steps.students.importSuccess', { count: newStudents.length })
            )
          } else {
            messageApi.info(t('oobe.steps.students.noNewStudents'))
          }
        } catch {
          messageApi.error(t('oobe.steps.students.parseFailed'))
        }
      } else if (ext === 'xlsx') {
        try {
          const { read, utils } = await import('xlsx')
          const arrayBuffer = await file.arrayBuffer()
          const workbook = read(arrayBuffer, { type: 'array' })
          const firstSheet = workbook.Sheets[workbook.SheetNames[0]]
          const jsonData = utils.sheet_to_json(firstSheet, { header: 1 }) as string[][]
          const names: string[] = []
          jsonData.forEach((row, idx) => {
            if (idx === 0) return
            const name = row[0]
            if (name && typeof name === 'string') {
              names.push(name.trim())
            }
          })
          const newStudents = names
            .filter((name) => !students.some((s) => s.name === name))
            .map((name) => ({ name }))
          if (newStudents.length > 0) {
            setStudents([...students, ...newStudents])
            messageApi.success(
              t('oobe.steps.students.importSuccess', { count: newStudents.length })
            )
          } else {
            messageApi.info(t('oobe.steps.students.noNewStudents'))
          }
        } catch {
          messageApi.error(t('oobe.steps.students.parseFailed'))
        }
      } else {
        messageApi.error(t('oobe.steps.students.unsupportedFormat'))
      }
    },
    [students, messageApi]
  )

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      const file = e.dataTransfer.files[0]
      if (file) handleFileImport(file)
    },
    [handleFileImport]
  )

  const handleNext = () => {
    const idx = steps.indexOf(currentStep)
    if (idx < steps.length - 1) {
      setCurrentStep(steps[idx + 1])
    }
  }

  const handlePrev = () => {
    const idx = steps.indexOf(currentStep)
    if (idx > 0) {
      setCurrentStep(steps[idx - 1])
    }
  }

  const handleSkip = () => {
    handleNext()
  }

  const handleFinish = async () => {
    setLoading(true)
    try {
      if (!(window as any).api) throw new Error('api not ready')

      if (workingTheme) {
        const exists = themes.some((t) => t.id === workingTheme.id)
        if (!exists) {
          await (window as any).api.saveTheme(workingTheme)
        }
        if (currentTheme?.id !== workingTheme.id) {
          await setTheme(workingTheme.id)
        }
      }

      for (const student of students) {
        await (window as any).api.createStudent({ name: student.name })
      }

      for (const reason of reasons) {
        await (window as any).api.createReason({
          content: reason.content,
          delta: reason.delta
        })
      }

      const res = await (window as any).api.setSetting('is_wizard_completed', true)
      if (!res?.success) throw new Error(res?.message || 'failed')

      messageApi.success(t('common.success'))
      onComplete()
    } catch (e: any) {
      messageApi.error(e?.message || t('common.error'))
    } finally {
      setLoading(false)
    }
  }

  if (!visible) return null

  const currentBg = workingTheme?.config?.custom?.['--ss-bg-color'] || ''

  const renderStepContent = () => {
    switch (currentStep) {
      case 'language':
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Typography.Text type="secondary">
              {t('oobe.steps.language.description')}
            </Typography.Text>
            <Segmented
              value={selectedLanguage}
              onChange={(v) => handleLanguageChange(v as AppLanguage)}
              options={languageOptions.map((opt) => ({
                value: opt.value,
                label: opt.label
              }))}
              block
            />
          </div>
        )

      case 'theme':
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Typography.Text type="secondary">{t('oobe.steps.theme.description')}</Typography.Text>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <Typography.Text strong>{t('oobe.steps.theme.mode')}</Typography.Text>
              <Segmented
                value={workingTheme?.mode || 'light'}
                onChange={(v) => setMode(v as any)}
                options={[
                  { label: t('oobe.steps.theme.lightMode'), value: 'light' },
                  { label: t('oobe.steps.theme.darkMode'), value: 'dark' }
                ]}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <Typography.Text strong>{t('oobe.steps.theme.primaryColor')}</Typography.Text>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <Input
                  value={primaryInput}
                  onChange={(e) => setPrimaryInput(e.target.value)}
                  onBlur={() => {
                    const hex = primaryInput.trim()
                    if (/^#?[0-9a-fA-F]{6}$/.test(hex.replace('#', ''))) {
                      setPrimary(hex.startsWith('#') ? hex : `#${hex}`)
                    }
                  }}
                  style={{ width: 100 }}
                />
                {presetPrimaryColors.slice(0, 6).map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setPrimary(c)}
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: '50%',
                      border:
                        primaryInput === c
                          ? '2px solid var(--ss-primary-color)'
                          : isDark
                            ? '1px solid rgba(255,255,255,0.3)'
                            : '1px solid rgba(0,0,0,0.2)',
                      background: c,
                      cursor: 'pointer',
                      padding: 0
                    }}
                  />
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <Typography.Text strong>{t('oobe.steps.theme.backgroundGradient')}</Typography.Text>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {presetGradients.map((g) => {
                  const gradientValue = g[workingTheme?.mode || 'light']
                  const active = currentBg === gradientValue
                  return (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() => setGradientPreset(gradientValue)}
                      style={{
                        width: 60,
                        height: 40,
                        borderRadius: 8,
                        border: active
                          ? '2px solid var(--ss-primary-color)'
                          : isDark
                            ? '1px solid rgba(255,255,255,0.2)'
                            : '1px solid rgba(0,0,0,0.1)',
                        background: gradientValue,
                        cursor: 'pointer',
                        padding: 0
                      }}
                      title={t(`theme.gradientLabels.${g.labelKey}`)}
                    />
                  )
                })}
              </div>
            </div>
          </div>
        )

      case 'students':
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Typography.Text type="secondary">
              {t('oobe.steps.students.description')}
            </Typography.Text>
            <div style={{ display: 'flex', gap: 8 }}>
              <Button icon={<UploadOutlined />} onClick={() => fileInputRef.current?.click()}>
                {t('oobe.steps.students.import')}
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.json"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) handleFileImport(file)
                  if (fileInputRef.current) fileInputRef.current.value = ''
                }}
              />
            </div>
            <div
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
              style={{
                border: isDark ? '1px dashed rgba(255,255,255,0.3)' : '1px dashed rgba(0,0,0,0.2)',
                borderRadius: 8,
                padding: 16,
                textAlign: 'center',
                color: isDark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.45)'
              }}
            >
              <FileExcelOutlined style={{ fontSize: 24, marginBottom: 8 }} />
              <div>{t('oobe.steps.students.dragDrop')}</div>
              <div style={{ fontSize: 12, marginTop: 4 }}>
                {t('oobe.steps.students.supportedFormats')}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Input
                value={newStudentName}
                onChange={(e) => setNewStudentName(e.target.value)}
                placeholder={t('oobe.steps.students.studentName')}
                onPressEnter={addStudent}
              />
              <Button type="primary" icon={<PlusOutlined />} onClick={addStudent}>
                {t('oobe.steps.students.addStudent')}
              </Button>
            </div>
            <div
              style={{
                maxHeight: 150,
                overflowY: 'auto',
                display: 'flex',
                flexWrap: 'wrap',
                gap: 4
              }}
            >
              {students.length === 0 ? (
                <Typography.Text type="secondary">
                  {t('oobe.steps.students.noStudents')}
                </Typography.Text>
              ) : (
                students.map((s) => (
                  <Tag
                    key={s.name}
                    closable
                    onClose={() => removeStudent(s.name)}
                    style={{ margin: 2 }}
                  >
                    {s.name}
                  </Tag>
                ))
              )}
            </div>
            {students.length > 0 && (
              <Typography.Text type="secondary">
                {t('oobe.steps.students.studentCount', { count: students.length })}
              </Typography.Text>
            )}
          </div>
        )

      case 'reasons':
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Typography.Text type="secondary">
              {t('oobe.steps.reasons.description')}
            </Typography.Text>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <Input
                value={newReasonContent}
                onChange={(e) => setNewReasonContent(e.target.value)}
                placeholder={t('oobe.steps.reasons.reasonName')}
                style={{ flex: 1 }}
              />
              <InputNumber
                value={newReasonDelta}
                onChange={(v) => setNewReasonDelta(v || 0)}
                min={-999}
                max={999}
                style={{ width: 80 }}
              />
              <Button type="primary" icon={<PlusOutlined />} onClick={addReason}>
                {t('oobe.steps.reasons.addReason')}
              </Button>
            </div>
            <div
              style={{
                maxHeight: 150,
                overflowY: 'auto',
                display: 'flex',
                flexWrap: 'wrap',
                gap: 4
              }}
            >
              {reasons.length === 0 ? (
                <Typography.Text type="secondary">
                  {t('oobe.steps.reasons.noReasons')}
                </Typography.Text>
              ) : (
                reasons.map((r) => (
                  <Tag
                    key={r.content}
                    closable
                    onClose={() => removeReason(r.content)}
                    color={r.delta > 0 ? 'success' : 'error'}
                    style={{ margin: 2 }}
                  >
                    {r.content} ({r.delta > 0 ? '+' : ''}
                    {r.delta})
                  </Tag>
                ))
              )}
            </div>
            {reasons.length > 0 && (
              <Typography.Text type="secondary">
                {t('oobe.steps.reasons.reasonCount', { count: reasons.length })}
              </Typography.Text>
            )}
          </div>
        )

      case 'start':
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24, alignItems: 'center' }}>
            <Typography.Text type="secondary" style={{ textAlign: 'center' }}>
              {t('oobe.steps.start.description')}
            </Typography.Text>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: 8,
                  background: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
                  borderRadius: 8
                }}
              >
                <span style={{ color: '#52c41a' }}>✓</span>
                <span>{t('oobe.steps.start.features.score')}</span>
              </div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: 8,
                  background: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
                  borderRadius: 8
                }}
              >
                <span style={{ color: '#52c41a' }}>✓</span>
                <span>{t('oobe.steps.start.features.history')}</span>
              </div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: 8,
                  background: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
                  borderRadius: 8
                }}
              >
                <span style={{ color: '#52c41a' }}>✓</span>
                <span>{t('oobe.steps.start.features.settlement')}</span>
              </div>
            </div>
          </div>
        )
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}
    >
      <OOBEBackground primaryColor={primaryColor} mode={workingTheme?.mode || 'light'} />

      <div
        style={{
          position: 'relative',
          zIndex: 1,
          background: isDark ? 'rgba(15, 25, 45, 0.55)' : 'rgba(255, 255, 255, 0.65)',
          backdropFilter: 'blur(20px)',
          borderRadius: 16,
          padding: 32,
          width: 480,
          maxWidth: '90vw',
          boxShadow: isDark ? '0 8px 32px rgba(0, 0, 0, 0.3)' : '0 8px 32px rgba(0, 0, 0, 0.1)',
          border: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid rgba(0, 0, 0, 0.06)'
        }}
      >
        {contextHolder}

        <div style={{ marginBottom: 24 }}>
          <Typography.Title
            level={3}
            style={{ margin: 0, color: isDark ? '#fff' : 'rgba(0, 0, 0, 0.88)' }}
          >
            {t('oobe.title')}
          </Typography.Title>
          <Typography.Text style={{ color: isDark ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.45)' }}>
            {t('oobe.subtitle')}
          </Typography.Text>
        </div>

        <div style={{ marginBottom: 16 }}>
          <Typography.Title
            level={4}
            style={{ margin: 0, color: isDark ? '#fff' : 'rgba(0, 0, 0, 0.88)' }}
          >
            {t(`oobe.steps.${currentStep}.title`)}
          </Typography.Title>
        </div>

        <div style={{ minHeight: 200, marginBottom: 24 }}>{renderStepContent()}</div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}
        >
          <div style={{ display: 'flex', gap: 8 }}>
            {currentStep !== 'language' && <Button onClick={handlePrev}>{t('common.prev')}</Button>}
            {currentStep !== 'start' && <Button onClick={handleSkip}>{t('oobe.skip')}</Button>}
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              color: isDark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.45)',
              fontSize: 12
            }}
          >
            <div
              style={{
                width: 60,
                height: 4,
                background: isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.1)',
                borderRadius: 2,
                overflow: 'hidden'
              }}
            >
              <div
                style={{
                  width: `${(stepIndex / totalSteps) * 100}%`,
                  height: '100%',
                  background: primaryColor,
                  transition: 'width 0.3s'
                }}
              />
            </div>
            <span>{t('oobe.step', { current: stepIndex, total: totalSteps })}</span>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            {currentStep !== 'start' ? (
              <Button type="primary" onClick={handleNext}>
                {t('common.next')}
              </Button>
            ) : (
              <Button
                type="primary"
                loading={loading}
                onClick={handleFinish}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8
                }}
              >
                <img
                  src={logoSvg}
                  alt="SecScore"
                  style={{
                    width: 16,
                    height: 16,
                    filter: isDark ? 'brightness(0) invert(1)' : 'none'
                  }}
                />
                {t('oobe.steps.start.startButton')}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
