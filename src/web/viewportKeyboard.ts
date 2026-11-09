/**
 * 移动端软键盘弹出时，让内容区高度随可视视口缩小，
 * 而不是让浏览器把整个页面顶上去（顶栏会滑出屏幕）。
 */
export function installKeyboardViewportFix(): void {
  const vv = window.visualViewport
  if (!vv) return
  const root = document.documentElement
  let raf = 0

  const apply = () => {
    raf = 0
    const keyboardOpen = window.innerHeight - vv.height > 80
    if (!keyboardOpen && vv.offsetTop === 0) {
      root.style.removeProperty("--ss-app-height")
      root.style.removeProperty("--ss-vv-offset-top")
      root.classList.remove("ss-keyboard-open")
      return
    }
    root.classList.add("ss-keyboard-open")
    root.style.setProperty("--ss-app-height", `${Math.round(vv.height)}px`)
    root.style.setProperty("--ss-vv-offset-top", `${Math.round(vv.offsetTop)}px`)
    // 浏览器为露出输入框而滚动了布局视口，这里拉回去，保证顶栏可见。
    if (window.scrollY !== 0) window.scrollTo(0, 0)
  }
  const schedule = () => {
    if (!raf) raf = requestAnimationFrame(apply)
  }

  vv.addEventListener("resize", schedule)
  vv.addEventListener("scroll", schedule)
  window.addEventListener("scroll", schedule, { passive: true })
}
