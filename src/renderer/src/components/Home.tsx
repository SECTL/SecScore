import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { Card, Space, Button, Tag, Input, Select, Modal, message, InputNumber, Divider } from 'antd'
import { SearchOutlined, DeleteOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { match, pinyin } from 'pinyin-pro'

interface student {
  id: number
  name: string
  score: number
  pinyinName?: string
  pinyinFirst?: string
}

interface reason {
  id: number
  content: string
  delta: number
  category: string
}

type SortType = 'alphabet' | 'surname' | 'score'

export const Home: React.FC<{ canEdit: boolean }> = ({ canEdit }) => {
  const { t } = useTranslation()
  const [students, setStudents] = useState<student[]>([])
  const [reasons, setReasons] = useState<reason[]>([])
  const [loading, setLoading] = useState(false)
  const [sortType, setSortType] = useState<SortType>('alphabet')
  const [searchKeyword, setSearchKeyword] = useState('')

  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const groupRefs = useRef<Record<string, HTMLDivElement | null>>({})

  const [selectedStudent, setSelectedStudent] = useState<student | null>(null)
  const [operationVisible, setOperationVisible] = useState(false)
  const [customScore, setCustomScore] = useState<number | undefined>(undefined)
  const [reasonContent, setReasonContent] = useState('')
  const [submitLoading, setSubmitLoading] = useState(false)
  const [messageApi, contextHolder] = message.useMessage()

  const emitDataUpdated = (category: 'events' | 'students' | 'reasons' | 'all') => {
    window.dispatchEvent(new CustomEvent('ss:data-updated', { detail: { category } }))
  }

  const getSurname = (name: string) => {
    if (!name) return ''
    return name.charAt(0)
  }

  const getFirstLetter = (name: string) => {
    if (!name) return ''
    const firstChar = name.charAt(0)
    if (/^[a-zA-Z]$/.test(firstChar)) return firstChar.toUpperCase()
    const py = pinyin(firstChar, { pattern: 'first', toneType: 'none' })
    return py ? py.toUpperCase() : '#'
  }

  const fetchData = useCallback(async (silent = false) => {
    if (!(window as any).api) return
    if (!silent) setLoading(true)
    const [stuRes, reaRes] = await Promise.all([
      (window as any).api.queryStudents({}),
      (window as any).api.queryReasons()
    ])

    if (stuRes.success) {
      const enrichedStudents = (stuRes.data as student[]).map((s) => ({
        ...s,
        pinyinName: pinyin(s.name, { toneType: 'none' }).toLowerCase(),
        pinyinFirst: getFirstLetter(s.name)
      }))
      setStudents(enrichedStudents)
    }
    if (reaRes.success) setReasons(reaRes.data)
    if (!silent) setLoading(false)
  }, [])

  useEffect(() => {
    fetchData()
    const onDataUpdated = (e: any) => {
      const category = e?.detail?.category
      if (category === 'students' || category === 'reasons' || category === 'all') {
        fetchData(true)
      }
    }
    window.addEventListener('ss:data-updated', onDataUpdated as any)
    return () => window.removeEventListener('ss:data-updated', onDataUpdated as any)
  }, [fetchData])

  const getDisplayText = (name: string) => {
    if (!name) return ''
    return name.length > 2 ? name.substring(name.length - 2) : name
  }

  const matchStudentName = useCallback((s: student, keyword: string) => {
    const q0 = keyword.trim().toLowerCase()
    if (!q0) return true

    const nameLower = String(s.name).toLowerCase()
    if (nameLower.includes(q0)) return true

    const pyLower = s.pinyinName || ''
    if (pyLower.includes(q0)) return true

    const q1 = q0.replace(/\s+/g, '')
    if (
      q1 &&
      (nameLower.replace(/\s+/g, '').includes(q1) || pyLower.replace(/\s+/g, '').includes(q1))
    )
      return true

    try {
      const m0 = match(s.name, q0)
      if (Array.isArray(m0)) return true
    } catch {
      return false
    }

    return false
  }, [])

  const sortedStudents = useMemo(() => {
    const filtered = students.filter((s) => matchStudentName(s, searchKeyword))

    switch (sortType) {
      case 'alphabet':
        return filtered.sort((a, b) => {
          const pyA = a.pinyinName || ''
          const pyB = b.pinyinName || ''
          return pyA.localeCompare(pyB)
        })
      case 'surname':
        return filtered.sort((a, b) => {
          const surnameA = getSurname(a.name)
          const surnameB = getSurname(b.name)
          if (surnameA === surnameB) {
            return a.name.localeCompare(b.name, 'zh-CN')
          }
          return surnameA.localeCompare(surnameB, 'zh-CN')
        })
      case 'score':
        return filtered.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, 'zh-CN'))
      default:
        return filtered
    }
  }, [students, searchKeyword, sortType, matchStudentName])

  const groupedStudents = useMemo(() => {
    if (sortType === 'score' || (sortType === 'alphabet' && searchKeyword)) {
      return [{ key: 'all', students: sortedStudents }]
    }

    const groups: Record<string, student[]> = {}
    sortedStudents.forEach((s) => {
      const key = sortType === 'alphabet' ? s.pinyinFirst || '#' : getSurname(s.name)
      if (!groups[key]) groups[key] = []
      groups[key].push(s)
    })

    return Object.entries(groups)
      .sort(([a], [b]) => a.localeCompare(b, 'zh-CN'))
      .map(([key, students]) => ({ key, students }))
  }, [sortedStudents, sortType, searchKeyword])

  const groupedReasons = useMemo(() => {
    const groups: Record<string, reason[]> = {}
    reasons.forEach((r) => {
      const cat = r.category || t('home.category.others')
      if (!groups[cat]) groups[cat] = []
      groups[cat].push(r)
    })
    return Object.entries(groups).sort(([a], [b]) => {
      if (a === t('home.category.others')) return 1
      if (b === t('home.category.others')) return -1
      return a.localeCompare(b, 'zh-CN')
    })
  }, [reasons])

  const getAvatarColor = (name: string) => {
    const colors = [
      '#FF6B6B',
      '#4ECDC4',
      '#45B7D1',
      '#FFA07A',
      '#98D8C8',
      '#F7DC6F',
      '#BB8FCE',
      '#85C1E2',
      '#F8B739',
      '#52B788'
    ]
    let hash = 0
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash)
    }
    const index = Math.abs(hash) % colors.length
    return colors[index]
  }

  const scrollToGroup = (key: string) => {
    const element = groupRefs.current[key]
    if (element) {
      element.scrollIntoView({ behavior: 'auto', block: 'start' })
    }
  }

  const openOperation = (student: student) => {
    if (!canEdit) {
      messageApi.error(t('common.readOnly'))
      return
    }
    setSelectedStudent(student)
    setCustomScore(undefined)
    setReasonContent('')
    setOperationVisible(true)
  }

  const performSubmit = async (student: student, delta: number, content: string) => {
    if (!(window as any).api) return
    if (!canEdit) {
      messageApi.error(t('common.readOnly'))
      return
    }

    setSubmitLoading(true)
    const res = await (window as any).api.createEvent({
      student_name: student.name,
      reason_content: content,
      delta: delta
    })

    if (res.success) {
      messageApi.success(
        delta > 0
          ? t('home.scoreAdded', { name: student.name, points: Math.abs(delta) })
          : t('home.scoreDeducted', { name: student.name, points: Math.abs(delta) })
      )
      setOperationVisible(false)

      setStudents((prev) =>
        prev.map((s) => (s.id === student.id ? { ...s, score: s.score + delta } : s))
      )

      emitDataUpdated('events')
    } else {
      messageApi.error(res.message || t('home.submitFailed'))
    }
    setSubmitLoading(false)
  }

  const handleSubmit = async () => {
    if (!selectedStudent) return

    const delta = customScore
    if (delta === undefined || !Number.isFinite(delta)) {
      messageApi.warning(t('home.pleaseSelectPoints'))
      return
    }

    const content =
      reasonContent ||
      (delta > 0
        ? t('home.addPoints')
        : delta < 0
          ? t('home.deductPoints')
          : t('home.pointsChange'))
    await performSubmit(selectedStudent, delta, content)
  }

  const handleReasonSelect = (reason: reason) => {
    if (!selectedStudent) return
    performSubmit(selectedStudent, reason.delta, reason.content)
  }

  const renderStudentCard = (student: student, index: number) => {
    const avatarText = getDisplayText(student.name)
    const avatarColor = getAvatarColor(student.name)

    let rankBadge: string | null = null
    if (sortType === 'score' && !searchKeyword) {
      if (index === 0) rankBadge = '🥇'
      else if (index === 1) rankBadge = '🥈'
      else if (index === 2) rankBadge = '🥉'
    }

    return (
      <div
        key={student.id}
        onClick={() => openOperation(student)}
        style={{ cursor: 'pointer', position: 'relative' }}
      >
        <Card
          style={{
            backgroundColor: 'var(--ss-card-bg)',
            transition: 'all 0.2s cubic-bezier(0.38, 0, 0.24, 1)',
            border: '1px solid var(--ss-border-color)',
            overflow: 'visible'
          }}
          styles={{ body: { padding: '12px' } }}
        >
          {rankBadge && (
            <div
              style={{
                position: 'absolute',
                top: '-10px',
                left: '-10px',
                fontSize: '24px',
                zIndex: 1
              }}
            >
              {rankBadge}
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '44px',
                height: '44px',
                borderRadius: '12px',
                backgroundColor: avatarColor,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'white',
                fontWeight: 'bold',
                fontSize: avatarText.length > 1 ? '14px' : '18px',
                flexShrink: 0,
                boxShadow: `0 4px 10px ${avatarColor}40`
              }}
            >
              {avatarText}
            </div>
            <div style={{ flex: 1, overflow: 'hidden' }}>
              <div
                style={{
                  fontWeight: 600,
                  fontSize: '15px',
                  color: 'var(--ss-text-main)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis'
                }}
              >
                {student.name}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                <Tag
                  color={student.score > 0 ? 'success' : student.score < 0 ? 'error' : 'default'}
                  style={{ fontWeight: 'bold' }}
                >
                  {student.score > 0 ? `+${student.score}` : student.score}
                </Tag>
              </div>
            </div>
          </div>
        </Card>
      </div>
    )
  }

  const renderGroupedCards = () => {
    return groupedStudents.map((group) => (
      <div
        key={group.key}
        style={{ marginBottom: '32px' }}
        ref={(el) => {
          groupRefs.current[group.key] = el
        }}
      >
        {group.key !== 'all' && (
          <div
            style={{
              fontSize: '18px',
              fontWeight: 'bold',
              color: 'var(--ss-text-main)',
              marginBottom: '16px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              borderLeft: '4px solid var(--ant-color-primary, #1890ff)',
              paddingLeft: '12px'
            }}
          >
            <span style={{ color: 'var(--ant-color-primary, #1890ff)' }}>{group.key}</span>
            <span
              style={{ fontSize: '12px', color: 'var(--ss-text-secondary)', fontWeight: 'normal' }}
            >
              ({t('home.studentCount', { count: group.students.length })})
            </span>
          </div>
        )}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
            gap: '16px'
          }}
        >
          {group.students.map((student, idx) => renderStudentCard(student, idx))}
        </div>
      </div>
    ))
  }

  const navContainerRef = useRef<HTMLDivElement>(null)
  const isNavDragging = useRef(false)

  const handleNavAction = useCallback(
    (clientY: number) => {
      if (!navContainerRef.current) return
      const rect = navContainerRef.current.getBoundingClientRect()
      const y = clientY - rect.top
      const items = navContainerRef.current.children
      const itemCount = items.length
      if (itemCount === 0) return

      const itemHeight = rect.height / itemCount
      const index = Math.floor(y / itemHeight)
      const safeIndex = Math.max(0, Math.min(itemCount - 1, index))

      const targetGroup = groupedStudents[safeIndex]
      if (targetGroup) {
        scrollToGroup(targetGroup.key)
      }
    },
    [groupedStudents]
  )

  const onNavMouseDown = (e: React.MouseEvent) => {
    isNavDragging.current = true
    handleNavAction(e.clientY)
    document.addEventListener('mousemove', onGlobalMouseMove)
    document.addEventListener('mouseup', onGlobalMouseUp)
  }

  const onGlobalMouseMove = (e: MouseEvent) => {
    if (isNavDragging.current) {
      handleNavAction(e.clientY)
    }
  }

  const onGlobalMouseUp = () => {
    isNavDragging.current = false
    document.removeEventListener('mousemove', onGlobalMouseMove)
    document.removeEventListener('mouseup', onGlobalMouseUp)
  }

  const onNavTouchStart = (e: React.TouchEvent) => {
    isNavDragging.current = true
    if (e.touches[0]) {
      handleNavAction(e.touches[0].clientY)
    }
  }

  const onNavTouchMove = (e: React.TouchEvent) => {
    if (isNavDragging.current && e.touches[0]) {
      handleNavAction(e.touches[0].clientY)
      if (e.cancelable) e.preventDefault()
    }
  }

  const onNavTouchEnd = () => {
    isNavDragging.current = false
  }

  const renderQuickNav = () => {
    if (
      groupedStudents.length <= 1 ||
      sortType === 'score' ||
      (sortType === 'alphabet' && searchKeyword)
    )
      return null

    return (
      <div
        ref={navContainerRef}
        onMouseDown={onNavMouseDown}
        onTouchStart={onNavTouchStart}
        onTouchMove={onNavTouchMove}
        onTouchEnd={onNavTouchEnd}
        style={{
          position: 'fixed',
          right: '12px',
          top: '50%',
          transform: 'translateY(-50%)',
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: 'var(--ss-card-bg)',
          padding: '8px 4px',
          borderRadius: '20px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
          zIndex: 100,
          maxHeight: '80vh',
          border: '1px solid var(--ss-border-color)',
          cursor: 'pointer',
          userSelect: 'none',
          touchAction: 'none'
        }}
      >
        {groupedStudents.map((group) => (
          <div
            key={group.key}
            style={{
              width: '24px',
              height: '24px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '11px',
              fontWeight: 'bold',
              color: 'var(--ant-color-primary, #1890ff)',
              borderRadius: '50%',
              pointerEvents: 'none'
            }}
          >
            {group.key}
          </div>
        ))}
      </div>
    )
  }

  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto', position: 'relative' }}>
      {contextHolder}
      <div
        style={{
          marginBottom: '32px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '16px',
          flexWrap: 'wrap'
        }}
      >
        <div>
          <h2 style={{ margin: 0, color: 'var(--ss-text-main)', fontSize: '24px' }}>
            {t('home.title')}
          </h2>
          <p style={{ margin: '4px 0 0', color: 'var(--ss-text-secondary)', fontSize: '13px' }}>
            {t('home.subtitle', { count: students.length })}
          </p>
        </div>

        <Space size="middle">
          <Input
            value={searchKeyword}
            onChange={(e) => setSearchKeyword(e.target.value)}
            placeholder={t('home.searchPlaceholder')}
            prefix={<SearchOutlined />}
            allowClear
            style={{ width: '220px' }}
          />

          <Select
            value={sortType}
            onChange={(v) => setSortType(v as SortType)}
            style={{ width: '140px' }}
            options={[
              { value: 'alphabet', label: t('home.sortBy.alphabet') },
              { value: 'surname', label: t('home.sortBy.surname') },
              { value: 'score', label: t('home.sortBy.score') }
            ]}
          />
        </Space>
      </div>

      {renderQuickNav()}

      <div style={{ minHeight: '400px' }} ref={scrollContainerRef}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '100px 0' }}>
            <div style={{ color: 'var(--ss-text-secondary)' }}>{t('common.loading')}</div>
          </div>
        ) : sortedStudents.length === 0 ? (
          <div
            style={{
              textAlign: 'center',
              padding: '100px 0',
              backgroundColor: 'var(--ss-card-bg)',
              borderRadius: '12px',
              border: '1px dashed var(--ss-border-color)'
            }}
          >
            <div style={{ fontSize: '16px', color: 'var(--ss-text-secondary)' }}>
              {searchKeyword ? t('home.noMatch') : t('home.noStudents')}
            </div>
            {searchKeyword && (
              <Button type="link" onClick={() => setSearchKeyword('')} style={{ marginTop: '8px' }}>
                {t('home.clearSearch')}
              </Button>
            )}
          </div>
        ) : (
          renderGroupedCards()
        )}
      </div>

      <Modal
        title={t('home.operationTitle', { name: selectedStudent?.name })}
        open={operationVisible}
        onCancel={() => setOperationVisible(false)}
        onOk={handleSubmit}
        confirmLoading={submitLoading}
        okText={t('home.submitOperation')}
        cancelText={t('common.cancel')}
        width={560}
        destroyOnHidden
      >
        {selectedStudent && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', padding: '8px 0' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 16px',
                backgroundColor: 'var(--ss-bg-color)',
                borderRadius: '8px'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '50%',
                    backgroundColor: getAvatarColor(selectedStudent.name),
                    color: 'white',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '14px',
                    fontWeight: 'bold'
                  }}
                >
                  {getDisplayText(selectedStudent.name)}
                </div>
                <span style={{ fontWeight: 600 }}>{selectedStudent.name}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ color: 'var(--ss-text-secondary)', fontSize: '13px' }}>
                  {t('home.currentScore')}：
                </span>
                <Tag
                  color={
                    selectedStudent.score > 0
                      ? 'success'
                      : selectedStudent.score < 0
                        ? 'error'
                        : 'default'
                  }
                  style={{ fontWeight: 'bold' }}
                >
                  {selectedStudent.score > 0 ? `+${selectedStudent.score}` : selectedStudent.score}
                </Tag>
              </div>
            </div>

            {groupedReasons.length > 0 && (
              <div>
                <div
                  style={{
                    marginBottom: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}
                >
                  <span style={{ fontWeight: 600, fontSize: '14px' }}>
                    {t('home.quickOptions')}
                  </span>
                  <Divider style={{ flex: 1, margin: 0 }} />
                </div>
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px',
                    maxHeight: '240px',
                    overflowY: 'auto',
                    paddingRight: '4px'
                  }}
                >
                  {groupedReasons.map(([category, items]) => (
                    <div key={category}>
                      <div
                        style={{
                          fontSize: '12px',
                          color: 'var(--ss-text-secondary)',
                          marginBottom: '6px',
                          paddingLeft: '2px'
                        }}
                      >
                        {category}
                      </div>
                      <Space wrap size="small">
                        {items.map((r) => (
                          <Button
                            key={r.id}
                            size="small"
                            onClick={() => handleReasonSelect(r)}
                            style={{
                              borderColor:
                                r.delta > 0
                                  ? 'var(--ant-color-success, #52c41a)'
                                  : r.delta < 0
                                    ? 'var(--ant-color-error, #ff4d4f)'
                                    : undefined
                            }}
                          >
                            {r.content}{' '}
                            <span
                              style={{
                                marginLeft: '4px',
                                color:
                                  r.delta > 0
                                    ? 'var(--ant-color-success, #52c41a)'
                                    : r.delta < 0
                                      ? 'var(--ant-color-error, #ff4d4f)'
                                      : 'inherit',
                                fontWeight: 'bold'
                              }}
                            >
                              {r.delta > 0 ? `+${r.delta}` : r.delta}
                            </span>
                          </Button>
                        ))}
                      </Space>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div>
              <div
                style={{ marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}
              >
                <span style={{ fontWeight: 600, fontSize: '14px' }}>{t('home.adjustPoints')}</span>
                <Divider style={{ flex: 1, margin: 0 }} />
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' }}>
                {[-5, -3, -2, -1, 1, 2, 3, 5, 10].map((num) => (
                  <Button
                    key={num}
                    size="small"
                    type={customScore === num ? 'primary' : 'default'}
                    danger={num < 0}
                    onClick={() => setCustomScore(num)}
                    style={{ minWidth: '42px' }}
                  >
                    {num > 0 ? `+${num}` : num}
                  </Button>
                ))}
                <Button size="small" onClick={() => setCustomScore(0)} style={{ minWidth: '42px' }}>
                  0
                </Button>
              </div>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                <InputNumber
                  value={customScore}
                  onChange={(v) => setCustomScore(v as number)}
                  min={-99}
                  max={99}
                  step={1}
                  style={{ width: '140px' }}
                  placeholder={t('home.customPoints')}
                />
                <span style={{ fontSize: '13px', color: 'var(--ss-text-secondary)' }}>
                  {t('home.customPointsHint')}
                </span>
              </div>
            </div>

            <div>
              <div
                style={{ marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}
              >
                <span style={{ fontWeight: 600, fontSize: '14px' }}>{t('home.reason')}</span>
                <Divider style={{ flex: 1, margin: 0 }} />
              </div>
              <Input
                value={reasonContent}
                onChange={(e) => setReasonContent(e.target.value)}
                placeholder={t('home.reasonPlaceholder')}
                suffix={
                  reasonContent ? (
                    <DeleteOutlined
                      onClick={() => setReasonContent('')}
                      style={{ cursor: 'pointer' }}
                    />
                  ) : undefined
                }
              />
            </div>

            {customScore !== undefined && (
              <div
                style={{
                  padding: '16px',
                  background:
                    customScore > 0
                      ? 'var(--ant-color-success-bg, #f6ffed)'
                      : customScore < 0
                        ? 'var(--ant-color-error-bg, #fff2f0)'
                        : 'var(--ss-bg-color)',
                  borderRadius: '8px',
                  border: `1px solid ${customScore > 0 ? 'var(--ant-color-success-border, #b7eb8f)' : customScore < 0 ? 'var(--ant-color-error-border, #ffccc7)' : 'var(--ss-border-color)'}`,
                  marginTop: '4px'
                }}
              >
                <div
                  style={{
                    fontSize: '13px',
                    fontWeight: 600,
                    marginBottom: '4px',
                    color: 'var(--ss-text-main)'
                  }}
                >
                  {t('home.preview')}：
                </div>
                <div style={{ fontSize: '15px' }}>
                  {selectedStudent.name}{' '}
                  <span
                    style={{
                      fontWeight: 'bold',
                      color:
                        customScore > 0
                          ? 'var(--ant-color-success, #52c41a)'
                          : customScore < 0
                            ? 'var(--ant-color-error, #ff4d4f)'
                            : 'inherit'
                    }}
                  >
                    {customScore > 0 ? `+${customScore}` : customScore}
                  </span>{' '}
                  {t('home.points')}
                  <span style={{ color: 'var(--ss-text-secondary)', marginLeft: '8px' }}>
                    {reasonContent
                      ? `${t('home.reasonLabel')}${reasonContent}`
                      : t('home.noReason')}
                  </span>
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}
