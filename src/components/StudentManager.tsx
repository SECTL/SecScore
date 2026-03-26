import React, { useEffect, useMemo, useRef, useState, useCallback } from "react"
import {
  Table,
  Button,
  Space,
  message,
  Modal,
  Form,
  Input,
  Tag,
  Pagination,
  Dropdown,
  Checkbox,
  Select,
} from "antd"
import type { ColumnsType } from "antd/es/table"
import { UploadOutlined, MoreOutlined, PlusOutlined } from "@ant-design/icons"
import { useTranslation } from "react-i18next"
import { TagEditorDialog } from "./TagEditorDialog"
import { getAvatarFromExtraJson, setAvatarInExtraJson } from "../utils/studentAvatar"
import { useResponsive, useIsMobile, useIsTablet } from "../hooks/useResponsive"

const createXlsxWorker = () => {
  return new Worker(new URL("../workers/xlsxWorker.ts", import.meta.url), {
    type: "module",
  })
}

interface student {
  id: number
  name: string
  group_name?: string | null
  score: number
  tags?: string[]
  tagIds?: number[]
  extra_json?: string | null
  avatarUrl?: string | null
}

interface BanYouClassroom {
  classId: string
  classNickName: string
  invitationCode?: string | null
  masterName?: string | null
  studentsNum?: number | null
  praiseCount?: number | null
  classAvatarPath?: string | null
  classAvatarDataUrl?: string | null
  isOwn?: boolean | null
}

interface BanYouMedal {
  key?: string
  uid?: string
  name: string
  type?: number
  medalType?: number
  value?: number
}

interface BanYouStudentItem {
  studentId: string
  studentName: string
}

interface BanYouTeamItem {
  teamId: string
  teamName: string
  students: BanYouStudentItem[]
}

interface BanYouTeamPlanOption {
  teamPlanId: number
  name?: string
}

interface BanYouClassroomDetail {
  medals: BanYouMedal[]
  students: BanYouStudentItem[]
  teams: BanYouTeamItem[]
  ungroupedStudents: BanYouStudentItem[]
  teamPlanIdUsed?: number
  teamPlans?: BanYouTeamPlanOption[]
  teamPlanSource?: string
}

export const StudentManager: React.FC<{ canEdit: boolean }> = ({ canEdit }) => {
  const UNGROUPED_KEY = "__ungrouped__"
  const { t } = useTranslation()
  const [data, setData] = useState<student[]>([])
  const [loading, setLoading] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState<number>(50)
  const [visible, setVisible] = useState(false)
  const [textImportVisible, setTextImportVisible] = useState(false)
  const [xlsxVisible, setXlsxVisible] = useState(false)
  const [banYouVisible, setBanYouVisible] = useState(false)
  const [tagEditVisible, setTagEditVisible] = useState(false)
  const [editingStudent, setEditingStudent] = useState<student | null>(null)
  const [groupEditVisible, setGroupEditVisible] = useState(false)
  const [groupEditStudent, setGroupEditStudent] = useState<student | null>(null)
  const [groupSaving, setGroupSaving] = useState(false)
  const [groupBoardVisible, setGroupBoardVisible] = useState(false)
  const [groupBoardSaving, setGroupBoardSaving] = useState(false)
  const [groupBoard, setGroupBoard] = useState<Record<string, student[]>>({})
  const [groupBoardOrder, setGroupBoardOrder] = useState<string[]>([])
  const [groupBoardNewGroupName, setGroupBoardNewGroupName] = useState("")
  const [pointerDraggingStudentId, setPointerDraggingStudentId] = useState<number | null>(null)
  const [pointerTargetGroup, setPointerTargetGroup] = useState<string | null>(null)
  const [pointerDragStudentName, setPointerDragStudentName] = useState("")
  const [pointerDragPosition, setPointerDragPosition] = useState<{ x: number; y: number } | null>(
    null
  )
  const draggingStudentIdRef = useRef<number | null>(null)
  const pointerDragSourceGroupRef = useRef<string | null>(null)
  const pointerDragTargetGroupRef = useRef<string | null>(null)
  const [avatarVisible, setAvatarVisible] = useState(false)
  const [avatarSaving, setAvatarSaving] = useState(false)
  const [avatarStudent, setAvatarStudent] = useState<student | null>(null)
  const [avatarValue, setAvatarValue] = useState<string | null>(null)
  const avatarInputRef = useRef<HTMLInputElement | null>(null)
  const [xlsxLoading, setXlsxLoading] = useState(false)
  const [textImportLoading, setTextImportLoading] = useState(false)
  const [xlsxFileName, setXlsxFileName] = useState("")
  const [xlsxAoa, setXlsxAoa] = useState<any[][]>([])
  const [xlsxSelectedCol, setXlsxSelectedCol] = useState<number | null>(null)
  const [textImportValue, setTextImportValue] = useState("")
  const [banYouCookie, setBanYouCookie] = useState("")
  const [banYouLoading, setBanYouLoading] = useState(false)
  const [banYouDetailLoading, setBanYouDetailLoading] = useState(false)
  const [banYouImportLoading, setBanYouImportLoading] = useState(false)
  const [banYouClassrooms, setBanYouClassrooms] = useState<BanYouClassroom[]>([])
  const [banYouDetailVisible, setBanYouDetailVisible] = useState(false)
  const [banYouSelectedClass, setBanYouSelectedClass] = useState<BanYouClassroom | null>(null)
  const [banYouDetail, setBanYouDetail] = useState<BanYouClassroomDetail | null>(null)
  const [banYouCheckedMedals, setBanYouCheckedMedals] = useState<string[]>([])
  const [banYouCheckedStudents, setBanYouCheckedStudents] = useState<string[]>([])
  const [banYouCheckedTeams, setBanYouCheckedTeams] = useState<string[]>([])
  const [banYouTeamPlanOptions, setBanYouTeamPlanOptions] = useState<BanYouTeamPlanOption[]>([])
  const [banYouSelectedTeamPlanId, setBanYouSelectedTeamPlanId] = useState<number | undefined>(
    undefined
  )
  const xlsxInputRef = useRef<HTMLInputElement | null>(null)
  const xlsxWorkerRef = useRef<Worker | null>(null)
  const [form] = Form.useForm()
  const [groupForm] = Form.useForm()
  const [messageApi, contextHolder] = message.useMessage()
  const addFormGroupName = Form.useWatch("group_name", form)
  const editFormGroupName = Form.useWatch("group_name", groupForm)
  const isMobile = useIsMobile()
  const isTablet = useIsTablet()
  const breakpoint = useResponsive()

  useEffect(() => {
    xlsxWorkerRef.current = createXlsxWorker()
    return () => {
      xlsxWorkerRef.current?.terminate()
    }
  }, [])

  const emitDataUpdated = (category: "students" | "all") => {
    window.dispatchEvent(new CustomEvent("ss:data-updated", { detail: { category } }))
  }

  const fetchStudents = useCallback(async () => {
    if (!(window as any).api) return
    setLoading(true)
    try {
      const res = await (window as any).api.queryStudents({})
      if (res.success && res.data) {
        try {
          const students = await Promise.all(
            (res.data as any[]).map(async (s) => {
              let tagIds: number[] = []
              let tags: string[] = []

              try {
                const tagsRes = await (window as any).api.tagsGetByStudent(s.id)
                if (tagsRes.success && tagsRes.data) {
                  tagIds = tagsRes.data.map((t: any) => t.id)
                  tags = tagsRes.data.map((t: any) => t.name)
                }
              } catch (e) {
                console.warn("Failed to fetch tags for student:", s.id, e)
              }

              return {
                id: s.id,
                name: s.name,
                group_name: s.group_name ?? null,
                score: s.score,
                extra_json: s.extra_json ?? null,
                avatarUrl: getAvatarFromExtraJson(s.extra_json),
                tags,
                tagIds,
              }
            })
          )
          console.debug("Fetched students:", students)
          setData(students)
        } catch (e) {
          console.warn("Failed to parse students response, falling back:", e)
          setData(res.data)
        }
      }
    } catch (e) {
      console.error("Failed to fetch students:", e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchStudents()
    const onDataUpdated = (e: any) => {
      const category = e?.detail?.category
      if (category === "students" || category === "all") fetchStudents()
    }
    window.addEventListener("ss:data-updated", onDataUpdated as any)
    return () => window.removeEventListener("ss:data-updated", onDataUpdated as any)
  }, [fetchStudents])

  const handleAdd = async () => {
    if (!(window as any).api) return
    if (!canEdit) {
      messageApi.error(t("common.readOnly"))
      return
    }
    try {
      const values = await form.validateFields()
      if (!values.name) {
        messageApi.warning(t("students.nameRequired"))
        return
      }

      const name = values.name.trim()
      const groupName =
        typeof values.group_name === "string" && values.group_name.trim()
          ? values.group_name.trim()
          : undefined
      if (data.some((s) => s.name === name)) {
        messageApi.warning(t("students.nameExists"))
        return
      }

      const res = await (window as any).api.createStudent({ ...values, name, group_name: groupName })
      if (res.success) {
        messageApi.success(t("students.addSuccess"))
        setVisible(false)
        form.resetFields()
        fetchStudents()
        emitDataUpdated("students")
      } else {
        messageApi.error(res.message || t("students.addFailed"))
      }
    } catch (err) {
      try {
        const api = (window as any).api
        api?.writeLog?.({
          level: "error",
          message: "renderer:validate error",
          meta:
            err instanceof Error
              ? { message: err.message, stack: err.stack }
              : { err: String(err) },
        })
      } catch {
        return
      }
    }
  }

  const handleDelete = async (id: number) => {
    if (!(window as any).api) return
    if (!canEdit) {
      messageApi.error(t("common.readOnly"))
      return
    }
    const res = await (window as any).api.deleteStudent(id)
    if (res.success) {
      messageApi.success(t("students.deleteSuccess"))
      fetchStudents()
      emitDataUpdated("students")
    } else {
      messageApi.error(res.message || t("students.deleteFailed"))
    }
  }

  const handleOpenTagEditor = (student: student) => {
    if (!canEdit) {
      messageApi.error(t("common.readOnly"))
      return
    }
    setEditingStudent(student)
    setTagEditVisible(true)
  }

  const handleOpenAvatarEditor = (student: student) => {
    if (!canEdit) {
      messageApi.error(t("common.readOnly"))
      return
    }
    setAvatarStudent(student)
    setAvatarValue(student.avatarUrl || null)
    setAvatarVisible(true)
  }

  const handleOpenGroupEditor = (student: student) => {
    if (!canEdit) {
      messageApi.error(t("common.readOnly"))
      return
    }
    setGroupEditStudent(student)
    groupForm.setFieldsValue({ group_name: student.group_name || "" })
    setGroupEditVisible(true)
  }

  const handleSaveGroup = async () => {
    if (!(window as any).api || !groupEditStudent) return

    try {
      const values = await groupForm.validateFields()
      const groupName =
        typeof values.group_name === "string" && values.group_name.trim()
          ? values.group_name.trim()
          : ""
      setGroupSaving(true)
      const res = await (window as any).api.updateStudent(groupEditStudent.id, {
        group_name: groupName,
      })
      if (res?.success) {
        messageApi.success(t("students.groupSaveSuccess"))
        setGroupEditVisible(false)
        setGroupEditStudent(null)
        groupForm.resetFields()
        fetchStudents()
        emitDataUpdated("students")
      } else {
        messageApi.error(res?.message || t("students.groupSaveFailed"))
      }
    } catch {
      return
    } finally {
      setGroupSaving(false)
    }
  }

  const openGroupBoardEditor = () => {
    if (!canEdit) {
      messageApi.error(t("common.readOnly"))
      return
    }

    const groups = new Set<string>()
    data.forEach((student) => {
      const normalized = student.group_name?.trim()
      if (normalized) groups.add(normalized)
    })
    const sortedGroups = Array.from(groups).sort((a, b) => a.localeCompare(b, "zh-CN"))
    const order = [...sortedGroups, UNGROUPED_KEY]
    const board: Record<string, student[]> = {}
    order.forEach((key) => {
      board[key] = []
    })
    data.forEach((student) => {
      const key = student.group_name?.trim() || UNGROUPED_KEY
      if (!board[key]) {
        board[key] = []
        order.push(key)
      }
      board[key].push(student)
    })
    order.forEach((key) => {
      board[key].sort((a, b) => a.name.localeCompare(b.name, "zh-CN"))
    })
    console.debug("[GroupBoard] open editor", {
      groups: order.map((group) => (group === UNGROUPED_KEY ? "ungrouped" : group)),
      studentCount: data.length,
    })
    setGroupBoardOrder(order)
    setGroupBoard(board)
    setGroupBoardNewGroupName("")
    setGroupBoardVisible(true)
  }

  const handleCreateGroupInBoard = () => {
    const name = groupBoardNewGroupName.trim()
    if (!name) {
      messageApi.warning(t("students.groupBoardGroupNameRequired"))
      return
    }
    if (name === UNGROUPED_KEY) {
      messageApi.warning(t("students.groupBoardGroupNameInvalid"))
      return
    }
    if (groupBoardOrder.includes(name)) {
      messageApi.warning(t("students.groupBoardGroupExists"))
      return
    }

    setGroupBoard((prev) => ({ ...prev, [name]: [] }))
    setGroupBoardOrder((prev) => {
      const withoutUngrouped = prev.filter((key) => key !== UNGROUPED_KEY)
      return [...withoutUngrouped, name, UNGROUPED_KEY]
    })
    setGroupBoardNewGroupName("")
  }

  const moveStudentToGroup = (studentId: number, targetGroup: string) => {
    setGroupBoard((prev) => {
      let movingStudent: student | null = null
      let sourceGroup = ""
      const next: Record<string, student[]> = {}
      Object.entries(prev).forEach(([group, students]) => {
        next[group] = students.filter((student) => {
          if (student.id === studentId) {
            movingStudent = student
            sourceGroup = group
            return false
          }
          return true
        })
      })

      if (!movingStudent) return prev
      const movedStudent = movingStudent as student
      if (sourceGroup === targetGroup) return prev
      if (!next[targetGroup]) next[targetGroup] = []
      next[targetGroup] = [...next[targetGroup], movedStudent]
      console.debug("[GroupBoard] move student", {
        studentId,
        studentName: movedStudent.name,
        from: sourceGroup === UNGROUPED_KEY ? "ungrouped" : sourceGroup,
        to: targetGroup === UNGROUPED_KEY ? "ungrouped" : targetGroup,
      })
      return next
    })
  }

  const handleSaveGroupBoard = async () => {
    if (!(window as any).api) return

    const groupByStudentId = new Map<number, string>()
    groupBoardOrder.forEach((groupKey) => {
      const students = groupBoard[groupKey] || []
      students.forEach((student) => {
        groupByStudentId.set(student.id, groupKey === UNGROUPED_KEY ? "" : groupKey)
      })
    })

    const changedStudents = data.filter((student) => {
      const originalGroup = student.group_name?.trim() || ""
      const nextGroup = groupByStudentId.get(student.id) ?? ""
      return originalGroup !== nextGroup
    })

    if (changedStudents.length === 0) {
      console.debug("[GroupBoard] save skipped, no changes")
      messageApi.info(t("students.groupBoardNoChanges"))
      setGroupBoardVisible(false)
      return
    }

    setGroupBoardSaving(true)
    try {
      const results = await Promise.allSettled(
        changedStudents.map((student) => {
          const nextGroup = groupByStudentId.get(student.id) ?? ""
          return (window as any).api.updateStudent(student.id, { group_name: nextGroup })
        })
      )
      const failedCount = results.filter(
        (result) => result.status === "rejected" || !result.value?.success
      ).length
      console.debug("[GroupBoard] save result", {
        changedCount: changedStudents.length,
        failedCount,
      })

      if (failedCount > 0) {
        messageApi.error(t("students.groupBoardSaveFailed", { failed: failedCount }))
      } else {
        messageApi.success(t("students.groupBoardSaveSuccess", { count: changedStudents.length }))
        setGroupBoardVisible(false)
      }
      fetchStudents()
      emitDataUpdated("students")
    } finally {
      setGroupBoardSaving(false)
    }
  }

  const beginPointerDrag = (
    e: React.PointerEvent<HTMLDivElement>,
    studentId: number,
    studentName: string,
    sourceGroup: string
  ) => {
    if (e.button !== 0) return
    e.preventDefault()
    draggingStudentIdRef.current = studentId
    pointerDragSourceGroupRef.current = sourceGroup
    pointerDragTargetGroupRef.current = null
    setPointerDraggingStudentId(studentId)
    setPointerDragStudentName(studentName)
    setPointerDragPosition({ x: e.clientX, y: e.clientY })
    setPointerTargetGroup(null)
    e.currentTarget.setPointerCapture(e.pointerId)
    console.debug("[GroupBoard] pointer drag start", {
      studentId,
      studentName,
      sourceGroup: sourceGroup === UNGROUPED_KEY ? "ungrouped" : sourceGroup,
    })
  }

  const trackPointerTarget = (clientX: number, clientY: number) => {
    if (draggingStudentIdRef.current == null) return
    setPointerDragPosition({ x: clientX, y: clientY })
    const element = document.elementFromPoint(clientX, clientY) as HTMLElement | null
    const dropZone = element?.closest("[data-group-drop]") as HTMLElement | null
    const targetGroup = dropZone?.dataset.groupDrop ?? null
    if (pointerDragTargetGroupRef.current !== targetGroup) {
      pointerDragTargetGroupRef.current = targetGroup
      setPointerTargetGroup(targetGroup)
      console.debug("[GroupBoard] pointer target", {
        targetGroup: targetGroup === UNGROUPED_KEY ? "ungrouped" : targetGroup,
      })
    }
  }

  const finishPointerDrag = () => {
    const studentId = draggingStudentIdRef.current
    const sourceGroup = pointerDragSourceGroupRef.current
    const targetGroup = pointerDragTargetGroupRef.current
    console.debug("[GroupBoard] pointer drag end", {
      studentId,
      sourceGroup: sourceGroup === UNGROUPED_KEY ? "ungrouped" : sourceGroup,
      targetGroup: targetGroup === UNGROUPED_KEY ? "ungrouped" : targetGroup,
    })
    if (studentId != null && targetGroup && targetGroup !== sourceGroup) {
      moveStudentToGroup(studentId, targetGroup)
    }
    draggingStudentIdRef.current = null
    pointerDragSourceGroupRef.current = null
    pointerDragTargetGroupRef.current = null
    setPointerDraggingStudentId(null)
    setPointerDragStudentName("")
    setPointerDragPosition(null)
    setPointerTargetGroup(null)
  }

  const readFileAsDataUrl = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => {
        const result = reader.result
        if (typeof result === "string") resolve(result)
        else reject(new Error("invalid-result"))
      }
      reader.onerror = () => reject(reader.error || new Error("read-failed"))
      reader.readAsDataURL(file)
    })
  }

  const handleAvatarFileChange = async (file?: File) => {
    if (!file) return
    if (!file.type.startsWith("image/")) {
      messageApi.error(t("students.avatarInvalidFile"))
      return
    }
    const maxSize = 2 * 1024 * 1024
    if (file.size > maxSize) {
      messageApi.error(t("students.avatarTooLarge"))
      return
    }
    try {
      const dataUrl = await readFileAsDataUrl(file)
      setAvatarValue(dataUrl)
    } catch {
      messageApi.error(t("students.avatarReadFailed"))
    }
  }

  const handleSaveAvatar = async () => {
    if (!(window as any).api || !avatarStudent) return

    setAvatarSaving(true)
    try {
      const payload = setAvatarInExtraJson(avatarStudent.extra_json, avatarValue)
      const res = await (window as any).api.updateStudent(avatarStudent.id, {
        extra_json: payload,
      })
      if (res?.success) {
        messageApi.success(t("students.avatarSaveSuccess"))
        setAvatarVisible(false)
        setAvatarStudent(null)
        setAvatarValue(null)
        fetchStudents()
        emitDataUpdated("students")
      } else {
        messageApi.error(res?.message || t("students.avatarSaveFailed"))
      }
    } catch {
      messageApi.error(t("students.avatarSaveFailed"))
    } finally {
      setAvatarSaving(false)
    }
  }

  const handleSaveTags = async (tagIds: number[]) => {
    if (!editingStudent || !(window as any).api) return

    try {
      const res = await (window as any).api.tagsUpdateStudentTags(editingStudent.id, tagIds)
      if (res && res.success) {
        messageApi.success("标签保存成功")
        setTagEditVisible(false)
        setEditingStudent(null)
        fetchStudents()
        emitDataUpdated("students")
      } else {
        const errorMsg = res?.message || t("students.tagSaveFailed")
        messageApi.error(errorMsg)
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      messageApi.error(`${t("students.tagSaveFailed")}: ${errorMsg}`)
    }
  }

  const excelColName = (idx: number) => {
    let n = idx + 1
    let s = ""
    while (n > 0) {
      const mod = (n - 1) % 26
      s = String.fromCharCode(65 + mod) + s
      n = Math.floor((n - 1) / 26)
    }
    return s
  }

  const parseXlsxFile = async (file: File) => {
    if (!xlsxWorkerRef.current) {
      messageApi.error(t("students.workerNotReady"))
      return
    }

    setXlsxLoading(true)
    try {
      const buf = await file.arrayBuffer()

      xlsxWorkerRef.current.postMessage({
        type: "parseXlsx",
        data: { buffer: buf },
      })

      const handleMessage = (event: MessageEvent) => {
        if (event.data.type === "success") {
          setXlsxFileName(file.name)
          setXlsxAoa(event.data.data)
          setXlsxSelectedCol(null)
          setXlsxVisible(true)
          setTextImportVisible(false)
          setXlsxLoading(false)
        } else if (event.data.type === "error") {
          messageApi.error(event.data.error || t("students.parseXlsxFailed"))
          setXlsxLoading(false)
        }
        xlsxWorkerRef.current?.removeEventListener("message", handleMessage)
      }

      xlsxWorkerRef.current.addEventListener("message", handleMessage)
    } catch (e: any) {
      messageApi.error(e?.message || t("students.parseXlsxFailed"))
      setXlsxLoading(false)
    }
  }

  const xlsxMaxCols = useMemo(() => {
    let max = 0
    for (const row of xlsxAoa) {
      if (Array.isArray(row)) max = Math.max(max, row.length)
    }
    return max
  }, [xlsxAoa])

  const xlsxPreviewRows = useMemo(() => {
    const limit = 50
    const rows = xlsxAoa.slice(0, limit)
    return rows.map((row, idx) => {
      const record: any = { __row: idx + 1 }
      for (let c = 0; c < xlsxMaxCols; c++) {
        record[`c${c}`] = row?.[c] ?? ""
      }
      return record
    })
  }, [xlsxAoa, xlsxMaxCols])

  const xlsxPreviewColumns = useMemo(() => {
    const cols: any[] = [
      {
        title: "#",
        dataIndex: "__row",
        key: "__row",
        width: 60,
        align: "center" as const,
        fixed: "left" as const,
      },
    ]
    for (let c = 0; c < xlsxMaxCols; c++) {
      const selected = xlsxSelectedCol === c
      cols.push({
        title: (
          <span
            style={{
              cursor: "pointer",
              fontWeight: selected ? 700 : 500,
              color: selected ? "var(--ant-color-primary, #1890ff)" : undefined,
            }}
            onClick={() => setXlsxSelectedCol(c)}
          >
            {excelColName(c)}
          </span>
        ),
        dataIndex: `c${c}`,
        key: `c${c}`,
        width: 120,
      })
    }
    return cols
  }, [xlsxMaxCols, xlsxSelectedCol])

  const extractUniqueNames = (rawNames: string[]) => {
    const out: string[] = []
    const seen = new Set<string>()
    const banned = new Set([t("students.name").toLowerCase(), "name", t("students.name")])
    for (const raw of rawNames) {
      const name = String(raw ?? "").trim()
      if (!name) continue
      if (banned.has(name.toLowerCase()) || banned.has(name)) continue
      if (seen.has(name)) continue
      seen.add(name)
      out.push(name)
    }
    return out
  }

  const extractNamesFromAoa = (aoa: any[][], colIdx: number) => {
    const names = aoa.map((row) => String(row?.[colIdx] ?? ""))
    return extractUniqueNames(names)
  }

  const extractNamesFromText = (text: string) => {
    const lines = text.split(/\r?\n/)
    return extractUniqueNames(lines)
  }

  const importNames = async (names: string[], options?: { toast?: boolean }) => {
    const toast = options?.toast ?? true
    if (!(window as any).api) return { success: false, inserted: 0, skipped: 0 }
    const res = await (window as any).api.importStudentsFromXlsx({ names })
    if (!res?.success) {
      if (toast) messageApi.error(res?.message || t("students.importFailed"))
      return { success: false, inserted: 0, skipped: 0 }
    }
    const inserted = Number(res?.data?.inserted ?? 0)
    const skipped = Number(res?.data?.skipped ?? 0)
    if (toast) messageApi.success(t("students.importComplete", { inserted, skipped }))
    fetchStudents()
    emitDataUpdated("students")
    return { success: true, inserted, skipped }
  }

  const handleConfirmXlsxImport = async () => {
    if (!canEdit) {
      messageApi.error(t("common.readOnly"))
      return
    }
    if (xlsxSelectedCol == null) {
      messageApi.warning(t("students.selectNameColFirst"))
      return
    }

    const names = extractNamesFromAoa(xlsxAoa, xlsxSelectedCol)
    if (!names.length) {
      messageApi.error(t("students.noNamesFound"))
      return
    }

    setXlsxLoading(true)
    try {
      const result = await importNames(names)
      if (!result.success) return
      setXlsxVisible(false)
      setXlsxAoa([])
      setXlsxFileName("")
      setXlsxSelectedCol(null)
    } finally {
      setXlsxLoading(false)
    }
  }

  const handleImportTextNames = async () => {
    if (!canEdit) {
      messageApi.error(t("common.readOnly"))
      return
    }
    const names = extractNamesFromText(textImportValue)
    if (!names.length) {
      messageApi.warning(t("students.noNamesFound"))
      return
    }

    setTextImportLoading(true)
    try {
      const result = await importNames(names)
      if (!result.success) return
      setTextImportValue("")
      setTextImportVisible(false)
    } finally {
      setTextImportLoading(false)
    }
  }

  const handleOpenTextImport = () => {
    setTextImportVisible(true)
  }

  const handleOpenXlsxImport = () => {
    xlsxInputRef.current?.click()
  }

  const handleOpenBanYouImport = () => {
    setBanYouVisible(true)
  }

  const handleFetchBanYouClassrooms = async () => {
    if (!canEdit) {
      messageApi.error(t("common.readOnly"))
      return
    }
    const cookie = banYouCookie.trim()
    if (!cookie) {
      messageApi.warning(t("students.banyouCookieRequired"))
      return
    }

    setBanYouLoading(true)
    try {
      console.debug("[BanYou] fetch classrooms start", {
        cookieLength: cookie.length,
        containsUid: cookie.includes("uid="),
        containsAccessToken: cookie.includes("accessToken="),
      })
      const res = await (window as any).api.fetchBanYouClassrooms({ cookie })
      if (!res?.success || !res?.data) {
        console.error("[BanYou] fetch classrooms failed", res)
        messageApi.error(res?.message || t("students.banyouFetchFailed"))
        return
      }
      const classrooms = Array.isArray(res.data.classrooms) ? res.data.classrooms : []
      console.debug("[BanYou] fetch classrooms success", {
        classrooms: classrooms.length,
        administrativeGroups: Array.isArray(res.data.administrativeGroups)
          ? res.data.administrativeGroups.length
          : 0,
      })
      setBanYouClassrooms(classrooms)
      messageApi.success(t("students.banyouFetchSuccess", { count: classrooms.length }))
    } catch (e: any) {
      console.error("[BanYou] fetch classrooms exception", e)
      messageApi.error(e?.message || t("students.banyouFetchFailed"))
    } finally {
      setBanYouLoading(false)
    }
  }

  const medalKey = (item: BanYouMedal, idx: number) => item.key || item.uid || `${item.name}-${idx}`

  const fetchBanYouClassDetail = async (classroom: BanYouClassroom, teamPlanId?: number) => {
    const cookie = banYouCookie.trim()
    if (!cookie) {
      messageApi.warning(t("students.banyouCookieRequired"))
      return
    }
    setBanYouSelectedClass(classroom)
    setBanYouDetailVisible(true)
    setBanYouDetailLoading(true)
    try {
      const parsedTeamPlanId = typeof teamPlanId === "number" ? teamPlanId : undefined
      const params: any = {
        cookie,
        classId: classroom.classId,
      }
      if (Number.isFinite(parsedTeamPlanId)) params.teamPlanId = parsedTeamPlanId
      const res = await (window as any).api.fetchBanYouClassroomDetail(params)
      if (!res?.success || !res?.data) {
        messageApi.error(res?.message || t("students.banyouFetchDetailFailed"))
        setBanYouDetail(null)
        return
      }
      const detail = res.data as BanYouClassroomDetail
      setBanYouDetail(detail)
      const options = Array.isArray(detail.teamPlans) ? detail.teamPlans : []
      setBanYouTeamPlanOptions(options)
      const used = Number(detail.teamPlanIdUsed)
      if (Number.isFinite(used) && used > 0) {
        setBanYouSelectedTeamPlanId(used)
      } else if (options.length > 0) {
        setBanYouSelectedTeamPlanId(Number(options[0].teamPlanId))
      } else {
        setBanYouSelectedTeamPlanId(undefined)
      }
      setBanYouCheckedStudents((detail.students || []).map((s) => s.studentId))
      setBanYouCheckedMedals((detail.medals || []).map((m, idx) => medalKey(m, idx)))
      setBanYouCheckedTeams((detail.teams || []).map((team) => team.teamId))
    } catch (e: any) {
      messageApi.error(e?.message || t("students.banyouFetchDetailFailed"))
      setBanYouDetail(null)
    } finally {
      setBanYouDetailLoading(false)
    }
  }

  const handleOpenBanYouClassDetail = async (classroom: BanYouClassroom) => {
    await fetchBanYouClassDetail(classroom)
  }

  const handleReloadBanYouGroupByPlan = async () => {
    if (!banYouSelectedClass) return
    if (!banYouSelectedTeamPlanId) {
      messageApi.warning(t("students.banyouSelectTeamPlanFirst"))
      return
    }
    await fetchBanYouClassDetail(banYouSelectedClass, banYouSelectedTeamPlanId)
  }

  const handleImportBanYouSelected = async () => {
    if (!banYouDetail) return
    if (!(window as any).api) return

    const selectedStudents = (banYouDetail.students || []).filter((s) =>
      banYouCheckedStudents.includes(s.studentId)
    )
    const selectedMedals = (banYouDetail.medals || []).filter((m, idx) =>
      banYouCheckedMedals.includes(medalKey(m, idx))
    )
    const selectedTeams = (banYouDetail.teams || []).filter((g) => banYouCheckedTeams.includes(g.teamId))

    if (!selectedStudents.length && !selectedMedals.length && !selectedTeams.length) {
      messageApi.warning(t("students.banyouNothingSelected"))
      return
    }

    setBanYouImportLoading(true)
    try {
      let studentInserted = 0
      let studentSkipped = 0
      if (selectedStudents.length) {
        const names = selectedStudents.map((s) => s.studentName)
        const res = await importNames(names, { toast: false })
        if (!res.success) {
          messageApi.error(t("students.importFailed"))
          return
        }
        studentInserted = res.inserted
        studentSkipped = res.skipped
      }

      let reasonInserted = 0
      let reasonSkipped = 0
      if (selectedMedals.length) {
        const reasonCategory = "班优导入"
        const currentReasons = await (window as any).api.queryReasons()
        const existing = new Set<string>()
        if (currentReasons?.success && Array.isArray(currentReasons?.data)) {
          for (const r of currentReasons.data) {
            existing.add(`${r.category}::${r.content}::${Number(r.delta)}`)
          }
        }
        for (const medal of selectedMedals) {
          const content = String(medal.name || "").trim()
          if (!content) {
            reasonSkipped += 1
            continue
          }
          const medalType = Number(medal.medalType ?? medal.type ?? 1)
          const value = Math.abs(Number(medal.value ?? 1)) || 1
          const delta = medalType < 0 ? -value : value
          const key = `${reasonCategory}::${content}::${delta}`
          if (existing.has(key)) {
            reasonSkipped += 1
            continue
          }
          const createRes = await (window as any).api.createReason({
            content,
            category: reasonCategory,
            delta,
          })
          if (createRes?.success) {
            reasonInserted += 1
            existing.add(key)
          } else {
            reasonSkipped += 1
          }
        }
      }

      let groupUpdated = 0
      let groupSkipped = 0
      if (selectedTeams.length) {
        const mapping = new Map<string, string>()
        for (const team of selectedTeams) {
          for (const student of team.students || []) {
            const name = String(student.studentName || "").trim()
            if (name && !mapping.has(name)) mapping.set(name, team.teamName || "")
          }
        }
        if (mapping.size > 0) {
          const localStudentsRes = await (window as any).api.queryStudents({})
          const localMap = new Map<string, number>()
          if (localStudentsRes?.success && Array.isArray(localStudentsRes?.data)) {
            for (const s of localStudentsRes.data) {
              localMap.set(String(s.name), Number(s.id))
            }
          }
          for (const [name, groupName] of mapping.entries()) {
            const id = localMap.get(name)
            if (!id) {
              groupSkipped += 1
              continue
            }
            const updateRes = await (window as any).api.updateStudent(id, { group_name: groupName })
            if (updateRes?.success) groupUpdated += 1
            else groupSkipped += 1
          }
        }
      }

      emitDataUpdated("all")
      fetchStudents()
      messageApi.success(
        t("students.banyouImportSummary", {
          studentsInserted: studentInserted,
          studentsSkipped: studentSkipped,
          reasonsInserted: reasonInserted,
          reasonsSkipped: reasonSkipped,
          groupsUpdated: groupUpdated,
          groupsSkipped: groupSkipped,
        })
      )
    } finally {
      setBanYouImportLoading(false)
    }
  }

  const banYouCreatedClasses = useMemo(
    () => banYouClassrooms.filter((item) => item.isOwn !== false),
    [banYouClassrooms]
  )
  const banYouJoinedClasses = useMemo(
    () => banYouClassrooms.filter((item) => item.isOwn === false),
    [banYouClassrooms]
  )

  const columns: ColumnsType<student> = useMemo(() => {
    const baseColumns: ColumnsType<student> = [
      {
        title: t("students.avatar"),
        key: "avatar",
        width: isMobile ? 60 : 88,
        align: "center",
        render: (_, row) =>
          row.avatarUrl ? (
            <img
              src={row.avatarUrl}
              alt={row.name}
              style={{
                width: isMobile ? 24 : 32,
                height: isMobile ? 24 : 32,
                borderRadius: "50%",
                objectFit: "cover",
                border: "1px solid var(--ss-border-color)",
              }}
            />
          ) : (
            <div
              style={{
                width: isMobile ? 24 : 32,
                height: isMobile ? 24 : 32,
                borderRadius: "50%",
                margin: "0 auto",
                backgroundColor: "var(--ss-bg-color)",
                border: "1px dashed var(--ss-border-color)",
                color: "var(--ss-text-secondary)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: isMobile ? 10 : 12,
              }}
            >
              -
            </div>
          ),
      },
      {
        title: t("students.name"),
        dataIndex: "name",
        key: "name",
        width: isMobile ? 80 : 100,
        ellipsis: true,
      },
      {
        title: t("students.group"),
        dataIndex: "group_name",
        key: "group_name",
        width: isMobile ? 90 : 120,
        ellipsis: true,
        render: (groupName?: string | null) => groupName?.trim() || t("students.noGroup"),
      },
      {
        title: t("students.currentScore"),
        dataIndex: "score",
        key: "score",
        width: isMobile ? 100 : 160,
        align: "center",
        render: (score: number) => (
          <span
            style={{
              fontWeight: "bold",
              color:
                score > 0
                  ? "var(--ant-color-success, #52c41a)"
                  : score < 0
                    ? "var(--ant-color-error, #ff4d4f)"
                    : "inherit",
              fontSize: isMobile ? 12 : 14,
            }}
          >
            {score > 0 ? `+${score}` : score}
          </span>
        ),
      },
      {
        title: t("students.tags"),
        dataIndex: "tags",
        key: "tags",
        width: isMobile ? 120 : 200,
        render: (tags: string[] = []) => (
          <Space size={isMobile ? 2 : 4}>
            {tags.length === 0 ? (
              <span style={{ color: "var(--ss-text-secondary)", fontSize: isMobile ? 10 : 12 }}>
                {t("students.noTags")}
              </span>
            ) : (
              tags.slice(0, isMobile ? 2 : 3).map((tag) => (
                <Tag key={tag} color="blue" style={{ fontSize: isMobile ? 10 : 12, margin: 0 }}>
                  {tag}
                </Tag>
              ))
            )}
            {tags.length > (isMobile ? 2 : 3) && (
              <Tag style={{ fontSize: isMobile ? 10 : 12, margin: 0 }}>
                +{tags.length - (isMobile ? 2 : 3)}
              </Tag>
            )}
          </Space>
        ),
      },
      {
        title: t("common.operation"),
        key: "operation",
        width: isMobile ? 96 : 110,
        fixed: isMobile ? "right" : undefined,
        render: (_, row) => (
          <Dropdown
            trigger={["click"]}
            menu={{
              items: [
                { key: "editTags", label: t("students.editTags") },
                { key: "editGroup", label: t("students.editGroup") },
                { key: "editAvatar", label: t("students.editAvatar") },
                { key: "delete", danger: true, label: t("common.delete") },
              ],
              onClick: ({ key }) => {
                if (key === "editTags") handleOpenTagEditor(row)
                else if (key === "editGroup") handleOpenGroupEditor(row)
                else if (key === "editAvatar") handleOpenAvatarEditor(row)
                else if (key === "delete") handleDelete(row.id)
              },
            }}
          >
            <Button size={isMobile ? "small" : "middle"} disabled={!canEdit} icon={<MoreOutlined />}>
              {t("common.operation")}
            </Button>
          </Dropdown>
        ),
      },
    ]

    if (isMobile) {
      return baseColumns.filter((col) => col.key !== "tags")
    }

    return baseColumns
  }, [t, canEdit, isMobile, isTablet, breakpoint])

  const existingGroupNames = useMemo(() => {
    const groups = new Set<string>()
    data.forEach((student) => {
      const normalized = student.group_name?.trim()
      if (normalized) groups.add(normalized)
    })
    return Array.from(groups).sort((a, b) => a.localeCompare(b, "zh-CN"))
  }, [data])

  const normalizedAddFormGroupName =
    typeof addFormGroupName === "string" && addFormGroupName.trim() ? addFormGroupName.trim() : ""
  const normalizedEditFormGroupName =
    typeof editFormGroupName === "string" && editFormGroupName.trim()
      ? editFormGroupName.trim()
      : ""

  const importMenu = {
    items: [
      { key: "text", label: t("students.importByText") },
      { key: "xlsx", label: t("students.importByXlsx") },
      { key: "banyou", label: t("students.importByBanyou") },
    ],
    onClick: ({ key }: { key: string }) => {
      if (!canEdit) {
        messageApi.error(t("common.readOnly"))
        return
      }
      if (key === "text") handleOpenTextImport()
      else if (key === "xlsx") handleOpenXlsxImport()
      else if (key === "banyou") handleOpenBanYouImport()
    },
  }

  const paginatedData = data.slice((currentPage - 1) * pageSize, currentPage * pageSize)

  return (
    <div style={{ padding: "24px" }}>
      {contextHolder}
      <div style={{ marginBottom: "16px", display: "flex", justifyContent: "space-between" }}>
        <h2 style={{ margin: 0, color: "var(--ss-text-main)" }}>{t("students.title")}</h2>
        <Space>
          <Button disabled={!canEdit} onClick={openGroupBoardEditor}>
            {t("students.groupBoardEdit")}
          </Button>
          <Dropdown trigger={["click"]} menu={importMenu} disabled={!canEdit}>
            <Button disabled={!canEdit}>{t("students.importList")}</Button>
          </Dropdown>
          <Button type="primary" disabled={!canEdit} onClick={() => setVisible(true)}>
            {t("students.addStudent")}
          </Button>
        </Space>
      </div>

      <Table
        dataSource={paginatedData}
        columns={columns}
        rowKey="id"
        loading={loading}
        pagination={false}
        style={{ backgroundColor: "var(--ss-card-bg)", color: "var(--ss-text-main)" }}
      />
      <div style={{ marginTop: 16, textAlign: "right" }}>
        <Pagination
          current={currentPage}
          pageSize={pageSize}
          total={data.length}
          onChange={(page, size) => {
            setCurrentPage(page)
            setPageSize(size)
          }}
          showSizeChanger
          showTotal={(total) => t("common.total", { count: total })}
        />
      </div>

      <Modal
        title={t("students.addTitle")}
        open={visible}
        onOk={handleAdd}
        onCancel={() => setVisible(false)}
        okText={t("students.addConfirm")}
        cancelText={t("common.cancel")}
        destroyOnHidden
      >
        <Form form={form} layout="vertical">
          <Form.Item
            label={t("students.name")}
            name="name"
            rules={[{ required: true, message: t("students.nameRequired") }]}
          >
            <Input placeholder={t("students.namePlaceholder")} />
          </Form.Item>
          <Form.Item label={t("students.group")} name="group_name">
            <Input placeholder={t("students.groupPlaceholder")} />
          </Form.Item>
          <div style={{ marginTop: 8 }}>
            <div style={{ color: "var(--ss-text-secondary)", marginBottom: 8, fontSize: 12 }}>
              {t("students.existingGroups")}
            </div>
            {existingGroupNames.length > 0 ? (
              <Space wrap size={[8, 8]}>
                {existingGroupNames.map((group) => {
                  const active = normalizedAddFormGroupName === group
                  return (
                    <Tag
                      key={`add-group-${group}`}
                      color={active ? "processing" : undefined}
                      style={{ cursor: "pointer", userSelect: "none", marginInlineEnd: 0 }}
                      onClick={() => form.setFieldValue("group_name", group)}
                    >
                      {group}
                    </Tag>
                  )
                })}
              </Space>
            ) : (
              <div style={{ color: "var(--ss-text-secondary)", fontSize: 12 }}>
                {t("students.noExistingGroups")}
              </div>
            )}
          </div>
        </Form>
      </Modal>

      <Modal
        title={t("students.editGroupTitle", { name: groupEditStudent?.name || "" })}
        open={groupEditVisible}
        onCancel={() => {
          setGroupEditVisible(false)
          setGroupEditStudent(null)
          groupForm.resetFields()
        }}
        onOk={handleSaveGroup}
        okText={t("common.save")}
        cancelText={t("common.cancel")}
        okButtonProps={{ loading: groupSaving, disabled: !groupEditStudent }}
        destroyOnHidden
      >
        <Form form={groupForm} layout="vertical">
          <Form.Item label={t("students.group")} name="group_name">
            <Input placeholder={t("students.groupPlaceholder")} />
          </Form.Item>
          <div style={{ marginTop: 8 }}>
            <div style={{ color: "var(--ss-text-secondary)", marginBottom: 8, fontSize: 12 }}>
              {t("students.existingGroups")}
            </div>
            {existingGroupNames.length > 0 ? (
              <Space wrap size={[8, 8]}>
                {existingGroupNames.map((group) => {
                  const active = normalizedEditFormGroupName === group
                  return (
                    <Tag
                      key={`edit-group-${group}`}
                      color={active ? "processing" : undefined}
                      style={{ cursor: "pointer", userSelect: "none", marginInlineEnd: 0 }}
                      onClick={() => groupForm.setFieldValue("group_name", group)}
                    >
                      {group}
                    </Tag>
                  )
                })}
              </Space>
            ) : (
              <div style={{ color: "var(--ss-text-secondary)", fontSize: 12 }}>
                {t("students.noExistingGroups")}
              </div>
            )}
          </div>
        </Form>
      </Modal>

      <Modal
        title={t("students.groupBoardTitle")}
        open={groupBoardVisible}
        centered
        onCancel={() => {
          setGroupBoardVisible(false)
          setGroupBoardNewGroupName("")
          draggingStudentIdRef.current = null
          pointerDragSourceGroupRef.current = null
          pointerDragTargetGroupRef.current = null
          setPointerDraggingStudentId(null)
          setPointerDragStudentName("")
          setPointerDragPosition(null)
          setPointerTargetGroup(null)
        }}
        onOk={handleSaveGroupBoard}
        okText={t("common.save")}
        cancelText={t("common.cancel")}
        okButtonProps={{ loading: groupBoardSaving }}
        width="90%"
        wrapClassName="ss-group-board-modal"
        styles={{ body: { maxHeight: "calc(100vh - 220px)", overflow: "hidden" } }}
        destroyOnHidden
      >
        <div style={{ color: "var(--ss-text-secondary)", marginBottom: 12, fontSize: 12 }}>
          {t("students.groupBoardHint")}
        </div>
        <Space style={{ marginBottom: 12, width: "100%" }}>
          <Input
            value={groupBoardNewGroupName}
            onChange={(e) => setGroupBoardNewGroupName(e.target.value)}
            onPressEnter={handleCreateGroupInBoard}
            placeholder={t("students.groupBoardNewGroupPlaceholder")}
            maxLength={32}
          />
          <Button icon={<PlusOutlined />} onClick={handleCreateGroupInBoard}>
            {t("students.groupBoardAddGroup")}
          </Button>
        </Space>
        <div
          style={{
            display: "flex",
            gap: 12,
            overflowX: "auto",
            paddingBottom: 4,
            userSelect: pointerDraggingStudentId != null ? "none" : "auto",
            WebkitUserSelect: pointerDraggingStudentId != null ? "none" : "auto",
          }}
        >
          {groupBoardOrder.map((groupKey) => {
            const studentsInGroup = groupBoard[groupKey] || []
            const groupLabel = groupKey === UNGROUPED_KEY ? t("students.noGroup") : groupKey
            return (
              <div
                key={groupKey}
                data-group-drop={groupKey}
                style={{
                  minWidth: isMobile ? 180 : 220,
                  maxWidth: isMobile ? 220 : 260,
                  border: "1px solid var(--ss-border-color)",
                  borderRadius: 10,
                  backgroundColor:
                    pointerTargetGroup === groupKey ? "var(--ss-bg-color)" : "var(--ss-card-bg)",
                  padding: 10,
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                  transition: "background-color 120ms ease",
                }}
              >
                <div
                  style={{
                    fontWeight: 600,
                    color: "var(--ss-text-main)",
                    borderBottom: "1px dashed var(--ss-border-color)",
                    paddingBottom: 8,
                  }}
                >
                  {groupLabel} ({studentsInGroup.length})
                </div>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                    minHeight: 160,
                    maxHeight: "44vh",
                    overflowY: "auto",
                    overflowX: "hidden",
                    paddingRight: 2,
                  }}
                >
                  {studentsInGroup.length > 0 ? (
                    studentsInGroup.map((student) => (
                      <div
                        key={`${groupKey}-${student.id}`}
                        onPointerDown={(e) => beginPointerDrag(e, student.id, student.name, groupKey)}
                        onPointerMove={(e) => trackPointerTarget(e.clientX, e.clientY)}
                        onPointerUp={finishPointerDrag}
                        onPointerCancel={finishPointerDrag}
                        onLostPointerCapture={finishPointerDrag}
                        style={{
                          border: "1px solid var(--ss-border-color)",
                          borderRadius: 8,
                          backgroundColor:
                            pointerDraggingStudentId === student.id
                              ? "var(--ss-bg-color)"
                              : "var(--ss-card-bg)",
                          opacity: pointerDraggingStudentId === student.id ? 0.45 : 1,
                          padding: "8px 10px",
                          cursor: pointerDraggingStudentId === student.id ? "grabbing" : "grab",
                          userSelect: "none",
                          WebkitUserSelect: "none",
                          touchAction: "none",
                        }}
                      >
                        {student.name}
                      </div>
                    ))
                  ) : (
                    <div style={{ color: "var(--ss-text-secondary)", fontSize: 12 }}>
                      {t("students.groupBoardEmpty")}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
        {pointerDraggingStudentId != null && pointerDragPosition && (
          <div
            style={{
              position: "fixed",
              left: pointerDragPosition.x + 14,
              top: pointerDragPosition.y + 14,
              pointerEvents: "none",
              zIndex: 2100,
              border: "1px solid var(--ss-border-color)",
              borderRadius: 8,
              backgroundColor: "var(--ss-card-bg)",
              color: "var(--ss-text-main)",
              padding: "8px 10px",
              boxShadow: "0 8px 24px rgba(0, 0, 0, 0.16)",
              fontSize: 13,
              maxWidth: 220,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {pointerDragStudentName}
          </div>
        )}
      </Modal>

      <Modal
        title={t("students.importByText")}
        open={textImportVisible}
        onCancel={() => setTextImportVisible(false)}
        footer={null}
        destroyOnHidden
      >
        <Space orientation="vertical" style={{ width: "100%" }}>
          <div style={{ color: "var(--ss-text-secondary)", fontSize: 12 }}>
            {t("students.importTextHint")}
          </div>
          <Input.TextArea
            value={textImportValue}
            onChange={(e) => setTextImportValue(e.target.value)}
            rows={8}
            placeholder={t("students.importTextPlaceholder")}
            disabled={!canEdit || textImportLoading}
          />
          <Button
            type="primary"
            loading={textImportLoading}
            disabled={!canEdit}
            onClick={handleImportTextNames}
          >
            {t("students.importConfirm")}
          </Button>
        </Space>
      </Modal>

      <Modal
        title={t("students.importByBanyou")}
        open={banYouVisible}
        onCancel={() => setBanYouVisible(false)}
        footer={null}
        width={900}
        destroyOnHidden
      >
        <Space orientation="vertical" style={{ width: "100%" }} size={12}>
          <div style={{ color: "var(--ss-text-secondary)", fontSize: 12 }}>
            {t("students.banyouCookieHint")}
          </div>
          <Input.TextArea
            value={banYouCookie}
            onChange={(e) => setBanYouCookie(e.target.value)}
            rows={4}
            placeholder={t("students.banyouCookiePlaceholder")}
            disabled={banYouLoading}
          />
          <Button type="primary" loading={banYouLoading} onClick={handleFetchBanYouClassrooms}>
            {t("students.banyouFetch")}
          </Button>

          <div style={{ marginTop: 8 }}>
            <h3 style={{ margin: "0 0 12px", color: "var(--ss-text-main)" }}>
              {t("students.banyouCreatedClasses")}
            </h3>
            {banYouCreatedClasses.length > 0 ? (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(320px, 1fr))",
                  gap: 12,
                }}
              >
                {banYouCreatedClasses.map((item) => (
                  <div
                    key={`created-${item.classId}`}
                    onClick={() => handleOpenBanYouClassDetail(item)}
                    style={{
                      border: "1px solid var(--ss-border-color)",
                      borderRadius: 12,
                      backgroundColor: "var(--ss-card-bg)",
                      overflow: "hidden",
                      cursor: "pointer",
                    }}
                  >
                    <div
                      style={{
                        padding: "12px 14px",
                        borderBottom: "1px solid var(--ss-border-color)",
                        fontWeight: 700,
                        color: "var(--ss-text-main)",
                        fontSize: 20,
                      }}
                    >
                      {item.classNickName} {item.invitationCode ? `(${item.invitationCode})` : ""}
                    </div>
                    <div style={{ padding: 14, display: "flex", gap: 12 }}>
                      {item.classAvatarDataUrl ? (
                        <img
                          src={item.classAvatarDataUrl}
                          alt={item.classNickName}
                          style={{ width: 72, height: 72, borderRadius: "50%", objectFit: "cover" }}
                        />
                      ) : (
                        <div
                          style={{
                            width: 72,
                            height: 72,
                            borderRadius: "50%",
                            backgroundColor: "var(--ss-bg-color)",
                            border: "1px dashed var(--ss-border-color)",
                          }}
                        />
                      )}
                      <div style={{ flex: 1, color: "var(--ss-text-main)" }}>
                        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>
                          {t("students.banyouClassTeacher")}
                          {item.masterName || "-"}
                        </div>
                        <div style={{ color: "var(--ss-text-secondary)", fontSize: 14 }}>
                          {t("students.banyouStudentCount")}
                          {Number(item.studentsNum ?? 0)}
                        </div>
                      </div>
                      <div
                        style={{
                          minWidth: 48,
                          display: "flex",
                          alignItems: "flex-end",
                          justifyContent: "center",
                          color: "var(--ss-text-main)",
                          fontSize: 42,
                          fontWeight: 700,
                          lineHeight: 1,
                        }}
                      >
                        {Number(item.praiseCount ?? 0)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ color: "var(--ss-text-secondary)", fontSize: 13 }}>
                {t("students.banyouNoClasses")}
              </div>
            )}
          </div>

          <div style={{ marginTop: 8 }}>
            <h3 style={{ margin: "0 0 12px", color: "var(--ss-text-main)" }}>
              {t("students.banyouJoinedClasses")}
            </h3>
            {banYouJoinedClasses.length > 0 ? (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(320px, 1fr))",
                  gap: 12,
                }}
              >
                {banYouJoinedClasses.map((item) => (
                  <div
                    key={`joined-${item.classId}`}
                    onClick={() => handleOpenBanYouClassDetail(item)}
                    style={{
                      border: "1px solid var(--ss-border-color)",
                      borderRadius: 12,
                      backgroundColor: "var(--ss-card-bg)",
                      padding: 14,
                      color: "var(--ss-text-main)",
                      cursor: "pointer",
                    }}
                  >
                    <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 8 }}>
                      {item.classNickName} {item.invitationCode ? `(${item.invitationCode})` : ""}
                    </div>
                    <div style={{ color: "var(--ss-text-secondary)", fontSize: 14 }}>
                      {t("students.banyouClassTeacher")}
                      {item.masterName || "-"}
                    </div>
                    <div style={{ color: "var(--ss-text-secondary)", fontSize: 14 }}>
                      {t("students.banyouStudentCount")}
                      {Number(item.studentsNum ?? 0)}
                    </div>
                    <div style={{ color: "var(--ss-text-secondary)", fontSize: 14 }}>
                      {t("students.banyouPraiseCount")}
                      {Number(item.praiseCount ?? 0)}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ color: "var(--ss-text-secondary)", fontSize: 13 }}>
                {t("students.banyouNoClasses")}
              </div>
            )}
          </div>
        </Space>
      </Modal>

      <Modal
        title={
          banYouSelectedClass
            ? `${t("students.banyouClassDetail")} - ${banYouSelectedClass.classNickName}`
            : t("students.banyouClassDetail")
        }
        open={banYouDetailVisible}
        onCancel={() => {
          setBanYouDetailVisible(false)
          setBanYouDetail(null)
          setBanYouSelectedClass(null)
          setBanYouTeamPlanOptions([])
          setBanYouSelectedTeamPlanId(undefined)
        }}
        width={980}
        destroyOnHidden
        onOk={handleImportBanYouSelected}
        okText={t("students.banyouImportSelected")}
        okButtonProps={{ loading: banYouImportLoading, disabled: !banYouDetail }}
        cancelText={t("common.cancel")}
      >
        {banYouDetailLoading ? (
          <div style={{ padding: "24px 0", textAlign: "center", color: "var(--ss-text-secondary)" }}>
            {t("common.loading")}
          </div>
        ) : !banYouDetail ? (
          <div style={{ color: "var(--ss-text-secondary)" }}>{t("students.banyouDetailEmpty")}</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 16, maxHeight: "70vh" }}>
            {banYouTeamPlanOptions.length > 0 && (
              <div>
                <div style={{ fontWeight: 700, marginBottom: 8 }}>
                  {t("students.banyouTeamPlanSelector")}
                </div>
                <Space>
                  <Select
                    style={{ minWidth: 320 }}
                    value={banYouSelectedTeamPlanId}
                    onChange={(v) => setBanYouSelectedTeamPlanId(Number(v))}
                    options={banYouTeamPlanOptions.map((item) => ({
                      value: item.teamPlanId,
                      label: item.name?.trim()
                        ? `${item.name} (${item.teamPlanId})`
                        : String(item.teamPlanId),
                    }))}
                  />
                  <Button loading={banYouDetailLoading} onClick={handleReloadBanYouGroupByPlan}>
                    {t("students.banyouLoadTeamPlan")}
                  </Button>
                </Space>
                {banYouDetail.teamPlanSource ? (
                  <div style={{ marginTop: 6, color: "var(--ss-text-secondary)", fontSize: 12 }}>
                    {t("students.banyouTeamPlanSource")}
                    {banYouDetail.teamPlanSource}
                  </div>
                ) : null}
              </div>
            )}

            <div>
              <div style={{ fontWeight: 700, marginBottom: 8 }}>{t("students.banyouReasonList")}</div>
              <div
                style={{
                  border: "1px solid var(--ss-border-color)",
                  borderRadius: 8,
                  padding: 10,
                  maxHeight: 180,
                  overflowY: "auto",
                }}
              >
                <Checkbox.Group
                  value={banYouCheckedMedals}
                  onChange={(vals) => setBanYouCheckedMedals(vals as string[])}
                  style={{ width: "100%" }}
                >
                  <Space direction="vertical" style={{ width: "100%" }}>
                    {banYouDetail.medals.map((item, idx) => {
                      const key = medalKey(item, idx)
                      const type = Number(item.medalType ?? item.type ?? 1)
                      const value = Math.abs(Number(item.value ?? 1)) || 1
                      const delta = type < 0 ? -value : value
                      return (
                        <Checkbox key={key} value={key}>
                          {item.name} ({delta > 0 ? `+${delta}` : delta})
                        </Checkbox>
                      )
                    })}
                  </Space>
                </Checkbox.Group>
              </div>
            </div>

            <div>
              <div style={{ fontWeight: 700, marginBottom: 8 }}>{t("students.banyouStudentList")}</div>
              <div
                style={{
                  border: "1px solid var(--ss-border-color)",
                  borderRadius: 8,
                  padding: 10,
                  maxHeight: 220,
                  overflowY: "auto",
                }}
              >
                <Checkbox.Group
                  value={banYouCheckedStudents}
                  onChange={(vals) => setBanYouCheckedStudents(vals as string[])}
                  style={{ width: "100%" }}
                >
                  <Space direction="vertical" style={{ width: "100%" }}>
                    {banYouDetail.students.map((item) => (
                      <Checkbox key={item.studentId} value={item.studentId}>
                        {item.studentName}
                      </Checkbox>
                    ))}
                  </Space>
                </Checkbox.Group>
              </div>
            </div>

            <div>
              <div style={{ fontWeight: 700, marginBottom: 8 }}>{t("students.banyouTeamList")}</div>
              <div
                style={{
                  border: "1px solid var(--ss-border-color)",
                  borderRadius: 8,
                  padding: 10,
                  maxHeight: 220,
                  overflowY: "auto",
                }}
              >
                <Checkbox.Group
                  value={banYouCheckedTeams}
                  onChange={(vals) => setBanYouCheckedTeams(vals as string[])}
                  style={{ width: "100%" }}
                >
                  <Space direction="vertical" style={{ width: "100%" }}>
                    {banYouDetail.teams.length > 0 ? (
                      banYouDetail.teams.map((team) => (
                        <Checkbox key={team.teamId} value={team.teamId}>
                          {team.teamName} ({(team.students || []).length})
                        </Checkbox>
                      ))
                    ) : (
                      <span style={{ color: "var(--ss-text-secondary)", fontSize: 12 }}>
                        {t("students.banyouNoTeams")}
                      </span>
                    )}
                  </Space>
                </Checkbox.Group>
              </div>
            </div>
          </div>
        )}
      </Modal>

      <input
        ref={xlsxInputRef}
        type="file"
        accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        style={{ display: "none" }}
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) parseXlsxFile(file)
          if (xlsxInputRef.current) xlsxInputRef.current.value = ""
        }}
      />

      <Modal
        title={t("students.xlsxPreview")}
        open={xlsxVisible}
        onCancel={() => setXlsxVisible(false)}
        onOk={handleConfirmXlsxImport}
        okText={t("students.importConfirm")}
        okButtonProps={{ loading: xlsxLoading, disabled: xlsxSelectedCol == null }}
        width="80%"
        destroyOnHidden
      >
        <div style={{ marginBottom: "12px", color: "var(--ss-text-secondary)", fontSize: "12px" }}>
          <div>
            {t("students.file")}
            {xlsxFileName || "-"}
          </div>
          <div>
            {t("students.selectNameCol")}
            {xlsxSelectedCol == null ? "-" : excelColName(xlsxSelectedCol)}
          </div>
          <div>{t("students.previewRows")}</div>
        </div>
        <Table
          dataSource={xlsxPreviewRows}
          columns={xlsxPreviewColumns}
          rowKey="__row"
          bordered
          scroll={{ y: 420 }}
          style={{ backgroundColor: "var(--ss-card-bg)", color: "var(--ss-text-main)" }}
          pagination={false}
        />
      </Modal>

      <TagEditorDialog
        visible={tagEditVisible}
        onClose={() => {
          setTagEditVisible(false)
          setEditingStudent(null)
        }}
        onConfirm={handleSaveTags}
        initialTagIds={editingStudent?.tagIds || []}
        title={t("students.editTagTitle", { name: editingStudent?.name || "" })}
      />

      <Modal
        title={t("students.editAvatarTitle", { name: avatarStudent?.name || "" })}
        open={avatarVisible}
        onCancel={() => {
          setAvatarVisible(false)
          setAvatarStudent(null)
          setAvatarValue(null)
        }}
        onOk={handleSaveAvatar}
        okButtonProps={{ loading: avatarSaving, disabled: !avatarStudent }}
        okText={t("common.save")}
        cancelText={t("common.cancel")}
        destroyOnHidden
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", justifyContent: "center", padding: "8px 0" }}>
            {avatarValue ? (
              <img
                src={avatarValue}
                alt={avatarStudent?.name || "avatar"}
                style={{
                  width: 96,
                  height: 96,
                  borderRadius: "50%",
                  objectFit: "cover",
                  border: "1px solid var(--ss-border-color)",
                }}
              />
            ) : (
              <div
                style={{
                  width: 96,
                  height: 96,
                  borderRadius: "50%",
                  border: "1px dashed var(--ss-border-color)",
                  backgroundColor: "var(--ss-bg-color)",
                  color: "var(--ss-text-secondary)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {t("students.noAvatar")}
              </div>
            )}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <Button
              icon={<UploadOutlined />}
              onClick={() => avatarInputRef.current?.click()}
              disabled={!canEdit}
            >
              {t("students.avatarUpload")}
            </Button>
            <Button onClick={() => setAvatarValue(null)} disabled={!canEdit}>
              {t("students.avatarClear")}
            </Button>
          </div>
          <input
            ref={avatarInputRef}
            type="file"
            accept="image/*"
            style={{ display: "none" }}
            onChange={(e) => {
              const file = e.target.files?.[0]
              handleAvatarFileChange(file)
              if (avatarInputRef.current) avatarInputRef.current.value = ""
            }}
          />
          <div style={{ color: "var(--ss-text-secondary)", fontSize: 12 }}>
            {t("students.avatarTip")}
          </div>
        </div>
      </Modal>
    </div>
  )
}
