import ReactDOM from "react-dom"
import { createRoot } from "react-dom/client"
import type { ReactNode } from "react"

const MARK = "__td_react_root__"

// 兼容 React 19：给 ReactDOM 补上 render
// TDesign 在初始化时会读取 ReactDOM.render，所以必须尽早 patch
if (!(ReactDOM as any).render) {
  ;(ReactDOM as any).render = (node: ReactNode, container: HTMLElement) => {
    // 简单的单例模式，避免重复 createRoot
    let root = (container as any)[MARK]
    if (!root) {
      root = createRoot(container)
      ;(container as any)[MARK] = root
    }
    root.render(node)
  }
}

// 兼容 React 19：给 ReactDOM 补上 unmountComponentAtNode
if (!(ReactDOM as any).unmountComponentAtNode) {
  ;(ReactDOM as any).unmountComponentAtNode = (container: HTMLElement) => {
    const root = (container as any)[MARK]
    if (root) {
      root.unmount()
      delete (container as any)[MARK]
    }
  }
}

// 同时也挂载到 window 上，以防万一
;(window as any).reactRender =
  (window as any).reactRender ||
  ((element: ReactNode, container: HTMLElement) => {
    ;(ReactDOM as any).render(element, container)
  })
