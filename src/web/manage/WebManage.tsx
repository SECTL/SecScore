import React, { useLayoutEffect, useRef, useState } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import {
  LeftOutlined,
  TeamOutlined,
  HistoryOutlined,
  TagsOutlined,
  SwapOutlined,
  CheckOutlined,
  DownOutlined,
} from "@ant-design/icons"
import { useManageData } from "./data"
import { BottomSheet } from "./BottomSheet"
import { StudentsTab } from "./StudentsTab"
import { HistoryTab } from "./HistoryTab"
import { ReasonsTab } from "./ReasonsTab"
import "./webManage.css"

const TABS = [
  { key: "students", label: "学生", title: "学生管理", icon: <TeamOutlined /> },
  { key: "history", label: "积分历史", title: "积分历史", icon: <HistoryOutlined /> },
  { key: "reasons", label: "理由", title: "理由管理", icon: <TagsOutlined /> },
] as const
type TabKey = (typeof TABS)[number]["key"]

/** Web 端「管理」独立页：顶部切换班级，底部导航切换学生/积分历史/理由。 */
export default function WebManage(): React.JSX.Element {
  const location = useLocation()
  const navigate = useNavigate()
  const data = useManageData()
  const [classSheetOpen, setClassSheetOpen] = useState(false)
  const [switchingId, setSwitchingId] = useState<string | null>(null)

  const seg = location.pathname.split("/")[2] as TabKey | undefined
  const tab: TabKey = TABS.some((t) => t.key === seg) ? (seg as TabKey) : "students"
  const current = TABS.find((t) => t.key === tab)!
  const currentClass = data.classes.find((c) => c.id === data.currentClassId)

  // 分组标题吸附在搜索栏下方：按搜索栏实际高度设置偏移。
  const scrollRef = useRef<HTMLElement>(null)
  useLayoutEffect(() => {
    const scroller = scrollRef.current
    const sticky = scroller?.querySelector<HTMLElement>(".ssm-sticky")
    if (!scroller || !sticky) return
    const apply = () => scroller.style.setProperty("--ssm-sticky-h", `${sticky.offsetHeight}px`)
    apply()
    const ro = new ResizeObserver(apply)
    ro.observe(sticky)
    return () => ro.disconnect()
  }, [tab, data.loading])

  const goBack = () => {
    // react-router 在 history.state.idx 记录站内位置；直接打开管理页时没有上一页可回。
    if ((window.history.state?.idx ?? 0) > 0) navigate(-1)
    else navigate("/", { replace: true })
  }

  const switchTab = (key: TabKey) => {
    if (key === tab) {
      document.querySelector(".ssm-scroll")?.scrollTo({ top: 0, behavior: "smooth" })
      return
    }
    // 标签之间用 replace，返回键直接回到主页而不是在标签间来回跳。
    navigate(`/manage/${key}`, { replace: true })
  }

  const [historyStudent, setHistoryStudent] = useState<string | null>(null)
  const openStudentHistory = (name: string) => {
    setHistoryStudent(name)
    const go = () => navigate("/manage/history", { replace: true })
    // 学生详情弹层关闭时会 history.back() 掉它压入的记录，等回退完成再切标签，
    // 否则 replace 会覆盖弹层记录、回退又落回学生页。
    if (window.history.state?.ssManageSheet) {
      window.addEventListener("popstate", () => setTimeout(go, 0), { once: true })
    } else go()
  }

  const switchClass = (id: string) => {
    if (id === data.currentClassId) {
      setClassSheetOpen(false)
      return
    }
    setSwitchingId(id)
    void (window as any).api.webSwitchClass(id)
  }

  return (
    <div className="ssm-root">
      <header className="ssm-topbar">
        <button type="button" className="ssm-icon-btn" onClick={goBack} aria-label="返回">
          <LeftOutlined />
        </button>
        <div className="ssm-topbar-title">{current.title}</div>
        <button
          type="button"
          className="ssm-class-chip"
          onClick={() => setClassSheetOpen(true)}
          aria-label="切换班级"
        >
          <SwapOutlined />
          <span className="ssm-class-chip-name">{currentClass?.name ?? "班级"}</span>
          <DownOutlined style={{ fontSize: 10 }} />
        </button>
      </header>

      <main className="ssm-scroll" key={tab} ref={scrollRef}>
        {data.error && !data.students.length ? (
          <div className="ssm-empty">
            <div>加载失败：{data.error}</div>
            <button type="button" className="ssm-pill is-active" onClick={() => void data.reload()}>
              重试
            </button>
          </div>
        ) : tab === "students" ? (
          <StudentsTab data={data} onOpenHistory={openStudentHistory} />
        ) : tab === "history" ? (
          <HistoryTab
            data={data}
            student={historyStudent}
            onClearStudent={() => setHistoryStudent(null)}
          />
        ) : (
          <ReasonsTab data={data} />
        )}
      </main>

      <nav className="ssm-tabbar">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            className={`ssm-tab${t.key === tab ? " is-active" : ""}`}
            onClick={() => switchTab(t.key)}
          >
            <span className="ssm-tab-icon">{t.icon}</span>
            <span className="ssm-tab-label">{t.label}</span>
          </button>
        ))}
      </nav>

      <BottomSheet open={classSheetOpen} title="切换班级" onClose={() => setClassSheetOpen(false)}>
        <div className="ssm-list">
          {data.classes.length === 0 && <div className="ssm-empty">暂无班级</div>}
          {data.classes.map((c) => {
            const active = c.id === data.currentClassId
            return (
              <button
                key={c.id}
                type="button"
                className={`ssm-row ssm-row-btn${active ? " is-active" : ""}`}
                onClick={() => switchClass(c.id)}
                disabled={switchingId !== null}
              >
                <span className="ssm-avatar">
                  <TeamOutlined />
                </span>
                <span className="ssm-row-main">
                  <span className="ssm-row-title">{c.name}</span>
                  {active && <span className="ssm-row-sub">当前班级</span>}
                  {switchingId === c.id && <span className="ssm-row-sub">正在切换…</span>}
                </span>
                {active && <CheckOutlined className="ssm-row-check" />}
              </button>
            )
          })}
        </div>
      </BottomSheet>
    </div>
  )
}
