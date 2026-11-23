import { useCallback, useEffect, useMemo, useState } from "react"
import { Button, DatePicker, message, Spin } from "antd"
import { DownloadOutlined, FileImageOutlined, ReloadOutlined } from "@ant-design/icons"
import dayjs, { Dayjs } from "dayjs"
import html2canvas from "html2canvas"
import { jsPDF } from "jspdf"
import { useRef } from "react"

type Student = {
  id: number
  name: string
  group_name: string | null
  extra_json: string | null
}
type EventRow = { student_name: string; reason_content: string; delta: number; event_time: string }
type GroupEvent = { group_name: string; reason_content: string; delta: number; event_time: string }
type GroupScore = { group_name: string; score: number }
type ReportData = {
  students: Array<Student & { period: number; today: number; rank: number }>
  groups: Array<{ name: string; total: number; average: number; independentScore: number; today: number; totalRank: number; averageRank: number }>
  events: EventRow[]
  groupEvents: GroupEvent[]
  groupTodayTotal: number
  generatedAt: Date
}

const RANGE_KEY = "ss_home_period_range"
const MODE_KEY = "ss_home_period_mode"
const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}
const isExcluded = (json: string | null) => {
  try { return JSON.parse(json || "{}").groupScoreExcluded === true } catch { return false }
}
const rankValues = (values: number[]) => values.map((value) => values.indexOf(value) + 1)

export function DailyReport(): React.JSX.Element {
  const [selectedDate, setSelectedDate] = useState<Dayjs>(dayjs())
  const [report, setReport] = useState<ReportData | null>(null)
  const [loading, setLoading] = useState(false)
  const [messageApi, contextHolder] = message.useMessage()
  const paperRef = useRef<HTMLElement>(null)
  const selectedDay = selectedDate.format("YYYY-MM-DD")

  const load = useCallback(async () => {
    const api = (window as any).api
    if (!api?.boardQuerySql) return
    setLoading(true)
    try {
      const [studentRes, groupScoreRes] = await Promise.all([
        api.boardQuerySql({ sql: "SELECT id, name, group_name, extra_json FROM students ORDER BY name", limit: 500 }),
        api.boardQuerySql({ sql: "SELECT group_name, score FROM group_scores", limit: 500 }),
      ])
      const queryAll = async (sql: string) => {
        const rows: any[] = []
        for (let offset = 0; ; offset += 500) {
          const page = await api.boardQuerySql({ sql: `SELECT * FROM (${sql}) AS report_page LIMIT 500 OFFSET ${offset}`, limit: 500 })
          if (!page?.success) throw new Error(page?.message || "报表明细读取失败")
          rows.push(...(page.data || []))
          if ((page.data || []).length < 500) return rows
        }
      }
      const results = [studentRes, groupScoreRes]
      if (results.some((result) => !result?.success)) throw new Error(results.find((result) => !result?.success)?.message || "报表数据读取失败")
      const students = (studentRes.data || []) as Student[]
      const groupScores = (groupScoreRes.data || []) as GroupScore[]
      const startOfSelectedDay = new Date(`${selectedDay}T00:00:00`)
      const endOfSelectedDay = new Date(startOfSelectedDay)
      endOfSelectedDay.setDate(endOfSelectedDay.getDate() + 1)
      const cutoff = endOfSelectedDay.getTime()
      const mode = localStorage.getItem(MODE_KEY) || (localStorage.getItem(RANGE_KEY) ? "custom" : "week")
      let periodStart: Date
      let periodEnd: Date
      if (mode === "custom") {
        const raw = JSON.parse(localStorage.getItem(RANGE_KEY) || "[]") as string[]
        periodStart = new Date(`${raw[0] || selectedDay}T00:00:00`)
        periodEnd = new Date(`${raw[1] || selectedDay}T00:00:00`)
        periodEnd.setDate(periodEnd.getDate() + 1)
      } else if (mode === "month") {
        periodStart = new Date(startOfSelectedDay.getFullYear(), startOfSelectedDay.getMonth(), 1)
        periodEnd = new Date(startOfSelectedDay.getFullYear(), startOfSelectedDay.getMonth() + 1, 1)
      } else {
        periodStart = new Date(startOfSelectedDay)
        periodStart.setDate(periodStart.getDate() - ((periodStart.getDay() + 6) % 7))
        periodEnd = new Date(periodStart)
        periodEnd.setDate(periodEnd.getDate() + 7)
      }
      const periodStartMs = periodStart.getTime()
      const end = Math.min(cutoff, periodEnd.getTime())
      const periodStartIso = new Date(periodStartMs).toISOString()
      const periodEndIso = new Date(end).toISOString()
      const dayStartIso = startOfSelectedDay.toISOString()
      const dayEndIso = endOfSelectedDay.toISOString()
      const [periodRows, groupPeriodRows, groupBalanceRows, dailyEvents, dailyGroupRows] = await Promise.all([
        queryAll(`SELECT student_name, SUM(delta) AS period FROM score_events WHERE event_time >= '${periodStartIso}' AND event_time < '${periodEndIso}' GROUP BY student_name`),
        queryAll(`SELECT group_name, SUM(delta) AS period FROM group_score_events WHERE settlement_id IS NULL AND event_time >= '${periodStartIso}' AND event_time < '${periodEndIso}' GROUP BY group_name`),
        queryAll(`SELECT group_name, SUM(delta) AS balance FROM group_score_events WHERE settlement_id IS NULL AND event_time >= '${periodStartIso}' AND event_time < '${periodEndIso}' GROUP BY group_name`),
        queryAll(`SELECT student_name, reason_content, delta, event_time FROM score_events WHERE event_time >= '${dayStartIso}' AND event_time < '${dayEndIso}' ORDER BY student_name, event_time`),
        queryAll(`SELECT group_name, reason_content, delta, event_time FROM group_score_events WHERE settlement_id IS NULL AND event_time >= '${dayStartIso}' AND event_time < '${dayEndIso}' ORDER BY group_name, event_time`),
      ]) as [Array<{ student_name: string; period: number }>, Array<{ group_name: string; period: number }>, Array<{ group_name: string; balance: number }>, EventRow[], GroupEvent[]]
      const periodByStudent = new Map(periodRows.map((row) => [row.student_name, Number(row.period) || 0]))
      const periodByGroup = new Map(groupPeriodRows.map((row) => [row.group_name, Number(row.period) || 0]))
      const groupBalanceByName = new Map(groupBalanceRows.map((row) => [row.group_name, Number(row.balance) || 0]))
      const events = dailyEvents
      const groupEvents = dailyGroupRows
      const inDay = (time: string) => {
        const value = new Date(time).getTime()
        return value >= startOfSelectedDay.getTime() && value < cutoff
      }
      const todayByStudent = new Map<string, number>()
      events.forEach((event) => {
        if (inDay(event.event_time)) todayByStudent.set(event.student_name, (todayByStudent.get(event.student_name) || 0) + Number(event.delta))
      })
      const rankedStudents = students.map((student) => ({ ...student, period: periodByStudent.get(student.name) || 0, today: todayByStudent.get(student.name) || 0 }))
        .sort((a, b) => b.period - a.period || a.name.localeCompare(b.name, "zh-CN"))
      const studentRanks = rankValues(rankedStudents.map((student) => student.period))
      const ranked = rankedStudents.map((student, index) => ({ ...student, rank: studentRanks[index] }))
      const groupNames = Array.from(new Set([...students.map((student) => student.group_name).filter((name): name is string => Boolean(name)), ...groupScores.map((row) => row.group_name), ...groupBalanceRows.map((row) => row.group_name)]))
      const groups = groupNames.map((name) => {
        const included = students.filter((student) => student.group_name === name && !isExcluded(student.extra_json))
        const individualTotal = included.reduce((sum, student) => sum + (periodByStudent.get(student.name) || 0), 0)
        const periodGroupDelta = periodByGroup.get(name) || 0
        const today = groupEvents.filter((event) => event.group_name === name && inDay(event.event_time)).reduce((sum, event) => sum + Number(event.delta), 0)
        return { name, total: individualTotal + periodGroupDelta, average: included.length ? (individualTotal + periodGroupDelta) / included.length : 0, independentScore: groupBalanceByName.get(name) || 0, today }
      }).sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, "zh-CN"))
      const totalRanks = rankValues(groups.map((group) => group.total))
      const averageSorted = groups.map((group, index) => ({ index, value: group.average })).sort((a, b) => b.value - a.value)
      const averageRanks = new Array(groups.length)
      rankValues(averageSorted.map((item) => item.value)).forEach((rank, index) => { averageRanks[averageSorted[index].index] = rank })
      const finalGroups = groups.map((group, index) => ({ ...group, totalRank: totalRanks[index], averageRank: averageRanks[index] }))
      setReport({ students: ranked, groups: finalGroups, events: events.filter((event) => inDay(event.event_time)).sort((a, b) => a.student_name.localeCompare(b.student_name, "zh-CN") || a.event_time.localeCompare(b.event_time)), groupEvents: groupEvents.filter((event) => inDay(event.event_time)).sort((a, b) => a.group_name.localeCompare(b.group_name, "zh-CN") || a.event_time.localeCompare(b.event_time)), groupTodayTotal: finalGroups.reduce((sum, group) => sum + group.today, 0), generatedAt: new Date() })
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : "报表加载失败")
    } finally {
      setLoading(false)
    }
  }, [messageApi, selectedDay])

  useEffect(() => { void load() }, [load])
  const eventsByStudent = useMemo(() => {
    const map = new Map<string, EventRow[]>()
    report?.events.forEach((event) => map.set(event.student_name, [...(map.get(event.student_name) || []), event]))
    return map
  }, [report])
  const eventsByGroup = useMemo(() => {
    const map = new Map<string, GroupEvent[]>()
    report?.groupEvents.forEach((event) => map.set(event.group_name, [...(map.get(event.group_name) || []), event]))
    return map
  }, [report])
  const todayTotal = report?.events.reduce((sum, event) => sum + Number(event.delta), 0) || 0

  const createExportClone = (width: number, mobile = false) => {
    const source = paperRef.current
    if (!source) throw new Error("报表尚未加载完成")
    const host = document.createElement("div")
    host.className = mobile ? "daily-report-export-host export-mobile" : "daily-report-export-host export-a4"
    host.style.width = `${width}px`
    host.style.position = "fixed"
    host.style.left = "-12000px"
    host.style.top = "0"
    host.style.zIndex = "-1"
    host.style.background = "#ffffff"
    host.style.color = "#202a32"
    host.style.fontFamily = "Arial, sans-serif"
    host.style.boxSizing = "border-box"
    source.closest(".daily-report-shell")?.querySelectorAll("style").forEach((style) => {
      host.appendChild(style.cloneNode(true))
    })
    const clone = source.cloneNode(true) as HTMLElement
    clone.style.width = `${width}px`
    clone.style.minHeight = "0"
    clone.style.margin = "0"
    clone.style.padding = mobile ? "18px 14px" : "24px 28px"
    clone.style.boxShadow = "none"
    host.appendChild(clone)
    document.body.appendChild(host)
    return { host, clone }
  }

  const exportLongImage = async () => {
    let host: HTMLDivElement | null = null
    try {
      setLoading(true)
      const exported = createExportClone(390, true)
      host = exported.host
      await document.fonts.ready
      const height = exported.clone.scrollHeight
      const scale = Math.min(2, 8192 / 390, 32760 / height)
      const canvas = await html2canvas(exported.clone, {
        backgroundColor: "#ffffff",
        scale,
        width: 390,
        height,
        windowWidth: 430,
        useCORS: true,
        logging: false,
      })
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error("图片生成失败")), "image/png"))
      downloadBlob(blob, `今日积分报告_${selectedDay}_手机长图.png`)
      messageApi.success("手机长图已导出")
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : "图片导出失败")
    } finally {
      host?.remove()
      setLoading(false)
    }
  }

  const exportPdf = async () => {
    let host: HTMLDivElement | null = null
    try {
      setLoading(true)
      const exported = createExportClone(794)
      host = exported.host
      await document.fonts.ready
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true })
      const pageWidth = 190
      const pageHeight = 269
      let y = 0
      const addCanvas = (canvas: HTMLCanvasElement, keepTogether = false) => {
        const renderedHeight = (canvas.height / canvas.width) * pageWidth
        if (keepTogether && renderedHeight <= pageHeight - 12 && y + renderedHeight > pageHeight) {
          pdf.addPage()
          y = 0
        }
        let offset = 0
        while (offset < renderedHeight) {
          if (y >= pageHeight - 1) {
            pdf.addPage()
            y = 0
          }
          const segmentHeight = Math.min(renderedHeight - offset, pageHeight - y)
          const sourceY = Math.round((offset / renderedHeight) * canvas.height)
          const sourceHeight = Math.max(1, Math.min(canvas.height - sourceY, Math.round((segmentHeight / renderedHeight) * canvas.height)))
          const pageCanvas = document.createElement("canvas")
          pageCanvas.width = canvas.width
          pageCanvas.height = sourceHeight
          pageCanvas.getContext("2d")?.drawImage(canvas, 0, sourceY, canvas.width, sourceHeight, 0, 0, pageCanvas.width, pageCanvas.height)
          const sliceHeight = (pageCanvas.height / canvas.width) * pageWidth
          pdf.addImage(pageCanvas.toDataURL("image/jpeg", 0.94), "JPEG", 10, 10 + y, pageWidth, sliceHeight, undefined, "FAST")
          y += sliceHeight + 1
          offset += segmentHeight
          if (offset < renderedHeight) {
            pdf.addPage()
            y = 0
          }
        }
      }
      const capture = async (element: HTMLElement, keepTogether = false) => {
        const canvas = await html2canvas(element, { backgroundColor: "#ffffff", scale: 2, width: 794, windowWidth: 900, useCORS: true, logging: false })
        addCanvas(canvas, keepTogether)
      }
      const captureTable = async (table: HTMLElement) => {
        const head = table.querySelector<HTMLElement>("thead")
        const rows = Array.from(table.querySelectorAll<HTMLElement>("tbody tr"))
        const captureTablePart = async (part: HTMLElement) => {
          const frame = document.createElement("div")
          frame.className = "report-section"
          frame.style.width = "794px"
          frame.style.background = "#fff"
          frame.appendChild(part)
          await capture(frame, true)
        }
        if (head) {
          const headTable = table.cloneNode(false) as HTMLElement
          headTable.appendChild(head.cloneNode(true))
          await captureTablePart(headTable)
        }
        for (const row of rows) {
          const rowTable = table.cloneNode(false) as HTMLElement
          const rowHead = head?.cloneNode(true)
          if (rowHead) rowTable.appendChild(rowHead)
          const body = document.createElement("tbody")
          body.appendChild(row.cloneNode(true))
          rowTable.appendChild(body)
          await captureTablePart(rowTable)
        }
      }
      const heading = exported.clone.querySelector<HTMLElement>(".report-heading")
      const summary = exported.clone.querySelector<HTMLElement>(".report-summary")
      if (heading) await capture(heading, true)
      if (summary) await capture(summary, true)
      const sections = Array.from(exported.clone.querySelectorAll<HTMLElement>(".report-section"))
      for (const section of sections) {
        const title = section.querySelector<HTMLElement>("h2")
        if (title) await capture(title, true)
        if (section.classList.contains("detail-section")) {
          for (const article of Array.from(section.querySelectorAll<HTMLElement>(".student-detail, .group-detail"))) await capture(article, true)
          const empty = section.querySelector<HTMLElement>(".empty-report")
          if (empty) await capture(empty, true)
        } else {
          const table = section.querySelector<HTMLElement>("table")
          if (table) await captureTable(table)
        }
      }
      const footer = exported.clone.querySelector<HTMLElement>(".report-footer")
      if (footer) await capture(footer, true)
      pdf.save(`今日积分报告_${selectedDay}.pdf`)
      messageApi.success("PDF 已导出")
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : "PDF 导出失败")
    } finally {
      host?.remove()
      setLoading(false)
    }
  }

  return <div className="daily-report-shell">
    {contextHolder}
    <div className="report-toolbar">
      <div><strong>今日积分报告</strong><span>家长版 · {selectedDay}</span></div>
      <DatePicker value={selectedDate} onChange={(value) => value && setSelectedDate(value)} allowClear={false} />
      <Button icon={<ReloadOutlined />} onClick={() => void load()} loading={loading}>刷新</Button>
      <Button icon={<FileImageOutlined />} onClick={() => void exportLongImage()} loading={loading}>导出手机长图</Button>
      <Button type="primary" icon={<DownloadOutlined />} onClick={() => void exportPdf()} loading={loading}>导出 PDF</Button>
    </div>
    <main className="report-paper" ref={paperRef}>
      {loading && !report ? <Spin size="large" /> : report && <>
        <header className="report-heading"><div><div className="report-kicker">DAILY CLASS REPORT</div><h1>今日积分报告</h1><p>{selectedDate.format("YYYY年M月D日")} · 本期 {report.students.length ? periodDescription(selectedDate, localStorage.getItem(MODE_KEY) || "week") : ""}</p></div><div className="report-date">{selectedDate.format("YYYY.MM.DD")}</div></header>
        <section className="report-summary">
          <div><span>班级人数</span><b>{report.students.length}</b></div>
          <div><span>今日有变动</span><b>{new Set(report.events.map((event) => event.student_name)).size}</b></div>
          <div><span>学生今日净变动</span><b className={todayTotal < 0 ? "negative" : "positive"}>{todayTotal > 0 ? `+${todayTotal}` : todayTotal} 分</b></div>
          <div><span>小组今日净变动</span><b className={report.groupTodayTotal < 0 ? "negative" : "positive"}>{report.groupTodayTotal > 0 ? `+${report.groupTodayTotal}` : report.groupTodayTotal} 分</b></div>
        </section>
        <section className="report-section"><h2><i>01</i>小组表现</h2><table><thead><tr><th>小组</th><th>本期总分</th><th>总分排名</th><th>本期平均分</th><th>平均分排名</th><th>期小组积分</th><th>{selectedDay} 变动</th></tr></thead><tbody>{report.groups.map((group) => <tr key={group.name}><td className="strong">{group.name}</td><td>{group.total}</td><td>第 {group.totalRank} 名</td><td>{group.average.toFixed(1)}</td><td>第 {group.averageRank} 名</td><td>{group.independentScore}</td><td className={group.today < 0 ? "negative" : "positive"}>{group.today > 0 ? `+${group.today}` : group.today}</td></tr>)}</tbody></table></section>
        <section className="report-section"><h2><i>02</i>个人本期积分榜</h2><table><thead><tr><th>排名</th><th>学生</th><th>所属小组</th><th>本期积分</th><th>今日变动</th></tr></thead><tbody>{report.students.map((student) => <tr key={student.id}><td className="rank">{student.rank}</td><td className="strong">{student.name}</td><td>{student.group_name || "未分组"}</td><td className="strong">{student.period}</td><td className={student.today < 0 ? "negative" : "positive"}>{student.today > 0 ? `+${student.today}` : student.today}</td></tr>)}</tbody></table></section>
        <section className="report-section detail-section"><h2><i>03</i>今日积分明细</h2>{report.students.filter((student) => eventsByStudent.has(student.name)).map((student) => <article className="student-detail" key={student.id}><div className="student-detail-heading"><strong>{student.name}</strong><span>今日小计 <b className={student.today < 0 ? "negative" : "positive"}>{student.today > 0 ? `+${student.today}` : student.today}</b></span></div><table><thead><tr><th>时间</th><th>积分理由</th><th>变动</th></tr></thead><tbody>{(eventsByStudent.get(student.name) || []).map((event, index) => <tr key={`${event.event_time}-${index}`}><td>{new Date(event.event_time).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}</td><td>{event.reason_content}</td><td className={event.delta < 0 ? "negative" : "positive"}>{event.delta > 0 ? `+${event.delta}` : event.delta}</td></tr>)}</tbody></table></article>)}{report.events.length === 0 && <p className="empty-report">所选日期没有积分变动记录</p>}</section>
        <section className="report-section detail-section group-detail-section"><h2><i>04</i>小组积分操作明细</h2>{report.groups.filter((group) => eventsByGroup.has(group.name)).map((group) => <article className="group-detail" key={group.name}><div className="student-detail-heading"><strong>{group.name}</strong><span>今日小组变动 <b className={group.today < 0 ? "negative" : "positive"}>{group.today > 0 ? `+${group.today}` : group.today}</b></span></div><table><thead><tr><th>时间</th><th>操作理由</th><th>变动</th></tr></thead><tbody>{(eventsByGroup.get(group.name) || []).map((event, index) => <tr key={`${event.event_time}-${index}`}><td>{new Date(event.event_time).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}</td><td>{event.reason_content}</td><td className={event.delta < 0 ? "negative" : "positive"}>{event.delta > 0 ? `+${event.delta}` : event.delta}</td></tr>)}</tbody></table></article>)}{report.groupEvents.length === 0 && <p className="empty-report">所选日期没有小组积分操作</p>}</section>
        <footer className="report-footer"><span>统计按设备本地时间 · 本期积分累计至所选日期结束</span><span>生成于 {report.generatedAt.toLocaleString("zh-CN")}</span></footer>
      </>}
    </main>
    <style>{`
      .daily-report-shell{height:100%;overflow:auto;background:#eef1f4;color:#202a32;font-family:var(--ss-font-family,Arial,sans-serif)}
      .report-toolbar{position:sticky;top:0;z-index:2;display:flex;align-items:center;gap:10px;padding:10px 18px;background:#fff;border-bottom:1px solid #dce2e6}
      .report-toolbar>div:first-child{display:flex;align-items:baseline;gap:10px;margin-right:auto}.report-toolbar strong{font-size:14px}.report-toolbar span{font-size:12px;color:#74818a}
      .report-paper{box-sizing:border-box;width:min(100% - 32px,920px);min-height:calc(100% - 52px);margin:16px auto;padding:36px 44px;background:#fff;box-shadow:0 2px 12px #17232c12}
      .report-heading{display:flex;justify-content:space-between;align-items:center;padding-bottom:22px;border-bottom:2px solid #253d4b}.report-kicker{font-size:10px;letter-spacing:1px;color:#64818a}.report-heading h1{margin:6px 0;font-size:26px;color:#203844}.report-heading p{margin:0;color:#6c7c84;font-size:12px}.report-date{font-size:17px;font-weight:700;color:#426879}
      .report-summary{display:grid;grid-template-columns:repeat(4,1fr);margin:18px 0 24px;background:#f2f6f6;border:1px solid #dfe9e8}.report-summary>div{padding:13px 16px;border-right:1px solid #dfe9e8}.report-summary>div:last-child{border:0}.report-summary span{display:block;color:#687980;font-size:11px}.report-summary b{display:block;margin-top:4px;font-size:20px;color:#203844}
      .report-section{margin:23px 0;break-inside:avoid}.report-section h2{display:flex;align-items:center;gap:9px;margin:0 0 10px;font-size:15px;color:#263e49}.report-section h2 i{font-style:normal;font-size:10px;color:#318477;font-variant-numeric:tabular-nums}
      .report-section table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:11px}.report-section th{text-align:left;background:#edf3f3;color:#53666e;font-weight:600}.report-section th,.report-section td{padding:7px 8px;border-bottom:1px solid #e5eaeb;overflow-wrap:anywhere;word-break:break-word;white-space:normal}.report-section tbody tr:nth-child(even){background:#fafcfc}.strong{font-weight:600;color:#263942}.rank{font-weight:700;color:#318477}.positive{color:#21805d!important}.negative{color:#c24848!important}
      .detail-section{break-before:page}.student-detail{margin:10px 0 16px;break-inside:avoid}.student-detail-heading{display:flex;justify-content:space-between;padding:7px 8px;background:#f2f6f6;font-size:12px}.student-detail-heading span{color:#687980}.empty-report{padding:24px;text-align:center;color:#75848b}.report-footer{display:flex;justify-content:space-between;margin-top:26px;padding-top:10px;border-top:1px solid #dfe5e6;font-size:9px;color:#78858a}
      @media(max-width:700px){.report-paper{width:100%;margin:0;padding:22px 14px}.report-toolbar{flex-wrap:wrap}.report-toolbar>div:first-child{width:100%}.report-section table{font-size:10px}.report-section th,.report-section td{padding:6px 4px}}
      .daily-report-export-host{position:fixed;left:-12000px;top:0;z-index:-1;background:#fff;color:#202a32}.daily-report-export-host .report-heading h1{font-size:24px}.daily-report-export-host .report-summary{grid-template-columns:repeat(2,1fr)}.daily-report-export-host .report-summary>div{padding:9px 11px}.daily-report-export-host .report-summary b{font-size:16px}.daily-report-export-host .report-section{margin:16px 0}.daily-report-export-host .report-section h2{font-size:14px}.daily-report-export-host .report-section table{font-size:10px}.daily-report-export-host .report-section th,.daily-report-export-host .report-section td{padding:5px 6px}.daily-report-export-host .student-detail{margin:8px 0 12px}.export-mobile .report-heading{align-items:flex-start}.export-mobile .report-heading h1{font-size:21px}.export-mobile .report-date{font-size:14px}.export-mobile .report-section table{font-size:9px}.export-mobile .report-section th,.export-mobile .report-section td{padding:5px 3px}.export-mobile .report-summary{grid-template-columns:repeat(2,minmax(0,1fr))}.export-mobile .report-footer{font-size:8px}
    `}</style>
  </div>
}

function periodDescription(date: Dayjs, mode: string): string {
  if (mode === "custom") {
    try {
      const [start, end] = JSON.parse(localStorage.getItem(RANGE_KEY) || "[]")
      return `${start || date.format("YYYY-MM-DD")} 至 ${end || date.format("YYYY-MM-DD")}`
    } catch { return "自定义周期" }
  }
  if (mode === "month") return date.startOf("month").format("YYYY年M月D日") + " 至 " + date.endOf("month").format("YYYY年M月D日")
  const monday = date.startOf("day").subtract((date.day() + 6) % 7, "day")
  return monday.format("YYYY年M月D日") + " 至 " + monday.add(6, "day").format("YYYY年M月D日")
}
