import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import {
  Card,
  Space,
  Button,
  Tag,
  Input,
  Select,
  Dialog,
  MessagePlugin,
  InputNumber,
  Divider
} from 'tdesign-react'
import { SearchIcon, DeleteIcon } from 'tdesign-icons-react'
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
  const [students, setStudents] = useState<student[]>([])
  const [reasons, setReasons] = useState<reason[]>([])
  const [loading, setLoading] = useState(false)
  const [sortType, setSortType] = useState<SortType>('alphabet')
  const [searchKeyword, setSearchKeyword] = useState('')

  // 滚动容器引用
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const groupRefs = useRef<Record<string, HTMLDivElement | null>>({})

  // 操作框状态
  const [selectedStudent, setSelectedStudent] = useState<student | null>(null)
  const [operationVisible, setOperationVisible] = useState(false)
  const [customScore, setCustomScore] = useState<number | undefined>(undefined)
  const [reasonContent, setReasonContent] = useState('')
  const [submitLoading, setSubmitLoading] = useState(false)

  const emitDataUpdated = (category: 'events' | 'students' | 'reasons' | 'all') => {
    window.dispatchEvent(new CustomEvent('ss:data-updated', { detail: { category } }))
  }

  // 获取姓氏
  const getSurname = (name: string) => {
    if (!name) return ''
    return name.charAt(0)
  }

  // 获取拼音首字母
  const getFirstLetter = (name: string) => {
    if (!name) return ''
    const firstChar = name.charAt(0)
    // 如果是英文字母
    if (/^[a-zA-Z]$/.test(firstChar)) return firstChar.toUpperCase()
    // 如果是中文，转拼音
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
      const enrichedStudents = (stuRes.data as student[]).map(s => ({
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

  // 获取展示用的文字
  const getDisplayText = (name: string) => {
    if (!name) return ''
    return name.length > 2 ? name.substring(name.length - 2) : name
  }

  // 拼音匹配
  const matchStudentName = useCallback((s: student, keyword: string) => {
    const q0 = keyword.trim().toLowerCase()
    if (!q0) return true

    const nameLower = String(s.name).toLowerCase()
    if (nameLower.includes(q0)) return true

    const pyLower = s.pinyinName || ''
    if (pyLower.includes(q0)) return true

    const q1 = q0.replace(/\s+/g, '')
    if (q1 && (nameLower.replace(/\s+/g, '').includes(q1) || pyLower.replace(/\s+/g, '').includes(q1))) return true

    try {
      const m0 = match(s.name, q0)
      if (Array.isArray(m0)) return true
    } catch {
      return false
    }

    return false
  }, [])

  // 过滤和排序学生
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

  // 分组显示
  const groupedStudents = useMemo(() => {
    if (sortType === 'score' || (sortType === 'alphabet' && searchKeyword)) {
      return [{ key: 'all', students: sortedStudents }]
    }

    const groups: Record<string, student[]> = {}
    sortedStudents.forEach((s) => {
      const key = sortType === 'alphabet' ? (s.pinyinFirst || '#') : getSurname(s.name)
      if (!groups[key]) groups[key] = []
      groups[key].push(s)
    })

    return Object.entries(groups)
      .sort(([a], [b]) => a.localeCompare(b, 'zh-CN'))
      .map(([key, students]) => ({ key, students }))
  }, [sortedStudents, sortType, searchKeyword])

  // 按分类分组的理由
  const groupedReasons = useMemo(() => {
    const groups: Record<string, reason[]> = {}
    reasons.forEach((r) => {
      const cat = r.category || '其他'
      if (!groups[cat]) groups[cat] = []
      groups[cat].push(r)
    })
    return Object.entries(groups).sort(([a], [b]) => {
      if (a === '其他') return 1
      if (b === '其他') return -1
      return a.localeCompare(b, 'zh-CN')
    })
  }, [reasons])

  // 生成头像颜色
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

  // 跳转到指定分组
  const scrollToGroup = (key: string) => {
    const element = groupRefs.current[key]
    if (element) {
      element.scrollIntoView({ behavior: 'auto', block: 'start' })
    }
  }

  // 打开操作框
  const openOperation = (student: student) => {
    if (!canEdit) {
      MessagePlugin.error('当前为只读权限')
      return
    }
    setSelectedStudent(student)
    setCustomScore(undefined)
    setReasonContent('')
    setOperationVisible(true)
  }

  // 核心提交逻辑
  const performSubmit = async (student: student, delta: number, content: string) => {
    if (!(window as any).api) return
    if (!canEdit) {
      MessagePlugin.error('当前为只读权限')
      return
    }

    setSubmitLoading(true)
    const res = await (window as any).api.createEvent({
      student_name: student.name,
      reason_content: content,
      delta: delta
    })

    if (res.success) {
      MessagePlugin.success(`已为 ${student.name} ${delta > 0 ? '加' : '扣'}${Math.abs(delta)}分`)
      setOperationVisible(false)

      // 【核心改进】本地增量更新分数，避免全量刷新导致的闪烁和滚动重置
      setStudents((prev) =>
        prev.map((s) => (s.id === student.id ? { ...s, score: s.score + delta } : s))
      )

      // 通知其他组件数据已更新（但不在此处重复 fetchData）
      emitDataUpdated('events')
    } else {
      MessagePlugin.error(res.message || '提交失败')
    }
    setSubmitLoading(false)
  }

  // 手动点击确定按钮提交（用于自定义分值）
  const handleSubmit = async () => {
    if (!selectedStudent) return

    const delta = customScore
    if (delta === undefined || !Number.isFinite(delta)) {
      MessagePlugin.warning('请选择或输入分值')
      return
    }

    const content = reasonContent || (delta > 0 ? '加分' : delta < 0 ? '扣分' : '积分变更')
    await performSubmit(selectedStudent, delta, content)
  }

  // 快捷理由选择：点击即提交
  const handleReasonSelect = (reason: reason) => {
    if (!selectedStudent) return
    performSubmit(selectedStudent, reason.delta, reason.content)
  }

  // 渲染学生卡片
  const renderStudentCard = (student: student, index: number) => {
    const avatarText = getDisplayText(student.name)
    const avatarColor = getAvatarColor(student.name)

    // 排行榜勋章
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
          hover
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
                  theme={student.score > 0 ? 'success' : student.score < 0 ? 'danger' : 'default'}
                  variant="light-outline"
                  size="small"
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

  // 渲染分组学生卡片
  const renderGroupedCards = () => {
    return groupedStudents.map((group) => (
      <div
        key={group.key}
        style={{ marginBottom: '32px' }}
        ref={(el) => (groupRefs.current[group.key] = el)}
      >
        {group.key !== 'all' && (
          <div
            style={{
              fontSize: '18px',
              fontWeight: 'bold',
              color: 'var(--ss-text-main)',
              marginBottom: '16px',
              paddingLeft: '4px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              borderLeft: '4px solid var(--td-brand-color)',
              paddingLeft: '12px'
            }}
          >
            <span style={{ color: 'var(--td-brand-color)' }}>{group.key}</span>
            <span
              style={{ fontSize: '12px', color: 'var(--ss-text-secondary)', fontWeight: 'normal' }}
            >
              ({group.students.length} 人)
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

  // 快速导航滑动处理
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

      // 计算当前指向第几个项
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

  // 触摸事件处理
  const onNavTouchStart = (e: React.TouchEvent) => {
    isNavDragging.current = true
    if (e.touches[0]) {
      handleNavAction(e.touches[0].clientY)
    }
  }

  const onNavTouchMove = (e: React.TouchEvent) => {
    if (isNavDragging.current && e.touches[0]) {
      handleNavAction(e.touches[0].clientY)
      // 防止触摸滑动时触发页面滚动
      if (e.cancelable) e.preventDefault()
    }
  }

  const onNavTouchEnd = () => {
    isNavDragging.current = false
  }

  // 渲染快速导航
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
          touchAction: 'none' // 关键：禁用浏览器的默认触摸处理
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
              color: 'var(--td-brand-color)',
              borderRadius: '50%',
              pointerEvents: 'none' // 让事件由父容器统一处理
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
      {/* 顶部工具栏 */}
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
            学生积分主页
          </h2>
          <p style={{ margin: '4px 0 0', color: 'var(--ss-text-secondary)', fontSize: '13px' }}>
            共 {students.length} 名学生，点击卡片进行积分操作
          </p>
        </div>

        <Space size="medium">
          {/* 搜索 */}
          <Input
            value={searchKeyword}
            onChange={setSearchKeyword}
            placeholder="搜索姓名/拼音..."
            prefixIcon={<SearchIcon />}
            clearable
            style={{ width: '220px' }}
          />

          {/* 排序方式 */}
          <Select
            value={sortType}
            onChange={(v) => setSortType(v as SortType)}
            style={{ width: '140px' }}
            autoWidth
          >
            <Select.Option value="alphabet" label="姓名排序" />
            <Select.Option value="surname" label="姓氏分组" />
            <Select.Option value="score" label="积分排行" />
          </Select>
        </Space>
      </div>

      {/* 快速导航 */}
      {renderQuickNav()}

      {/* 学生卡片网格 */}
      <div style={{ minHeight: '400px' }} ref={scrollContainerRef}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '100px 0' }}>
            <div style={{ color: 'var(--ss-text-secondary)' }}>加载中...</div>
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
              {searchKeyword ? '未找到匹配的学生' : '暂无学生数据，请前往学生管理添加'}
            </div>
            {searchKeyword && (
              <Button
                variant="text"
                theme="primary"
                onClick={() => setSearchKeyword('')}
                style={{ marginTop: '8px' }}
              >
                清除搜索
              </Button>
            )}
          </div>
        ) : (
          renderGroupedCards()
        )}
      </div>

      {/* 操作框 */}
      <Dialog
        header={`积分操作：${selectedStudent?.name}`}
        visible={operationVisible}
        onClose={() => setOperationVisible(false)}
        onConfirm={handleSubmit}
        confirmBtn={{ content: '提交操作', loading: submitLoading }}
        width="560px"
        destroyOnClose
        top="10%"
      >
        {selectedStudent && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', padding: '8px 0' }}>
            {/* 当前状态 */}
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
                  当前积分：
                </span>
                <Tag
                  theme={
                    selectedStudent.score > 0
                      ? 'success'
                      : selectedStudent.score < 0
                        ? 'danger'
                        : 'default'
                  }
                  variant="light"
                  style={{ fontWeight: 'bold' }}
                >
                  {selectedStudent.score > 0 ? `+${selectedStudent.score}` : selectedStudent.score}
                </Tag>
              </div>
            </div>

            {/* 快捷理由 */}
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
                  <span style={{ fontWeight: 600, fontSize: '14px' }}>快捷选项</span>
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
                      <Space breakLine size="small">
                        {items.map((r) => (
                          <Button
                            key={r.id}
                            variant="outline"
                            size="small"
                            onClick={() => handleReasonSelect(r)}
                            style={{
                              borderColor:
                                r.delta > 0
                                  ? 'var(--td-success-color-3)'
                                  : r.delta < 0
                                    ? 'var(--td-error-color-3)'
                                    : undefined
                            }}
                          >
                            {r.content}{' '}
                            <span
                              style={{
                                marginLeft: '4px',
                                color:
                                  r.delta > 0
                                    ? 'var(--td-success-color)'
                                    : r.delta < 0
                                      ? 'var(--td-error-color)'
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

            {/* 自定义分值 */}
            <div>
              <div
                style={{ marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}
              >
                <span style={{ fontWeight: 600, fontSize: '14px' }}>调整分值</span>
                <Divider style={{ flex: 1, margin: 0 }} />
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' }}>
                {[-5, -3, -2, -1, 1, 2, 3, 5, 10].map((num) => (
                  <Button
                    key={num}
                    size="small"
                    variant={customScore === num ? 'base' : 'outline'}
                    theme={num > 0 ? 'success' : 'danger'}
                    onClick={() => setCustomScore(num)}
                    style={{ minWidth: '42px' }}
                  >
                    {num > 0 ? `+${num}` : num}
                  </Button>
                ))}
                <Button
                  size="small"
                  variant="outline"
                  onClick={() => setCustomScore(0)}
                  style={{ minWidth: '42px' }}
                >
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
                  placeholder="自定义分值"
                />
                <span style={{ fontSize: '13px', color: 'var(--ss-text-secondary)' }}>
                  可在输入框微调特输入任意分值
                </span>
              </div>
            </div>

            {/* 理由内容 */}
            <div>
              <div
                style={{ marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}
              >
                <span style={{ fontWeight: 600, fontSize: '14px' }}>操作理由</span>
                <Divider style={{ flex: 1, margin: 0 }} />
              </div>
              <Input
                value={reasonContent}
                onChange={setReasonContent}
                placeholder="输入加分/扣分的原因（可选）"
                suffixIcon={
                  reasonContent ? (
                    <DeleteIcon
                      onClick={() => setSearchKeyword('')}
                      style={{ cursor: 'pointer' }}
                    />
                  ) : undefined
                }
              />
            </div>

            {/* 变动预览 */}
            {customScore !== undefined && (
              <div
                style={{
                  padding: '16px',
                  backgroundColor:
                    customScore > 0
                      ? 'var(--td-success-color-1)'
                      : customScore < 0
                        ? 'var(--td-error-color-1)'
                        : 'var(--ss-bg-color)',
                  borderRadius: '8px',
                  border: `1px solid ${customScore > 0 ? 'var(--td-success-color-2)' : customScore < 0 ? 'var(--td-error-color-2)' : 'var(--ss-border-color)'}`,
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
                  变更预览：
                </div>
                <div style={{ fontSize: '15px' }}>
                  {selectedStudent.name}{' '}
                  <span
                    style={{
                      fontWeight: 'bold',
                      color:
                        customScore > 0
                          ? 'var(--td-success-color)'
                          : customScore < 0
                            ? 'var(--td-error-color)'
                            : 'inherit'
                    }}
                  >
                    {customScore > 0 ? `+${customScore}` : customScore}
                  </span>{' '}
                  分
                  <span style={{ color: 'var(--ss-text-secondary)', marginLeft: '8px' }}>
                    {reasonContent ? `理由：${reasonContent}` : '（无理由）'}
                  </span>
                </div>
              </div>
            )}
          </div>
        )}
      </Dialog>
    </div>
  )
}