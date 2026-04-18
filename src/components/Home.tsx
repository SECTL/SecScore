import React, { useState, useEffect, useLayoutEffect, useCallback, useMemo, useRef } from "react"
import {
  Card,
  Space,
  Button,
  Tag,
  Input,
  Select,
  Modal,
  Drawer,
  message,
  InputNumber,
  Divider,
} from "antd"
import { SearchOutlined, DeleteOutlined, UndoOutlined } from "@ant-design/icons"
import { useTranslation } from "react-i18next"
import { match, pinyin } from "pinyin-pro"
import { getAvatarFromExtraJson } from "../utils/studentAvatar"
import { useResponsive } from "../hooks/useResponsive"

interface student {
  id: number
  name: string
  group_name?: string | null
  score: number
  reward_points: number
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

interface scoreEvent {
  id: number
  uuid: string
  student_name: string
  reason_content: string
  delta: number
  val_prev: number
  val_curr: number
  event_time: string
}

interface rewardSetting {
  id: number
  name: string
  cost_points: number
}

type SortType = "alphabet" | "surname" | "group" | "score"
type LayoutType = "grouped" | "squareGrid" | "largeAvatar"
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
  immersiveMode?: boolean
}

export const Home: React.FC<HomeProps> = ({
  canEdit,
  isPortraitMode = false,
  immersiveMode = false,
}) => {
  const { t } = useTranslation()
  const breakpoint = useResponsive()
  const isMobile = breakpoint === "xs" || breakpoint === "sm"
  const isTablet = breakpoint === "md"
  const [students, setStudents] = useState<student[]>([])
  const [reasons, setReasons] = useState<reason[]>([])
  const [rewards, setRewards] = useState<rewardSetting[]>([])
  const [loading, setLoading] = useState(false)
  const [sortType, setSortType] = useState<SortType>("alphabet")
  const [layoutType, setLayoutType] = useState<LayoutType>("grouped")
  const [searchKeyword, setSearchKeyword] = useState("")
  const [showPinyinKeyboard, setShowPinyinKeyboard] = useState(false)
  const [searchKeyboardLayout, setSearchKeyboardLayout] = useState<SearchKeyboardLayout>("qwerty26")
  const [disableSearchKeyboard, setDisableSearchKeyboard] = useState(false)
  const canShowSearchKeyboard = !isMobile && !disableSearchKeyboard

  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const groupRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const searchAreaRef = useRef<HTMLDivElement>(null)
  const immersiveToolbarRef = useRef<HTMLDivElement>(null)
  const immersiveToolbarContentRef = useRef<HTMLDivElement>(null)
  const [immersiveToolbarWidth, setImmersiveToolbarWidth] = useState<number | null>(null)
  const immersiveToolbarHorizontalPadding = 20

  const [selectedStudent, setSelectedStudent] = useState<student | null>(null)
  const [batchMode, setBatchMode] = useState(false)
  const [selectedStudentIds, setSelectedStudentIds] = useState<number[]>([])
  const [operationVisible, setOperationVisible] = useState(false)
  const [operationOriginRect, setOperationOriginRect] = useState<DOMRect | null>(null)
  const [customScore, setCustomScore] = useState<number | undefined>(undefined)
  const [reasonContent, setReasonContent] = useState("")
  const [submitLoading, setSubmitLoading] = useState(false)
  const [undoLoading, setUndoLoading] = useState(false)
  const [latestEvent, setLatestEvent] = useState<scoreEvent | null>(null)
  const [messageApi, contextHolder] = message.useMessage()
  const [quickActionStudentId, setQuickActionStudentId] = useState<number | null>(null)
  const [rewardMode, setRewardMode] = useState(false)
  const [rewardStudent, setRewardStudent] = useState<student | null>(null)
  const [rewardModalVisible, setRewardModalVisible] = useState(false)
  const [redeemLoading, setRedeemLoading] = useState(false)
  const longPressTimerRef = useRef<number | null>(null)
  const suppressClickRef = useRef(false)
  const fetchRequestIdRef = useRef(0)
  const operationMorphAnimationRef = useRef<Animation | null>(null)
  const operationMaskAnimationRef = useRef<Animation | null>(null)
  const operationMorphRafRef = useRef<number | null>(null)
  const operationClosingRef = useRef(false)
  const operationCloseTokenRef = useRef(0)
  const operationModalRootClass = "ss-home-operation-morph-root"
  const operationModalClass = "ss-home-operation-morph-modal"

  const emitDataUpdated = (category: "events" | "students" | "reasons" | "all") => {
    window.dispatchEvent(new CustomEvent("ss:data-updated", { detail: { category } }))
  }

  const logHome = (message: string, meta?: Record<string, unknown>) => {
    try {
      if (meta) {
        console.error(`[Home][Diag] ${message}`, meta)
      } else {
        console.error(`[Home][Diag] ${message}`)
      }
    } catch {
      void 0
    }
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

  const getGroupName = useCallback(
    (groupName?: string | null) => groupName?.trim() || t("home.ungrouped"),
    [t]
  )

  const fetchData = useCallback(async (silent = false) => {
    if (!(window as any).api) return
    const requestId = ++fetchRequestIdRef.current
    logHome("fetchData:start", { requestId, silent })
    if (!silent) setLoading(true)
    const [stuRes, reaRes, rewRes] = await Promise.all([
      (window as any).api.queryStudents({}),
      (window as any).api.queryReasons(),
      (window as any).api.rewardSettingQuery(),
    ])
    if (requestId !== fetchRequestIdRef.current) return

    logHome("fetchData:response", {
      requestId,
      silent,
      studentsSuccess: Boolean(stuRes?.success),
      studentsCount: Array.isArray(stuRes?.data) ? stuRes.data.length : 0,
      reasonsSuccess: Boolean(reaRes?.success),
      reasonsCount: Array.isArray(reaRes?.data) ? reaRes.data.length : 0,
    })

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
    if (rewRes.success) setRewards(rewRes.data)
    if (!silent) setLoading(false)
  }, [])

  const fetchLatestEvent = useCallback(async () => {
    if (!(window as any).api) return
    const res = await (window as any).api.queryEvents({ limit: 1 })
    if (res.success) {
      const latest =
        Array.isArray(res.data) && res.data.length > 0 ? (res.data[0] as scoreEvent) : null
      setLatestEvent(latest)
      logHome("fetchLatestEvent:response", {
        hasLatest: Boolean(latest),
        latestStudent: latest?.student_name,
        latestDelta: latest?.delta,
        latestUuid: latest?.uuid,
      })
    }
  }, [])

  useEffect(() => {
    fetchData()
    fetchLatestEvent()
    const onDataUpdated = (e: any) => {
      const category = e?.detail?.category
      logHome("event:ss:data-updated", { detail: e?.detail })
      if (
        category === "events" ||
        category === "students" ||
        category === "reasons" ||
        category === "all"
      ) {
        fetchData(true)
        fetchLatestEvent()
      }
    }
    window.addEventListener("ss:data-updated", onDataUpdated as any)
    return () => window.removeEventListener("ss:data-updated", onDataUpdated as any)
  }, [fetchData, fetchLatestEvent])

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
        if (
          change?.key === "search_keyboard_layout" &&
          (change?.value === "t9" || change?.value === "qwerty26")
        ) {
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
    if (!canShowSearchKeyboard && showPinyinKeyboard) {
      setShowPinyinKeyboard(false)
    }
  }, [canShowSearchKeyboard, showPinyinKeyboard])

  useEffect(() => {
    const onDocumentClick = (e: MouseEvent) => {
      const target = e.target as Node | null
      if (searchAreaRef.current && target && !searchAreaRef.current.contains(target)) {
        setShowPinyinKeyboard(false)
      }

      const quickCard = (target as HTMLElement | null)?.closest?.(
        '[data-student-quick-card="true"]'
      )
      if (!quickCard) {
        setQuickActionStudentId(null)
      }
    }
    document.addEventListener("mousedown", onDocumentClick)
    return () => document.removeEventListener("mousedown", onDocumentClick)
  }, [])

  useEffect(() => {
    if (!immersiveMode) {
      setImmersiveToolbarWidth(null)
      return
    }
    const contentEl = immersiveToolbarContentRef.current
    if (!contentEl) return

    let frameId: number | null = null
    const updateToolbarWidth = () => {
      if (frameId !== null) cancelAnimationFrame(frameId)
      frameId = requestAnimationFrame(() => {
        const contentWidth = Math.ceil(contentEl.scrollWidth)
        const nextWidth = contentWidth + immersiveToolbarHorizontalPadding
        setImmersiveToolbarWidth((prev) => (prev === nextWidth ? prev : nextWidth))
      })
    }

    updateToolbarWidth()
    const observer = new ResizeObserver(updateToolbarWidth)
    observer.observe(contentEl)
    window.addEventListener("resize", updateToolbarWidth)

    return () => {
      observer.disconnect()
      window.removeEventListener("resize", updateToolbarWidth)
      if (frameId !== null) cancelAnimationFrame(frameId)
    }
  }, [immersiveMode, immersiveToolbarHorizontalPadding])

  useEffect(() => {
    return () => {
      if (longPressTimerRef.current !== null) {
        window.clearTimeout(longPressTimerRef.current)
        longPressTimerRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    setSelectedStudentIds((prev) => {
      if (prev.length === 0) return prev
      const validIds = new Set(students.map((s) => s.id))
      return prev.filter((id) => validIds.has(id))
    })
  }, [students])

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

  const getImmersivePopupContainer = useCallback((triggerNode: HTMLElement) => {
    return immersiveToolbarRef.current ?? triggerNode.parentElement ?? document.body
  }, [])

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

  const getDisplayPoints = useCallback(
    (s: student) => (rewardMode ? Number(s.reward_points || 0) : Number(s.score || 0)),
    [rewardMode]
  )

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
        return filtered.sort(
          (a, b) =>
            getDisplayPoints(b) - getDisplayPoints(a) || a.name.localeCompare(b.name, "zh-CN")
        )
      case "group":
        return filtered.sort((a, b) => {
          const groupA = getGroupName(a.group_name)
          const groupB = getGroupName(b.group_name)
          if (groupA === groupB) {
            return (a.pinyinName || "").localeCompare(b.pinyinName || "")
          }
          if (groupA === t("home.ungrouped")) return 1
          if (groupB === t("home.ungrouped")) return -1
          return groupA.localeCompare(groupB, "zh-CN")
        })
      default:
        return filtered
    }
  }, [students, searchKeyword, sortType, matchStudentName, getDisplayPoints, getGroupName, t])

  const groupedStudents = useMemo(() => {
    if (sortType === "score" || (sortType === "alphabet" && searchKeyword)) {
      return [{ key: "all", students: sortedStudents }]
    }

    const groups: Record<string, student[]> = {}
    sortedStudents.forEach((s) => {
      const key =
        sortType === "alphabet"
          ? s.pinyinFirst || "#"
          : sortType === "surname"
            ? getSurname(s.name)
            : getGroupName(s.group_name)
      if (!groups[key]) groups[key] = []
      groups[key].push(s)
    })

    return Object.entries(groups)
      .sort(([a], [b]) => {
        const ungrouped = t("home.ungrouped")
        if (a === ungrouped) return 1
        if (b === ungrouped) return -1
        return a.localeCompare(b, "zh-CN")
      })
      .map(([key, students]) => ({ key, students }))
  }, [sortedStudents, sortType, searchKeyword, layoutType, getGroupName, t])

  const firstStudentIdByGroup = useMemo(() => {
    const result = new Map<string, number>()
    groupedStudents.forEach((group) => {
      if (group.key === "all") return
      const first = group.students[0]
      if (first) result.set(group.key, first.id)
    })
    return result
  }, [groupedStudents])

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

  const selectedStudents = useMemo(() => {
    if (selectedStudentIds.length === 0) return []
    const idSet = new Set(selectedStudentIds)
    return students.filter((s) => idSet.has(s.id))
  }, [students, selectedStudentIds])

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

  const openOperation = (student: student, sourceEl?: HTMLElement | null) => {
    if (!canEdit) {
      messageApi.error(t("common.readOnly"))
      return
    }
    if (rewardMode) {
      setRewardStudent(student)
      setRewardModalVisible(true)
      return
    }
    if (batchMode) {
      setSelectedStudentIds((prev) =>
        prev.includes(student.id) ? prev.filter((id) => id !== student.id) : [...prev, student.id]
      )
      return
    }

    const cardEl = sourceEl?.querySelector(".ant-card") as HTMLElement | null
    const sourceRect = (cardEl ?? sourceEl)?.getBoundingClientRect() ?? null
    logHome("operation:morph:open", {
      student: student.name,
      hasSourceEl: Boolean(sourceEl),
      hasCardEl: Boolean(cardEl),
      sourceRect: sourceRect
        ? {
            left: sourceRect.left,
            top: sourceRect.top,
            width: sourceRect.width,
            height: sourceRect.height,
          }
        : null,
    })
    setOperationOriginRect(sourceRect)
    operationClosingRef.current = false
    operationCloseTokenRef.current += 1
    operationMorphAnimationRef.current?.cancel()
    operationMaskAnimationRef.current?.cancel()

    setSelectedStudent(student)
    setCustomScore(undefined)
    setReasonContent("")
    setOperationVisible(true)
  }

  const playOperationMorph = useCallback((attempt = 0) => {
    if (isPortraitMode || !operationOriginRect) return false
    const modalEl = document.querySelector(`.${operationModalClass}`) as HTMLElement | null
    if (!modalEl) {
      const byClassCount = document.querySelectorAll(`.${operationModalClass}`).length
      const byRootCount = document.querySelectorAll(`.${operationModalRootClass}`).length
      const modalCount = document.querySelectorAll(".ant-modal").length
      const rootExists = Boolean(document.querySelector(`.${operationModalRootClass}`))
      logHome("operation:morph:modal-miss", {
        attempt,
        rootExists,
        byClassCount,
        byRootCount,
        modalCount,
      })
      return false
    }

    // Clear any leftover transform from previous close animation before measuring.
    operationMorphAnimationRef.current?.cancel()
    for (const animation of modalEl.getAnimations()) {
      animation.cancel()
    }
    modalEl.style.transform = ""
    modalEl.style.opacity = ""
    modalEl.style.visibility = ""
    const maskEl = document.querySelector(`.${operationModalRootClass} .ant-modal-mask`) as
      | HTMLElement
      | null
    if (maskEl) {
      operationMaskAnimationRef.current?.cancel()
      maskEl.style.opacity = ""
      maskEl.style.visibility = ""
      operationMaskAnimationRef.current = maskEl.animate([{ opacity: 0 }, { opacity: 1 }], {
        duration: 220,
        easing: "cubic-bezier(0.2, 0, 0, 1)",
        fill: "both",
      })
    }
    const modalRect = modalEl.getBoundingClientRect()
    if (modalRect.width <= 0 || modalRect.height <= 0) {
      logHome("operation:morph:modal-rect-invalid", {
        attempt,
        width: modalRect.width,
        height: modalRect.height,
      })
      return false
    }
    const fromX = operationOriginRect.left - modalRect.left
    const fromY = operationOriginRect.top - modalRect.top
    const scaleX = operationOriginRect.width / modalRect.width
    const scaleY = operationOriginRect.height / modalRect.height

    logHome("operation:morph:computed", {
      modalRect: {
        left: modalRect.left,
        top: modalRect.top,
        width: modalRect.width,
        height: modalRect.height,
      },
      fromX,
      fromY,
      scaleX,
      scaleY,
      expectedStartRect: {
        left: modalRect.left + fromX,
        top: modalRect.top + fromY,
        width: modalRect.width * scaleX,
        height: modalRect.height * scaleY,
      },
      animateSupported: typeof modalEl.animate === "function",
    })

    modalEl.style.transformOrigin = "top left"
    modalEl.style.willChange = "transform, opacity"
    operationMorphAnimationRef.current = modalEl.animate(
      [
        {
          transform: `translate3d(${fromX}px, ${fromY}px, 0) scale(${scaleX}, ${scaleY})`,
          opacity: 0.86,
        },
        {
          transform: "translate3d(0, 0, 0) scale(1, 1)",
          opacity: 1,
        },
      ],
      {
        duration: 480,
        easing: "cubic-bezier(0.16, 1, 0.3, 1)",
        fill: "both",
      }
    )
    logHome("operation:morph:animation-start", {
      attempt,
      currentTime: operationMorphAnimationRef.current.currentTime,
      playState: operationMorphAnimationRef.current.playState,
    })
    operationMorphAnimationRef.current.onfinish = () => {
      logHome("operation:morph:animation-finish")
    }
    operationMorphAnimationRef.current.oncancel = () => {
      logHome("operation:morph:animation-cancel")
    }
    return true
  }, [isPortraitMode, operationOriginRect, operationModalClass, operationModalRootClass])

  useLayoutEffect(() => {
    if (isPortraitMode || !operationVisible) return

    logHome("operation:morph:layout-open", {
      hasOriginRect: Boolean(operationOriginRect),
    })
    let attempt = 0
    const maxAttempts = 120

    const run = () => {
      operationMorphRafRef.current = null
      const done = playOperationMorph(attempt)
      if (done) return
      if (attempt >= maxAttempts) {
        logHome("operation:morph:retry-exhausted", { attempts: attempt + 1 })
        return
      }
      attempt += 1
      operationMorphRafRef.current = window.requestAnimationFrame(run)
    }
    operationMorphRafRef.current = window.requestAnimationFrame(run)

    return () => {
      if (operationMorphRafRef.current !== null) {
        window.cancelAnimationFrame(operationMorphRafRef.current)
        operationMorphRafRef.current = null
      }
    }
  }, [isPortraitMode, operationVisible, operationOriginRect, playOperationMorph])

  const finishCloseOperationModal = useCallback((skipCancelMorph = false, skipCancelMask = false) => {
    if (!skipCancelMorph) {
      operationMorphAnimationRef.current?.cancel()
    }
    operationMorphAnimationRef.current = null
    if (!skipCancelMask) {
      operationMaskAnimationRef.current?.cancel()
    }
    operationMaskAnimationRef.current = null
    if (operationMorphRafRef.current !== null) {
      window.cancelAnimationFrame(operationMorphRafRef.current)
      operationMorphRafRef.current = null
    }
    operationClosingRef.current = false
    setOperationVisible(false)
    setOperationOriginRect(null)
  }, [])

  const closeOperationModal = useCallback(() => {
    logHome("operation:morph:close", {
      hasAnimation: Boolean(operationMorphAnimationRef.current),
      playState: operationMorphAnimationRef.current?.playState,
      currentTime: operationMorphAnimationRef.current?.currentTime,
    })
    if (operationMorphRafRef.current !== null) {
      window.cancelAnimationFrame(operationMorphRafRef.current)
      operationMorphRafRef.current = null
    }
    if (
      !isPortraitMode &&
      operationVisible &&
      operationOriginRect &&
      !operationClosingRef.current
    ) {
      const modalEl = document.querySelector(`.${operationModalClass}`) as HTMLElement | null
      if (modalEl) {
        const modalRect = modalEl.getBoundingClientRect()
        if (modalRect.width > 0 && modalRect.height > 0) {
          const toX = operationOriginRect.left - modalRect.left
          const toY = operationOriginRect.top - modalRect.top
          const toScaleX = operationOriginRect.width / modalRect.width
          const toScaleY = operationOriginRect.height / modalRect.height
          const closeToken = ++operationCloseTokenRef.current
          operationClosingRef.current = true
          operationMorphAnimationRef.current?.cancel()
          operationMaskAnimationRef.current?.cancel()
          modalEl.style.transformOrigin = "top left"
          modalEl.style.willChange = "transform, opacity"
          const maskEl = document.querySelector(
            `.${operationModalRootClass} .ant-modal-mask`
          ) as HTMLElement | null
          if (maskEl) {
            operationMaskAnimationRef.current = maskEl.animate([{ opacity: 1 }, { opacity: 0 }], {
              duration: 320,
              easing: "cubic-bezier(0.4, 0, 1, 1)",
              fill: "both",
            })
          }
          operationMorphAnimationRef.current = modalEl.animate(
            [
              { transform: "translate3d(0, 0, 0) scale(1, 1)", opacity: 1 },
              {
                transform: `translate3d(${toX}px, ${toY}px, 0) scale(${toScaleX}, ${toScaleY})`,
                opacity: 0,
              },
            ],
            {
              duration: 320,
              easing: "cubic-bezier(0.4, 0, 1, 1)",
              fill: "both",
            }
          )
          operationMorphAnimationRef.current.onfinish = () => {
            if (operationCloseTokenRef.current !== closeToken || !operationClosingRef.current) {
              logHome("operation:morph:close-animation-finish:stale", { closeToken })
              return
            }
            logHome("operation:morph:close-animation-finish")
            modalEl.style.opacity = "0"
            modalEl.style.visibility = "hidden"
            if (maskEl) {
              maskEl.style.opacity = "0"
              maskEl.style.visibility = "hidden"
            }
            finishCloseOperationModal(true, true)
          }
          operationMorphAnimationRef.current.oncancel = () => {
            if (operationCloseTokenRef.current !== closeToken || !operationClosingRef.current) {
              logHome("operation:morph:close-animation-cancel:stale", { closeToken })
              return
            }
            logHome("operation:morph:close-animation-cancel")
            finishCloseOperationModal()
          }
          return
        }
      }
    }
    finishCloseOperationModal()
  }, [
    finishCloseOperationModal,
    isPortraitMode,
    operationModalClass,
    operationOriginRect,
    operationVisible,
  ])

  const handleToggleRewardMode = () => {
    if (!canEdit) {
      messageApi.error(t("common.readOnly"))
      return
    }
    if (!rewardMode && rewards.length === 0) {
      messageApi.warning(t("rewardExchange.noAffordableRewards"))
      return
    }
    setRewardMode((prev) => !prev)
    setBatchMode(false)
    setSelectedStudentIds([])
    closeOperationModal()
    setQuickActionStudentId(null)
    setRewardStudent(null)
    setRewardModalVisible(false)
  }

  const affordableRewards = useMemo(() => {
    if (!rewardStudent) return []
    return rewards
      .filter((r) => r.cost_points <= Number(rewardStudent.reward_points || 0))
      .sort((a, b) => a.cost_points - b.cost_points || a.name.localeCompare(b.name, "zh-CN"))
  }, [rewards, rewardStudent])

  const handleRedeemReward = async (reward: rewardSetting) => {
    if (!(window as any).api || !rewardStudent) return
    if (!canEdit) {
      messageApi.error(t("common.readOnly"))
      return
    }
    setRedeemLoading(true)
    const res = await (window as any).api.rewardRedeem({
      student_name: rewardStudent.name,
      reward_id: reward.id,
    })
    setRedeemLoading(false)
    if (res.success) {
      messageApi.success(
        t("rewardExchange.redeemSuccess", {
          student: rewardStudent.name,
          reward: reward.name,
          points: reward.cost_points,
        })
      )
      setRewardModalVisible(false)
      setRewardStudent(null)
      setRewardMode(false)
      fetchData(true)
      fetchLatestEvent()
      emitDataUpdated("students")
      return
    }
    messageApi.error(res.message || t("rewardExchange.redeemFailed"))
  }

  const performSubmit = async (targetStudents: student[], delta: number, content: string) => {
    if (!(window as any).api) return
    if (!canEdit) {
      messageApi.error(t("common.readOnly"))
      return
    }
    if (targetStudents.length === 0) {
      messageApi.warning(t("home.selectStudentFirst"))
      return
    }

    setSubmitLoading(true)
    logHome("performSubmit:start", { studentCount: targetStudents.length, delta, content })
    let successCount = 0

    for (const student of targetStudents) {
      const res = await (window as any).api.createEvent({
        student_name: student.name,
        reason_content: content,
        delta: delta,
      })

      logHome("performSubmit:createEvent:response", {
        student: student.name,
        delta,
        success: Boolean(res?.success),
        message: (res as any)?.message,
      })
      if (res.success) successCount += 1
    }

    if (successCount > 0) {
      if (targetStudents.length === 1) {
        const student = targetStudents[0]
        messageApi.success(
          delta > 0
            ? t("home.scoreAdded", { name: student.name, points: Math.abs(delta) })
            : t("home.scoreDeducted", { name: student.name, points: Math.abs(delta) })
        )
      } else if (successCount === targetStudents.length) {
        messageApi.success(t("home.batchSuccess", { count: successCount }))
      } else {
        messageApi.warning(
          t("home.batchPartial", { success: successCount, total: targetStudents.length })
        )
      }

      setSelectedStudentIds([])
      setBatchMode(false)
      setSelectedStudent(null)
      closeOperationModal()
      setCustomScore(undefined)
      setReasonContent("")
      setQuickActionStudentId(null)
      fetchData(true)
      fetchLatestEvent()
      emitDataUpdated("events")
      logHome("performSubmit:afterSuccessRefreshDispatched", {
        studentCount: targetStudents.length,
        delta,
      })
    } else {
      messageApi.warning(
        t("home.batchPartial", { success: successCount, total: targetStudents.length })
      )
    }
    setSubmitLoading(false)
  }

  const handleUndoLastEvent = async () => {
    if (!(window as any).api) return
    if (!canEdit) {
      messageApi.error(t("common.readOnly"))
      return
    }
    if (!latestEvent) {
      messageApi.warning(t("home.undoUnavailable"))
      return
    }

    setUndoLoading(true)
    const res = await (window as any).api.deleteEvent(latestEvent.uuid)
    if (res.success) {
      messageApi.success(t("home.undoLastSuccess"))
      fetchData(true)
      fetchLatestEvent()
      emitDataUpdated("events")
    } else {
      messageApi.error((res as any).message || t("score.undoFailed"))
    }
    setUndoLoading(false)
  }

  const handleSubmit = async () => {
    const targets = batchMode ? selectedStudents : selectedStudent ? [selectedStudent] : []
    if (targets.length === 0) {
      messageApi.warning(t("home.selectStudentFirst"))
      return
    }

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
    await performSubmit(targets, delta, content)
  }

  const handleReasonSelect = (reason: reason) => {
    const targets = batchMode ? selectedStudents : selectedStudent ? [selectedStudent] : []
    if (targets.length === 0) {
      messageApi.warning(t("home.selectStudentFirst"))
      return
    }
    performSubmit(targets, reason.delta, reason.content)
  }

  const cancelLongPress = () => {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }
  }

  const startLongPress = (student: student) => {
    if (rewardMode) return
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
    if (rewardMode) return
    cancelLongPress()
    if (!canEdit) {
      messageApi.error(t("common.readOnly"))
      return
    }
    setQuickActionStudentId(student.id)
    suppressClickRef.current = true
  }

  const handleQuickAdjust = (student: student, delta: number) => {
    if (rewardMode) return
    const content = delta > 0 ? t("home.addPoints") : t("home.deductPoints")
    performSubmit([student], delta, content)
    setQuickActionStudentId(null)
  }

  const handleSelectAllStudents = () => {
    setSelectedStudentIds(students.map((s) => s.id))
  }

  const handleClearSelectedStudents = () => {
    setSelectedStudentIds([])
  }

  const handleEnterBatchMode = () => {
    if (!canEdit) {
      messageApi.error(t("common.readOnly"))
      return
    }
    setBatchMode(true)
    setSelectedStudent(null)
    closeOperationModal()
    setQuickActionStudentId(null)
  }

  const handleExitBatchMode = () => {
    setBatchMode(false)
    setSelectedStudentIds([])
  }

  const handleOpenBatchOperation = () => {
    if (!canEdit) {
      messageApi.error(t("common.readOnly"))
      return
    }
    if (selectedStudents.length === 0) {
      messageApi.warning(t("home.selectStudentFirst"))
      return
    }
    setSelectedStudent(null)
    setCustomScore(undefined)
    setReasonContent("")
    setOperationVisible(true)
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
    const isSelected = selectedStudentIds.includes(student.id)

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
          openOperation(student, e.currentTarget as HTMLElement)
        }}
        onMouseDown={(e) => {
          if (batchMode) return
          if (e.button !== 0) return
          startLongPress(student)
        }}
        onMouseUp={cancelLongPress}
        onMouseLeave={cancelLongPress}
        onTouchStart={() => {
          if (batchMode) return
          startLongPress(student)
        }}
        onTouchEnd={cancelLongPress}
        onTouchCancel={cancelLongPress}
        onContextMenu={(e) => {
          if (batchMode) return
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
              : isSelected
                ? "1px solid var(--ant-color-primary, #1677ff)"
                : "1px solid var(--ss-border-color)",
            overflow: "visible",
            boxShadow:
              isQuickActionMode || isSelected ? "0 8px 18px rgba(22, 119, 255, 0.18)" : undefined,
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
          <div
            style={{ display: "flex", alignItems: "center", gap: isPortraitMode ? "10px" : "12px" }}
          >
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
                  {isSelected && (
                    <Tag color="processing" style={{ marginInlineEnd: 0 }}>
                      {t("home.selected")}
                    </Tag>
                  )}
                  <Tag
                    color={
                      getDisplayPoints(student) > 0
                        ? "success"
                        : getDisplayPoints(student) < 0
                          ? "error"
                          : "default"
                    }
                    style={{ fontWeight: "bold" }}
                  >
                    {getDisplayPoints(student) > 0
                      ? `+${getDisplayPoints(student)}`
                      : getDisplayPoints(student)}
                  </Tag>
                </div>
              </div>
            </div>
          </div>
        </Card>
      </div>
    )
  }

  const renderStudentRowCompact = (student: student, isLast: boolean) => {
    const avatarText = getDisplayText(student.name)
    const avatarColor = getAvatarColor(student.name)
    const isQuickActionMode = quickActionStudentId === student.id
    const isSelected = selectedStudentIds.includes(student.id)

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
          openOperation(student, e.currentTarget as HTMLElement)
        }}
        onMouseDown={(e) => {
          if (batchMode) return
          if (e.button !== 0) return
          startLongPress(student)
        }}
        onMouseUp={cancelLongPress}
        onMouseLeave={cancelLongPress}
        onTouchStart={() => {
          if (batchMode) return
          startLongPress(student)
        }}
        onTouchEnd={cancelLongPress}
        onTouchCancel={cancelLongPress}
        onContextMenu={(e) => {
          if (batchMode) return
          e.preventDefault()
          openQuickAction(student)
        }}
        style={{
          cursor: "pointer",
          position: "relative",
          padding: "8px 10px",
          borderBottom: isLast ? "none" : "1px solid var(--ss-border-color)",
          background: isQuickActionMode || isSelected ? "rgba(22, 119, 255, 0.06)" : "transparent",
          transition: "background-color 160ms ease",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px", minHeight: "32px" }}>
          {student.avatarUrl ? (
            <img
              src={student.avatarUrl}
              alt={student.name}
              style={{
                width: "32px",
                height: "32px",
                borderRadius: "9px",
                objectFit: "cover",
                flexShrink: 0,
                border: "1px solid var(--ss-border-color)",
                backgroundColor: "var(--ss-bg-color)",
              }}
            />
          ) : (
            <div
              style={{
                width: "32px",
                height: "32px",
                borderRadius: "9px",
                backgroundColor: avatarColor,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "white",
                fontWeight: "bold",
                fontSize: avatarText.length > 1 ? "12px" : "14px",
                flexShrink: 0,
              }}
            >
              {avatarText}
            </div>
          )}

          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontWeight: 600,
                fontSize: "14px",
                color: "var(--ss-text-main)",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                lineHeight: 1.25,
              }}
            >
              {student.name}
            </div>
          </div>

          {isQuickActionMode ? (
            <Space size={6}>
              <Button
                type="primary"
                size="small"
                onClick={(e) => {
                  e.stopPropagation()
                  handleQuickAdjust(student, 1)
                }}
                style={{
                  minWidth: "44px",
                  height: "26px",
                  borderRadius: "13px",
                  paddingInline: "8px",
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
                  minWidth: "44px",
                  height: "26px",
                  borderRadius: "13px",
                  paddingInline: "8px",
                }}
              >
                -1
              </Button>
            </Space>
          ) : (
            <Space size={4}>
              {isSelected && (
                <Tag color="processing" style={{ marginInlineEnd: 0 }}>
                  {t("home.selected")}
                </Tag>
              )}
              <Tag
                color={
                  getDisplayPoints(student) > 0
                    ? "success"
                    : getDisplayPoints(student) < 0
                      ? "error"
                      : "default"
                }
                style={{ fontWeight: "bold", marginInlineEnd: 0 }}
              >
                {getDisplayPoints(student) > 0
                  ? `+${getDisplayPoints(student)}`
                  : getDisplayPoints(student)}
              </Tag>
            </Space>
          )}
        </div>
      </div>
    )
  }

  const renderStudentSquareCard = (student: student, index: number) => {
    const avatarText = getDisplayText(student.name)
    const avatarColor = getAvatarColor(student.name)
    const isQuickActionMode = quickActionStudentId === student.id
    const isSelected = selectedStudentIds.includes(student.id)

    let rankBadge: string | null = null
    if (sortType === "score" && !searchKeyword) {
      if (index === 0) rankBadge = "🥇"
      else if (index === 1) rankBadge = "🥈"
      else if (index === 2) rankBadge = "🥉"
    }

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
          openOperation(student, e.currentTarget as HTMLElement)
        }}
        onMouseDown={(e) => {
          if (batchMode) return
          if (e.button !== 0) return
          startLongPress(student)
        }}
        onMouseUp={cancelLongPress}
        onMouseLeave={cancelLongPress}
        onTouchStart={() => {
          if (batchMode) return
          startLongPress(student)
        }}
        onTouchEnd={cancelLongPress}
        onTouchCancel={cancelLongPress}
        onContextMenu={(e) => {
          if (batchMode) return
          e.preventDefault()
          openQuickAction(student)
        }}
        style={{
          cursor: "pointer",
          position: "relative",
          aspectRatio: "1 / 1",
        }}
        ref={(el) => {
          groupedStudents.forEach((group) => {
            if (group.key === "all") return
            if (firstStudentIdByGroup.get(group.key) === student.id) {
              groupRefs.current[group.key] = el
            }
          })
        }}
      >
        <Card
          style={{
            width: "100%",
            height: "100%",
            backgroundColor: "var(--ss-card-bg)",
            transition: "all 0.2s cubic-bezier(0.38, 0, 0.24, 1)",
            border: isQuickActionMode
              ? "1px solid var(--ant-color-primary, #1677ff)"
              : isSelected
                ? "1px solid var(--ant-color-primary, #1677ff)"
                : "1px solid var(--ss-border-color)",
            overflow: "visible",
            boxShadow:
              isQuickActionMode || isSelected ? "0 8px 18px rgba(22, 119, 255, 0.18)" : undefined,
          }}
          styles={{ body: { height: "100%", padding: "8px" } }}
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
          <div
            style={{
              height: "100%",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
              textAlign: "center",
            }}
          >
            {student.avatarUrl ? (
              <img
                src={student.avatarUrl}
                alt={student.name}
                style={{
                  width: "42px",
                  height: "42px",
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
                  width: "42px",
                  height: "42px",
                  borderRadius: "12px",
                  backgroundColor: avatarColor,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "white",
                  fontWeight: "bold",
                  fontSize: avatarText.length > 1 ? "14px" : "18px",
                  flexShrink: 0,
                  boxShadow: `0 4px 10px ${avatarColor}40`,
                }}
              >
                {avatarText}
              </div>
            )}
            {isQuickActionMode ? (
              <Space size={6}>
                <Button
                  type="primary"
                  size="small"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleQuickAdjust(student, 1)
                  }}
                  style={{
                    minWidth: "44px",
                    height: "28px",
                    borderRadius: "14px",
                    paddingInline: "8px",
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
                    minWidth: "44px",
                    height: "28px",
                    borderRadius: "14px",
                    paddingInline: "8px",
                  }}
                >
                  -1
                </Button>
              </Space>
            ) : (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "6px",
                  width: "100%",
                  minWidth: 0,
                }}
              >
                <div
                  style={{
                    fontWeight: 600,
                    fontSize: "13px",
                    color: "var(--ss-text-main)",
                    maxWidth: "100%",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {student.name}
                </div>
                <Tag
                  color={
                    getDisplayPoints(student) > 0
                      ? "success"
                      : getDisplayPoints(student) < 0
                        ? "error"
                        : "default"
                  }
                  style={{ fontWeight: "bold", marginInlineEnd: 0 }}
                >
                  {getDisplayPoints(student) > 0
                    ? `+${getDisplayPoints(student)}`
                    : getDisplayPoints(student)}
                </Tag>
                {isSelected && (
                  <Tag color="processing" style={{ marginInlineEnd: 0 }}>
                    {t("home.selected")}
                  </Tag>
                )}
              </div>
            )}
          </div>
        </Card>
      </div>
    )
  }

  const renderStudentLargeAvatarCard = (student: student, index: number) => {
    const avatarText = getDisplayText(student.name)
    const avatarColor = getAvatarColor(student.name)
    const isQuickActionMode = quickActionStudentId === student.id
    const isSelected = selectedStudentIds.includes(student.id)
    const displayPoints = getDisplayPoints(student)
    const scoreColor = displayPoints > 0 ? "#52c41a" : displayPoints < 0 ? "#ff4d4f" : "#595959"

    let rankBadge: string | null = null
    if (sortType === "score" && !searchKeyword) {
      if (index === 0) rankBadge = "🥇"
      else if (index === 1) rankBadge = "🥈"
      else if (index === 2) rankBadge = "🥉"
    }

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
          openOperation(student, e.currentTarget as HTMLElement)
        }}
        onMouseDown={(e) => {
          if (batchMode) return
          if (e.button !== 0) return
          startLongPress(student)
        }}
        onMouseUp={cancelLongPress}
        onMouseLeave={cancelLongPress}
        onTouchStart={() => {
          if (batchMode) return
          startLongPress(student)
        }}
        onTouchEnd={cancelLongPress}
        onTouchCancel={cancelLongPress}
        onContextMenu={(e) => {
          if (batchMode) return
          e.preventDefault()
          openQuickAction(student)
        }}
        style={{
          cursor: "pointer",
          position: "relative",
          aspectRatio: "1.2 / 1",
        }}
        ref={(el) => {
          groupedStudents.forEach((group) => {
            if (group.key === "all") return
            if (firstStudentIdByGroup.get(group.key) === student.id) {
              groupRefs.current[group.key] = el
            }
          })
        }}
      >
        <Card
          style={{
            width: "100%",
            height: "100%",
            backgroundColor: "var(--ss-card-bg)",
            transition: "all 0.2s cubic-bezier(0.38, 0, 0.24, 1)",
            border: isQuickActionMode
              ? "1px solid var(--ant-color-primary, #1677ff)"
              : isSelected
                ? "1px solid var(--ant-color-primary, #1677ff)"
                : "1px solid var(--ss-border-color)",
            overflow: "hidden",
            borderRadius: "18px",
            boxShadow:
              isQuickActionMode || isSelected ? "0 8px 18px rgba(22, 119, 255, 0.18)" : undefined,
          }}
          styles={{ body: { height: "100%", padding: 0 } }}
        >
          <div style={{ position: "relative", width: "100%", height: "100%" }}>
            {student.avatarUrl ? (
              <img
                src={student.avatarUrl}
                alt={student.name}
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            ) : (
              <div
                style={{
                  width: "100%",
                  height: "100%",
                  background: `linear-gradient(140deg, ${avatarColor} 0%, ${avatarColor}aa 100%)`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "rgba(255,255,255,0.95)",
                  fontWeight: 700,
                  fontSize: avatarText.length > 1 ? "46px" : "56px",
                  letterSpacing: "0.02em",
                }}
              >
                {avatarText}
              </div>
            )}

            <div
              style={{
                position: "absolute",
                inset: 0,
                background:
                  "linear-gradient(180deg, rgba(255,255,255,0) 56%, rgba(255,255,255,0.72) 84%, rgba(255,255,255,0.95) 100%)",
                pointerEvents: "none",
              }}
            />

            {rankBadge && (
              <div
                style={{
                  position: "absolute",
                  top: 8,
                  right: 10,
                  fontSize: "24px",
                  lineHeight: 1,
                  zIndex: 2,
                }}
              >
                {rankBadge}
              </div>
            )}

            {isSelected && (
              <Tag
                color="processing"
                style={{
                  position: "absolute",
                  top: 8,
                  left: 8,
                  marginInlineEnd: 0,
                  zIndex: 2,
                  backdropFilter: "blur(4px)",
                }}
              >
                {t("home.selected")}
              </Tag>
            )}

            {isQuickActionMode ? (
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "10px",
                  zIndex: 3,
                  background: "rgba(0, 0, 0, 0.18)",
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
                    minWidth: "52px",
                    height: "32px",
                    borderRadius: "16px",
                    fontWeight: 700,
                    paddingInline: "10px",
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
                    minWidth: "52px",
                    height: "32px",
                    borderRadius: "16px",
                    fontWeight: 700,
                    paddingInline: "10px",
                  }}
                >
                  -1
                </Button>
              </div>
            ) : (
              <div
                style={{
                  position: "absolute",
                  left: 8,
                  right: 8,
                  bottom: 8,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "8px",
                  zIndex: 2,
                }}
              >
                <div
                  style={{
                    maxWidth: "65%",
                    fontWeight: 700,
                    fontSize: "22px",
                    lineHeight: 1,
                    color: "#111",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    background: "rgba(255,255,255,0.62)",
                    border: "1px solid rgba(255,255,255,0.82)",
                    borderRadius: "8px",
                    padding: "3px 9px",
                    backdropFilter: "blur(4px)",
                  }}
                >
                  {student.name}
                </div>
                <div
                  style={{
                    fontWeight: 800,
                    fontSize: "28px",
                    lineHeight: 1,
                    color: scoreColor,
                    background: "rgba(255,255,255,0.62)",
                    border: "1px solid rgba(255,255,255,0.82)",
                    borderRadius: "8px",
                    padding: "2px 9px",
                    backdropFilter: "blur(4px)",
                  }}
                >
                  {displayPoints > 0 ? `+${displayPoints}` : displayPoints}
                </div>
              </div>
            )}
          </div>
        </Card>
      </div>
    )
  }

  const renderGroupedCards = () => {
    if (layoutType === "squareGrid") {
      return (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(102px, 1fr))",
            gap: isPortraitMode ? "8px" : "10px",
          }}
        >
          {sortedStudents.map((student, idx) => renderStudentSquareCard(student, idx))}
        </div>
      )
    }

    if (layoutType === "largeAvatar") {
      return (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
            gap: isPortraitMode ? "10px" : "14px",
          }}
        >
          {sortedStudents.map((student, idx) => renderStudentLargeAvatarCard(student, idx))}
        </div>
      )
    }

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
        {isPortraitMode ? (
          <div
            style={{
              backgroundColor: "var(--ss-card-bg)",
              border: "1px solid var(--ss-border-color)",
              borderRadius: "10px",
              overflow: "hidden",
            }}
          >
            {group.students.map((student, idx) =>
              renderStudentRowCompact(student, idx === group.students.length - 1)
            )}
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
              gap: "16px",
            }}
          >
            {group.students.map((student, idx) => renderStudentCard(student, idx))}
          </div>
        )}
      </div>
    ))
  }

  const navContainerRef = useRef<HTMLDivElement>(null)
  const isNavDragging = useRef(false)
  const navHapticIndexRef = useRef<number | null>(null)
  const bodyUserSelectRef = useRef("")
  const bodyWebkitUserSelectRef = useRef("")
  const [viewportHeight, setViewportHeight] = useState(() =>
    typeof window === "undefined" ? 900 : window.innerHeight
  )
  const [navActiveKey, setNavActiveKey] = useState<string | null>(null)
  const [navIndicatorY, setNavIndicatorY] = useState(0)
  const [isNavDraggingState, setIsNavDraggingState] = useState(false)

  const triggerNavHaptic = useCallback(() => {
    if (!isMobile) return
    if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return
    navigator.vibrate(8)
  }, [isMobile])

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
      if (safeIndex !== navHapticIndexRef.current) {
        navHapticIndexRef.current = safeIndex
        triggerNavHaptic()
      }

      const targetGroup = groupedStudents[safeIndex]
      if (targetGroup) {
        setNavActiveKey(targetGroup.key)
        setNavIndicatorY(quickNavLayout.paddingY + (safeIndex + 0.5) * quickNavLayout.itemSize)
        scrollToGroup(targetGroup.key)
      }
    },
    [groupedStudents, quickNavLayout.itemSize, quickNavLayout.paddingY, triggerNavHaptic]
  )

  const onNavMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    navHapticIndexRef.current = null
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
    navHapticIndexRef.current = null
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
    navHapticIndexRef.current = null
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

  const shouldShowQuickNav =
    groupedStudents.length > 1 &&
    sortType !== "score" &&
    !(sortType === "alphabet" && searchKeyword)

  const portraitListRightPadding =
    isPortraitMode && shouldShowQuickNav
      ? quickNavLayout.itemSize + quickNavLayout.paddingX * 2 + 2
      : 0

  const renderQuickNav = () => {
    if (!shouldShowQuickNav) return null

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

  const operationTargets = batchMode ? selectedStudents : selectedStudent ? [selectedStudent] : []
  const isBatchOperation = operationTargets.length > 1 || (batchMode && operationTargets.length > 0)

  const operationPanelContent = operationTargets.length > 0 && (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "20px",
        padding: "8px 0",
        overflowX: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "8px",
          padding: "12px 16px",
          backgroundColor: "var(--ss-bg-color)",
          borderRadius: "8px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "12px", minWidth: 0, flex: 1 }}>
          {!isBatchOperation && selectedStudent?.avatarUrl ? (
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
          ) : !isBatchOperation ? (
            <div
              style={{
                width: "32px",
                height: "32px",
                borderRadius: "50%",
                backgroundColor: getAvatarColor(selectedStudent?.name || ""),
                color: "white",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "14px",
                fontWeight: "bold",
              }}
            >
              {getDisplayText(selectedStudent?.name || "")}
            </div>
          ) : (
            <Tag color="processing">{t("home.batchMode")}</Tag>
          )}
          <span
            style={{
              fontWeight: 600,
              minWidth: 0,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {!isBatchOperation
              ? selectedStudent?.name
              : t("home.selectedCount", { count: operationTargets.length })}
          </span>
        </div>
        {!isBatchOperation && selectedStudent && (
          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
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
        )}
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
        <div style={{ marginBottom: "12px", display: "flex", alignItems: "center", gap: "8px" }}>
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
        <div style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
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
        <div style={{ marginBottom: "12px", display: "flex", alignItems: "center", gap: "8px" }}>
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
              <DeleteOutlined onClick={() => setReasonContent("")} style={{ cursor: "pointer" }} />
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
            {isBatchOperation
              ? t("home.selectedCount", { count: operationTargets.length })
              : selectedStudent?.name}{" "}
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
              {reasonContent ? `${t("home.reasonLabel")}${reasonContent}` : t("home.noReason")}
            </span>
          </div>
        </div>
      )}
    </div>
  )

  const applyDrawerDragRegion = useCallback((open: boolean) => {
    if (!open || typeof document === "undefined") return
    requestAnimationFrame(() => {
      const drawerRoot = document.querySelector(".ss-operation-drawer")
      if (!drawerRoot) return

      const dragTargets = drawerRoot.querySelectorAll(".ant-drawer-header, .ant-drawer-title")
      dragTargets.forEach((el) => el.setAttribute("data-tauri-drag-region", "true"))

      const noDragTargets = drawerRoot.querySelectorAll(".ant-drawer-close, button, input")
      noDragTargets.forEach((el) => el.removeAttribute("data-tauri-drag-region"))
    })
  }, [])

  const batchToolbar = rewardMode ? null : !batchMode ? (
    <Button onClick={handleEnterBatchMode} disabled={!canEdit} style={{ borderRadius: "999px" }}>
      {t("home.multiSelect")}
    </Button>
  ) : (
    <Space size={8} wrap>
      <Button
        onClick={handleSelectAllStudents}
        disabled={!canEdit || students.length === 0}
        style={{ borderRadius: "999px" }}
      >
        {t("home.selectAll")}
      </Button>
      <Button
        onClick={handleClearSelectedStudents}
        disabled={!canEdit || selectedStudentIds.length === 0}
        style={{ borderRadius: "999px" }}
      >
        {t("home.clearSelected")}
      </Button>
      <Button
        type="primary"
        onClick={handleOpenBatchOperation}
        disabled={!canEdit || selectedStudentIds.length === 0}
        style={{ borderRadius: "999px" }}
      >
        {t("home.batchOperate")}
      </Button>
      <Button onClick={handleExitBatchMode} style={{ borderRadius: "999px" }}>
        {t("common.cancel")}
      </Button>
    </Space>
  )

  return (
    <div
      style={{
        padding: isPortraitMode ? "16px" : "24px",
        paddingBottom: immersiveMode ? (isPortraitMode ? "108px" : "124px") : undefined,
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
          marginBottom: immersiveMode ? "8px" : "32px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "16px",
          flexWrap: "wrap",
        }}
      >
        {!immersiveMode && (
          <>
            <div>
              <h2 style={{ margin: 0, color: "var(--ss-text-main)", fontSize: "24px" }}>
                {rewardMode ? t("rewardExchange.title") : t("home.title")}
              </h2>
              <p style={{ margin: "4px 0 0", color: "var(--ss-text-secondary)", fontSize: "13px" }}>
                {t("home.subtitle", { count: students.length })}
              </p>
            </div>

            <Space
              size="middle"
              align="start"
              wrap
              style={{
                width: isPortraitMode ? "100%" : undefined,
                justifyContent: isPortraitMode ? "flex-start" : undefined,
              }}
            >
              <div
                ref={searchAreaRef}
                style={{
                  position: "relative",
                  width: isMobile ? "100%" : isTablet ? "180px" : "220px",
                  minWidth: isMobile ? "100%" : isTablet ? "150px" : "180px",
                  flexShrink: isMobile ? 0 : 1,
                }}
              >
                <Input
                  value={searchKeyword}
                  onChange={(e) => setSearchKeyword(e.target.value)}
                  onFocus={() => {
                    if (canShowSearchKeyboard) setShowPinyinKeyboard(true)
                  }}
                  onClick={() => {
                    if (canShowSearchKeyboard) setShowPinyinKeyboard(true)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") setShowPinyinKeyboard(false)
                  }}
                  placeholder={t("home.searchPlaceholder")}
                  prefix={<SearchOutlined />}
                  allowClear
                  style={{ width: "100%" }}
                />
                {canShowSearchKeyboard && showPinyinKeyboard && (
                  <div
                    style={{
                      position: "absolute",
                      top: "calc(100% + 8px)",
                      left: isPortraitMode ? "0" : "50%",
                      transform: isPortraitMode ? "none" : "translateX(-50%)",
                      width: isPortraitMode
                        ? `min(calc(100vw - 32px), ${searchKeyboardLayout === "qwerty26" ? "288px" : "220px"})`
                        : searchKeyboardLayout === "qwerty26"
                          ? "288px"
                          : "220px",
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
                              style={{
                                display: "grid",
                                gridTemplateColumns: "repeat(3, 1fr)",
                                gap: "6px",
                              }}
                            >
                              {row.map((keyItem) => (
                                <Button
                                  key={keyItem.digit}
                                  size="small"
                                  onClick={() => handleSearchKeyPress(keyItem.digit)}
                                  style={{ height: "28px", fontSize: "11px", padding: 0 }}
                                >
                                  {keyItem.digit === "⌫"
                                    ? "⌫"
                                    : `${keyItem.digit} ${keyItem.letters}`}
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
                style={{
                  width: isMobile ? "calc(50% - 8px)" : isTablet ? "130px" : "140px",
                  minWidth: isMobile ? "100px" : "120px",
                  flexShrink: isMobile ? 1 : 0,
                }}
                options={[
                  { value: "alphabet", label: t("home.sortBy.alphabet") },
                  { value: "surname", label: t("home.sortBy.surname") },
                  { value: "group", label: t("home.sortBy.group") },
                  { value: "score", label: t("home.sortBy.score") },
                ]}
              />
              <Select
                value={layoutType}
                onChange={(v) => setLayoutType(v as LayoutType)}
                style={{
                  width: isMobile ? "calc(50% - 8px)" : isTablet ? "130px" : "140px",
                  minWidth: isMobile ? "100px" : "120px",
                  flexShrink: isMobile ? 1 : 0,
                }}
                options={[
                  { value: "grouped", label: t("home.layoutBy.grouped") },
                  { value: "squareGrid", label: t("home.layoutBy.squareGrid") },
                  { value: "largeAvatar", label: t("home.layoutBy.largeAvatar") },
                ]}
              />
              <Button
                icon={<UndoOutlined />}
                onClick={handleUndoLastEvent}
                loading={undoLoading}
                disabled={!canEdit || !latestEvent || rewardMode}
                title={
                  latestEvent
                    ? t("home.undoLastHint", {
                        name: latestEvent.student_name,
                        delta: latestEvent.delta > 0 ? `+${latestEvent.delta}` : latestEvent.delta,
                      })
                    : t("home.undoUnavailable")
                }
                style={{
                  flexShrink: isMobile ? 1 : 0,
                }}
              >
                {t("home.undoLastAction")}
              </Button>
              <Button
                type={rewardMode ? "default" : "primary"}
                onClick={handleToggleRewardMode}
                disabled={!canEdit}
                style={{
                  flexShrink: isMobile ? 1 : 0,
                }}
              >
                {rewardMode ? t("rewardExchange.exitMode") : t("rewardExchange.enterMode")}
              </Button>
              {batchToolbar}
            </Space>
          </>
        )}
      </div>

      {renderQuickNav()}

      <div
        style={{
          minHeight: "400px",
          paddingRight: portraitListRightPadding ? `${portraitListRightPadding}px` : undefined,
        }}
        ref={scrollContainerRef}
      >
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
        title={t("rewardExchange.chooseRewardTitle", { name: rewardStudent?.name || "" })}
        open={rewardModalVisible}
        onCancel={() => {
          setRewardModalVisible(false)
          setRewardStudent(null)
        }}
        footer={null}
        destroyOnHidden
      >
        {!rewardStudent ? null : (
          <>
            <div style={{ marginBottom: "12px", color: "var(--ss-text-secondary)", fontSize: 13 }}>
              {t("rewardExchange.currentRewardPoints", { points: rewardStudent.reward_points })}
            </div>
            {affordableRewards.length === 0 ? (
              <div style={{ color: "var(--ss-text-secondary)" }}>
                {t("rewardExchange.noAffordableRewards")}
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {affordableRewards.map((reward) => (
                  <div
                    key={reward.id}
                    style={{
                      border: "1px solid var(--ss-border-color)",
                      borderRadius: 8,
                      padding: "10px 12px",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 600 }}>{reward.name}</div>
                      <div style={{ fontSize: 12, color: "var(--ss-text-secondary)" }}>
                        {t("rewardExchange.costLabel", { points: reward.cost_points })}
                      </div>
                    </div>
                    <Button
                      type="primary"
                      loading={redeemLoading}
                      onClick={() => handleRedeemReward(reward)}
                    >
                      {t("rewardExchange.redeemNow")}
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </Modal>

      <div
        ref={immersiveToolbarRef}
        data-immersive-toolbar="true"
        className={`ss-immersive-toolbar ${immersiveMode ? "is-visible" : "is-hidden"}`}
        aria-hidden={!immersiveMode}
        style={{
          position: "fixed",
          left: "50%",
          bottom: isPortraitMode ? "12px" : "16px",
          zIndex: 1100,
          width: immersiveToolbarWidth ? `${immersiveToolbarWidth}px` : "max-content",
          maxWidth: "calc(100vw - 20px)",
          borderRadius: "999px",
          border: "1px solid color-mix(in srgb, var(--ss-border-color) 80%, transparent)",
          backgroundColor: "var(--ss-card-bg)",
          background: "color-mix(in srgb, var(--ss-card-bg) 62%, transparent)",
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
          boxShadow: "0 8px 30px rgba(0, 0, 0, 0.16)",
          padding: "10px",
          overflow: "visible",
        }}
      >
        <div
          ref={(node) => {
            searchAreaRef.current = node
            immersiveToolbarContentRef.current = node
          }}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
            overflowX: "visible",
            justifyContent: "flex-start",
          }}
        >
          <Input
            value={searchKeyword}
            onChange={(e) => setSearchKeyword(e.target.value)}
            onFocus={() => {
              if (canShowSearchKeyboard) setShowPinyinKeyboard(true)
            }}
            onClick={() => {
              if (canShowSearchKeyboard) setShowPinyinKeyboard(true)
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") setShowPinyinKeyboard(false)
            }}
            placeholder={t("home.searchPlaceholder")}
            prefix={<SearchOutlined />}
            allowClear
            style={{
              width: isPortraitMode ? "170px" : "220px",
              borderRadius: "999px",
              flexShrink: 0,
            }}
          />
          <Select
            value={sortType}
            onChange={(v) => setSortType(v as SortType)}
            getPopupContainer={getImmersivePopupContainer}
            style={{ width: 126, flexShrink: 0 }}
            options={[
              { value: "alphabet", label: t("home.sortBy.alphabet") },
              { value: "surname", label: t("home.sortBy.surname") },
              { value: "group", label: t("home.sortBy.group") },
              { value: "score", label: t("home.sortBy.score") },
            ]}
          />
          <Select
            value={layoutType}
            onChange={(v) => setLayoutType(v as LayoutType)}
            getPopupContainer={getImmersivePopupContainer}
            style={{ width: 126, flexShrink: 0 }}
            options={[
              { value: "grouped", label: t("home.layoutBy.grouped") },
              { value: "squareGrid", label: t("home.layoutBy.squareGrid") },
              { value: "largeAvatar", label: t("home.layoutBy.largeAvatar") },
            ]}
          />
          <Button
            icon={<UndoOutlined />}
            onClick={handleUndoLastEvent}
            loading={undoLoading}
            disabled={!canEdit || !latestEvent || rewardMode}
            title={
              latestEvent
                ? t("home.undoLastHint", {
                    name: latestEvent.student_name,
                    delta: latestEvent.delta > 0 ? `+${latestEvent.delta}` : latestEvent.delta,
                  })
                : t("home.undoUnavailable")
            }
            style={{ borderRadius: "999px", flexShrink: 0 }}
          >
            {t("home.undoLastAction")}
          </Button>
          <Button
            type={rewardMode ? "default" : "primary"}
            onClick={handleToggleRewardMode}
            disabled={!canEdit}
            style={{ borderRadius: "999px", flexShrink: 0 }}
          >
            {rewardMode ? t("rewardExchange.exitMode") : t("rewardExchange.enterMode")}
          </Button>
          <div style={{ flexShrink: 0 }}>{batchToolbar}</div>
          {canShowSearchKeyboard && showPinyinKeyboard && (
            <div
              style={{
                position: "absolute",
                bottom: "calc(100% + 8px)",
                left: isPortraitMode ? "8px" : "12px",
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
                        key={`qwerty-immersive-row-${rowIndex}`}
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
                        key={`pinyin-immersive-row-${rowIndex}`}
                        style={{
                          display: "grid",
                          gridTemplateColumns: "repeat(3, 1fr)",
                          gap: "6px",
                        }}
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
      </div>

      {isPortraitMode ? (
        <Drawer
          title={
            <div data-tauri-drag-region>
              {isBatchOperation
                ? t("home.operationTitleBatch", { count: operationTargets.length })
                : t("home.operationTitle", { name: selectedStudent?.name })}
            </div>
          }
          className="ss-operation-drawer"
          placement="bottom"
          height="100%"
          open={operationVisible}
          onClose={closeOperationModal}
          afterOpenChange={applyDrawerDragRegion}
          destroyOnClose
          styles={{
            body: { padding: "12px 16px 24px", overflowX: "hidden" },
          }}
          footer={
            <Space style={{ width: "100%", justifyContent: "flex-end" }}>
              <Button onClick={closeOperationModal}>{t("common.cancel")}</Button>
              <Button type="primary" onClick={handleSubmit} loading={submitLoading}>
                {t("home.submitOperation")}
              </Button>
            </Space>
          }
        >
          {operationPanelContent}
        </Drawer>
      ) : (
        <Modal
          title={
            isBatchOperation
              ? t("home.operationTitleBatch", { count: operationTargets.length })
              : t("home.operationTitle", { name: selectedStudent?.name })
          }
          open={operationVisible}
          onCancel={closeOperationModal}
          onOk={handleSubmit}
          confirmLoading={submitLoading}
          okText={t("home.submitOperation")}
          cancelText={t("common.cancel")}
          width={560}
          centered
          forceRender
          transitionName=""
          maskTransitionName=""
          rootClassName={operationModalRootClass}
          className={operationModalClass}
          styles={{
            body: {
              maxHeight: "calc(100vh - 220px)",
              overflowY: "auto",
            },
          }}
          destroyOnHidden
        >
          {operationPanelContent}
        </Modal>
      )}
    </div>
  )
}
