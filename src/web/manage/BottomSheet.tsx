import React, { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"

interface BottomSheetProps {
  open: boolean
  title?: React.ReactNode
  onClose: () => void
  children: React.ReactNode
}

const CLOSE_DISTANCE = 100
const ANIM_MS = 240

/** 移动端底部弹层：系统返回键关闭、拖动顶部把手下拉关闭。 */
export function BottomSheet({ open, title, onClose, children }: BottomSheetProps): React.JSX.Element | null {
  const [mounted, setMounted] = useState(open)
  const [visible, setVisible] = useState(false)
  const [dragY, setDragY] = useState(0)
  const dragStart = useRef<number | null>(null)
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    if (open) {
      setMounted(true)
      const raf = requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)))
      return () => cancelAnimationFrame(raf)
    }
    setVisible(false)
    setDragY(0)
    const timer = window.setTimeout(() => setMounted(false), ANIM_MS)
    return () => window.clearTimeout(timer)
  }, [open])

  // 打开时压入一条历史记录，系统返回键只关闭弹层。
  useEffect(() => {
    if (!open) return
    window.history.pushState({ ssManageSheet: true }, "")
    let byPop = false
    const onPop = () => {
      byPop = true
      onCloseRef.current()
    }
    window.addEventListener("popstate", onPop)
    return () => {
      window.removeEventListener("popstate", onPop)
      if (!byPop && window.history.state?.ssManageSheet) window.history.back()
    }
  }, [open])

  if (!mounted) return null

  const onTouchStart = (e: React.TouchEvent) => {
    dragStart.current = e.touches[0].clientY
  }
  const onTouchMove = (e: React.TouchEvent) => {
    if (dragStart.current == null) return
    setDragY(Math.max(0, e.touches[0].clientY - dragStart.current))
  }
  const onTouchEnd = () => {
    if (dragStart.current == null) return
    dragStart.current = null
    if (dragY > CLOSE_DISTANCE) onClose()
    else setDragY(0)
  }

  return createPortal(
    <div className={`ssm-sheet-root${visible ? " is-open" : ""}`}>
      <div className="ssm-sheet-mask" onClick={onClose} />
      <div
        className="ssm-sheet"
        role="dialog"
        style={
          dragY
            ? { transform: `translateY(${dragY}px)`, transition: "none" }
            : undefined
        }
      >
        <div
          className="ssm-sheet-head"
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          onTouchCancel={onTouchEnd}
        >
          <div className="ssm-sheet-handle" />
          {title && <div className="ssm-sheet-title">{title}</div>}
        </div>
        <div className="ssm-sheet-body">{children}</div>
      </div>
    </div>,
    document.body
  )
}
