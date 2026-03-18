import React, { useState, useEffect, useCallback, useMemo, useRef } from "react"
import { Card, Space, Button, Tag, Input, Select, Modal, message, InputNumber, Divider } from "antd"
import { SearchOutlined, DeleteOutlined } from "@ant-design/icons"
import { useTranslation } from "react-i18next"
import { match, pinyin } from "pinyin-pro"
import { getAvatarFromExtraJson } from "../utils/studentAvatar"

interface student {
  id: number
  name: string
  score: number
  extra_json?: string | null
  avatarUrl?: string | null
  pinyinName?: string
  pinyinFirst?: string
  pinyinInitials?: string
}

interface reason {
  id: number
  content: string
  delta: number
  category: string
}

type SortType = "alphabet" | "surname" | "score"
type SearchKeyboardLayout = "t9" | "qwerty26"

const T9_KEY_MAP: Record<string, string> = {
  a: "2",
  b: "2",
  c: "2",
  d: "3",
  e: "3",
  f: "3",
  g: "4",
  h: "4",
  i: "4",
  j: "5",
  k: "5",
  l: "5",
  m: "6",
  n: "6",
  o: "6",
  p: "7",
  q: "7",
  r: "7",
  s: "7",
  t: "8",
  u: "8",
  v: "8",
  w: "9",
  x: "9",
  y: "9",
  z: "9",
}

interface HomeProps {
  canEdit: boolean
  isPortraitMode?: boolean
}

export const Home: React.FC<HomeProps> = ({ canEdit, isPortraitMode = false }) => {
  const { t } = useTranslation()
  const [students, setStudents] = useState<student[]>([])
  const [reasons, setReasons] = useState<reason[]>([])
  const [loading, setLoading] = useState(false)
  const [sortType, setSortType] = useState<SortType>("alphabet")
  const [searchKeyword, setSearchKeyword] = useState("")
  const [showPinyinKeyboard, setShowPinyinKeyboard] = useState(false)
  const [searchKeyboardLayout, setSearchKeyboardLayout] = useState<SearchKeyboardLayout>("qwerty26")
  const [disableSearchKeyboard, setDisableSearchKeyboard] = useState(false)

  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const groupRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const searchAreaRef = useRef<HTMLDivElement>(null)

  const [selectedStudent, setSelectedStudent] = useState<student | null>(null)
  const [operationVisible, setOperationVisible] = useState(false)
  const [customScore, setCustomScore] = useState<number | undefined>(undefined)
  const [reasonContent, setReasonContent] = useState("")
  const [submitLoading, setSubmitLoading] = useState(false)
  const [messageApi, contextHolder] = message.useMessage()
  const [quickActionStudentId, setQuickActionStudentId] = useState<number | null>(null)
  const longPressTimerRef = useRef<number | null>(null)
  const suppressClickRef = useRef(false)

  const emitDataUpdated = (category: "events" | "students" | "reasons" | "all") => {
    window.dispatchEvent(new CustomEvent("ss:data-updated", { detail: { category } }))
  }

  const getSurname = (name: string) => {
    if (!name) return ""
    return name.charAt(0)
  }

  const getFirstLetter = (name: string) => {
    if (!name) return ""
    const firstChar = name.charAt(0)
    if (/^[a-zA-Z]$/.test(firstChar)) return firstChar.toUpperCase()
    const py = pinyin(firstChar, { pattern: "first", toneType: "none" })
    return py ? py.toUpperCase() : "#"
  }

  const fetchData = useCallback(async (silent = false) => {
    if (!(window as any).api) return
    if (!silent) setLoading(true)
    const [stuRes, reaRes] = await Promise.all([
      (window as any).api.queryStudents({}),
      (window as any).api.queryReasons(),
    ])

    if (stuRes.success) {
      const enrichedStudents = (stuRes.data as student[]).map((s) => ({
        ...s,
        avatarUrl: getAvatarFromExtraJson(s.extra_json),
        pinyinName: pinyin(s.name, { toneType: "none" }).toLowerCase(),
        pinyinInitials: pinyin(s.name, { pattern: "first", toneType: "none" }).toLowerCase(),
        pinyinFirst: getFirstLetter(s.name),
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
      if (category === "students" || category === "reasons" || category === "all") {
        fetchData(true)
      }
    }
    window.addEventListener("ss:data-updated", onDataUpdated as any)
    return () => window.removeEventListener("ss:data-updated", onDataUpdated as any)
  }, [fetchData])

  useEffect(() => {
    const api = (window as any).api
    if (!api) return

    let disposed = false
    let unlisten: (() => void) | null = null

    api
      .getSetting("search_keyboard_layout")
      .then((res: any) => {
        if (disposed) return
        const value = res?.data
        if (value === "t9" || value === "qwerty26") {
          setSearchKeyboardLayout(value)
        }
      })
      .catch(() => void 0)

    api
      .getSetting("disable_search_keyboard")
      .then((res: any) => {
        if (disposed) return
        setDisableSearchKeyboard(Boolean(res?.data))
      })
      .catch(() => void 0)

    api
      .onSettingChanged((change: any) => {
        if (change?.key === "search_keyboard_layout" && (change?.value === "t9" || change?.value === "qwerty26")) {
          setSearchKeyboardLayout(change.value)
        }
        if (change?.key === "disable_search_keyboard") {
          setDisableSearchKeyboard(Boolean(change?.value))
        }
      })
      .then((fn: () => void) => {
        if (disposed) {
          fn()
          return
        }
        unlisten = fn
      })
      .catch(() => void 0)

    return () => {
      disposed = true
      if (unlisten) unlisten()
    }
  }, [])

  useEffect(() => {
    if (disableSearchKeyboard && showPinyinKeyboard) {
      setShowPinyinKeyboard(false)
    }
  }, [disableSearchKeyboard, showPinyinKeyboard])

  useEffect(() => {
    const onDocumentClick = (e: MouseEvent) => {
      const target = e.target as Node | null
      if (searchAreaRef.current && target && !searchAreaRef.current.contains(target)) {
        setShowPinyinKeyboard(false)
      }

      const quickCard = (target as HTMLElement | null)?.closest?.('[data-student-quick-card="true"]')
      if (!quickCard) {
        setQuickActionStudentId(null)
      }
    }
    document.addEventListener("mousedown", onDocumentClick)
    return () => document.removeEventListener("mousedown", onDocumentClick)
  }, [])

  useEffect(() => {
    return () => {
      if (longPressTimerRef.current !== null) {
        window.clearTimeout(longPressTimerRef.current)
        longPressTimerRef.current = null
      }
    }
  }, [])

  const t9KeyRows = [
    [
      { digit: "2", letters: "ABC" },
      { digit: "3", letters: "DEF" },
      { digit: "4", letters: "GHI" },
    ],
    [
      { digit: "5", letters: "JKL" },
      { digit: "6", letters: "MNO" },
      { digit: "7", letters: "PQRS" },
    ],
    [
      { digit: "8", letters: "TUV" },
      { digit: "9", letters: "WXYZ" },
      { digit: "⌫", letters: "" },
    ],
  ]

  const qwertyKeyRows = [
    ["q", "w", "e", "r", "t", "y", "u", "i", "o", "p"],
    ["a", "s", "d", "f", "g", "h", "j", "k", "l"],
    ["z", "x", "c", "v", "b", "n", "m", "⌫"],
  ]

  const toT9Digits = (text: string) =>
    text
      .toLowerCase()
      .split("")
      .map((ch) => T9_KEY_MAP[ch] || "")
      .join("")

  const handleSearchKeyPress = (keyValue: string) => {
    if (keyValue === "⌫") {
      setSearchKeyword((prev) => prev.slice(0, -1))
      return
    }
    setSearchKeyword((prev) => `${prev}${keyValue}`)
  }

  const getDisplayText = (name: string) => {
    if (!name) return ""
    return name.length > 2 ? name.substring(name.length - 2) : name
  }

  const matchStudentName = useCallback((s: student, keyword: string) => {
    const q0 = keyword.trim().toLowerCase()
    if (!q0) return true

    const nameLower = String(s.name).toLowerCase()
    if (nameLower.includes(q0)) return true

    const pyLower = s.pinyinName || ""
    if (pyLower.includes(q0)) return true
    const pyInitialsLower = s.pinyinInitials || ""
    if (pyInitialsLower.includes(q0)) return true

    const q1 = q0.replace(/\s+/g, "")
    const isT9Query = /^[2-9]+$/.test(q1)
    if (isT9Query) {
      const pyDigits = toT9Digits(pyLower.replace(/[^a-z]/g, ""))
      const pyInitialsDigits = toT9Digits(pyInitialsLower.replace(/[^a-z]/g, ""))
      if (pyDigits.includes(q1)) return true
      if (pyInitialsDigits.includes(q1)) return true
    }

    if (
      q1 &&
      (nameLower.replace(/\s+/g, "").includes(q1) ||
        pyLower.replace(/\s+/g, "").includes(q1) ||
        pyInitialsLower.replace(/\s+/g, "").includes(q1))
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
      case "alphabet":
        return filtered.sort((a, b) => {
          const pyA = a.pinyinName || ""
          const pyB = b.pinyinName || ""
          return pyA.localeCompare(pyB)
        })
      case "surname":
        return filtered.sort((a, b) => {
          const surnameA = getSurname(a.name)
          const surnameB = getSurname(b.name)
          if (surnameA === surnameB) {
            return a.name.localeCompare(b.name, "zh-CN")
          }
          return surnameA.localeCompare(surnameB, "zh-CN")
        })
      case "score":
        return filtered.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, "zh-CN"))
      default:
        return filtered
    }
  }, [students, searchKeyword, sortType, matchStudentName])

  const groupedStudents = useMemo(() => {
    if (sortType === "score" || (sortType === "alphabet" && searchKeyword)) {
      return [{ key: "all", students: sortedStudents }]
    }

    const groups: Record<string, student[]> = {}
    sortedStudents.forEach((s) => {
      const key = sortType === "alphabet" ? s.pinyinFirst || "#" : getSurname(s.name)
      if (!groups[key]) groups[key] = []
      groups[key].push(s)
    })

    return Object.entries(groups)
      .sort(([a], [b]) => a.localeCompare(b, "zh-CN"))
      .map(([key, students]) => ({ key, students }))
  }, [sortedStudents, sortType, searchKeyword])

  const groupedReasons = useMemo(() => {
    const groups: Record<string, reason[]> = {}
    reasons.forEach((r) => {
      const cat = r.category || t("home.category.others")
      if (!groups[cat]) groups[cat] = []
      groups[cat].push(r)
    })
    return Object.entries(groups).sort(([a], [b]) => {
      if (a === t("home.category.others")) return 1
      if (b === t("home.category.others")) return -1
      return a.localeCompare(b, "zh-CN")
    })
  }, [reasons])

  const getAvatarColor = (name: string) => {
    const colors = [
      "#FF6B6B",
      "#4ECDC4",
      "#45B7D1",
      "#FFA07A",
      "#98D8C8",
      "#F7DC6F",
      "#BB8FCE",
      "#85C1E2",
      "#F8B739",
      "#52B788",
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
      element.scrollIntoView({ behavior: "auto", block: "start" })
    }
  }

  const openOperation = (student: student) => {
    if (!canEdit) {
      messageApi.error(t("common.readOnly"))
      return
    }
    setSelectedStudent(student)
    setCustomScore(undefined)
    setReasonContent("")
    setOperationVisible(true)
  }

  const performSubmit = async (student: student, delta: number, content: string) => {
    if (!(window as any).api) return
    if (!canEdit) {
      messageApi.error(t("common.readOnly"))
      return
    }

    setSubmitLoading(true)
    const res = await (window as any).api.createEvent({
      student_name: student.name,
      reason_content: content,
      delta: delta,
    })

    if (res.success) {
      messageApi.success(
        delta > 0
          ? t("home.scoreAdded", { name: student.name, points: Math.abs(delta) })
          : t("home.scoreDeducted", { name: student.name, points: Math.abs(delta) })
      )
      setOperationVisible(false)

      setStudents((prev) =>
        prev.map((s) => (s.id === student.id ? { ...s, score: s.score + delta } : s))
      )

      emitDataUpdated("events")
    } else {
      messageApi.error(res.message || t("home.submitFailed"))
    }
    setSubmitLoading(false)
  }

  const handleSubmit = async () => {
    if (!selectedStudent) return

    const delta = customScore
    if (delta === undefined || !Number.isFinite(delta)) {
      messageApi.warning(t("home.pleaseSelectPoints"))
      return
    }

    const content =
      reasonContent ||
      (delta > 0
        ? t("home.addPoints")
        : delta < 0
          ? t("home.deductPoints")
          : t("home.pointsChange"))
    await performSubmit(selectedStudent, delta, content)
  }

  const handleReasonSelect = (reason: reason) => {
    if (!selectedStudent) return
    performSubmit(selectedStudent, reason.delta, reason.content)
  }

  const cancelLongPress = () => {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }
  }

  const startLongPress = (student: student) => {
    cancelLongPress()
    longPressTimerRef.current = window.setTimeout(() => {
      if (!canEdit) {
        messageApi.error(t("common.readOnly"))
        return
      }
      setQuickActionStudentId(student.id)
      suppressClickRef.current = true
      longPressTimerRef.current = null
    }, 450)
  }

  const openQuickAction = (student: student) => {
    cancelLongPress()
    if (!canEdit) {
      messageApi.error(t("common.readOnly"))
      return
    }
    setQuickActionStudentId(student.id)
    suppressClickRef.current = true
  }

  const handleQuickAdjust = (student: student, delta: number) => {
    const content = delta > 0 ? t("home.addPoints") : t("home.deductPoints")
    performSubmit(student, delta, content)
    setQuickActionStudentId(null)
  }

  const renderStudentCard = (student: student, index: number) => {
    const avatarText = getDisplayText(student.name)
    const avatarColor = getAvatarColor(student.name)

    let rankBadge: string | null = null
    if (sortType === "score" && !searchKeyword) {
      if (index === 0) rankBadge = "🥇"
      else if (index === 1) rankBadge = "🥈"
      else if (index === 2) rankBadge = "🥉"
    }

    const isQuickActionMode = quickActionStudentId === student.id

    return (
      <div
        key={student.id}
        data-student-quick-card="true"
        onClick={(e) => {
          if (suppressClickRef.current) {
            suppressClickRef.current = false
            e.preventDefault()
            e.stopPropagation()
            return
          }
          openOperation(student)
        }}
        onMouseDown={(e) => {
          if (e.button !== 0) return
          startLongPress(student)
        }}
        onMouseUp={cancelLongPress}
        onMouseLeave={cancelLongPress}
        onTouchStart={() => startLongPress(student)}
        onTouchEnd={cancelLongPress}
        onTouchCancel={cancelLongPress}
        onContextMenu={(e) => {
          e.preventDefault()
          openQuickAction(student)
        }}
        style={{ cursor: "pointer", position: "relative" }}
      >
        <Card
          style={{
            backgroundColor: "var(--ss-card-bg)",
            transition: "all 0.2s cubic-bezier(0.38, 0, 0.24, 1)",
            border: isQuickActionMode
              ? "1px solid var(--ant-color-primary, #1677ff)"
              : "1px solid var(--ss-border-color)",
            overflow: "visible",
            boxShadow: isQuickActionMode ? "0 8px 18px rgba(22, 119, 255, 0.18)" : undefined,
          }}
          styles={{ body: { padding: isPortraitMode ? "10px 12px" : "12px" } }}
        >
          {rankBadge && (
            <div
              style={{
                position: "absolute",
                top: "-10px",
                left: "-10px",
                fontSize: "24px",
                zIndex: 1,
              }}
            >
              {rankBadge}
            </div>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: isPortraitMode ? "10px" : "12px" }}>
            {student.avatarUrl ? (
              <img
                src={student.avatarUrl}
                alt={student.name}
                style={{
                  width: isPortraitMode ? "40px" : "44px",
                  height: isPortraitMode ? "40px" : "44px",
                  borderRadius: "12px",
                  objectFit: "cover",
                  flexShrink: 0,
                  boxShadow: `0 4px 10px ${avatarColor}40`,
                  border: "1px solid var(--ss-border-color)",
                  backgroundColor: "var(--ss-bg-color)",
                }}
              />
            ) : (
              <div
                style={{
                  width: isPortraitMode ? "40px" : "44px",
                  height: isPortraitMode ? "40px" : "44px",
                  borderRadius: "12px",
                  backgroundColor: avatarColor,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "white",
                  fontWeight: "bold",
                  fontSize: isPortraitMode
                    ? avatarText.length > 1
                      ? "13px"
                      : "16px"
                    : avatarText.length > 1
                      ? "14px"
                      : "18px",
                  flexShrink: 0,
                  boxShadow: `0 4px 10px ${avatarColor}40`,
                }}
              >
                {avatarText}
              </div>
            )}
            <div
              style={{
                flex: 1,
                overflow: "hidden",
                position: "relative",
                minHeight: isPortraitMode ? "40px" : "44px",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  opacity: isQuickActionMode ? 1 : 0,
                  transform: isQuickActionMode ? "translateY(0)" : "translateY(6px)",
                  transition: "opacity 180ms ease, transform 220ms cubic-bezier(0.2, 0.8, 0.2, 1)",
                  pointerEvents: isQuickActionMode ? "auto" : "none",
                }}
              >
                  <Button
                    type="primary"
                    size="small"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleQuickAdjust(student, 1)
                    }}
                    style={{
                      minWidth: "54px",
                      height: "36px",
                      borderRadius: "18px",
                      fontWeight: 700,
                      paddingInline: "12px",
                    }}
                  >
                    +1
                  </Button>
                  <Button
                    danger
                    size="small"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleQuickAdjust(student, -1)
                    }}
                    style={{
                      minWidth: "54px",
                      height: "36px",
                      borderRadius: "18px",
                      fontWeight: 700,
                      paddingInline: "12px",
                    }}
                  >
                    -1
                  </Button>
              </div>
              <div
                style={{
                  opacity: isQuickActionMode ? 0 : 1,
                  transform: isQuickActionMode ? "translateY(-6px)" : "translateY(0)",
                  transition: "opacity 180ms ease, transform 220ms cubic-bezier(0.2, 0.8, 0.2, 1)",
                  pointerEvents: isQuickActionMode ? "none" : "auto",
                }}
              >
                <div
                  style={{
                    fontWeight: 600,
                    fontSize: "15px",
                    color: "var(--ss-text-main)",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {student.name}
                </div>
                <div
                  style={{ display: "flex", alignItems: "center", gap: "4px", marginTop: "2px" }}
                >
                  <Tag
                    color={student.score > 0 ? "success" : student.score < 0 ? "error" : "default"}
                    style={{ fontWeight: "bold" }}
                  >
                    {student.score > 0 ? `+${student.score}` : student.score}
                  </Tag>
                </div>
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
        style={{ marginBottom: isPortraitMode ? "20px" : "32px" }}
        ref={(el) => {
          groupRefs.current[group.key] = el
        }}
      >
        {group.key !== "all" && (
          <div
            style={{
              fontSize: "18px",
              fontWeight: "bold",
              color: "var(--ss-text-main)",
              marginBottom: "16px",
              display: "flex",
              alignItems: "center",
              gap: "8px",
              borderLeft: "4px solid var(--ant-color-primary, #1890ff)",
              paddingLeft: "12px",
            }}
          >
            <span style={{ color: "var(--ant-color-primary, #1890ff)" }}>{group.key}</span>
            <span
              style={{ fontSize: "12px", color: "var(--ss-text-secondary)", fontWeight: "normal" }}
            >
              ({t("home.studentCount", { count: group.students.length })})
            </span>
          </div>
        )}
        <div
          style={{
            display: isPortraitMode ? "flex" : "grid",
            flexDirection: isPortraitMode ? "column" : undefined,
            gridTemplateColumns: isPortraitMode ? undefined : "repeat(auto-fill, minmax(180px, 1fr))",
            gap: isPortraitMode ? "10px" : "16px",
          }}
        >
          {group.students.map((student, idx) => renderStudentCard(student, idx))}
        </div>
      </div>
    ))
  }

  const navContainerRef = useRef<HTMLDivElement>(null)
  const isNavDragging = useRef(false)
  const bodyUserSelectRef = useRef("")
  const bodyWebkitUserSelectRef = useRef("")
  const [viewportHeight, setViewportHeight] = useState(() =>
    typeof window === "undefined" ? 900 : window.innerHeight
  )
  const [navActiveKey, setNavActiveKey] = useState<string | null>(null)
  const [navIndicatorY, setNavIndicatorY] = useState(0)
  const [isNavDraggingState, setIsNavDraggingState] = useState(false)

  const quickNavLayout = useMemo(() => {
    const baseItemSize = 24
    const baseFontSize = 11
    const basePaddingY = 8
    const basePaddingX = 4
    const baseBorderRadius = 20
    const baseBubbleSize = 34
    const baseBubbleFontSize = 13
    const minScale = 0.58
    const maxHeight = Math.max(120, Math.floor(viewportHeight * 0.8))
    const count = groupedStudents.length

    if (count <= 0) {
      return {
        maxHeight,
        itemSize: baseItemSize,
        fontSize: baseFontSize,
        paddingY: basePaddingY,
        paddingX: basePaddingX,
        borderRadius: baseBorderRadius,
        bubbleSize: baseBubbleSize,
        bubbleFontSize: baseBubbleFontSize,
      }
    }

    const baseContentHeight = count * baseItemSize + basePaddingY * 2
    const rawScale = Math.min(1, maxHeight / baseContentHeight)
    const scale = Math.max(minScale, rawScale)

    return {
      maxHeight,
      itemSize: Math.max(14, baseItemSize * scale),
      fontSize: Math.max(8, baseFontSize * scale),
      paddingY: Math.max(4, basePaddingY * scale),
      paddingX: Math.max(3, basePaddingX * scale),
      borderRadius: Math.max(12, baseBorderRadius * scale),
      bubbleSize: Math.max(22, baseBubbleSize * scale),
      bubbleFontSize: Math.max(10, baseBubbleFontSize * scale),
    }
  }, [groupedStudents.length, viewportHeight])

  const setNavDraggingState = useCallback((dragging: boolean) => {
    isNavDragging.current = dragging
    setIsNavDraggingState(dragging)
    if (dragging) {
      bodyUserSelectRef.current = document.body.style.userSelect
      bodyWebkitUserSelectRef.current = document.body.style.webkitUserSelect
      document.body.style.userSelect = "none"
      document.body.style.webkitUserSelect = "none"
      return
    }

    document.body.style.userSelect = bodyUserSelectRef.current
    document.body.style.webkitUserSelect = bodyWebkitUserSelectRef.current
  }, [])

  const handleNavAction = useCallback(
    (clientY: number) => {
      if (!navContainerRef.current) return
      const rect = navContainerRef.current.getBoundingClientRect()
      const y = clientY - rect.top
      const itemCount = groupedStudents.length
      if (itemCount === 0) return

      const innerTop = quickNavLayout.paddingY
      const innerBottom = rect.height - quickNavLayout.paddingY
      const clampedY = Math.max(innerTop, Math.min(innerBottom - 0.001, y))
      const index = Math.floor((clampedY - innerTop) / quickNavLayout.itemSize)
      const safeIndex = Math.max(0, Math.min(itemCount - 1, index))

      const targetGroup = groupedStudents[safeIndex]
      if (targetGroup) {
        setNavActiveKey(targetGroup.key)
        setNavIndicatorY(quickNavLayout.paddingY + (safeIndex + 0.5) * quickNavLayout.itemSize)
        scrollToGroup(targetGroup.key)
      }
    },
    [groupedStudents, quickNavLayout.itemSize, quickNavLayout.paddingY]
  )

  const onNavMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    setNavDraggingState(true)
    handleNavAction(e.clientY)
    document.addEventListener("mousemove", onGlobalMouseMove)
    document.addEventListener("mouseup", onGlobalMouseUp)
  }

  const onGlobalMouseMove = (e: MouseEvent) => {
    if (isNavDragging.current) {
      if (e.cancelable) e.preventDefault()
      handleNavAction(e.clientY)
    }
  }

  const onGlobalMouseUp = () => {
    setNavDraggingState(false)
    document.removeEventListener("mousemove", onGlobalMouseMove)
    document.removeEventListener("mouseup", onGlobalMouseUp)
  }

  const onNavTouchStart = (e: React.TouchEvent) => {
    setNavDraggingState(true)
    if (e.touches[0]) {
      handleNavAction(e.touches[0].clientY)
    }
    if (e.cancelable) e.preventDefault()
  }

  const onNavTouchMove = (e: React.TouchEvent) => {
    if (isNavDragging.current && e.touches[0]) {
      handleNavAction(e.touches[0].clientY)
      if (e.cancelable) e.preventDefault()
    }
  }

  const onNavTouchEnd = () => {
    setNavDraggingState(false)
  }

  useEffect(() => {
    const onResize = () => setViewportHeight(window.innerHeight)
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  }, [])

  useEffect(() => {
    return () => {
      document.removeEventListener("mousemove", onGlobalMouseMove)
      document.removeEventListener("mouseup", onGlobalMouseUp)
      document.body.style.userSelect = bodyUserSelectRef.current
      document.body.style.webkitUserSelect = bodyWebkitUserSelectRef.current
    }
  }, [])

  useEffect(() => {
    if (!groupedStudents.length) {
      setNavActiveKey(null)
      return
    }

    const refreshActiveByScroll = () => {
      let currentKey = groupedStudents[0]?.key || null
      const anchorY = 140

      groupedStudents.forEach((group) => {
        const el = groupRefs.current[group.key]
        if (!el) return
        const top = el.getBoundingClientRect().top
        if (top <= anchorY) {
          currentKey = group.key
        }
      })

      if (currentKey) {
        setNavActiveKey(currentKey)
        const idx = groupedStudents.findIndex((g) => g.key === currentKey)
        if (idx >= 0 && navContainerRef.current) {
          setNavIndicatorY(quickNavLayout.paddingY + (idx + 0.5) * quickNavLayout.itemSize)
        }
      }
    }

    refreshActiveByScroll()
    window.addEventListener("scroll", refreshActiveByScroll, { passive: true })
    window.addEventListener("resize", refreshActiveByScroll)
    return () => {
      window.removeEventListener("scroll", refreshActiveByScroll)
      window.removeEventListener("resize", refreshActiveByScroll)
    }
  }, [groupedStudents, quickNavLayout.itemSize, quickNavLayout.paddingY])

  const renderQuickNav = () => {
    if (
      isPortraitMode ||
      groupedStudents.length <= 1 ||
      sortType === "score" ||
      (sortType === "alphabet" && searchKeyword)
    )
      return null

    return (
      <div
        ref={navContainerRef}
        onMouseDown={onNavMouseDown}
        onTouchStart={onNavTouchStart}
        onTouchMove={onNavTouchMove}
        onTouchEnd={onNavTouchEnd}
        onContextMenu={(e) => e.preventDefault()}
        style={{
          position: "fixed",
          right: "12px",
          top: "50%",
          transform: "translateY(-50%)",
          display: "flex",
          flexDirection: "column",
          backgroundColor: "var(--ss-card-bg)",
          padding: `${quickNavLayout.paddingY}px ${quickNavLayout.paddingX}px`,
          borderRadius: `${quickNavLayout.borderRadius}px`,
          boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
          zIndex: 100,
          maxHeight: `${quickNavLayout.maxHeight}px`,
          border: "1px solid var(--ss-border-color)",
          cursor: "pointer",
          userSelect: "none",
          touchAction: "none",
        }}
      >
        {isNavDraggingState && navActiveKey && (
          <div
            style={{
              position: "absolute",
              left: "-10px",
              top: `${navIndicatorY}px`,
              width: `${quickNavLayout.bubbleSize}px`,
              height: `${quickNavLayout.bubbleSize}px`,
              transform: "translate(-100%, -50%)",
              borderRadius: "50%",
              backgroundColor: isNavDraggingState
                ? "var(--ant-color-primary, #1890ff)"
                : "rgba(24, 144, 255, 0.16)",
              border: isNavDraggingState
                ? "1px solid transparent"
                : "1px solid rgba(24, 144, 255, 0.32)",
              boxShadow: isNavDraggingState ? "0 6px 16px rgba(0,0,0,0.2)" : "none",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              pointerEvents: "none",
              zIndex: 2,
            }}
          >
            <div
              style={{
                position: "absolute",
                right: "-8px",
                top: "50%",
                width: 0,
                height: 0,
                transform: "translateY(-50%)",
                borderTop: "6px solid transparent",
                borderBottom: "6px solid transparent",
                borderLeft: `8px solid ${
                  isNavDraggingState
                    ? "var(--ant-color-primary, #1890ff)"
                    : "rgba(24, 144, 255, 0.16)"
                }`,
              }}
            />
            <span
              style={{
                color: isNavDraggingState ? "#fff" : "var(--ant-color-primary, #1890ff)",
                fontSize: `${quickNavLayout.bubbleFontSize}px`,
                fontWeight: 700,
                lineHeight: 1,
              }}
            >
              {navActiveKey}
            </span>
          </div>
        )}
        {groupedStudents.map((group) => (
          <div
            key={group.key}
            style={{
              width: `${quickNavLayout.itemSize}px`,
              height: `${quickNavLayout.itemSize}px`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: `${quickNavLayout.fontSize}px`,
              fontWeight: "bold",
              color:
                navActiveKey === group.key
                  ? isNavDraggingState
                    ? "#ffffff"
                    : "var(--ant-color-primary, #1890ff)"
                  : "var(--ant-color-primary, #1890ff)",
              borderRadius: "50%",
              backgroundColor:
                navActiveKey === group.key
                  ? isNavDraggingState
                    ? "var(--ant-color-primary, #1890ff)"
                    : "rgba(24, 144, 255, 0.36)"
                  : "transparent",
              pointerEvents: "none",
            }}
          >
            {group.key}
          </div>
        ))}
      </div>
    )
  }

  return (
    <div
      style={{
        padding: isPortraitMode ? "16px" : "24px",
        width: "100%",
        boxSizing: "border-box",
        maxWidth: isPortraitMode ? "100%" : "1200px",
        margin: "0 auto",
        position: "relative",
        overflowX: "hidden",
      }}
    >
      {contextHolder}
      <div
        style={{
          marginBottom: "32px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "16px",
          flexWrap: "wrap",
        }}
      >
        <div>
          <h2 style={{ margin: 0, color: "var(--ss-text-main)", fontSize: "24px" }}>
            {t("home.title")}
          </h2>
          <p style={{ margin: "4px 0 0", color: "var(--ss-text-secondary)", fontSize: "13px" }}>
            {t("home.subtitle", { count: students.length })}
          </p>
        </div>

        <Space size="middle" align="start">
          <div ref={searchAreaRef} style={{ position: "relative", width: "220px" }}>
            <Input
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
              onFocus={() => {
                if (!disableSearchKeyboard) setShowPinyinKeyboard(true)
              }}
              onClick={() => {
                if (!disableSearchKeyboard) setShowPinyinKeyboard(true)
              }}
              onKeyDown={(e) => {
                if (e.key === "Escape") setShowPinyinKeyboard(false)
              }}
              placeholder={t("home.searchPlaceholder")}
              prefix={<SearchOutlined />}
              allowClear
              style={{ width: "220px" }}
            />
            {!disableSearchKeyboard && showPinyinKeyboard && (
              <div
                style={{
                  position: "absolute",
                  top: "calc(100% + 8px)",
                  left: "50%",
                  transform: "translateX(-50%)",
                  width: searchKeyboardLayout === "qwerty26" ? "288px" : "220px",
                  padding: "8px",
                  borderRadius: "10px",
                  border: "1px solid var(--ss-border-color)",
                  backgroundColor: "var(--ss-card-bg)",
                  boxShadow: "0 8px 24px rgba(0, 0, 0, 0.12)",
                  zIndex: 20,
                }}
              >
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  {searchKeyboardLayout === "qwerty26"
                    ? qwertyKeyRows.map((row, rowIndex) => (
                        <div
                          key={`qwerty-row-${rowIndex}`}
                          style={{
                            display: "grid",
                            gridTemplateColumns: `repeat(${row.length}, 1fr)`,
                            gap: "7px",
                          }}
                        >
                          {row.map((keyItem) => (
                            <Button
                              key={keyItem}
                              size="small"
                              onClick={() => handleSearchKeyPress(keyItem)}
                              style={{ height: "32px", fontSize: "12px", padding: 0 }}
                            >
                              {keyItem === "⌫" ? "⌫" : keyItem.toUpperCase()}
                            </Button>
                          ))}
                        </div>
                      ))
                    : t9KeyRows.map((row, rowIndex) => (
                        <div
                          key={`pinyin-row-${rowIndex}`}
                          style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "6px" }}
                        >
                          {row.map((keyItem) => (
                            <Button
                              key={keyItem.digit}
                              size="small"
                              onClick={() => handleSearchKeyPress(keyItem.digit)}
                              style={{ height: "28px", fontSize: "11px", padding: 0 }}
                            >
                              {keyItem.digit === "⌫" ? "⌫" : `${keyItem.digit} ${keyItem.letters}`}
                            </Button>
                          ))}
                        </div>
                      ))}
                </div>
              </div>
            )}
          </div>

          <Select
            value={sortType}
            onChange={(v) => setSortType(v as SortType)}
            style={{ width: "140px" }}
            options={[
              { value: "alphabet", label: t("home.sortBy.alphabet") },
              { value: "surname", label: t("home.sortBy.surname") },
              { value: "score", label: t("home.sortBy.score") },
            ]}
          />
        </Space>
      </div>

      {renderQuickNav()}

      <div style={{ minHeight: "400px" }} ref={scrollContainerRef}>
        {loading ? (
          <div style={{ textAlign: "center", padding: "100px 0" }}>
            <div style={{ color: "var(--ss-text-secondary)" }}>{t("common.loading")}</div>
          </div>
        ) : sortedStudents.length === 0 ? (
          <div
            style={{
              textAlign: "center",
              padding: "100px 0",
              backgroundColor: "var(--ss-card-bg)",
              borderRadius: "12px",
              border: "1px dashed var(--ss-border-color)",
            }}
          >
            <div style={{ fontSize: "16px", color: "var(--ss-text-secondary)" }}>
              {searchKeyword ? t("home.noMatch") : t("home.noStudents")}
            </div>
            {searchKeyword && (
              <Button type="link" onClick={() => setSearchKeyword("")} style={{ marginTop: "8px" }}>
                {t("home.clearSearch")}
              </Button>
            )}
          </div>
        ) : (
          renderGroupedCards()
        )}
      </div>

      <Modal
        title={t("home.operationTitle", { name: selectedStudent?.name })}
        open={operationVisible}
        onCancel={() => setOperationVisible(false)}
        onOk={handleSubmit}
        confirmLoading={submitLoading}
        okText={t("home.submitOperation")}
        cancelText={t("common.cancel")}
        width={560}
        destroyOnHidden
      >
        {selectedStudent && (
          <div style={{ display: "flex", flexDirection: "column", gap: "20px", padding: "8px 0" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "12px 16px",
                backgroundColor: "var(--ss-bg-color)",
                borderRadius: "8px",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                {selectedStudent.avatarUrl ? (
                  <img
                    src={selectedStudent.avatarUrl}
                    alt={selectedStudent.name}
                    style={{
                      width: "32px",
                      height: "32px",
                      borderRadius: "50%",
                      objectFit: "cover",
                      border: "1px solid var(--ss-border-color)",
                    }}
                  />
                ) : (
                  <div
                    style={{
                      width: "32px",
                      height: "32px",
                      borderRadius: "50%",
                      backgroundColor: getAvatarColor(selectedStudent.name),
                      color: "white",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "14px",
                      fontWeight: "bold",
                    }}
                  >
                    {getDisplayText(selectedStudent.name)}
                  </div>
                )}
                <span style={{ fontWeight: 600 }}>{selectedStudent.name}</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ color: "var(--ss-text-secondary)", fontSize: "13px" }}>
                  {t("home.currentScore")}：
                </span>
                <Tag
                  color={
                    selectedStudent.score > 0
                      ? "success"
                      : selectedStudent.score < 0
                        ? "error"
                        : "default"
                  }
                  style={{ fontWeight: "bold" }}
                >
                  {selectedStudent.score > 0 ? `+${selectedStudent.score}` : selectedStudent.score}
                </Tag>
              </div>
            </div>

            {groupedReasons.length > 0 && (
              <div>
                <div
                  style={{
                    marginBottom: "12px",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                  }}
                >
                  <span
                    style={{
                      fontWeight: 600,
                      fontSize: "14px",
                      whiteSpace: "nowrap",
                      wordBreak: "keep-all",
                      flexShrink: 0,
                    }}
                  >
                    {t("home.quickOptions")}
                  </span>
                  <Divider style={{ flex: 1, margin: 0 }} />
                </div>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "12px",
                    maxHeight: "240px",
                    overflowY: "auto",
                    paddingRight: "4px",
                  }}
                >
                  {groupedReasons.map(([category, items]) => (
                    <div key={category}>
                      <div
                        style={{
                          fontSize: "12px",
                          color: "var(--ss-text-secondary)",
                          marginBottom: "6px",
                          paddingLeft: "2px",
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
                              whiteSpace: "nowrap",
                              wordBreak: "keep-all",
                              borderColor:
                                r.delta > 0
                                  ? "var(--ant-color-success, #52c41a)"
                                  : r.delta < 0
                                    ? "var(--ant-color-error, #ff4d4f)"
                                    : undefined,
                            }}
                          >
                            {r.content}{" "}
                            <span
                              style={{
                                marginLeft: "4px",
                                color:
                                  r.delta > 0
                                    ? "var(--ant-color-success, #52c41a)"
                                    : r.delta < 0
                                      ? "var(--ant-color-error, #ff4d4f)"
                                      : "inherit",
                                fontWeight: "bold",
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
                style={{ marginBottom: "12px", display: "flex", alignItems: "center", gap: "8px" }}
              >
                <span
                  style={{
                    fontWeight: 600,
                    fontSize: "14px",
                    whiteSpace: "nowrap",
                    wordBreak: "keep-all",
                    flexShrink: 0,
                  }}
                >
                  {t("home.adjustPoints")}
                </span>
                <Divider style={{ flex: 1, margin: 0 }} />
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginBottom: "12px" }}>
                {[-5, -3, -2, -1, 1, 2, 3, 5, 10].map((num) => (
                  <Button
                    key={num}
                    size="small"
                    type={customScore === num ? "primary" : "default"}
                    danger={num < 0}
                    onClick={() => setCustomScore(num)}
                    style={{ minWidth: "42px" }}
                  >
                    {num > 0 ? `+${num}` : num}
                  </Button>
                ))}
                <Button size="small" onClick={() => setCustomScore(0)} style={{ minWidth: "42px" }}>
                  0
                </Button>
              </div>
              <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
                <InputNumber
                  value={customScore}
                  onChange={(v) => setCustomScore(v as number)}
                  min={-99}
                  max={99}
                  step={1}
                  style={{ width: "140px" }}
                  placeholder={t("home.customPoints")}
                />
                <span style={{ fontSize: "13px", color: "var(--ss-text-secondary)" }}>
                  {t("home.customPointsHint")}
                </span>
              </div>
            </div>

            <div>
              <div
                style={{ marginBottom: "12px", display: "flex", alignItems: "center", gap: "8px" }}
              >
                <span
                  style={{
                    fontWeight: 600,
                    fontSize: "14px",
                    whiteSpace: "nowrap",
                    wordBreak: "keep-all",
                    flexShrink: 0,
                  }}
                >
                  {t("home.reason")}
                </span>
                <Divider style={{ flex: 1, margin: 0 }} />
              </div>
              <Input
                value={reasonContent}
                onChange={(e) => setReasonContent(e.target.value)}
                placeholder={t("home.reasonPlaceholder")}
                suffix={
                  reasonContent ? (
                    <DeleteOutlined
                      onClick={() => setReasonContent("")}
                      style={{ cursor: "pointer" }}
                    />
                  ) : undefined
                }
              />
            </div>

            {customScore !== undefined && (
              <div
                style={{
                  padding: "16px",
                  background:
                    customScore > 0
                      ? "var(--ant-color-success-bg, #f6ffed)"
                      : customScore < 0
                        ? "var(--ant-color-error-bg, #fff2f0)"
                        : "var(--ss-bg-color)",
                  borderRadius: "8px",
                  border: `1px solid ${customScore > 0 ? "var(--ant-color-success-border, #b7eb8f)" : customScore < 0 ? "var(--ant-color-error-border, #ffccc7)" : "var(--ss-border-color)"}`,
                  marginTop: "4px",
                }}
              >
                <div
                  style={{
                    fontSize: "13px",
                    fontWeight: 600,
                    marginBottom: "4px",
                    color: "var(--ss-text-main)",
                  }}
                >
                  {t("home.preview")}：
                </div>
                <div style={{ fontSize: "15px" }}>
                  {selectedStudent.name}{" "}
                  <span
                    style={{
                      fontWeight: "bold",
                      color:
                        customScore > 0
                          ? "var(--ant-color-success, #52c41a)"
                          : customScore < 0
                            ? "var(--ant-color-error, #ff4d4f)"
                            : "inherit",
                    }}
                  >
                    {customScore > 0 ? `+${customScore}` : customScore}
                  </span>{" "}
                  {t("home.points")}
                  <span style={{ color: "var(--ss-text-secondary)", marginLeft: "8px" }}>
                    {reasonContent
                      ? `${t("home.reasonLabel")}${reasonContent}`
                      : t("home.noReason")}
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
